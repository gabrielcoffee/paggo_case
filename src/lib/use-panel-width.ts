"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "expresso:panel-width";
export const PANEL_MIN = 360;
export const PANEL_MAX = 900;
const DEFAULT = 480;

function clamp(n: number): number {
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(n)));
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getClientSnapshot(): number {
  const stored = localStorage.getItem(KEY);
  if (stored) {
    const n = Number(stored);
    if (!Number.isNaN(n)) return clamp(n);
  }
  return DEFAULT;
}

function getServerSnapshot(): number {
  return DEFAULT;
}

// Detail-panel width persisted in localStorage and shared across every panel
// (invoice/customer sheets + the agent split panel) so the analyst sets it once.
export function usePanelWidth() {
  const width = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const setWidth = useCallback((w: number) => {
    localStorage.setItem(KEY, String(clamp(w)));
    listeners.forEach((l) => l());
  }, []);
  return { width, setWidth };
}
