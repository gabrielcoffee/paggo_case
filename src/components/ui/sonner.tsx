"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Sonner defaults to the light theme; sync it with next-themes so toasts follow
// dark mode.
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return <Sonner theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"} {...props} />;
}
