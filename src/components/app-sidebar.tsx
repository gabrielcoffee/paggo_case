"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ReceiptText, Users, Sparkles, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/invoices", label: "Faturas", icon: ReceiptText },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/agent", label: "Agente", icon: Sparkles },
];

export function AppSidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();

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
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
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
