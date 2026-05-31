// Plain constants/types for chats. Kept out of chats.ts because a "use server"
// file may only export async functions (no const/value exports).
export const MAX_CHATS = 5;

export type ChatSummary = { id: string; title: string; updatedAt: string };
export type StoredMessage = {
  id: string;
  role: string;
  content: string;
  data: unknown;
  createdAt: string;
};
