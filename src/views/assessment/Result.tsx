import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../../App';
import { Bar, pct } from '../../components/ui';
import { DIMENSIONS, PROFILES, ROUTE_LABELS } from '../../model/catalogue';
import { HORIZON_OPTIONS, OBJECTIVE_OPTIONS, PERIMETER_OPTIONS, labelOf } from '../../model/options';
import { buildResult, type Task } from '../../model/plan';
import type { DimensionResult } from '../../model/scoring';
import { track } from '../../lib/remote';
import { deleteEverything, go, recordResult, setTaskStatus, useAssessment, type TaskStatus } from '../../lib/store';
import { deepList } from './Deep';

const STATUS_PILL: Record<DimensionResult['status'], { label: string; bg: string; fg: string }> = {
  complete: { label: 'Complete', bg: 'var(--navy-2)', fg: 'var(--lime)' },
  indicative: { label: 'Indicative, incomplete', bg: 'rgba(0,195,191,0.16)', fg: 'var(--teal-dark)' },
  insufficient_coverage: { label: 'Insufficient coverage', bg: 'var(--grey-1)', fg: 'var(--grey-4)' },
  pending_profile: { label: 'Scoring pending', bg: 'var(--grey-1)', fg: 'var(--grey-4)' },
  specialist_route: { label: 'Specialist route', bg: 'rgba(243,72,50,0.12)', fg: 'var(--red)' },
  model_exception: { label: 'Model exception', bg: 'var(--grey-1)', fg: 'var(--grey-4)' },
};

const TASK_PILL: Record<string, { bg: string; fg: string }> = {
  Critical: { bg: 'var(--red)', fg: 'var(--white)' },
  'Needs review': { bg: 'var(--lime-2)', fg: 'var(--navy)' },
  Clarify: { bg: 'var(--lime-2)', fg: 'var(--navy)' },
  Reconfirm: { bg: 'var(--lime-2)', fg: 'var(--navy)' },
  'Adviser review': { bg: 'var(--lime-2)', fg: 'var(--navy)' },
  Confirm: { bg: 'var(--lime-2)', fg: 'var(--navy)' },
  Unanswered: { bg: 'var(--grey-1)', fg: 'var(--grey-4)' },
  Gap: { bg: 'var(--navy-2)', fg: 'var(--white)' },
  Partial: { bg: 'var(--navy-2)', fg: 'var(--white)' },
};

function dimensionNote(d: DimensionResult): string {
  switch (d.status) {
    case 'complete': return 'All applicable questions answered';
    case 'indicative': return `Missing-answer range ${Math.round(d.lower)} to ${Math.round(d.upper)}${d.pendingApplicability ? ' · applicability pending' : ''}`;
    case 'insufficient_coverage': return `${d.openCount} question${d.openCount === 1 ? '' : 's'} open. An index needs 80% coverage and every area at least half answered.`;
    case 'pending_profile': return 'Confirm a perspective to see an index.';
    case 'specialist_route': return 'A standard readiness conclusion is withheld on the specialist route.';
    case 'model_exception': return 'An area has no applicable questions. This needs an approved model exception.';
  }
}

