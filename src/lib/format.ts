const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Numeric = number | string | { toString(): string };

function toNumber(v: Numeric): number {
  return typeof v === "number" ? v : Number(v.toString());
}

export function brl(v: Numeric): string {
  return BRL.format(toNumber(v));
}

export function brlCompact(v: Numeric): string {
  return BRL_COMPACT.format(toNumber(v));
}

export function date(v: Date | string | null | undefined): string {
  if (!v) return "—";
  return DATE.format(typeof v === "string" ? new Date(v) : v);
}

export function dateTime(v: Date | string | null | undefined): string {
  if (!v) return "—";
  return DATETIME.format(typeof v === "string" ? new Date(v) : v);
}
