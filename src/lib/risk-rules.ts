// Single source of truth for the prioritization rules: drives the read-only
// "Regras" popover and the rule labels shown in the invoice detail. Keep in sync
// with the scoring logic in `risk.ts`. Prisma-free (safe to import on the client).

export type RiskRuleMeta = {
  key: string;
  label: string;
  max: number; // max points this rule can contribute
  why: string;
};

export const RISK_RULES: RiskRuleMeta[] = [
  {
    key: "balance_at_risk",
    label: "Valor em aberto",
    max: 30,
    why: "Mais dinheiro em aberto = mais vale o tempo do analista. Linear até R$ 25k.",
  },
  {
    key: "aging",
    label: "Tempo de atraso",
    max: 20,
    why: "Dívida mais antiga é mais difícil de recuperar. Linear até 60 dias.",
  },
  {
    key: "chronicity",
    label: "Cliente cronicamente atrasado",
    max: 20,
    why: "Quem atrasa repetidamente tende a atrasar de novo. Linear até 5 atrasos.",
  },
  {
    key: "ent_first_late",
    label: "Enterprise atrasando 1ª vez",
    max: 15,
    why: "Enterprise costuma pagar em dia; 1º atraso é operacional e altamente recuperável.",
  },
  {
    key: "boleto_stuck",
    label: "Boleto travado",
    max: 10,
    why: "Boleto com várias tentativas = problema técnico, não falta de vontade. Oferecer PIX.",
  },
];

export const RULE_LABELS: Record<string, string> = Object.fromEntries(
  RISK_RULES.map((r) => [r.key, r.label]),
);
