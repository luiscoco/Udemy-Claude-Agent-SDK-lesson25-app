import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
export type LabTrace = {
  event: string;
  authorized?: boolean;
  httpStatus?: number;
};
const secret = () => randomBytes(32).toString("base64url");
export const challenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");
export async function readBody(req: IncomingMessage) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 16000) throw new Error("Request too large");
  }
  return text;
}
export async function startAuthLab() {
  const token = secret(),
    wrongToken = secret(),
    verifier = secret(),
    state = secret(),
    trace: LabTrace[] = [];
  let available = true,
    oauthToken = "",
    issuedCode = "",
    codeUsed = false,
    origin = "",
    closed = false;
  let resolveOAuth!: (token: string) => void;
  const oauthReady = new Promise<string>((ok) => {
    resolveOAuth = ok;
  });
  const transports = new Set<StreamableHTTPServerTransport>();
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const html = (res: ServerResponse, body: string) => {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      `<!doctype html><html><meta charset="utf-8"><style>body{font:22px/1.5 Arial;background:#eaf5ff;color:#102544;padding:20px}h1{font-size:30px}button{font:bold 22px Arial;background:#087fff;color:white;padding:16px;border:0;border-radius:12px}</style>${body}</html>`,
    );
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", origin);
    try {
      if (url.pathname === "/authorize" && req.method === "GET") {
        if (
          url.searchParams.get("state") !== state ||
          url.searchParams.get("code_challenge") !== challenge(verifier) ||
          url.searchParams.get("code_challenge_method") !== "S256"
        ) {
          json(res, 400, { error: "Invalid classroom authorization request" });
          return;
        }
        trace.push({ event: "authorization_requested" });
        html(
          res,
          `<h1>Classroom OAuth provider</h1><p>This local teaching provider is not GitHub. Approve read-only access to the classroom course card?</p><form method="POST" action="/approve"><input type="hidden" name="state" value="${state}"><button id="approve">Approve classroom access</button></form>`,
        );
        return;
      }
      if (url.pathname === "/approve" && req.method === "POST") {
        const form = new URLSearchParams(await readBody(req));
        if (form.get("state") !== state) {
          json(res, 400, { error: "Invalid state" });
          return;
        }
        issuedCode = secret();
        trace.push({ event: "consent_approved" });
        res.writeHead(303, {
          Location: origin + "/callback?code=" + issuedCode + "&state=" + state,
        });
        res.end();
        return;
      }
      if (url.pathname === "/callback") {
        if (url.searchParams.get("state") !== state) {
          json(res, 400, { error: "State mismatch" });
          return;
        }
        trace.push({ event: "state_validated" });
        const response = await fetch(origin + "/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: url.searchParams.get("code") || "",
            code_verifier: verifier,
            redirect_uri: origin + "/callback",
            client_id: "classroom-client",
          }),
        });
        if (!response.ok) {
          json(res, 400, { error: "Token exchange failed" });
          return;
        }
        const result = await response.json();
        oauthToken = result.access_token;
        resolveOAuth(oauthToken);
        html(
          res,
          '<h1 id="authorized">Classroom authorization complete</h1><p>The application exchanged the code and holds the access token on the server. The Agent SDK did not open a browser or run this flow.</p>',
        );
        return;
      }
      if (url.pathname === "/token" && req.method === "POST") {
        const form = new URLSearchParams(await readBody(req));
        if (
          codeUsed ||
          !issuedCode ||
          form.get("code") !== issuedCode ||
          form.get("grant_type") !== "authorization_code" ||
          form.get("client_id") !== "classroom-client" ||
          form.get("redirect_uri") !== origin + "/callback" ||
          challenge(form.get("code_verifier") || "") !== challenge(verifier)
        ) {
          json(res, 400, { error: "invalid_grant" });
          return;
        }
        codeUsed = true;
        trace.push({ event: "pkce_validated" });
        oauthToken = secret();
        trace.push({ event: "token_issued" });
        json(res, 200, {
          access_token: oauthToken,
          token_type: "Bearer",
          expires_in: 3600,
        });
        return;
      }
      if (url.pathname === "/.well-known/oauth-protected-resource") {
        json(res, 200, {
          resource: origin + "/mcp",
          authorization_servers: [origin],
        });
        return;
      }
      if (url.pathname.startsWith("/.well-known/oauth-authorization-server")) {
        json(res, 200, {
          issuer: origin,
          authorization_endpoint: origin + "/authorize",
          token_endpoint: origin + "/token",
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code"],
          code_challenge_methods_supported: ["S256"],
        });
        return;
      }
      if (url.pathname === "/mcp" || url.pathname === "/data") {
        if (!available) {
          trace.push({ event: "service_unavailable", httpStatus: 503 });
          json(res, 503, { error: "Intentional classroom outage" });
          return;
        }
        const bearer = req.headers.authorization;
        const authorized =
          bearer === "Bearer " + token ||
          Boolean(oauthToken && bearer === "Bearer " + oauthToken);
        trace.push({
          event: url.pathname === "/mcp" ? "mcp_http_auth" : "stdio_api_auth",
          authorized,
          httpStatus: authorized ? 200 : 401,
        });
        if (!authorized) {
          res.setHeader(
            "WWW-Authenticate",
            `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          );
          json(res, 401, { error: "Classroom credential required" });
          return;
        }
        if (url.pathname === "/data") {
          json(res, 200, {
            lesson: 25,
            marker: "AUTH-25",
            source: "Authenticated classroom HTTP API",
          });
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        const mcp = new McpServer({
          name: "classroom-secure",
          version: "1.0.0",
        });
        mcp.registerTool(
          "course_card",
          {
            description: "Read the authenticated classroom course card",
            inputSchema: {},
            annotations: { readOnlyHint: true },
          },
          async () => {
            trace.push({ event: "http_tool_completed", authorized: true });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    lesson: 25,
                    marker: "AUTH-25",
                    source: "Authenticated classroom MCP HTTP",
                  }),
                },
              ],
            };
          },
        );
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        transports.add(transport);
        res.on("close", () => {
          transports.delete(transport);
          void transport.close();
          void mcp.close();
        });
        await mcp.connect(transport);
        await transport.handleRequest(
          req,
          res,
          JSON.parse(await readBody(req)),
        );
        return;
      }
      json(res, 404, { error: "Not found" });
    } catch {
      if (!res.headersSent)
        json(res, 500, {
          error: "Classroom service could not complete this request",
        });
      else res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No classroom listener");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    token,
    wrongToken,
    origin,
    trace,
    oauthReady,
    authorizationUrl:
      origin +
      "/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: "classroom-client",
        redirect_uri: origin + "/callback",
        scope: "course:read",
        state,
        code_challenge: challenge(verifier),
        code_challenge_method: "S256",
      }),
    setAvailable: (value: boolean) => {
      available = value;
      trace.push({ event: value ? "service_restored" : "service_disabled" });
    },
    sensitiveValues: () =>
      [token, wrongToken, oauthToken, verifier, state, issuedCode].filter(
        Boolean,
      ),
    close: async () => {
      if (closed) return;
      closed = true;
      for (const t of transports) await t.close().catch(() => {});
      await new Promise<void>((ok) => {
        server.close(() => ok());
        server.closeAllConnections();
      });
    },
  };
}
