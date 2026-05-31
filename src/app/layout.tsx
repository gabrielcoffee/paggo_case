import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { getUser } from "@/lib/supabase/server";

const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paggo Collections",
  description: "B2B collections cockpit — triage, act, and automate overdue invoices.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUser();
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {user ? (
          <div className="flex min-h-screen">
            <AppSidebar userEmail={user.email ?? ""} />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
