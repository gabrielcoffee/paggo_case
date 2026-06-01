"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { NumberInput } from "@/components/ui/number-input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SEGMENT_LABELS, STATUS_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { AGING_BUCKETS, AGING_LABELS } from "@/lib/aging";
import { CHANNELS, STATUS_TARGETS, templateVars } from "@/lib/automation/automation-spec";
import { PRESET_LABELS, REPORT_PRESETS, type ReportPreset } from "@/lib/report/report-config";
import { createAutomation, previewMatches } from "@/lib/actions/automations";

type Kind = "invoice" | "customer" | "report";
type EffectKind = "note" | "followup" | "status" | "report_email";

const CHANNEL_LABELS: Record<string, string> = { phone: "Telefone", email: "E-mail", whatsapp: "WhatsApp" };
const SEGMENTS = ["SMB", "MID", "ENT"];
const FREQS = [
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
] as const;

const inputCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring/40 focus:ring-2";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {n}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="space-y-3 pl-7">{children}</div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{children}</span>;
}

export function AutomationForm({
  open,
  onOpenChange,
  today,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  today: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("invoice");

  // condition (superset; only the relevant fields are read per kind)
  const [scope, setScope] = useState<"unpaid" | "overdue" | "all">("overdue");
  const [segment, setSegment] = useState<string[]>([]);
  const [aging, setAging] = useState<string[]>([]);
  const [minRisk, setMinRisk] = useState(0);
  const [minOpen, setMinOpen] = useState(0);
  const [minOverdueAr, setMinOverdueAr] = useState(0);
  const [minOverdueCount, setMinOverdueCount] = useState(0);

  // effect
  const [effectKind, setEffectKind] = useState<EffectKind>("followup");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("phone");
  const [dueOffsetDays, setDueOffsetDays] = useState(1);
  const [statusTo, setStatusTo] = useState<(typeof STATUS_TARGETS)[number]>("in_negotiation");
  const [reportPreset, setReportPreset] = useState<ReportPreset>("maior_risco");
  const [reportCount, setReportCount] = useState<5 | 10 | 15>(10);

  // schedule
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [startDate, setStartDate] = useState(today.slice(0, 10));
  const [timeOfDay, setTimeOfDay] = useState("10:00");

  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const target = kind === "customer" ? "customer" : "invoice";
  const isReport = kind === "report";

  function condition() {
    if (kind === "invoice") return { scope, segment, status: [], aging, minRisk, minOpen };
    if (kind === "customer") return { segment, minOpenAr: 0, minOverdueAr, minOverdueCount };
    return {};
  }

  // Live preview of how many entities match right now (debounced). Shows a
  // spinner from the moment an input changes until the new count lands.
  useEffect(() => {
    if (!open || isReport) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewing(true);
    const cond = condition();
    const t = setTimeout(async () => {
      const n = await previewMatches(target, cond);
      if (alive) {
        setPreview(n);
        setPreviewing(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, scope, JSON.stringify(segment), JSON.stringify(aging), minRisk, minOpen, minOverdueAr, minOverdueCount]);

  // Keep the effect kind valid for the chosen target.
  function pickKind(k: Kind) {
    setKind(k);
    if (k === "report") setEffectKind("report_email");
    else if (effectKind === "report_email" || (k === "customer" && effectKind === "status")) setEffectKind("followup");
  }

  function insertVar(v: string) {
    setBodyTemplate((b) => `${b}{${v}}`);
    bodyRef.current?.focus();
  }

  function toggle(list: string[], v: string, set: (x: string[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  function buildEffect() {
    if (effectKind === "note") return { kind: "note", bodyTemplate };
    if (effectKind === "followup") return { kind: "followup", channel, dueOffsetDays, bodyTemplate };
    if (effectKind === "status") return { kind: "status", to: statusTo };
    return { kind: "report_email", reportConfig: { preset: reportPreset, count: reportCount } };
  }

  const needsBody = effectKind === "note" || effectKind === "followup";
  const canSave = !!name.trim() && !!startDate && (!needsBody || !!bodyTemplate.trim());

  async function submit() {
    setSaving(true);
    try {
      const r = await createAutomation({
        name,
        target,
        condition: condition(),
        effect: buildEffect(),
        schedule: { frequency, startDate, timeOfDay },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Automação criada");
      onOpenChange(false);
      reset();
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setName("");
    setKind("invoice");
    setScope("overdue");
    setSegment([]);
    setAging([]);
    setMinRisk(0);
    setMinOpen(0);
    setMinOverdueAr(0);
    setMinOverdueCount(0);
    setEffectKind("followup");
    setBodyTemplate("");
    setFrequency("weekly");
    setStartDate(today.slice(0, 10));
    setTimeOfDay("10:00");
    setPreview(null);
  }

  const effectOptions: { value: EffectKind; label: string }[] = isReport
    ? [{ value: "report_email", label: "Enviar relatório por email" }]
    : kind === "invoice"
      ? [
          { value: "note", label: "Escrever nota" },
          { value: "followup", label: "Agendar follow-up" },
          { value: "status", label: "Mudar status" },
        ]
      : [
          { value: "note", label: "Escrever nota" },
          { value: "followup", label: "Agendar follow-up" },
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova automação</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <label className="flex flex-col gap-1.5">
            <Lbl>Nome</Lbl>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Cobrança Enterprise vencida"
              className={inputCls}
            />
          </label>

          <Section n={1} title="Gatilho — o que monitorar">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={kind === "invoice"} onClick={() => pickKind("invoice")}>Faturas</Chip>
              <Chip active={kind === "customer"} onClick={() => pickKind("customer")}>Clientes</Chip>
              <Chip active={kind === "report"} onClick={() => pickKind("report")}>Carteira (relatório)</Chip>
            </div>

            {kind === "invoice" && (
              <>
                <label className="flex flex-col gap-1.5">
                  <Lbl>Escopo</Lbl>
                  <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={inputCls}>
                    <option value="overdue">Vencidas</option>
                    <option value="unpaid">Em aberto</option>
                    <option value="all">Todas</option>
                  </select>
                </label>
                <div className="flex flex-col gap-1.5">
                  <Lbl>Segmento</Lbl>
                  <div className="flex flex-wrap gap-1.5">
                    {SEGMENTS.map((s) => (
                      <Chip key={s} active={segment.includes(s)} onClick={() => toggle(segment, s, setSegment)}>
                        {SEGMENT_LABELS[s] ?? s}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Lbl>Faixa de atraso</Lbl>
                  <div className="flex flex-wrap gap-1.5">
                    {AGING_BUCKETS.map((b) => (
                      <Chip key={b} active={aging.includes(b)} onClick={() => toggle(aging, b, setAging)}>
                        {AGING_LABELS[b]}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <Lbl>Risco mínimo</Lbl>
                    <NumberInput value={minRisk} onChange={setMinRisk} min={0} max={100} step={5} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <Lbl>Em aberto ≥ (R$)</Lbl>
                    <NumberInput value={minOpen} onChange={setMinOpen} min={0} step={1000} />
                  </label>
                </div>
              </>
            )}

            {kind === "customer" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Lbl>Segmento</Lbl>
                  <div className="flex flex-wrap gap-1.5">
                    {SEGMENTS.map((s) => (
                      <Chip key={s} active={segment.includes(s)} onClick={() => toggle(segment, s, setSegment)}>
                        {SEGMENT_LABELS[s] ?? s}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <Lbl>AR vencido ≥ (R$)</Lbl>
                    <NumberInput value={minOverdueAr} onChange={setMinOverdueAr} min={0} step={1000} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <Lbl>Qtd. vencidas ≥</Lbl>
                    <NumberInput value={minOverdueCount} onChange={setMinOverdueCount} min={0} step={1} />
                  </label>
                </div>
              </>
            )}

            {!isReport && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {previewing || preview === null ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando correspondências…
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">{preview}</span>{" "}
                    {target === "invoice" ? "fatura(s)" : "cliente(s)"} correspondem agora.
                  </>
                )}
              </p>
            )}
          </Section>

          <Section n={2} title="Ação — o que fazer">
            <label className="flex flex-col gap-1.5">
              <Lbl>Ação</Lbl>
              <select value={effectKind} onChange={(e) => setEffectKind(e.target.value as EffectKind)} className={inputCls}>
                {effectOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            {effectKind === "followup" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <Lbl>Canal</Lbl>
                  <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className={inputCls}>
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <Lbl>Vencimento em (dias)</Lbl>
                  <NumberInput value={dueOffsetDays} onChange={setDueOffsetDays} min={0} max={365} step={1} />
                </label>
              </div>
            )}

            {needsBody && (
              <div className="flex flex-col gap-1.5">
                <Lbl>Texto (use variáveis)</Lbl>
                <textarea
                  ref={bodyRef}
                  value={bodyTemplate}
                  onChange={(e) => setBodyTemplate(e.target.value)}
                  rows={2}
                  placeholder="Ex.: Cliente {cliente} deve {valor_aberto} há {dias_atraso} dias."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-ring/40 focus:ring-2"
                />
                <div className="flex flex-wrap gap-1.5">
                  {templateVars(target).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVar(v)}
                      className="rounded border border-input px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {effectKind === "status" && (
              <label className="flex flex-col gap-1.5">
                <Lbl>Novo status</Lbl>
                <select value={statusTo} onChange={(e) => setStatusTo(e.target.value as typeof statusTo)} className={inputCls}>
                  {STATUS_TARGETS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s as InvoiceStatus] ?? s}</option>
                  ))}
                </select>
              </label>
            )}

            {effectKind === "report_email" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <Lbl>Relatório</Lbl>
                  <select value={reportPreset} onChange={(e) => setReportPreset(e.target.value as ReportPreset)} className={inputCls}>
                    {REPORT_PRESETS.filter((p) => p !== "custom").map((p) => (
                      <option key={p} value={p}>{PRESET_LABELS[p]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <Lbl>Quantidade</Lbl>
                  <select value={reportCount} onChange={(e) => setReportCount(Number(e.target.value) as 5 | 10 | 15)} className={inputCls}>
                    {[5, 10, 15].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <p className="col-span-2 text-[11px] text-muted-foreground">Enviado para o seu email cadastrado.</p>
              </div>
            )}
          </Section>

          <Section n={3} title="Agenda — quando rodar">
            <div className="flex flex-wrap gap-1.5">
              {FREQS.map((f) => (
                <Chip key={f.value} active={frequency === f.value} onClick={() => setFrequency(f.value)}>
                  {f.label}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <Lbl>Data de início</Lbl>
                <DatePicker value={startDate} onChange={setStartDate} placeholder="Selecionar data" />
              </label>
              <label className="flex flex-col gap-1.5">
                <Lbl>Horário de início</Lbl>
                <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={inputCls} />
              </label>
            </div>
          </Section>
        </div>

        <div className="mt-2 flex justify-end">
          <Button onClick={submit} loading={saving} disabled={saving || !canSave}>
            Criar automação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
