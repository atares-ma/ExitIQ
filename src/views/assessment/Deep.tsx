import { useState } from 'react';
import { Bar } from '../../components/ui';
import { CHAPTERS, DOMAIN_NAMES, ROUTE_LABELS } from '../../model/catalogue';
import { applicableQuestions, questionText, resolveRoutes } from '../../model/routing';
import { hasConflict, isKnown } from '../../model/scoring';
import type { Answer, EvidenceRef, QuestionDef } from '../../model/types';
import { go, setEvidence, setPosition, useAssessment } from '../../lib/store';
import { ControlAnswer } from './AnswerControls';

export function deepList(ctx: Parameters<typeof resolveRoutes>[0]): { q: QuestionDef; chapter: number }[] {
  const app = applicableQuestions(resolveRoutes(ctx));
  return CHAPTERS.flatMap((ch, ci) => ch.domains.flatMap((d) => app.filter((q) => q.domain === d).map((q) => ({ q, chapter: ci }))));
}

const dotColor = (a: Answer | undefined) => (!a ? 'rgba(255,255,255,0.18)' : isKnown(a) ? 'var(--teal)' : 'var(--lime-2)');

export function Deep() {
  const s = useAssessment();
  const routes = resolveRoutes(s.ctx);
  const list = deepList(s.ctx);
  if (!list.length) return null;
  const qi = Math.min(s.qIdx, list.length - 1);
  const { q, chapter } = list[qi];
  const a = s.answers[q.id];
  const done = (x: { q: QuestionDef }) => !!s.answers[x.q.id];
  const answeredN = list.filter(done).length;
  const theme = list.filter((x) => x.q.domain === q.domain);
  const chItems = list.map((x, k) => ({ ...x, k })).filter((x) => x.chapter === chapter);
  const isLast = qi === list.length - 1;

  return (
    <div className="deep-grid">
      <aside aria-label="Chapters" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.74)' }}>Chapters</h2>
        {CHAPTERS.map((ch, j) => {
          const items = list.map((x, k) => ({ ...x, k })).filter((x) => x.chapter === j);
          if (!items.length) return null;
          const n = items.filter(done).length;
          return (
            <button key={ch.title} type="button" className="chapter-btn" aria-current={j === chapter}
              onClick={() => setPosition({ qIdx: (items.find((x) => !done(x)) ?? items[0]).k })}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 700 }}>
                <span>{ch.title}</span><span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.74)', whiteSpace: 'nowrap' }}>{n} of {items.length}</span>
              </span>
              <Bar dark value={(n / items.length) * 100} color="var(--teal)" label={`${n} of ${items.length} answered`} />
            </button>
          );
        })}
        <button type="button" className="btn btn-lime" onClick={() => go('result')}>See action plan</button>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>{answeredN} of {list.length} questions answered. You can open the action plan at any time.</p>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="kicker">Chapter {chapter + 1} of {CHAPTERS.length} · {CHAPTERS[chapter].title}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.74)' }} aria-live="polite">{DOMAIN_NAMES[q.domain]}: {theme.filter(done).length} of {theme.length} questions</span>
          </div>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.74)' }}>{q.id}{q.route !== 'CORE' ? ` · ${ROUTE_LABELS[q.route]}` : ''}</span>
        </div>
        <div className="mini-map" aria-label="Questions in this chapter">
          {chItems.map((x) => (
            <button key={x.q.id} type="button" title={`${x.q.id} ${x.q.name}`} aria-label={`${x.q.id} ${x.q.name}`} aria-current={x.k === qi}
              onClick={() => setPosition({ qIdx: x.k })} style={{ background: dotColor(s.answers[x.q.id]), outline: x.k === qi ? '2px solid var(--white)' : 'none', outlineOffset: 2 }} />
          ))}
        </div>

        <section key={q.id} className="glass fade-up" aria-labelledby="deep-q" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal-pale)' }}>{q.name}</span>
            <h1 id="deep-q" style={{ margin: 0, fontSize: 23, lineHeight: 1.35 }}>{questionText(q, s.ctx)}</h1>
            {q.help && <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.74)', lineHeight: 1.5 }}>{q.help}</p>}
          </div>
          {routes[q.route] === 'pending' && (
            <div className="banner" style={{ borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)' }}>
              <span className="pill" style={{ background: 'var(--white)', color: 'var(--navy)' }}>Applicability open</span>
              <span>You were not sure whether {ROUTE_LABELS[q.route].toLowerCase()} applies, so this question stays in scope. <button type="button" onClick={() => go('c3')} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Clarify in the setup</button>.</span>
            </div>
          )}
          {a && hasConflict(a) && (
            <div className="banner" style={{ borderColor: 'var(--red)', background: 'rgba(243,72,50,0.12)' }}>
              <span className="pill" style={{ background: 'var(--red)', color: 'var(--white)' }}>Conflict</span>
              <span>Contributors gave different answers. This question is excluded from coverage until the facts are reconfirmed.</span>
            </div>
          )}
          <ControlAnswer q={q} ctx={s.ctx} answer={a} />
          <div className="two-col" style={{ gap: 18, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.74)' }}>Suggested contributor</span>
              <span style={{ fontSize: 15 }}>{q.contributor}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Inviting contributors is planned for a later release. Until then, export the task list from the action plan.</span>
            </div>
            {a && isKnown(a) ? <EvidenceEditor key={q.id} q={q} answer={a} /> : (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', alignSelf: 'end' }}>Evidence support can be recorded once the question has a substantive answer.</div>
            )}
          </div>
        </section>

        <div className="nav-row">
          <button type="button" className="btn btn-ghost" disabled={qi === 0} onClick={() => setPosition({ qIdx: qi - 1 })}>Back</button>
          <button type="button" className="btn btn-lime" onClick={() => (isLast ? go('result') : setPosition({ qIdx: qi + 1 }))}>{isLast ? 'See action plan' : 'Next question'}</button>
        </div>
      </div>
    </div>
  );
}

