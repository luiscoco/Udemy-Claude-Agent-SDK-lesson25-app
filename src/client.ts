import { renderMarkdown } from "./markdown.js";
import type { LabEvent, Mode, RunConfig } from "./protocol.js";
const $ = (id: string) => document.getElementById(id)!;
const button = $("run") as HTMLButtonElement,
  rows: LabEvent[] = [];
const json = (id: string, value: unknown) => {
  $(id).textContent = JSON.stringify(value, null, 2);
  (window as any).Prism?.highlightElement($(id));
};
const native: unknown[] = [],
  connections: unknown[] = [];
function receive(e: LabEvent) {
  rows.push(e.type === "oauth" ? { type: "notice", text: "Local classroom consent displayed; authorization URL omitted from observations." } : e);
  if (e.type === "configuration") {
    const select = $("configuration-file") as HTMLSelectElement;
    select.replaceChildren();
    e.files.forEach((file, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = file.name;
      select.append(option);
    });
    const show = () => {
      $("configuration-content").textContent =
        e.files[Number(select.value)].contents;
      (window as any).Prism?.highlightElement($("configuration-content"));
    };
    select.onchange = show;
    show();
  }
  if (e.type === "oauth") {
    $("oauth-panel").hidden = false;
    ($("oauth-frame") as HTMLIFrameElement).src = e.url;
  }
  if (e.type === "options") json("options", e.options);
  if (e.type === "initialized") {
    $("session").textContent = e.sessionId;
    json("init", e);
    json("discovery", { tools: e.tools, initServers: e.servers });
  }
  if (e.type === "connection") {
    connections.push(e);
    json("connections", connections);
  }
  if (e.type === "recovery") json("recovery", e);
  if (e.type === "native-result") {
    native.push(e);
    json("native", native);
  }
  if (e.type === "answer") renderMarkdown($("answer"), e.text);
  if (e.type === "result") {
    $("status").textContent = e.status;
    $("cost").textContent = "$" + e.costUsd.toFixed(5);
    renderMarkdown($("answer"), e.text);
  }
  if (e.type === "evidence") {
    json("evidence", {
      mode: e.mode,
      completed: e.completed,
      resultStatuses: e.resultStatuses,
      reconnectInvoked: e.reconnectInvoked,
      configContainsOnlyPlaceholders: e.configContainsOnlyPlaceholders,
      githubReadOnly: e.githubReadOnly,
      authTrace: e.authTrace,
      snapshots: e.snapshots,
    });
    const tr = document.createElement("tr");
    for (const value of [
      e.mode,
      e.completed.join(", ") || "No completed call",
      e.resultStatuses.join(" → "),
      String(e.reconnectInvoked),
      e.snapshots
        .at(-1)
        ?.servers.map((s) => s.name + ": " + s.status)
        .join(", ") || "—",
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    $("history").append(tr);
  }
  if (e.type === "error" || e.type === "notice")
    $("notice").textContent = e.text;
  if (e.type === "error") $("status").textContent = "Could not finish";
  if (
    [
      "message",
      "tool",
      "native-result",
      "result",
      "error",
      "recovery",
    ].includes(e.type)
  ) {
    const li = document.createElement("li");
    li.textContent = JSON.stringify(e);
    $("events").append(li);
  }
}
button.onclick = async () => {
  button.disabled = true;
  native.length = 0;
  connections.length = 0;
  $("answer").replaceChildren();
  $("events").replaceChildren();
  $("notice").textContent = "";
  $("status").textContent = "Running…";
  $("oauth-panel").hidden = true;
  ($("oauth-frame") as HTMLIFrameElement).src = "about:blank";
  for (const id of [
    "options",
    "init",
    "discovery",
    "connections",
    "native",
    "evidence",
    "recovery",
  ])
    json(id, {});
  $("session").textContent = "—";
  $("cost").textContent = "—";
  const config: RunConfig = {
    mode: ($("mode") as HTMLSelectElement).value as Mode,
  };
  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error(await response.text());
    const reader = response.body!.getReader(),
      decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines) if (line.trim()) receive(JSON.parse(line));
      if (done) break;
    }
    if ($("status").textContent === "Running…")
      $("status").textContent = "No final result";
  } catch (error) {
    $("status").textContent = "Could not finish";
    $("notice").textContent =
      error instanceof Error ? error.message : "Request failed.";
  } finally {
    button.disabled = false;
  }
};
$("download").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "lesson25-observations.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
fetch("/api/config")
  .then((r) => r.json())
  .then((c) => {
    $("configuration").textContent = c.ready
      ? "Model key configured · GitHub token " +
        (c.githubReady ? "configured" : "not configured")
      : "Set your model API key and restart.";
    button.disabled = !c.ready;
  });
