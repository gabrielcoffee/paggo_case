import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

// chats queries derive userId from the session; mock it to a stable test user.
const TEST_USER = "TEST-USER-CHATS";
vi.mock("@/lib/supabase/server", () => ({
  getUser: vi.fn(async () => ({ id: TEST_USER, email: "t@test.dev" })),
}));

import { prisma } from "@/lib/prisma";
import {
  listChats,
  getOrCreateChat,
  resetChat,
  getChatMessages,
  appendMessage,
  deleteChat,
} from "@/lib/queries/chats";

async function cleanup() {
  const chats = await prisma.chat.findMany({ where: { userId: TEST_USER } });
  for (const c of chats) await prisma.chatMessage.deleteMany({ where: { chatId: c.id } });
  await prisma.chat.deleteMany({ where: { userId: TEST_USER } });
}

beforeEach(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("single chat per user", () => {
  it("getOrCreateChat returns the same single chat on repeat calls", async () => {
    const a = await getOrCreateChat();
    const b = await getOrCreateChat();
    expect(a.id).toBe(b.id);
    expect((await listChats()).length).toBe(1);
  });

  it("resetChat wipes messages but keeps exactly one chat", async () => {
    const chat = await getOrCreateChat();
    await appendMessage(chat.id, "user", "oi");
    await appendMessage(chat.id, "assistant", "olá", { trace: [] });
    const reset = await resetChat();
    expect(reset.id).toBe(chat.id);
    expect((await getChatMessages(chat.id)).length).toBe(0);
    expect((await listChats()).length).toBe(1);
  });
});

describe("messages + ownership", () => {
  it("appends and reads messages for an owned chat", async () => {
    const chat = await getOrCreateChat();
    await appendMessage(chat.id, "user", "oi");
    await appendMessage(chat.id, "assistant", "olá", { trace: [] });
    const msgs = await getChatMessages(chat.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("returns nothing for a chat owned by someone else", async () => {
    const other = await prisma.chat.create({ data: { userId: "SOMEONE-ELSE", title: "x" } });
    const msgs = await getChatMessages(other.id);
    expect(msgs).toEqual([]);
    await prisma.chat.delete({ where: { id: other.id } });
  });

  it("deleteChat removes the chat and its messages", async () => {
    const chat = await getOrCreateChat();
    await appendMessage(chat.id, "user", "x");
    await deleteChat(chat.id);
    expect(await prisma.chat.findUnique({ where: { id: chat.id } })).toBeNull();
    expect(await prisma.chatMessage.count({ where: { chatId: chat.id } })).toBe(0);
  });
});
