import type { NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { streamAgent, type ChatTurn } from "@/lib/agent/loop";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });

  let body: { chatId?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { chatId, messages } = body;
  if (typeof chatId !== "string" || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "chatId e messages[] obrigatórios" }, { status: 400 });
  }

  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat || chat.userId !== user.id) {
    return Response.json({ error: "Chat inválido" }, { status: 403 });
  }

  // Persist the new user message (the last turn).
  const last = messages[messages.length - 1] as ChatTurn;
  if (last?.role === "user") {
    await prisma.chatMessage.create({
      data: { chatId, role: "user", content: String(last.content) },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let text = "";
      try {
        let planIds: string[] = [];
        let charts: unknown[] = [];
        let trace: unknown[] = [];
        for await (const ev of streamAgent(messages as ChatTurn[], chatId)) {
          if (ev.type === "text") {
            text += ev.delta;
            send({ type: "text", delta: ev.delta });
          } else {
            planIds = ev.planIds;
            charts = ev.charts;
            trace = ev.trace;
          }
        }
        const plans = planIds.length
          ? await prisma.agentPlan.findMany({ where: { id: { in: planIds } } })
          : [];
        const planData = plans.map((p) => ({
          id: p.id,
          summary: p.summary,
          steps: p.steps,
          status: p.status,
        }));
        const data = { plans: planData, charts, trace };
        await prisma.chatMessage.create({
          data: { chatId, role: "assistant", content: text, data: data as never },
        });
        await prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
        send({ type: "done", ...data });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