function csv(tasks: Task[], status: Record<string, TaskStatus>): string {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Priority', 'Type', 'Title', 'Reason', 'Action', 'Suggested owner', 'Suggested timing', 'Depends on', 'Evidence required', 'Dimension', 'Area', 'Questions', 'Status'];
  const rows = tasks.map((t) => [t.priorityClass, t.label, t.title, t.reason, t.action, t.accountableRole, t.suggestedTiming, t.dependencies.join(' '), t.evidenceRequired, t.dimension, t.domain, t.sourceQuestionIds.join(' '), status[t.key] ?? 'open']);
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

export function Result() {
  const s = useAssessment();
  const r = useMemo(() => buildResult(s.ctx, s.answers), [s.ctx, s.answers]);
  const [filter, setFilter] = useState<'all' | 'critical' | 'open' | 'gap'>('all');
  const [showAll, setShowAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    recordResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.dataStatus, JSON.stringify(r.dimensions.map((d) => d.displayIndex)), r.profile]);

  const profileName = PROFILES.find((p) => p.key === r.score.weightingProfile)!.name;
  const chips = [
    s.ctx.profile && s.ctx.profile !== 'UNDECIDED' ? profileName : 'Perspective not confirmed',
    s.ctx.objectives.map((o) => labelOf(OBJECTIVE_OPTIONS, o)).join(', ') || 'Objective not set',
    labelOf(PERIMETER_OPTIONS, s.ctx.perimeter),
    labelOf(HORIZON_OPTIONS, s.ctx.horizon),
    ...r.activeModules.map((k) => ROUTE_LABELS[k]),
  ];
  const list = deepList(s.ctx);
  const openQuestion = (qid: string) => go('deep', { qIdx: Math.max(0, list.findIndex((x) => x.q.id === qid)) });

  const tasks = r.tasks.filter((t) => filter === 'all' || t.kind === filter);
  const shown = showAll ? tasks : tasks.slice(0, 8);
  const count = (k: Task['kind']) => r.tasks.filter((t) => t.kind === k).length;
  const prev = s.previousSnapshot;
  const complete = r.dataStatus === 'data_complete';

  const download = () => {
    const blob = new Blob(['﻿' + csv(r.tasks, s.taskStatus)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exitiq-action-plan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    track('export', s.remoteId, { stage: 'RESULT' });
  };

  return (
    <main style={{ flex: 1 }}>
      <section className="result-hero">
        <div className="wrap" style={{ padding: '44px 24px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span className="kicker">Action plan · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <h1 className="h1" style={{ color: 'var(--lime)', maxWidth: 900 }}>
            {r.specialist.length ? 'Your progress is kept. A specialist route comes first.' : complete ? 'Your assessment is complete. Here is where preparation stands.' : 'Here is where preparation stands, and what is still open.'}
          </h1>
          <div className="chips">
            {chips.map((c) => <span key={c} className="pill" style={{ border: '1px solid rgba(255,255,255,0.3)', padding: '7px 12px', fontSize: 13, fontWeight: 500 }}>{c}</span>)}
          </div>
          {complete && r.riskStatus !== 'none' && (
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.8)', maxWidth: 760 }}>“Complete” describes the data, not approval to transact. Open risks are shown separately below.</p>
          )}
        </div>
      </section>

      <div className="result-body">
        <div className="wrap" style={{ padding: '40px 24px 64px', display: 'flex', flexDirection: 'column', gap: 48 }}>
          <section aria-labelledby="dims-title" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <h2 className="h3" id="dims-title" style={{ fontSize: 26 }}>Three readiness dimensions</h2>
              <span style={{ fontSize: 13, color: 'var(--grey-4)' }}>
                {r.profile ? `Weighted for: ${profileName}` : 'No perspective confirmed'} · Model v1, proposed parameters
              </span>
            </div>
            {prev && prev.profile !== r.profile && (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--grey-4)' }}>
                Recalculated after a change of perspective. Previously ({prev.profile ? PROFILES.find((p) => p.key === prev.profile)?.name : 'not confirmed'}):{' '}
                {DIMENSIONS.map((d, i) => `${d.name} ${prev.indices[i] ?? 'not shown'}`).join(' · ')}.
              </p>
            )}
            <div className="dim-grid">
              {r.dimensions.map((d) => <DimensionCard key={d.key} d={d} />)}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--grey-4)', lineHeight: 1.6, maxWidth: 820 }}>
              An index is shown when at least 80% of a dimension’s weighted questions are answered and every area is at least half answered. The range shows the lowest and highest result your open answers could still produce; it is not a statistical confidence interval. Hatched bars mark open questions. Evidence support is shown separately from answer points.
            </p>
          </section>

          <div className="two-col">
            <section aria-labelledby="risk-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 className="h3" id="risk-title">Risk status</h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--grey-4)' }}>Shown separately so that a strong result elsewhere cannot hide a time-critical issue.</p>
              {r.risks.length === 0 && (
                <div style={{ border: '1px solid var(--grey-2)', borderRadius: 14, padding: '12px 14px', fontSize: 14 }}>No critical prerequisites or open review items based on your answers. This does not replace specialist review.</div>
              )}
              {r.risks.map((k) => (
                <div key={k.rule + k.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', border: `1px solid ${k.severity === 'critical' ? 'var(--red)' : 'var(--grey-2)'}`, borderRadius: 14, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 }}>
                  <span className="pill" style={k.severity === 'critical' ? { background: 'var(--red)', color: 'var(--white)' } : { background: 'var(--grey-1)', border: '1px solid var(--grey-2)' }}>{k.severity === 'critical' ? 'Critical' : 'Needs review'}</span>
                  <span>
                    <b>{k.title}.</b> {k.text}
                    {k.questionIds.length > 0 && <span style={{ color: 'var(--grey-4)' }}> ({k.questionIds.join(', ')})</span>}
                  </span>
                </div>
              ))}
            </section>
            <section aria-labelledby="str-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 className="h3" id="str-title">Supported strengths</h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--grey-4)' }}>Up to three, each linked to the answer it comes from. “You reported” statements, not independent verification.</p>
              {r.strengths.length === 0 && <div style={{ background: 'var(--grey-1)', borderRadius: 14, padding: '12px 14px', fontSize: 14 }}>Strengths appear here once answers support them.</div>}
              {r.strengths.map((x) => (
                <div key={x.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--grey-1)', borderRadius: 14, padding: '12px 14px', fontSize: 14, lineHeight: 1.5 }}>
                  <span className="pill" style={{ background: 'var(--navy-2)', color: 'var(--white)' }}>{x.id}</span>
                  <span><b>{x.name}.</b> You reported: {x.text}</span>
                </div>
              ))}
            </section>
          </div>

          <section aria-labelledby="tasks-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <h2 className="h3" id="tasks-title" style={{ fontSize: 26 }}>Priority actions</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Filter tasks">
                {([['all', `All · ${r.tasks.length}`], ['critical', `Critical · ${count('critical')}`], ['open', `Open facts · ${count('open')}`], ['gap', `Preparation · ${count('gap')}`]] as const).map(([k, l]) => (
                  <button key={k} type="button" className="filter-btn" aria-pressed={filter === k} onClick={() => { setFilter(k); setShowAll(false); }}>{l}</button>
                ))}
              </div>
            </div>
            <div className="task-list">
              {shown.length === 0 && <div style={{ padding: 18, fontSize: 14 }}>Nothing in this view.</div>}
              {shown.map((t) => {
                const pill = TASK_PILL[t.label] ?? TASK_PILL.Gap;
                const qid = t.sourceQuestionIds[0];
                return (
                  <div key={t.key} className="task">
                    <span className="pill" style={{ background: pill.bg, color: pill.fg, alignSelf: 'start' }}>{t.label}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <b style={{ fontSize: 15 }}>{t.title}</b>
                      <span style={{ fontSize: 14, lineHeight: 1.5 }}>{t.reason}</span>
                      <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--grey-4)' }}>Suggested next step: {t.action}</span>
                      <span style={{ fontSize: 12, color: 'var(--grey-4)' }}>
                        {[t.dimension, t.domain, `Suggested: ${t.accountableRole}`, t.suggestedTiming, t.dependencies.length ? `After ${t.dependencies.join(', ')}` : null, t.sourceQuestionIds.join(', ') || null].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }} className="no-print">
                      <select className="input input-light" style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} aria-label={`Status of ${t.title}`}
                        value={s.taskStatus[t.key] ?? 'open'} onChange={(e) => setTaskStatus(t.key, e.target.value as TaskStatus)}>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                      </select>
                      {qid && t.kind !== 'critical' && t.ruleId !== 'APP' && (
                        <button type="button" onClick={() => openQuestion(qid)} style={{ background: 'none', border: 0, color: 'var(--teal-dark)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Open question</button>
                      )}
                      {t.ruleId === 'APP' && <button type="button" onClick={() => go('c3')} style={{ background: 'none', border: 0, color: 'var(--teal-dark)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Clarify setup</button>}
                    </div>
                  </div>
                );
              })}
              {tasks.length > 8 && (
                <button type="button" className="no-print" onClick={() => setShowAll((x) => !x)} style={{ width: '100%', padding: 14, border: 0, borderTop: '1px solid var(--grey-1)', background: 'var(--grey-1)', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                  {showAll ? 'Show fewer' : `Show all ${tasks.length} items`}
                </button>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--grey-4)' }}>Timings are planning suggestions, not legal deadlines. Critical items come first, then open facts, then preparation gaps ranked by their weight within the dimension.</p>
          </section>

          <div className="two-col">
            <section aria-labelledby="tax-title" style={{ background: 'var(--navy-2)', color: 'var(--white)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 className="h3" id="tax-title">Tax preparation</h2>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.84)' }}>This measures preparation and specialist review. It is not tax advice and does not assess how tax-efficient a structure is. Seller-level matters are kept separate from company-level work.</p>
              {(['company', 'seller', 'cross_border'] as const).map((scope) => {
                const rows = r.tax.filter((x) => x.scope === scope);
                if (!rows.length) return null;
                return (
                  <div key={scope} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', margin: '8px 0 4px' }}>{scope === 'company' ? 'Company level' : scope === 'seller' ? 'Seller level' : 'Cross-border'}</span>
                    {rows.map((x) => (
                      <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 14 }}>
                        <span>{x.name}</span>
                        <b style={{ color: x.status === 'Prepared' ? 'var(--lime)' : x.status === 'In progress' || x.status === 'Not started' ? 'var(--white)' : 'var(--lime-2)', whiteSpace: 'nowrap' }}>{x.status}</b>
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
            <section style={{ background: 'var(--grey-1)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignSelf: 'start' }}>
              <h2 className="h3">What this report does not show</h2>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>No overall exit score, no valuation, no sale probability and no implied multiple. A high readiness result describes preparation. It does not mean maximum attractiveness to investors, and business economics or customer structure can matter to buyers regardless.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} className="no-print">
                <button type="button" className="btn btn-navy" onClick={() => go('deep')}>Continue answering</button>
                <button type="button" className="btn btn-outline" onClick={() => window.print()}>Print or save as PDF</button>
                <button type="button" className="btn btn-outline" onClick={download}>Export task list (CSV)</button>
              </div>
              <div style={{ borderTop: '1px solid var(--grey-2)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }} className="no-print">
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>Would you like an atares adviser to review the gaps with you? This is optional and separate from your result.</p>
                <a className="btn btn-outline" style={{ alignSelf: 'flex-start' }} href="https://atares.team" target="_blank" rel="noreferrer" onClick={() => track('contact_request', s.remoteId, { stage: 'RESULT' })}>Discuss with atares</a>
              </div>
            </section>
          </div>

          <section className="no-print" style={{ borderTop: '1px solid var(--grey-2)', paddingTop: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--grey-4)' }}>
            <span>Model {r.versions.catalogue} · {r.versions.scoring} · {r.versions.report}</span>
            <span style={{ marginLeft: 'auto' }} />
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 0, color: 'var(--red)', cursor: 'pointer', fontSize: 13 }}>Delete this assessment</button>
            ) : (
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                This removes your answers from this browser and from the ExitIQ database.
                <button type="button" className="btn btn-sm" style={{ background: 'var(--red)', color: 'var(--white)' }} onClick={async () => { await deleteEverything(); navigate('/'); }}>Delete</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </span>
            )}
          </section>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--grey-4)', textAlign: 'center' }}>ExitIQ is a structured self-assessment. It does not replace legal, tax or financial advice, and its results are not a valuation.</p>
        </div>
      </div>
    </main>
  );
}

function DimensionCard({ d }: { d: DimensionResult }) {
  const pill = STATUS_PILL[d.status];
  const shown = d.displayIndex != null;
  return (
    <article className="dim-card" aria-labelledby={`dim-${d.key}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <h3 id={`dim-${d.key}`} style={{ margin: 0, fontSize: 19 }}>{d.name}</h3>
        <span className="pill" style={{ background: pill.bg, color: pill.fg }}>{pill.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span className="big-index" style={{ color: shown ? 'var(--navy)' : 'var(--grey-3)' }}>{shown ? d.displayIndex : 'Not shown'}</span>
        <span style={{ fontSize: 13, color: 'var(--grey-4)' }}>{dimensionNote(d)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: 'var(--grey-4)' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>Answer coverage {pct(d.coverage)}<Bar value={d.coverage * 100} label={`Answer coverage ${pct(d.coverage)}`} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>Evidence support {pct(d.evidenceSupport)}<Bar value={d.evidenceSupport * 100} color="var(--teal-dark)" label={`Evidence support ${pct(d.evidenceSupport)}`} /></span>
      </div>
      <div style={{ borderTop: '1px solid var(--grey-1)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.domains.map((m) => {
          const lc = m.localCoverage;
          const label = m.index == null ? 'Open' : `${Math.round(m.index)}${lc < 1 ? ` · ${Math.round(lc * 100)}% answered` : ''}`;
          return (
            <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}><b>{m.name}</b><span style={{ whiteSpace: 'nowrap', color: 'var(--grey-4)' }}>{label}</span></div>
              <Bar value={(m.index ?? 0) * lc} open={(1 - lc) * 100} label={`${m.name}: ${label}`} />
            </div>
          );
        })}
      </div>
    </article>
  );
}
