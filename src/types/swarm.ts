export interface SessionStatus {
  type: "idle" | "retry" | "busy";
}

export interface SessionStatusResponse {
  data?: Record<string, SessionStatus>;
}

export interface SessionModelInfo {
  providerID: string;
  modelID: string;
}

export interface SessionMessageInfo {
  role: "user" | "assistant" | "system";
  providerID?: string;
  modelID?: string;
  model?: SessionModelInfo;
}

export interface SessionMessagePart {
  type: "text" | "file" | "agent" | "subtask";
  text?: string;
}

export interface SessionMessageData {
  info?: SessionMessageInfo;
  parts?: SessionMessagePart[];
}

export interface SessionMessagesResponse {
  data?: SessionMessageData[];
}
