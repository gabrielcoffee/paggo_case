"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createCustomer } from "@/lib/actions/create";

const SEGMENTS = [
  { value: "SMB", label: "SMB" },
  { value: "MID", label: "Mid-market" },
  { value: "ENT", label: "Enterprise" },
] as const;

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring/40 focus:ring-2";

export function CustomerCreateModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<"SMB" | "MID" | "ENT">("SMB");
  const [creditLimit, setCreditLimit] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setName("");
    setSegment("SMB");
    setCreditLimit("");
    setErr(null);
  }

  function submit() {
    start(async () => {
      const r = await createCustomer({
        name,
        segment,
        creditLimit: Number(creditLimit) || 0,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
      toast.success("Cliente criado");
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Adicionar cliente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
          </DialogHeader>

          <Field label="Nome">
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
                onChange={(e) => setSegment(e.target.value as "SMB" | "MID" | "ENT")}
                className={inputCls}
              >
                {SEGMENTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Limite de crédito (R$)">
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

          {err && <p className="text-xs text-destructive">{err}</p>}

          <Button loading={pending} disabled={pending || !name.trim()} onClick={submit}>
            Criar cliente
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
