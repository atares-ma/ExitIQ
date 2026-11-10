// Cloudflare Turnstile for Supabase anonymous sign-in. With CAPTCHA protection
// enabled in Supabase (Authentication → Attack Protection), signInAnonymously
// is rejected unless it carries a fresh Turnstile token.
//
// The site key is public. The secret key lives only in the Supabase dashboard.

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 60_000;

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window { turnstile?: Turnstile }
}

export const captchaEnabled = SITE_KEY.length > 0;

let scriptPromise: Promise<Turnstile> | null = null;
function loadScript(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Turnstile script could not be loaded'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Returns a single-use Turnstile token, or null when no site key is configured.
 * The widget only becomes visible (bottom right) if Cloudflare asks the visitor
 * to interact; otherwise it runs invisibly.
 */
export async function getCaptchaToken(): Promise<string | null> {
  if (!captchaEnabled) return null;
  const ts = await loadScript();
  const host = document.createElement('div');
  host.setAttribute('aria-live', 'polite');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:1000';
  document.body.appendChild(host);
  let id = '';
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Verification timed out')), TIMEOUT_MS);
      id = ts.render(host, {
        sitekey: SITE_KEY,
        action: 'anonymous-sign-in',
        appearance: 'interaction-only',
        execution: 'execute',
        callback: (token: string) => { clearTimeout(timer); resolve(token); },
        'error-callback': () => { clearTimeout(timer); reject(new Error('Verification failed')); },
        'expired-callback': () => { clearTimeout(timer); reject(new Error('Verification expired')); },
      });
      ts.execute(id);
    });
  } finally {
    if (id) ts.remove(id);
    host.remove();
  }
}
