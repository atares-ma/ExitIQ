import { Chip, RadioGroup, CheckboxGroup } from '../../components/ui';
import { QUESTION_BY_ID } from '../../model/catalogue';
import { DISCOVERY } from '../../model/options';
import { initialObservations } from '../../model/plan';
import { questionText } from '../../model/routing';
import { track } from '../../lib/remote';
import { go, setDiagnostic, setPosition, useAssessment } from '../../lib/store';
import { ControlAnswer } from './AnswerControls';

const BAND_STATUSES = ['Unknown', 'Prefer not to answer'];

export function Discovery() {
  const s = useAssessment();
  const i = Math.min(s.dIdx, DISCOVERY.length - 1);
  const d = DISCOVERY[i];
  const last = i === DISCOVERY.length - 1;

  const answered =
    d.kind === 'control' ? !!s.answers[d.control]
      : d.kind === 'multi' ? Array.isArray(s.diag.E01) && s.diag.E01.length > 0
        : !!s.diag[d.id];

  const next = () => {
    const nextTheme = DISCOVERY[i + 1]?.theme;
    if (nextTheme !== d.theme) track('theme_complete', s.remoteId, { stage: 'DISCOVERY' });
    if (last) go('picture');
    else setPosition({ dIdx: i + 1 });
  };
  const back = () => (i === 0 ? go('summary') : setPosition({ dIdx: i - 1 }));

  // One short observation after a theme, based on recorded answers only (section 2).
  const prev = DISCOVERY[i - 1];
  const themeIds = prev && prev.theme !== d.theme ? DISCOVERY.filter((x) => x.theme === prev.theme).map((x) => (x.kind === 'control' ? x.control : x.id)) : [];
  const themeNote = themeIds.length
    ? initialObservations(s.ctx, s.answers, s.diag).find((o) => o.answerIds.length > 0 && o.answerIds.every((id) => themeIds.includes(id)))
    : undefined;

  let title = d.title ?? '';
  if (d.kind === 'control' && !d.title) title = questionText(QUESTION_BY_ID[d.control], s.ctx);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="pill" style={{ background: 'rgba(0,35,54,0.7)', border: '1px solid rgba(255,255,255,0.14)', padding: '6px 12px', fontSize: 13 }}>Discovery · {d.theme}</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.74)' }} aria-live="polite">Question {i + 1} of {DISCOVERY.length}</span>
      </div>
      <div className="progress-dots" aria-hidden="true">
        {DISCOVERY.map((x, j) => <span key={x.id} className={j < i ? 'done' : j === i ? 'current' : ''} />)}
      </div>

      {themeNote && (
        <div className="banner" role="note" style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(0,35,54,0.45)' }}>
          <span className="pill" style={{ background: 'rgba(0,195,191,0.2)', color: 'var(--teal-pale)' }}>{prev.theme}</span>
          <span>{themeNote.text}</span>
        </div>
      )}

      <section key={d.id} className="glass fade-up" aria-labelledby="disc-q" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 id="disc-q" style={{ margin: 0, fontSize: 24, lineHeight: 1.35 }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.76)' }}>{d.help}</p>
          {d.kind === 'control' && <p style={{ margin: 0, fontSize: 12, color: 'var(--teal-pale)' }}>Scored question {d.control}. It is reused in the detailed assessment, so you will not be asked again.</p>}
        </div>

        {d.kind === 'control' && (
          <ControlAnswer q={QUESTION_BY_ID[d.control]} ctx={s.ctx} answer={s.answers[d.control]} showNa={false} title={title} />
        )}
        {d.kind === 'multi' && (
          <CheckboxGroup layout="list" label={title} choices={d.options.map((o) => ({ value: o, label: o }))}
            values={Array.isArray(s.diag.E01) ? s.diag.E01 : []}
            onToggle={(v) => {
              const cur = Array.isArray(s.diag.E01) ? s.diag.E01 : [];
              const nextV = cur.includes(v) ? cur.filter((x) => x !== v) : cur.length >= d.max ? cur : [...cur, v];
              setDiagnostic('E01', nextV.length ? nextV : null);
            }} />
        )}
        {d.kind === 'band' && (
          <>
            <RadioGroup layout="list" label={title} choices={d.options.map((o) => ({ value: o, label: o }))}
              value={typeof s.diag[d.id] === 'string' && !BAND_STATUSES.includes(s.diag[d.id] as string) ? (s.diag[d.id] as string) : null}
              onChange={(v) => setDiagnostic(d.id, v)} />
            <div className="chips">
              {BAND_STATUSES.map((l) => <Chip key={l} pressed={s.diag[d.id] === l} onClick={() => setDiagnostic(d.id, s.diag[d.id] === l ? null : l)}>{l}</Chip>)}
            </div>
          </>
        )}
      </section>

      <div className="nav-row">
        <button type="button" className="btn btn-ghost" onClick={back}>Back</button>
        <div className="right">
          <button type="button" className="btn-link" style={{ background: 'none', cursor: 'pointer' }} onClick={next}>Skip for now</button>
          <button type="button" className="btn btn-lime" disabled={!answered} onClick={next}>{last ? 'See initial picture' : 'Next'}</button>
        </div>
      </div>
    </>
  );
}
