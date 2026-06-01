"use server";

import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import { type ChatSummary, type StoredMessage } from "@/lib/queries/chat-types";

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

function summary(c: { id: string; title: string; updatedAt: Date }): ChatSummary {
  return { id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() };
}

// One persistent chat per user. No cap, no chat list — the agent keeps a single
// conversation that the user can reset. Returns the existing chat or creates it.
export async function getOrCreateChat(): Promise<ChatSummary> {
  const userId = await uid();
  const existing = await prisma.chat.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return summary(existing);
  const c = await prisma.chat.create({ data: { userId, title: "Chat" } });
  return summary(c);
}

// Loads the single chat + its messages + reconciled plan statuses in ONE server
// round-trip (instead of getOrCreateChat → getChatMessages → getPlanStatuses in
// series). Cuts the chat's initial latency to a single call.
export async function loadChat(): Promise<{
  chat: ChatSummary;
  messages: StoredMessage[];
  planStatuses: Record<string, string>;
}> {
  const userId = await uid();
  const existing = await prisma.chat.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  const chat = existing ?? (await prisma.chat.create({ data: { userId, title: "Chat" } }));

  const msgs = await prisma.chatMessage.findMany({
    where: { chatId: chat.id },
    orderBy: { createdAt: "asc" },
  });
  const messages: StoredMessage[] = msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    data: m.data,
    createdAt: m.createdAt.toISOString(),
  }));

  const planIds: string[] = [];
  for (const m of messages) {
    const d = (m.data ?? {}) as { plans?: { id: string }[] };
    if (d.plans) for (const p of d.plans) planIds.push(p.id);
  }
  let planStatuses: Record<string, string> = {};
  if (planIds.length) {
    const rows = await prisma.agentPlan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, status: true },
    });
    planStatuses = Object.fromEntries(rows.map((r) => [r.id, r.status]));
  }

  return { chat: summary(chat), messages, planStatuses };
}

// "Resetar chat": wipe the single conversation in place (messages + any agent
// plans tied to it) and keep the same row so the user always has exactly one.
export async function resetChat(): Promise<ChatSummary> {
  const chat = await getOrCreateChat();
  await prisma.agentPlan.deleteMany({ where: { sessionId: chat.id } });
  await prisma.chatMessage.deleteMany({ where: { chatId: chat.id } });
  const c = await prisma.chat.update({
    where: { id: chat.id },
    data: { updatedAt: new Date() },
  });
  return summary(c);
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
