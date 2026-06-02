import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { getSessionUser } from "@/lib/supabase/server";

const sans = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Expresso Collections",
  description: "B2B collections cockpit — triage, act, and automate overdue invoices.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeProvider>
          <ConfirmProvider>
            {user ? (
              <div className="flex min-h-screen">
                <AppSidebar userEmail={user.email ?? ""} />
                <main className="min-w-0 flex-1">{children}</main>
              </div>
            ) : (
              children
            )}
          </ConfirmProvider>
          <Toaster richColors position="bottom-center" duration={3200} offset={24} />
        </ThemeProvider>
      </body>
    </html>
  );
}
