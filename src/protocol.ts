export type Mode =
  | "stdio-env"
  | "http-header"
  | "json-expansion"
  | "oauth-handoff"
  | "bad-token-health"
  | "reconnect"
  | "github";
export type RunConfig = { mode: Mode };
export type State = { name: string; status: string; source?: string };
export type LabEvent =
  | { type: "options"; config: RunConfig; options: Record<string, unknown> }
  | { type: "configuration"; files: { name: string; contents: string }[] }
  | { type: "oauth"; url: string }
  | {
      type: "initialized";
      model: string;
      sessionId: string;
      tools: string[];
      servers: State[];
    }
  | { type: "connection"; phase: string; servers: State[] }
  | { type: "recovery"; reconnectInvoked: boolean; connected: boolean }
  | { type: "message"; sdkType: string; summary: string }
  | { type: "tool"; name: string; args: unknown }
  | { type: "native-result"; isError: boolean; text: string }
  | { type: "answer"; text: string }
  | {
      type: "result";
      status: string;
      text: string;
      sessionId: string;
      costUsd: number;
    }
  | {
      type: "evidence";
      mode: Mode;
      initServers: State[];
      snapshots: { phase: string; servers: State[] }[];
      completed: string[];
      resultStatuses: string[];
      reconnectInvoked: boolean;
      authTrace: { event: string; authorized?: boolean; httpStatus?: number }[];
      configContainsOnlyPlaceholders: boolean;
      githubReadOnly: boolean;
    }
  | { type: "notice" | "error"; text: string };
