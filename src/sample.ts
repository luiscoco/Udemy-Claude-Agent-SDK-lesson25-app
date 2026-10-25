import { runAgent, validateConfig } from "./agent.js";
await runAgent(
  validateConfig({ mode: process.argv[2] || "http-header" }),
  (event) => {
    if (event.type === "answer") console.log(event.text);
    else if (event.type !== "message") console.log(JSON.stringify(event));
  },
);
