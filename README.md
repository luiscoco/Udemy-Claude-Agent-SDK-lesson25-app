# Claude Agent SDK · Lesson 25 · MCP authentication and errors

Based on Lesson25_MCP_Authentication_and_Errors.pptx. Five linked student pages with large text and coloured code in every UML step.

## What you will learn

- Pass credentials through the right channel: The external stdio process receives a classroom API key through env. HTTP MCP servers receive an Authorization header. Keys remain on the backend and are redacted from the configuration viewer.
- Expand project placeholders at runtime: The project experiment writes ${DEMO_MCP_TOKEN} into .mcp.json, then supplies that variable through the runtime environment. Both stdio env and HTTP headers authenticate without putting the generated credential in the file.
- Keep OAuth in your application: The classroom provider performs a real local authorization-code flow with consent, state validation and S256 PKCE. The app exchanges the code and hands the token to the SDK. This is a local teaching provider, not GitHub OAuth or a production identity service.
- Use GitHub with read-only scope: The GitHub example uses your locally configured PAT to connect to the real remote MCP server. It exposes only list_issues, restricts the query to three public issues and records actual connected status and completion.
- Detect unavailable servers: Keep initialization separate from current status. Treat failed and needs-auth as unavailable; pending alone is not failure. The bad-token experiment keeps a valid server usable while the invalid-credential server supplies no data.
- Reconnect after fixing the cause: The recovery experiment starts with a controlled HTTP outage, records the unavailable state, restores the service and invokes reconnectMcpServer on the same running query. It then requests real data on a second turn.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson25-app.git
cd .\Udemy-Claude-Agent-SDK-lesson25-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson25-mcp-auth-errors` instead of cloning. Open http://127.0.0.1:3125 and keep the terminal running. Node.js 24+, API credit, model access and internet are required. Windows may require Git Bash. No separate MCP server is needed.

## Create your .env file

Copy .env.example only if .env does not exist. Enter your key privately and restart after edits. The startup script loads this file; existing shell values take precedence.

```dotenv
GITHUB_MCP_TOKEN=your_read_only_token
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3125
# Optional on Windows: CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe
```

No Managed Agents IDs are required. Real .env, media, private workspaces and dependencies are excluded from Git.

## Run the experiments

### Compare env, headers and project placeholders

Run the first three modes. Inspect redacted configuration and successful authenticated tool results. Project config contains placeholders while the runtime supplies a generated value.

```powershell
npm run sample:env -- stdio-env
npm run sample:env -- http-header
npm run sample:env -- json-expansion
```

### Complete the classroom OAuth flow in the browser

Choose OAuth mode in the web app, click Run, then Approve classroom access in the embedded consent screen. The real local code exchange validates state and PKCE before the SDK connects. The CLI also emits the local consent URL; open it in your browser to approve.

```powershell
npm run sample:env -- oauth-handoff
```

### Detect failure, recover and read GitHub issues

Run bad-token health and reconnect, then GitHub with your local PAT. GitHub is limited to list_issues for three public anthropics/claude-code issues. No writes or comments are allowed.

```powershell
npm run sample:env -- bad-token-health
npm run sample:env -- reconnect
npm run sample:env -- github
npm test
```

## How the app was built

### 1. Validate the classroom task

Accept one fixed mode. Browser input does not supply arbitrary endpoints, commands, tokens or GitHub repositories.

Source: `src/config.ts`, lines 28–30. Selected source; surrounding code omitted.

```typescript
return { mode: (value as RunConfig).mode };
}
export function hostAllows(name: string, input: Record<string, unknown>) {
```

### 2. Supply the stdio credential

The actual classroom credential is passed through the stdio server environment. The process authenticates to its local API; real model and GitHub keys are blanked for that child.

Source: `src/config.ts`, lines 71–75. Selected source; surrounding code omitted.

```typescript
CLASSROOM_API_KEY: lab.token,
      CLASSROOM_API_ORIGIN: lab.origin,
      ANTHROPIC_API_KEY: "",
      GITHUB_MCP_TOKEN: "",
    },
```

### 3. Set an HTTP bearer header

HTTP servers receive a bearer header. Only redacted configuration is displayed, while the real value is used internally for the connection.

Source: `src/config.ts`, lines 81–83. Selected source; surrounding code omitted.

```typescript
headers: { Authorization: `Bearer ${token}` },
    alwaysLoad: true,
  });
```

### 4. Write placeholder configuration

The project file stores a placeholder in stdio env and HTTP headers. The SDK runtime receives the actual value through its environment, so the file contains no generated credential.

Source: `src/config.ts`, lines 109–112. Selected source; surrounding code omitted.

```typescript
env: { ...stdio.env, CLASSROOM_API_KEY: "${DEMO_MCP_TOKEN}" },
        },
        "secure-api": http("${DEMO_MCP_TOKEN}"),
      },
