"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_PARTICIPATION_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_PARTICIPATION_SUPABASE_KEY ?? "";
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY ?? "";
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && key.startsWith("sb_publishable_");
let client: SupabaseClient | null = null;
export function backend(): SupabaseClient {
  if (!configured) throw new Error("This service is being set up. Please check back soon.");
  if (!client) client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" } });
  return client;
}
export async function request<T>(action: string, body?: unknown, token?: string): Promise<T> {
  if (!configured) throw new Error("This service is being set up. Please check back soon.");
  const multipart = body instanceof FormData;
  const response = await fetch(`${url}/functions/v1/participation-api/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: key, ...(multipart ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't complete that request. Please try again.");
  return data as T;
}
