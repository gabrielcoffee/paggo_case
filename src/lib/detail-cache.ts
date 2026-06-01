"use client";

import { fetchInvoiceDetail, type InvoiceDetail } from "@/lib/actions/invoice-detail";

// Client-side cache of invoice detail promises. Hovering a row warms the cache
// so opening the sheet is instant (no "Carregando"). Promises are memoized so
// concurrent hovers/opens dedupe; writes invalidate the entry.
const cache = new Map<string, Promise<InvoiceDetail | null>>();

export function prefetchDetail(id: string): void {
  if (!cache.has(id)) cache.set(id, fetchInvoiceDetail(id));
}

export function getDetail(id: string): Promise<InvoiceDetail | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetchInvoiceDetail(id);
    cache.set(id, p);
  }
  return p;
}

export function invalidateDetail(id: string): void {
  cache.delete(id);
}
