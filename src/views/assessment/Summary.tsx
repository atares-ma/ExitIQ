import { PROFILES, QUESTION_BY_ID, ROUTE_LABELS } from '../../model/catalogue';
import { HORIZON_OPTIONS, OBJECTIVE_OPTIONS, OWNERSHIP_OPTIONS, PERIMETER_OPTIONS, labelOf } from '../../model/options';
import { activeModules, applicableQuestions, pendingModules, resolveRoutes } from '../../model/routing';
import { dismissRouteChange, go, useAssessment, type Screen } from '../../lib/store';
import { Banner } from './Banners';

/** Section 5: a readable configuration summary the user can correct before scoring. */
export function Summary() {
  const s = useAssessment();
  const { ctx } = s;
  const routes = resolveRoutes(ctx);
  const active = activeModules(routes);
  const pending = pendingModules(routes);
  const n = applicableQuestions(routes).length;
  const profile = ctx.profile && ctx.profile !== 'UNDECIDED' ? PROFILES.find((p) => p.key === ctx.profile)!.name : 'Not confirmed yet';

  const rows: { label: string; value: string; chips: { label: string; tone: 'navy' | 'grey' | 'pending' }[]; edit: Screen }[] = [
    { label: 'Perspective', value: profile, chips: ctx.ownershipTags.map((t) => ({ label: labelOf(OWNERSHIP_OPTIONS, t), tone: 'grey' })), edit: 'c2' },
    { label: 'Transaction', value: ctx.objectives.map((o) => labelOf(OBJECTIVE_OPTIONS, o)).join(', ') || 'Not set', chips: [], edit: 'c2' },
    { label: 'Perimeter and timing', value: `${labelOf(PERIMETER_OPTIONS, ctx.perimeter)} · ${labelOf(HORIZON_OPTIONS, ctx.horizon)}`, chips: [], edit: 'c2' },
    { label: 'Active modules', value: active.length ? `${active.length} added to the core questions` : 'Core questions only', chips: active.map((k) => ({ label: ROUTE_LABELS[k], tone: 'navy' })), edit: 'c3' },
    { label: 'Unresolved', value: pending.length ? 'These stay open until clarified' : 'None', chips: pending.map((k) => ({ label: `${ROUTE_LABELS[k]} · not sure`, tone: 'pending' })), edit: 'c3' },
  ];

  const rc = s.routeChange;
  const started = Object.keys(s.answers).length > 0 || Object.keys(s.diag).length > 0;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="kicker">Before we start</div>
        <h1 className="h1" style={{ fontSize: 'clamp(30px,3.6vw,44px)' }}>Check how your assessment is set up.</h1>
        <p className="lead" style={{ color: 'rgba(255,255,255,0.86)', fontSize: 17 }}>This configuration decides which questions apply and how they are weighted. Correct anything that does not fit.</p>
      </div>

      {rc && (rc.added.length > 0 || rc.removed.length > 0 || rc.deactivated.length > 0 || rc.reactivated.length > 0) && (
        <Banner tone="lime" tag="Route change">
          {rc.added.length > 0 && <>Added: {rc.added.map((k) => ROUTE_LABELS[k]).join(', ')}. </>}
          {rc.removed.length > 0 && <>Removed: {rc.removed.map((k) => ROUTE_LABELS[k]).join(', ')}. </>}
          {rc.deactivated.length > 0 && <>Earlier answers set aside, not deleted: {rc.deactivated.map((q) => `${q} ${QUESTION_BY_ID[q].name}`).join(', ')}. </>}
          {rc.reactivated.length > 0 && <>Back in scope, please reconfirm: {rc.reactivated.map((q) => `${q} ${QUESTION_BY_ID[q].name}`).join(', ')}. </>}
          <button type="button" className="btn-link" style={{ background: 'none', border: 0, cursor: 'pointer', textDecoration: 'underline', color: 'inherit', padding: 0 }} onClick={dismissRouteChange}>Dismiss</button>
        </Banner>
      )}

      <div className="card-light" style={{ padding: 0, overflow: 'hidden' }}>
        <dl style={{ margin: 0 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) minmax(0, 1fr) auto', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--grey-1)', alignItems: 'start' }}>
              <dt style={{ fontSize: 13, color: 'var(--grey-4)', fontWeight: 600, paddingTop: 2 }}>{r.label}</dt>
              <dd style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{r.value}</span>
                {r.chips.length > 0 && (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {r.chips.map((c) => (
                      <span key={c.label} className="pill" style={c.tone === 'navy' ? { background: 'var(--navy-2)', color: 'var(--white)' } : c.tone === 'grey' ? { background: 'var(--grey-1)', border: '1px solid var(--grey-2)' } : { background: 'var(--white)', border: '1px solid var(--grey-3)' }}>{c.label}</span>
                    ))}
                  </span>
                )}
              </dd>
              <button type="button" className="btn-link" style={{ color: 'var(--teal-dark)', fontWeight: 700, fontSize: 13, background: 'none', border: 0, cursor: 'pointer' }} onClick={() => go(r.edit)} aria-label={`Edit ${r.label}`}>Edit</button>
            </div>
          ))}
        </dl>
        <div style={{ background: 'var(--grey-1)', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{n} questions apply to you</div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--grey-4)', lineHeight: 1.55 }}>
            Eight discovery questions come first; four of them are scored questions that are reused later, so you never answer twice.{' '}
            {pending.length ? 'Questions for unresolved topics are included until you clarify them.' : 'If you change the setup later, we show which questions were added or set aside and why.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-lime" onClick={() => go('discovery', { dIdx: 0 })}>{started ? 'Continue discovery' : 'Start discovery'} <span aria-hidden="true">→</span></button>
            {started && <button type="button" className="btn btn-outline" onClick={() => go('deep')}>Go to detailed questions</button>}
          </div>
        </div>
      </div>
    </>
  );
}
