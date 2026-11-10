import { useAssessment } from '../../lib/store';

type Tone = 'red' | 'lime' | 'white';
const TONES: Record<Tone, { border: string; bg: string; tagBg: string; tagFg: string }> = {
  red: { border: 'var(--red)', bg: 'rgba(243,72,50,0.12)', tagBg: 'var(--red)', tagFg: 'var(--white)' },
  lime: { border: 'rgba(223,254,0,0.5)', bg: 'rgba(223,254,0,0.08)', tagBg: 'var(--lime-2)', tagFg: 'var(--navy)' },
  white: { border: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.06)', tagBg: 'var(--white)', tagFg: 'var(--navy)' },
};

export function Banner({ tone, tag, children }: { tone: Tone; tag: string; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <div className="banner" role="note" style={{ borderColor: t.border, background: t.bg }}>
      <span className="pill" style={{ background: t.tagBg, color: t.tagFg }}>{tag}</span>
      <span>{children}</span>
    </div>
  );
}

/** Section 3/4: specialist routes, liquidity review and pending profile are always visible. */
export function Banners() {
  const { ctx } = useAssessment();
  const out: React.ReactNode[] = [];
  if (ctx.liquidity === 'acute') {
    out.push(<Banner key="acute" tone="red" tag="Specialist route">You confirmed acute payment pressure. Your progress is kept and preparatory observations are shown, but a standard readiness conclusion is withheld. Please obtain a qualified assessment first; ExitIQ does not diagnose insolvency.</Banner>);
  } else if (ctx.liquidity === 'potential' || ctx.liquidity === 'unknown') {
    out.push(<Banner key="liq" tone="lime" tag="Review task">Liquidity over the next six months needs a review. A task has been added to your action plan.</Banner>);
  }
  if (ctx.objectives.includes('ipo') || ctx.objectives.includes('distress')) {
    out.push(<Banner key="ipo" tone="lime" tag="Specialist route">IPO and distress situations need a specialist route. Your progress is kept and relevant preparation is shown, without a standard readiness conclusion.</Banner>);
  }
  if (ctx.profile === 'UNDECIDED') {
    out.push(<Banner key="prof" tone="white" tag="Scoring pending">Confirm a perspective to enable scoring. Discovery and the detailed questions work without it.</Banner>);
  }
  return out.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{out}</div> : null;
}
