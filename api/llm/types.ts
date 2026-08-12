export interface TwinReplyResult {
  reply: string;
  provider: string;
  model: string;
}

export type TwinReplyGenerator = (
  systemPrompt: string,
  message: string,
) => Promise<TwinReplyResult>;