```

### 5. Complete application-side OAuth

The application validates state and exchanges the authorization code using its private PKCE verifier. This local teaching flow completes before the SDK receives the access token.

Source: `src/auth-lab.ts`, lines 96–101. Selected source; surrounding code omitted.

```typescript
trace.push({ event: "state_validated" });
        const response = await fetch(origin + "/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
```

### 6. Load project settings and runtime env

Supply the runtime variable used by the generated project configuration. Other experiments pass credentials directly through server config. These values stay outside the displayed projection.

Source: `src/agent.ts`, lines 131–133. Selected source; surrounding code omitted.

```typescript
DEMO_MCP_TOKEN: lab.token,
        MCP_TIMEOUT: "4000",
        CLAUDE_CODE_MCP_STARTUP_WAIT_MS: "6000",
```

### 7. Run the real SDK query

Streaming input keeps recovery on one running Query. Normal experiments use one turn; the reconnection experiment performs a health-check turn before requesting data.

Source: `src/agent.ts`, lines 219–221. Selected source; surrounding code omitted.

```typescript
const run = query({ prompt: input(), options });
    let text = "",
      status = "no_result",
```

### 8. Preserve initial status

The initialization snapshot may differ from current connection state. Preserve it instead of assuming configured servers are usable or treating pending as permanent failure.

Source: `src/agent.ts`, lines 251–255. Selected source; surrounding code omitted.

```typescript
initServers = message.mcp_servers.map((s) => ({
            name: s.name,
            status: s.status,
          }));
          sessionId = message.session_id;
```

### 9. Poll current server status

Inspect mcpServerStatus and record separate phase snapshots. Failed and needs-auth indicate an unavailable server; pending is polled rather than immediately treated as failure.

Source: `src/agent.ts`, lines 224–229. Selected source; surrounding code omitted.

```typescript
const current = async (phase: string) => {
      let servers: State[] = [];
      for (let attempt = 0; attempt < 48; attempt++) {
        servers = (await run.mcpServerStatus()).map((s) => ({
          name: s.name,
          status: s.status,
```

### 10. Fix the cause and reconnect

The local outage is restored before the actual SDK reconnect control is invoked. Verify connected status and a completed tool call on the next turn of the same query.

Source: `src/agent.ts`, lines 300–303. Selected source; surrounding code omitted.

```typescript
await run.reconnectMcpServer("secure-api");
            const servers = await current("after-reconnect");
            emit({
              type: "recovery",
```

### 11. Limit GitHub to read-only issues

The real GitHub connection uses the configured PAT, a read-only server header and only list_issues. A host guard additionally fixes the public repository and three-issue request.

Source: `src/config.ts`, lines 97–100. Selected source; surrounding code omitted.

```typescript
"X-MCP-Tools": "list_issues",
          "X-MCP-Readonly": "true",
        },
        alwaysLoad: true,
```

### 12. Redact credentials before display

Remove actual configured and generated secrets, plus common token patterns, before rendering configuration or model text. The private .env remains excluded from Git and HTTP routing.

Source: `src/agent.ts`, lines 29–34. Selected source; surrounding code omitted.

```typescript
export function redactor(values: string[]) {
  return (text: string) => {
    for (const value of values
      .filter(Boolean)
      .sort((a, b) => b.length - a.length))
      text = text.split(value).join("[REDACTED]");
```

### 13. Render answers beside evidence

Sanitize and format actual Markdown. Keep it beside redacted authentication traces, server snapshots, reconnect acknowledgement and real tool results.

Source: `src/client.ts`, lines 50–52. Selected source; surrounding code omitted.

```typescript
if (e.type === "answer") renderMarkdown($("answer"), e.text);
  if (e.type === "result") {
    $("status").textContent = e.status;
```

## Reference topics and limits

- Logical UML participants: The diagram groups setup and alternative experiments. The local classroom OAuth provider and protected MCP service share a teaching process but represent separate logical roles. GitHub is a separate real remote service.
- Local OAuth scope: The local provider demonstrates browser consent, one-use authorization codes, state validation and S256 PKCE. It is not GitHub OAuth, a production identity provider, a dynamic-registration implementation or a third-party refresh-token flow. The access token remains on the backend.
- Real GitHub integration: The GitHub mode uses a personal access token from your local .env and the actual remote MCP endpoint. The server is restricted to read-only list_issues; the host fixes anthropics/claude-code, three issues and selected public fields. No comments, messages or writes are performed.
- Connection status and errors: MCP failure can coexist with a successful model turn and another healthy server. Initialization may show pending; inspect current status before classifying a server. Query startup, model authentication or process failure can still throw, so the host retains try/catch.
- Recovery demonstrated honestly: The recovery run fixes an intentional 503 outage and calls reconnectMcpServer on the same streaming Query. It does not claim to reproduce five automatic retries, recover an arbitrary network failure or refresh an external provider token.
- Credentials and recordings: Classroom credentials are generated per run. Actual GitHub and model tokens come from .env. The UI and recordings show redacted config, credential-channel names and boolean/status evidence. Observation downloads omit the classroom authorization URL.
- Token setup: Create a fine-grained GitHub PAT with public-repository read access and an expiration. Store it as GITHUB_MCP_TOKEN in .env and restart after saving. For this public issue-list exercise, private-repository and write permissions are unnecessary.

## References

- [Custom tools: official SDK documentation](https://code.claude.com/docs/en/agent-sdk/custom-tools)
- [MCP authentication and errors](https://code.claude.com/docs/en/agent-sdk/mcp)
- [GitHub MCP remote server](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)
- [Create a GitHub token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Regenerate student pages with `python scripts/build-pages.py`. `npm test` checks redaction, PKCE hashing, authentication rejection, GitHub scope and startup without paid model calls.
