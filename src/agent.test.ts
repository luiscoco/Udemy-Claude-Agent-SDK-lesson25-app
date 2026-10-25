import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hostAllows, validateConfig } from "./config.js";
import { redactor } from "./agent.js";
import { challenge, startAuthLab } from "./auth-lab.js";
test("fixed mode selection rejects arbitrary endpoints", () => {
  assert.throws(() => validateConfig({ mode: "shell" }));
  assert.deepEqual(
    validateConfig({ mode: "http-header", url: "http://example.org" }),
    { mode: "http-header" },
  );
});
test("GitHub scope permits only three issues from the named public repository", () => {
  const args = {
    owner: "anthropics",
    repo: "claude-code",
    perPage: 3,
    orderBy: "CREATED_AT",
    direction: "DESC",
    fields: ["number", "title"],
  };
  assert.equal(hostAllows("mcp__github__list_issues", args), true);
  assert.equal(
    hostAllows("mcp__github__list_issues", { ...args, repo: "private" }),
    false,
  );
  assert.equal(hostAllows("mcp__github__issue_write", args), false);
});
test("redaction removes configured and token-shaped credentials", () => {
  const text = redactor(["classroom-value"])(
    "classroom-value github_pat_fake123 ghp_fake456 sk-ant-fake789",
  );
  assert.equal(text.includes("fake"), false);
  assert.equal(text.includes("classroom-value"), false);
});
test("PKCE uses SHA-256 base64url", () => {
  assert.equal(
    challenge("verifier"),
    createHash("sha256").update("verifier").digest("base64url"),
  );
});
test("protected endpoint rejects bad credentials and records no token values", async () => {
  const lab = await startAuthLab();
  try {
    const bad = await fetch(lab.origin + "/data");
    assert.equal(bad.status, 401);
    const good = await fetch(lab.origin + "/data", {
      headers: { Authorization: "Bearer " + lab.token },
    });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).marker, "AUTH-25");
    assert.equal(JSON.stringify(lab.trace).includes(lab.token), false);
  } finally {
    await lab.close();
  }
});
