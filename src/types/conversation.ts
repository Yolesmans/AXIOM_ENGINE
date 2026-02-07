export type ConversationRole = "system" | "user" | "assistant";

export type ConversationMessageKind = "tone" | "preambule" | "question" | "mirror" | "mirror_validation" | "matching" | "other";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  block?: number;
  step?: string;
  kind?: ConversationMessageKind;
}
