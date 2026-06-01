"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Bot, User, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/agent/markdown";
import { PlanModal, type PlanData } from "@/components/agent/plan-modal";
import { AgentChart } from "@/components/agent/agent-charts";
import type { EntitySelect } from "@/components/agent/chat-entity-list";
import type { PanelTab } from "@/components/invoice-detail-panel";
import { ToolTrace } from "@/components/agent/tool-trace";
import type { TraceEntry } from "@/lib/agent/loop";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getOrCreateChat, resetChat, getChatMessages } from "@/lib/queries/chats";
import { getPlanStatuses } from "@/lib/actions/agent-plan";

type ChartItem = { type: string; data: unknown; tab?: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  plans?: PlanData[];
  charts?: ChartItem[];
  trace?: TraceEntry[];
};

const SUGGESTIONS = [
  "Quais as 5 faturas de maior risco?",
  "Mostre a distribuição por risco da carteira.",
  "Faturas acima de R$5 mil de clientes com 3+ atrasos: prepare negociação + nota + follow-up.",
];

export function AgentChat({ onSelect }: { onSelect?: EntitySelect }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
    );
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    const stored = await getChatMessages(chatId);
    const msgs: Msg[] = stored.map((m) => {
      const d = (m.data ?? {}) as { plans?: PlanData[]; charts?: ChartItem[]; trace?: TraceEntry[] };
      return {
        role: m.role as "user" | "assistant",
        content: m.content,
        plans: d.plans,
        charts: d.charts,
        trace: d.trace,
      };
    });
    // Reconcile plan statuses (a saved message holds the status at save time).
    const planIds = msgs.flatMap((m) => m.plans?.map((p) => p.id) ?? []);
    if (planIds.length) {
      const statuses = await getPlanStatuses(planIds);
      for (const m of msgs)
        m.plans = m.plans?.map((p) => ({ ...p, status: statuses[p.id] ?? p.status }));
    }
    setMessages(msgs);
  }, []);

  // Single, persistent conversation per user: load (or create) the one chat.
  useEffect(() => {
    (async () => {
      try {
        const chat = await getOrCreateChat();
        setActiveId(chat.id);
        await loadMessages(chat.id);
      } finally {
        setInitializing(false);
      }
    })();
  }, [loadMessages]);

  // "Resetar chat": wipe the single conversation in place (keeps the same row).
  async function newChat() {
    if (creating || loading) return;
    if (!(await confirm({ title: "Resetar chat", description: "Apagar toda a conversa atual? Esta ação não pode ser desfeita.", confirmLabel: "Resetar" })))
      return;
    setCreating(true);
    setError(null);
    try {
      const chat = await resetChat();
      setActiveId(chat.id);
      setMessages([]);
    } finally {
      setCreating(false);
    }
  }

  function setPlanStatus(planId: string, status: string) {
    setMessages((msgs) =>
      msgs.map((m) =>
        m.plans ? { ...m, plans: m.plans.map((p) => (p.id === planId ? { ...p, status } : p)) } : m,
      ),
    );
  }

  // Immutably mutate the trailing assistant message as the stream arrives.
  function patchLast(patch: (m: Msg) => Msg) {
    setMessages((msgs) => {
      const copy = [...msgs];
      copy[copy.length - 1] = patch(copy[copy.length - 1]);
      return copy;
    });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);

    let chatId = activeId;
    if (!chatId) {
      const chat = await getOrCreateChat();
      chatId = chat.id;
      setActiveId(chatId);
    }

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const userMsg: Msg = { role: "user", content: q };
    setMessages((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    scrollDown();

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, messages: [...history, { role: "user", content: q }] }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: "Erro no agente" }));
        throw new Error(e.error ?? "Erro no agente");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "text") patchLast((m) => ({ ...m, content: m.content + evt.delta }));
          else if (evt.type === "done")
            patchLast((m) => ({ ...m, plans: evt.plans, charts: evt.charts, trace: evt.trace }));
          else if (evt.type === "error") throw new Error(evt.error);
          scrollDown();
        }
      }
      patchLast((m) => (m.content ? m : { ...m, content: "(sem resposta)" }));
    } catch (e) {
      setError((e as Error).message);
      patchLast((m) => ({ ...m, content: m.content || "⚠️ erro ao responder" }));
    } finally {
      setLoading(false);
      scrollDown();
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
        <Bot className="h-4 w-4 text-primary" />
        <div>
          <h1 className="text-base font-semibold">Agente</h1>
          <p className="text-xs text-muted-foreground">
            Lê a carteira e propõe ações — toda mudança pede sua confirmação
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={newChat}
          loading={creating}
          disabled={loading}
        >
          <Plus className="h-4 w-4" /> Resetar chat
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-5 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {initializing && (
            <div className="flex justify-center pt-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!initializing && messages.length === 0 && (
            <div className="space-y-3 pt-10 text-center">
              <p className="text-sm text-muted-foreground">Comece com:</p>
              <div className="flex flex-col items-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary/40 hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Bubble
              key={i}
              msg={m}
              streaming={loading && i === messages.length - 1}
              onStatus={setPlanStatus}
              onSelect={onSelect}
            />
          ))}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-3xl items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Pergunte ou peça uma ação…"
            className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none ring-ring/40 focus:ring-2"
          />
          <Button type="submit" size="icon-lg" disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </footer>
    </div>
  );
}

function Bubble({
  msg,
  streaming,
  onStatus,
  onSelect,
}: {
  msg: Msg;
  streaming: boolean;
  onStatus: (planId: string, status: string) => void;
  onSelect?: EntitySelect;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex animate-in gap-3 fade-in slide-in-from-bottom-1 duration-300", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-secondary" : "bg-primary/10 text-primary",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="min-w-0 max-w-[85%] space-y-2">
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isUser ? "whitespace-pre-wrap bg-primary text-primary-foreground" : "border border-border bg-card",
          )}
        >
          {isUser ? (
            msg.content
          ) : msg.content ? (
            <Markdown content={msg.content} onSelect={onSelect} />
          ) : streaming ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            "(sem resposta)"
          )}
        </div>
        {msg.charts?.map((c, i) => (
          <AgentChart
            key={i}
            type={c.type}
            data={c.data}
            tab={c.tab as PanelTab | undefined}
            onSelect={onSelect}
          />
        ))}
        {msg.plans?.map((p) => (
          <PlanModal key={p.id} plan={p} onStatus={onStatus} />
        ))}
        {msg.trace && msg.trace.length > 0 && <ToolTrace trace={msg.trace} />}
      </div>
    </div>
  );
}
