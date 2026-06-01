"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { createInvoice } from "@/lib/actions/create";
import { normalizeText } from "@/lib/text";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { value: "SMB", label: "SMB" },
  { value: "MID", label: "Mid-market" },
  { value: "ENT", label: "Enterprise" },
] as const;
const METHODS = [
  { value: "BOLETO", label: "Boleto" },
  { value: "PIX", label: "PIX" },
  { value: "CREDIT_CARD", label: "Cartão" },
  { value: "BANK_TRANSFER", label: "Transferência" },
] as const;

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring/40 focus:ring-2";

type Method = (typeof METHODS)[number]["value"];
type Segment = (typeof SEGMENTS)[number]["value"];

export function InvoiceCreateModal({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");

  // existing customer picker
  const [custQuery, setCustQuery] = useState("");
  const [customerId, setCustomerId] = useState("");

  // new customer
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<Segment>("SMB");
  const [creditLimit, setCreditLimit] = useState("");

  // invoice
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState<Method>("BOLETO");

  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const selectedName = customers.find((c) => c.id === customerId)?.name ?? "";
  const matches = useMemo(() => {
    const nq = normalizeText(custQuery);
    if (!nq || nq === normalizeText(selectedName)) return [];
    return customers
      .filter((c) => normalizeText(`${c.name} ${c.id}`).includes(nq))
      .slice(0, 30);
  }, [custQuery, customers, selectedName]);

  function reset() {
    setMode("existing");
    setCustQuery("");
    setCustomerId("");
    setName("");
    setSegment("SMB");
    setCreditLimit("");
    setAmount("");
    setDueDate("");
    setMethod("BOLETO");
    setErr(null);
  }

  const canSubmit =
    !!amount &&
    !!dueDate &&
    (mode === "existing" ? !!customerId : !!name.trim());

  function submit() {
    start(async () => {
      const r = await createInvoice({
        customerId: mode === "existing" ? customerId : undefined,
        newCustomer:
          mode === "new"
            ? { name, segment, creditLimit: Number(creditLimit) || 0 }
            : undefined,
        amount: Number(amount) || 0,
        dueDate,
        paymentMethod: method,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
      toast.success("Fatura criada");
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Adicionar fatura
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova fatura</DialogTitle>
          </DialogHeader>

          {/* Customer: existing or new */}
          <div className="flex rounded-md border border-input bg-background p-0.5 text-xs font-medium">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded px-2.5 py-1 transition-colors",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "existing" ? "Cliente existente" : "Novo cliente"}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <div className="relative">
              <Field label="Cliente">
                <input
                  value={customerId ? selectedName : custQuery}
                  onChange={(e) => {
                    setCustQuery(e.target.value);
                    setCustomerId("");
                  }}
                  placeholder="Buscar por nome ou ID…"
                  className={inputCls}
                />
              </Field>
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustQuery(c.name);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <span className="min-w-0 truncate">{c.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {c.id}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {customerId && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
                  <Check className="h-3 w-3" /> {customerId}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Nome do cliente">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Razão social"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Segmento">
                  <select
                    value={segment}
                    onChange={(e) => setSegment(e.target.value as Segment)}
                    className={inputCls}
                  >
                    {SEGMENTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Limite (R$)">
                  <input
                    type="number"
                    min={0}
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="0"
                    className={inputCls}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* Invoice fields */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className={inputCls}
              />
            </Field>
            <Field label="Método">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                className={inputCls}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Vencimento">
            <DatePicker value={dueDate} onChange={setDueDate} placeholder="Selecionar data" />
          </Field>

          {err && <p className="text-xs text-destructive">{err}</p>}

          <Button loading={pending} disabled={pending || !canSubmit} onClick={submit}>
            Criar fatura
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
