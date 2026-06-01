"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  Users,
  Sparkles,
  LogOut,
  MessageSquare,
  Clock,
  Handshake,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = { href: string; label: string; icon: LucideIcon; children?: NavItem[] };

const NAV: NavItem[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  {
    href: "/invoices",
    label: "Faturas",
    icon: ReceiptText,
    children: [
      { href: "/notes", label: "Notas", icon: MessageSquare },
      { href: "/followups", label: "Follow-ups", icon: Clock },
      { href: "/agreements", label: "Acordos", icon: Handshake },
    ],
  },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/agent", label: "Agente", icon: Sparkles },
];

export function AppSidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary font-mono text-sm font-bold text-sidebar-primary-foreground">
          P
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-sidebar-foreground">Paggo</div>
          <div className="text-[11px] text-muted-foreground">Collections</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV.map((item) => {
          if (!item.children) {
            return <NavLink key={item.href} item={item} active={isActive(item.href)} />;
          }
          const childActive = item.children.some((c) => isActive(c.href));
          const expanded = open[item.href] ?? childActive;
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <div key={item.href}>
              <div
                className={cn(
                  "flex items-center rounded-md pr-1 transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Link
                  href={item.href}
                  className="flex flex-1 items-center gap-2.5 px-2.5 py-2 text-sm font-medium"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [item.href]: !expanded }))}
                  aria-label={expanded ? "Recolher" : "Expandir"}
                  aria-expanded={expanded}
                  className="rounded p-1 opacity-70 hover:opacity-100"
                >
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")}
                  />
                </button>
              </div>

              <div
                className={cn(
                  "grid transition-all duration-200 ease-out",
                  expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {item.children.map((c) => (
                      <NavLink key={c.href} item={c} active={isActive(c.href)} nested />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <div className="rounded-md bg-sidebar-accent/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-sidebar-foreground">Data de referência</span>
          <br />
          01/04/2026 · carteira de 90 dias
        </div>
        <div className="flex items-center justify-between gap-2">
          {userEmail && (
            <span className="min-w-0 truncate text-[11px] text-muted-foreground" title={userEmail}>
              {userEmail}
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
            {userEmail && (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  aria-label="Sair"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sair
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  nested,
}: {
  item: NavItem;
  active: boolean;
  nested?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors",
        nested ? "pl-8 pr-2.5 text-[13px]" : "px-2.5",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
    >
      <Icon className={nested ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {item.label}
    </Link>
  );
}
