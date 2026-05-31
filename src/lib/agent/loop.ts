import Anthropic from "@anthropic-ai/sdk";
import {
  AGENT_MODEL,
  AGENT_MAX_TOKENS,
  MAX_TOOL_ITERATIONS,
  buildSystemPrompt,
} from "@/lib/agent/config";
import { TOOL_DEFS, runTool, type ChartPayload } from "@/lib/agent/tools";
import { appToday } from "@/lib/risk";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type TraceEntry = { name: string; input: unknown; isError: boolean };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "done"; planIds: string[]; charts: ChartPayload[]; trace: TraceEntry[] };

// Streaming manual tool-use loop. Yields text deltas as they arrive across tool
// rounds, then a final `done` event with the AgentPlan ids, charts, and tool trace.
export async function* streamAgent(
  history: ChatTurn[],
  sessionId: string,
): AsyncGenerator<AgentEvent> {
  const client = new Anthropic();
  const today = appToday().toISOString().slice(0, 10);
  const system = [
    { type: "text" as const, text: buildSystemPrompt(today), cache_control: { type: "ephemeral" as const } },
  ];
  const tools = TOOL_DEFS as unknown as Anthropic.Tool[];
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  const planIds: string[] = [];
  const charts: ChartPayload[] = [];
  const trace: TraceEntry[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const stream = client.messages.stream({
      model: AGENT_MODEL,
      max_tokens: AGENT_MAX_TOKENS,
      system,
      tools,
      messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", delta: event.delta.text };
      }
    }

    const msg = await stream.finalMessage();
    messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason !== "tool_use") break;

    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const outcome = await runTool(tu.name, tu.input as Record<string, unknown>, sessionId);
      trace.push({ name: tu.name, input: tu.input, isError: !!outcome.isError });
      if (outcome.planId) planIds.push(outcome.planId);
      if (outcome.chart) charts.push(outcome.chart);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: outcome.content,
        is_error: outcome.isError ?? false,
      });
    }
    messages.push({ role: "user", content: results });
  }

  yield { type: "done", planIds, charts, trace };
}

// Non-streaming wrapper (tests + fallback): drains the stream into a full result.
export async function runAgent(
  history: ChatTurn[],
  sessionId: string,
): Promise<{ text: string; planIds: string[]; charts: ChartPayload[]; trace: TraceEntry[] }> {
  let text = "";
  let planIds: string[] = [];
  let charts: ChartPayload[] = [];
  let trace: TraceEntry[] = [];
  for await (const ev of streamAgent(history, sessionId)) {
    if (ev.type === "text") text += ev.delta;
    else {
      planIds = ev.planIds;
      charts = ev.charts;
      trace = ev.trace;
    }
  }
  return { text, planIds, charts, trace };
}
