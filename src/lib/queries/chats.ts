"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import { MAX_CHATS, type ChatSummary, type StoredMessage } from "@/lib/queries/chat-types";

// userId always comes from the session — never trust a client-passed id.
async function uid(): Promise<string> {
  const u = await getUser();
  if (!u) throw new Error("Não autenticado");
  return u.id;
}

async function ownChatOrNull(chatId: string, userId: string) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  return chat && chat.userId === userId ? chat : null;
}

export async function listChats(): Promise<ChatSummary[]> {
  const userId = await uid();
  const rows = await prisma.chat.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
}

export async function createChat(
  title = "Resetar chat",
): Promise<{ ok: true; chat: ChatSummary } | { ok: false; error: string }> {
  const userId = await uid();
  const count = await prisma.chat.count({ where: { userId } });
  if (count >= MAX_CHATS) {
    return { ok: false, error: `Limite de ${MAX_CHATS} chats. Exclua um para criar outro.` };
  }
  const c = await prisma.chat.create({ data: { userId, title: title.slice(0, 80) || "Resetar chat" } });
  return { ok: true, chat: { id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() } };
}

export async function getChatMessages(chatId: string): Promise<StoredMessage[]> {
  const userId = await uid();
  if (!(await ownChatOrNull(chatId, userId))) return [];
  const msgs = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    data: m.data,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function appendMessage(
  chatId: string,
  role: "user" | "assistant",
  content: string,
  data?: unknown,
): Promise<void> {
  const userId = await uid();
  if (!(await ownChatOrNull(chatId, userId))) throw new Error("Chat inválido");
  await prisma.chatMessage.create({
    data: {
      chatId,
      role,
      content,
      data: (data ?? undefined) as never,
    },
  });
  await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  const userId = await uid();
  if (!(await ownChatOrNull(chatId, userId))) throw new Error("Chat inválido");
  await prisma.chat.update({ where: { id: chatId }, data: { title: title.slice(0, 80) || "Chat" } });
}

export async function deleteChat(chatId: string): Promise<void> {
  const userId = await uid();
  if (!(await ownChatOrNull(chatId, userId))) throw new Error("Chat inválido");
  await prisma.agentPlan.deleteMany({ where: { sessionId: chatId } });
  await prisma.chat.delete({ where: { id: chatId } }); // cascades messages
}
