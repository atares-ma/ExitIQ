import type { KeyboardEvent, ReactNode } from 'react';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <a href={href} className="brand" aria-label="ExitIQ by atares, home">
      <img src="/media/atares-logo-white.png" alt="atares" />
      <span className="divider" aria-hidden="true" />
      <span className="name">Exit<b>IQ</b></span>
    </a>
  );
}

/** Arrow-key navigation inside a radio group, as native radios would do. */
function arrowNav(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'];
  if (!keys.includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const n = items[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
  n.focus();
  n.click();
}

export interface Choice<T extends string | number> { value: T; label: string; sub?: string; tag?: string }

export function RadioGroup<T extends string | number>({ label, choices, value, onChange, min = '200px', layout = 'grid' }: {
  label: string; choices: Choice<T>[]; value: T | null | undefined; onChange: (v: T) => void; min?: string; layout?: 'grid' | 'list';
}) {
  const hasValue = choices.some((c) => c.value === value);
  return (
    <div role="radiogroup" aria-label={label} className={layout === 'grid' ? 'opt-grid' : 'opt-list'} style={{ ['--min' as string]: min }} onKeyDown={arrowNav}>
      {choices.map((c, i) => {
        const on = c.value === value;
        return (
          <button type="button" key={String(c.value)} role="radio" aria-checked={on} tabIndex={on || (!hasValue && i === 0) ? 0 : -1} className="opt" onClick={() => onChange(c.value)}>
            <span className="mark" aria-hidden="true" />
            <span>
              {c.label}
              {c.sub && <span className="sub">{c.sub}</span>}
            </span>
            {c.tag && <span className="tag">{c.tag}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function CheckboxGroup<T extends string>({ label, choices, values, onToggle, min = '200px', layout = 'grid' }: {
  label: string; choices: Choice<T>[]; values: T[]; onToggle: (v: T) => void; min?: string; layout?: 'grid' | 'list';
}) {
  return (
    <div role="group" aria-label={label} className={layout === 'grid' ? 'opt-grid' : 'opt-list'} style={{ ['--min' as string]: min }}>
      {choices.map((c) => {
        const on = values.includes(c.value);
        return (
          <button type="button" key={c.value} role="checkbox" aria-checked={on} className="opt" onClick={() => onToggle(c.value)}>
            <span className="mark" aria-hidden="true">{on ? '✓' : ''}</span>
            <span>
              {c.label}
              {c.sub && <span className="sub">{c.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ label, choices, value, onChange }: {
  label: string; choices: Choice<T>[]; value: T | null | undefined; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={arrowNav}>
      {choices.map((c, i) => (
        <button type="button" key={c.value} role="radio" aria-checked={c.value === value} tabIndex={c.value === value || (!value && i === 0) ? 0 : -1} onClick={() => onChange(c.value)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export function Field({ label, why, children, id }: { label: string; why?: string; children: ReactNode; id?: string }) {
  return (
    <section className="glass field" aria-labelledby={id}>
      <h2 className="field-label" id={id}>{label}</h2>
      {why && <p className="field-why">{why}</p>}
      {children}
    </section>
  );
}

export function Bar({ value, color = 'var(--navy-2)', dark = false, open = 0, label }: { value: number; color?: string; dark?: boolean; open?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const o = Math.max(0, Math.min(100 - v, open));
  return (
    <div className={`bar${dark ? ' dark' : ''}`} role="img" aria-label={label}>
      <i style={{ width: `${v}%`, background: color }} />
      {o > 0 && <i className="hatched" style={{ left: `${v}%`, width: `${o}%`, borderRadius: 0 }} />}
    </div>
  );
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
