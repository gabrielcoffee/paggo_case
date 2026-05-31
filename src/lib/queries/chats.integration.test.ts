import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

// chats queries derive userId from the session; mock it to a stable test user.
const TEST_USER = "TEST-USER-CHATS";
vi.mock("@/lib/supabase/server", () => ({
  getUser: vi.fn(async () => ({ id: TEST_USER, email: "t@test.dev" })),
}));

import { prisma } from "@/lib/prisma";
import {
  listChats,
  createChat,
  getChatMessages,
  appendMessage,
  deleteChat,
} from "@/lib/queries/chats";
import { MAX_CHATS } from "@/lib/queries/chat-types";

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

describe("createChat", () => {
  it("creates chats up to the cap and blocks the 6th", async () => {
    for (let i = 0; i < MAX_CHATS; i++) {
      const r = await createChat(`chat ${i}`);
      expect(r.ok).toBe(true);
    }
    const sixth = await createChat("over the limit");
    expect(sixth.ok).toBe(false);
    expect((await listChats()).length).toBe(MAX_CHATS);
  });
});

describe("messages + ownership", () => {
  it("appends and reads messages for an owned chat", async () => {
    const r = await createChat("c1");
    if (!r.ok) throw new Error("setup");
    await appendMessage(r.chat.id, "user", "oi");
    await appendMessage(r.chat.id, "assistant", "olá", { trace: [] });
    const msgs = await getChatMessages(r.chat.id);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("returns nothing for a chat owned by someone else", async () => {
    const other = await prisma.chat.create({ data: { userId: "SOMEONE-ELSE", title: "x" } });
    const msgs = await getChatMessages(other.id);
    expect(msgs).toEqual([]);
    await prisma.chat.delete({ where: { id: other.id } });
  });

  it("deleteChat removes the chat and its messages", async () => {
    const r = await createChat("c2");
    if (!r.ok) throw new Error("setup");
    await appendMessage(r.chat.id, "user", "x");
    await deleteChat(r.chat.id);
    expect(await prisma.chat.findUnique({ where: { id: r.chat.id } })).toBeNull();
    expect(await prisma.chatMessage.count({ where: { chatId: r.chat.id } })).toBe(0);
  });
});
