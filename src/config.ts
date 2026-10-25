import { mkdir, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { Mode, RunConfig } from "./protocol.js";
import { startAuthLab } from "./auth-lab.js";
export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MODES: Mode[] = [
  "stdio-env",
  "http-header",
  "json-expansion",
  "oauth-handoff",
  "bad-token-health",
  "reconnect",
  "github",
];
export function validateConfig(value: unknown): RunConfig {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !MODES.includes((value as RunConfig).mode)
  )
    throw new Error("Choose a listed MCP auth experiment.");
  return { mode: (value as RunConfig).mode };
}
export function hostAllows(name: string, input: Record<string, unknown>) {
  if (
    [
      "mcp__api-server__course_card",
      "mcp__secure-api__course_card",
      "mcp__healthy__course_card",
    ].includes(name)
  )
    return true;
  return (
    name === "mcp__github__list_issues" &&
    input.owner === "anthropics" &&
    input.repo === "claude-code" &&
    input.perPage === 3 &&
    input.orderBy === "CREATED_AT" &&
    input.direction === "DESC" &&
    Array.isArray(input.fields) &&
    input.fields.every((v) =>
      ["number", "title", "created_at", "state"].includes(String(v)),
    )
  );
}
export async function prepare(
  mode: Mode,
  lab: Awaited<ReturnType<typeof startAuthLab>>,
  oauthToken = "",
) {
  const root = resolve(
      realpathSync.native(tmpdir()),
      "claude-sdk25",
      randomUUID().slice(0, 12),
    ),
    cwd = resolve(root, "p"),
    home = resolve(root, "h"),
    sdkHome = resolve(root, "c");
  for (const p of [cwd, home, sdkHome]) await mkdir(p, { recursive: true });
  const stdio: McpServerConfig = {
    type: "stdio",
    command: process.execPath,
    args: [resolve(ROOT, "scripts/authenticated-stdio.mjs")],
    env: {
      CLASSROOM_API_KEY: lab.token,
      CLASSROOM_API_ORIGIN: lab.origin,
      ANTHROPIC_API_KEY: "",
      GITHUB_MCP_TOKEN: "",
    },
    alwaysLoad: true,
  };
  const http = (token: string): McpServerConfig => ({
    type: "http",
    url: lab.origin + "/mcp",
    headers: { Authorization: `Bearer ${token}` },
    alwaysLoad: true,
  });
  let servers: Record<string, McpServerConfig> = {},
    project = false,
    configContainsOnlyPlaceholders = false;
  if (mode === "stdio-env") servers = { "api-server": stdio };
  else if (mode === "github") {
    if (!process.env.GITHUB_MCP_TOKEN)
      throw new Error("Configure GITHUB_MCP_TOKEN locally first.");
    servers = {
      github: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_MCP_TOKEN}`,
          "X-MCP-Tools": "list_issues",
          "X-MCP-Readonly": "true",
        },
        alwaysLoad: true,
      },
    };
  } else if (mode === "json-expansion") {
    project = true;
    const configuration = {
      mcpServers: {
        "api-server": {
          ...stdio,
          env: { ...stdio.env, CLASSROOM_API_KEY: "${DEMO_MCP_TOKEN}" },
        },
        "secure-api": http("${DEMO_MCP_TOKEN}"),
      },
    };
    const text = JSON.stringify(configuration, null, 2);
    configContainsOnlyPlaceholders =
      text.includes("${DEMO_MCP_TOKEN}") && !text.includes(lab.token);
    await writeFile(resolve(cwd, ".mcp.json"), text);
    return {
      cwd,
      home,
      sdkHome,
      servers,
      project,
      configContainsOnlyPlaceholders,
      configuration: text,
    };
  } else if (mode === "bad-token-health")
    servers = { healthy: http(lab.token), unavailable: http(lab.wrongToken) };
  else
    servers = {
      "secure-api": http(mode === "oauth-handoff" ? oauthToken : lab.token),
    };
  return {
    cwd,
    home,
    sdkHome,
    servers,
    project,
    configContainsOnlyPlaceholders,
    configuration: JSON.stringify({ mcpServers: servers }, null, 2),
  };
}
