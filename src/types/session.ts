export interface SessionModelInfo {
  providerID: string;
  modelID: string;
}

export interface SessionMessageInfo {
  role: string;
  providerID?: string;
  modelID?: string;
  model?: SessionModelInfo;
}

export interface SessionMessageData {
  info?: SessionMessageInfo;
}

export interface SessionMessagesResponse {
  data?: SessionMessageData[];
}
