"use client";

import {
  fetchCustomerDetail,
  type CustomerDetail,
} from "@/lib/actions/customer-detail";

// Mirrors detail-cache.ts for customers: hover warms the cache so the sheet opens
// instantly; writes invalidate the entry.
const cache = new Map<string, Promise<CustomerDetail | null>>();

export function prefetchCustomer(id: string): void {
  if (!cache.has(id)) cache.set(id, fetchCustomerDetail(id));
}

export function getCustomer(id: string): Promise<CustomerDetail | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetchCustomerDetail(id);
    cache.set(id, p);
  }
  return p;
}

export function invalidateCustomer(id: string): void {
  cache.delete(id);
}