/** Section 7: evidence is separate from answer points. 0.5 needs a dated reference with a named role; 1 needs an authorised reviewer. */
function EvidenceEditor({ q, answer }: { q: QuestionDef; answer: Answer }) {
  const ev = answer.evidence;
  const [mode, setMode] = useState<'self' | 'ref'>(ev ? 'ref' : 'self');
  const [draft, setDraft] = useState<EvidenceRef>(ev ?? { reference: '', ownerRole: '', asOfDate: null, reviewStatus: 'dated_reference' });
  const complete = draft.reference.trim() && draft.ownerRole.trim() && draft.asOfDate;
  const saved = !!ev && ev.reference === draft.reference && ev.ownerRole === draft.ownerRole && ev.asOfDate === draft.asOfDate;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.74)' }}>Evidence support</span>
      <div className="chips" role="radiogroup" aria-label="Evidence support">
        <button type="button" role="radio" aria-checked={mode === 'self'} className="chip" aria-pressed={mode === 'self'}
          onClick={() => { setMode('self'); if (ev) setEvidence(q.id, null); }}>Self-assessment only</button>
        <button type="button" role="radio" aria-checked={mode === 'ref'} className="chip" aria-pressed={mode === 'ref'} onClick={() => setMode('ref')}>Dated document with named owner</button>
      </div>
      {mode === 'ref' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <input className="input" placeholder="Where it is, e.g. “Board minutes March 2026, data room 4.2”" maxLength={500} value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} aria-label="Evidence reference" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input className="input" placeholder="Responsible role, e.g. CFO" maxLength={120} value={draft.ownerRole} onChange={(e) => setDraft({ ...draft, ownerRole: e.target.value })} aria-label="Responsible role" />
            <input className="input" type="date" value={draft.asOfDate ?? ''} onChange={(e) => setDraft({ ...draft, asOfDate: e.target.value || null })} aria-label="As of date" />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-lime btn-sm" disabled={!complete || saved} onClick={() => setEvidence(q.id, { ...draft, reviewStatus: 'dated_reference' })}>{saved ? 'Saved' : 'Save reference'}</button>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Reference, role and date are all needed. Full support requires review by an authorised reviewer; a filename or upload alone does not count.</span>
          </div>
        </div>
      )}
    </div>
  );
}
