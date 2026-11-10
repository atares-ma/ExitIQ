import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Public values: the project URL and the publishable key are designed to ship
// in the browser bundle. Row Level Security protects the data. Never put a
// secret / service-role key here or in any VITE_ variable.
const DEFAULT_URL = 'https://elpjwoujqzskgydytvob.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_PoJzvUpZYg_QJ0r7FIGYGQ_9GKwsSWA';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || DEFAULT_PUBLISHABLE_KEY;

const FETCH_TIMEOUT_MS = 15_000;

// supabase-js does not time out its own requests. A stalled request (captive
// portal, throttled background tab) would otherwise leave the save indicator
// spinning forever, so every call gets a hard ceiling.
const timedFetch: typeof fetch = (input, init) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException('Request timed out', 'TimeoutError')), FETCH_TIMEOUT_MS);
  init?.signal?.addEventListener('abort', () => ac.abort(init.signal?.reason), { once: true });
  return fetch(input, { ...init, signal: ac.signal }).finally(() => clearTimeout(timer));
};

export const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: timedFetch },
});

export const SUPABASE_URL = url;
