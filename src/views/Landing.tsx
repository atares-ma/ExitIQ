import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../App';
import { Bar, Brand, CheckboxGroup, Chip, RadioGroup } from '../components/ui';
import { hasProgress, useAssessment } from '../lib/store';
import { COPY, type Lang } from './landing-copy';

const LANG_KEY = 'exitiq-landing-lang';
type Preview = { strengths: number[]; e05: number | string | null; e04: number | string | null };
const emptyPreview: Preview = { strengths: [], e05: null, e04: null };

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'de' ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

export default function Landing() {
  const [lang, setLangState] = useState<Lang>(readLang);
  const t = COPY[lang];
  const state = useAssessment();
  const resumable = hasProgress(state);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = 'ExitIQ by atares M&A';
  }, [lang]);

  const setLang = (l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  };
  const start = () => navigate('/assessment');

  return (
    <div style={{ background: 'var(--white)' }}>
      <header className="site-header">
        <div className="wrap" style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Brand />
          <nav aria-label="Sections">
            <a href="#how">{t.navHow}</a>
            <a href="#report">{t.navReport}</a>
            <a href="#ownership">{t.navOwner}</a>
            <a href="#about">{t.navAbout}</a>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="lang" role="group" aria-label="Language">
              {(['en', 'de'] as Lang[]).map((l) => (
                <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
              ))}
            </div>
            {resumable && <button type="button" className="btn btn-ghost btn-sm" onClick={start}>{t.resume}</button>}
          </div>
        </div>
      </header>

      <Hero lang={lang} onStart={start} />

      <section aria-label="Promises" style={{ background: 'var(--navy)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="wrap grid-auto" style={{ padding: '28px 24px', color: 'var(--white)', ['--min' as string]: '220px', gap: 20 }}>
          {t.promises.map((p) => (
            <div key={p.a} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{p.a}</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)' }}>{p.b}</span>
            </div>
          ))}
        </div>
      </section>

      <HowItWorks lang={lang} />
      <ReportPreview lang={lang} />
      <Ownership lang={lang} />

      <section aria-label="Principles" style={{ background: 'var(--grey-1)' }}>
        <div className="wrap section grid-auto" style={{ ['--min' as string]: '240px' }}>
          {t.principles.map((p) => (
            <div key={p.title} className="card-light" style={{ borderColor: 'var(--navy-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>{p.title}</h3>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--grey-4)' }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="about" aria-labelledby="about-title">
        <div className="wrap section two-col" style={{ alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <img src="/media/atares-logo-navy.png" alt="atares, merging visions" style={{ height: 56, width: 'auto', alignSelf: 'flex-start' }} />
            <h2 className="h2" id="about-title">{t.aboutTitle}</h2>
            <p className="lead muted" style={{ fontSize: 16 }}>{t.about1}</p>
            <p className="lead muted" style={{ fontSize: 16 }}>{t.about2}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['200+', t.stat1], ['20+', t.stat2]].map(([n, l]) => (
              <div key={n} style={{ background: 'var(--navy-2)', color: 'var(--white)', borderRadius: 18, padding: 22 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--lime)' }}>{n}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.84)' }}>{l}</div>
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1', background: 'var(--grey-1)', border: '1px solid var(--grey-2)', borderRadius: 18, padding: 22 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t.networkTitle}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--grey-4)' }}>{t.networkBody}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-dark">
        <div className="wrap section" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <h2 className="h2" style={{ color: 'var(--lime)', maxWidth: 800 }}>{t.closeTitle}</h2>
          <p className="lead" style={{ color: 'rgba(255,255,255,0.86)', maxWidth: 620, fontSize: 16 }}>{t.closeSub}</p>
          <div><button type="button" className="btn btn-lime btn-lg" onClick={start}>{t.cta} <span aria-hidden="true">→</span></button></div>
          {t.assessmentLang && <p className="muted-light" style={{ margin: 0, fontSize: 14 }}>{t.assessmentLang}</p>}
          <footer style={{ marginTop: 56, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
              <img src="/media/atares-logo-white.png" alt="atares" style={{ height: 26, width: 'auto', alignSelf: 'flex-start' }} />
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)' }}>{t.disclaimer}</p>
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
              <a href="https://atares.team" style={{ color: 'rgba(255,255,255,0.84)' }}>{t.imprint}</a>
              <a href="https://atares.team" style={{ color: 'rgba(255,255,255,0.84)' }}>{t.privacy}</a>
              <a href="https://atares.team" style={{ color: 'rgba(255,255,255,0.84)' }}>atares.team</a>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}

function Hero({ lang, onStart }: { lang: Lang; onStart: () => void }) {
  const t = COPY[lang];
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Preview>(emptyPreview);
  const [video, setVideo] = useState(true);
  useEffect(() => {
    setStep(0);
    setA(emptyPreview);
  }, [lang]);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setVideo(false);
  }, []);

  const answered = [a.strengths.length > 0, a.e05 !== null, a.e04 !== null][step] ?? true;
  const isQ = step < 3;

  const observations = useMemo(() => {
    const o = t.obs;
    const out: { text: string; color: string }[] = [];
    const open = (v: unknown) => typeof v === 'string';
    const rel = a.strengths.includes(0);
    if (rel && (a.e05 === 0 || a.e05 === 1)) out.push({ text: o.relWait, color: 'var(--lime)' });
    else if (rel) out.push({ text: o.rel, color: 'var(--teal)' });
    else if (a.strengths.length) out.push({ text: o.lead(a.strengths.map((i) => t.strengths[i].toLowerCase()).join(', ')), color: 'var(--teal)' });
    if (a.e05 === 2) out.push({ text: o.e05ok, color: 'var(--teal)' });
    else if (a.e05 === 0) out.push({ text: o.e05bad, color: 'var(--lime)' });
    else if (open(a.e05)) out.push({ text: o.e05open, color: 'var(--grey-3)' });
    if (a.e04 === 3) out.push({ text: o.e04high, color: 'var(--lime)' });
    else if (open(a.e04)) out.push({ text: o.e04open, color: 'var(--grey-3)' });
    if (!out.length) out.push({ text: o.none, color: 'var(--grey-3)' });
    return out.slice(0, 3);
  }, [a, t]);

  const toggleStrength = (i: number) =>
    setA((s) => ({ ...s, strengths: s.strengths.includes(i) ? s.strengths.filter((x) => x !== i) : s.strengths.length >= 3 ? s.strengths : [...s.strengths, i] }));

  return (
    <section id="top" className="hero">
      {video && <video src="/media/hero-loop.mp4" poster="/media/bg-dark.jpg" autoPlay muted loop playsInline aria-hidden="true" />}
      <div className="wrap hero-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div className="kicker">{t.kicker}</div>
          <h1>{t.heroTitle}</h1>
          <p className="lead" style={{ fontSize: 19, color: 'rgba(255,255,255,0.9)', maxWidth: 540 }}>{t.heroSub}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-lime btn-lg" onClick={onStart}>{t.cta} <span aria-hidden="true">→</span></button>
            <a href="#how" className="btn btn-ghost btn-lg">{t.navHow}</a>
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.74)', maxWidth: 500 }}>{t.heroMeta}</p>
        </div>

        <div className="glass" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20, minHeight: 520, borderRadius: 24 }} aria-label="Discovery preview">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="pill" style={{ background: 'rgba(0,35,54,0.7)', border: '1px solid rgba(255,255,255,0.14)', fontSize: 13, padding: '6px 12px' }}>{isQ ? t.discovery : t.picture}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.74)' }} aria-live="polite">{isQ ? t.qOf(step + 1) : t.basedOn}</span>
          </div>
          <div className="progress-dots" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <span key={i} style={{ background: i <= step ? (i === 3 ? 'var(--lime)' : 'var(--teal)') : undefined }} />)}
          </div>

          {isQ ? (
            <div key={lang + step} className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35 }} id="preview-q">{[t.q1.title, t.q2.title, t.q3.title][step]}</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.76)' }}>{[t.q1.help, t.q2.help, t.q3.help][step]}</div>
              </div>
              {step === 0 && (
                <CheckboxGroup label={t.q1.title} layout="list" choices={t.strengths.map((l, i) => ({ value: String(i), label: l }))}
                  values={a.strengths.map(String)} onToggle={(v) => toggleStrength(Number(v))} />
              )}
              {step === 1 && (
                <>
                  <RadioGroup label={t.q2.title} layout="list" choices={t.q2.opts.map((l, i) => ({ value: i, label: l }))} value={typeof a.e05 === 'number' ? a.e05 : null} onChange={(v) => setA((s) => ({ ...s, e05: v }))} />
                  <div className="chips">{t.q2.stats.map((l, i) => <Chip key={l} pressed={a.e05 === `open${i}`} onClick={() => setA((s) => ({ ...s, e05: `open${i}` }))}>{l}</Chip>)}</div>
                </>
              )}
              {step === 2 && (
                <>
                  <RadioGroup label={t.q3.title} layout="list" choices={t.q3.opts.map((l, i) => ({ value: i, label: l }))} value={typeof a.e04 === 'number' ? a.e04 : null} onChange={(v) => setA((s) => ({ ...s, e04: v }))} />
                  <div className="chips">{t.q3.stats.map((l, i) => <Chip key={l} pressed={a.e04 === `open${i}`} onClick={() => setA((s) => ({ ...s, e04: `open${i}` }))}>{l}</Chip>)}</div>
                </>
              )}
            </div>
          ) : (
            <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35 }}>{t.pictureTitle}</div>
              {observations.map((o) => (
                <div key={o.text} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 14, background: 'rgba(0,35,54,0.45)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 15, lineHeight: 1.55 }}>
                  <span style={{ width: 8, height: 8, marginTop: 8, flex: 'none', borderRadius: '50%', background: o.color }} aria-hidden="true" />
                  <span>{o.text}</span>
                </div>
              ))}
              <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.7)' }}>{t.pictureNote}</div>
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>{isQ ? t.back : t.change}</button>
            <button type="button" className="btn btn-lime btn-sm" disabled={!answered}
              onClick={() => (isQ ? setStep((s) => s + 1) : (setStep(0), setA(emptyPreview)))}>
              {isQ ? (step === 2 ? t.seePicture : t.next) : t.again}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  const [i, setI] = useState(0);
  const st = t.stages[i];
  return (
    <section id="how" aria-labelledby="how-title">
      <div className="wrap section" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div className="kicker dark">{t.navHow}</div>
        <h2 className="h2" id="how-title" style={{ maxWidth: 820 }}>{t.howTitle}</h2>
        <p className="lead muted" style={{ maxWidth: 720, fontSize: 17 }}>{t.howSub}</p>
        <div role="tablist" aria-label={t.navHow} className="grid-auto" style={{ ['--min' as string]: '170px', gap: 10 }}>
          {t.stages.map((s, j) => (
            <button key={s.title} type="button" role="tab" aria-selected={i === j} aria-controls="stage-panel" className="stage-tab" onClick={() => setI(j)}>
              <span className="n">0{j + 1}</span>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{s.title}</span>
            </button>
          ))}
        </div>
        <div id="stage-panel" role="tabpanel" key={lang + i} className="fade-up two-col" style={{ background: 'var(--grey-1)', border: '1px solid var(--grey-2)', borderRadius: 20, padding: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 className="h3">{st.title}</h3>
            <p style={{ margin: 0, lineHeight: 1.65, color: 'var(--grey-4)' }}>{st.body}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="kicker dark" style={{ fontSize: 13 }}>{t.whatYouGet}</div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{st.outcome}</div>
            <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--grey-4)', fontSize: 15 }}>{st.detail}</p>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--grey-4)', maxWidth: 760 }}>{t.howNote}</p>
      </div>
    </section>
  );
}

const DIM_META = [
  { statusBg: 'rgba(0,195,191,0.2)', statusFg: 'var(--teal-pale)', cov: 86, ev: 40, vals: [80, 58, null], critical: true },
  { statusBg: 'rgba(190,252,0,0.2)', statusFg: 'var(--lime)', cov: 100, ev: 55, vals: [88, 75, 70, 90, 83], critical: false },
  { statusBg: 'rgba(255,255,255,0.14)', statusFg: 'var(--white)', cov: 61, ev: 18, vals: [66, null, 72, null], critical: false },
];

function ReportPreview({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  const [i, setI] = useState(0);
  const dim = t.dims[i];
  const meta = DIM_META[i];
  return (
    <section id="report" className="section-dark" aria-labelledby="report-title">
      <div className="wrap section" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div className="kicker">{t.navReport}</div>
        <h2 className="h2" id="report-title" style={{ maxWidth: 760 }}>{t.reportTitle}</h2>
        <p className="lead" style={{ maxWidth: 780, fontSize: 16, color: 'rgba(255,255,255,0.86)' }}>{t.reportSub}</p>
        <div className="two-col" style={{ alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} role="tablist" aria-label={t.navReport}>
            {t.dims.map((d, j) => {
              const m = DIM_META[j];
              return (
                <button key={d.name} type="button" role="tab" aria-selected={i === j} onClick={() => setI(j)}
                  style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 18, padding: 18, color: 'var(--white)', border: `1px solid ${i === j ? 'var(--teal)' : 'rgba(255,255,255,0.16)'}`, background: i === j ? 'rgba(0,195,191,0.14)' : 'rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 17 }}>{d.name}</span>
                    <span className="pill" style={{ background: m.statusBg, color: m.statusFg }}>{d.status}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 32, fontWeight: 800 }}>{d.index}</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)' }}>{d.range}</span>
                  </span>
                  <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{t.cov} {m.cov}%<Bar dark value={m.cov} color="var(--teal)" /></span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{t.ev} {m.ev}%<Bar dark value={m.ev} color="var(--lime)" /></span>
                  </span>
                </button>
              );
            })}
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{t.illustrative}</p>
          </div>
          <div key={lang + i} className="fade-up card-light" style={{ display: 'flex', flexDirection: 'column', gap: 16 }} role="tabpanel">
            <div className="kicker dark" style={{ fontSize: 13 }}>{t.covers(dim.name)}</div>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: 16 }}>{dim.body}</p>
            {dim.domains.map((n, j) => {
              const v = meta.vals[j];
              return (
                <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><b>{n}</b><span>{v == null ? t.open : v}</span></div>
                  <Bar value={v ?? 100} color={v == null ? 'var(--grey-2)' : 'var(--navy-2)'} />
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid var(--grey-2)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b style={{ fontSize: 14 }}>{t.separate}</b>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${meta.critical ? 'var(--red)' : 'var(--grey-2)'}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, lineHeight: 1.5 }}>
                <span className="pill" style={{ background: meta.critical ? 'var(--red)' : 'var(--grey-1)', color: meta.critical ? 'var(--white)' : 'var(--navy)' }}>{meta.critical ? t.crit : t.review}</span>
                <span>{dim.risk}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="two-col" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 28, marginTop: 12 }}>
          <b>{t.notShownTitle}</b>
          <p style={{ margin: 0, lineHeight: 1.6, color: 'rgba(255,255,255,0.84)', fontSize: 15 }}>{t.notShownBody}</p>
        </div>
      </div>
    </section>
  );
}

function Ownership({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  const [i, setI] = useState(0);
  const p = t.profiles[i];
  return (
    <section id="ownership" aria-labelledby="own-title">
      <div className="wrap section" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div className="kicker dark">{t.ownKicker}</div>
        <h2 className="h2" id="own-title" style={{ maxWidth: 720 }}>{t.ownTitle}</h2>
        <p className="lead muted" style={{ maxWidth: 780, fontSize: 16 }}>{t.ownSub}</p>
        <div role="tablist" aria-label={t.ownKicker} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {t.profiles.map((x, j) => (
            <button key={x.label} type="button" role="tab" aria-selected={i === j} className="profile-tab" onClick={() => setI(j)}>{x.label}</button>
          ))}
        </div>
        <div key={lang + i} className="fade-up grid-auto" role="tabpanel" style={{ ['--min' as string]: '260px' }}>
          <div style={{ background: 'var(--navy-2)', color: 'var(--white)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="kicker" style={{ fontSize: 13 }}>{t.lookAt}</div>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: 16 }}>{p.focus}</p>
          </div>
          <div style={{ background: 'var(--grey-1)', border: '1px solid var(--grey-2)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="kicker dark" style={{ fontSize: 13 }}>{t.wontDo}</div>
            <p style={{ margin: 0, lineHeight: 1.6, fontSize: 16 }}>{p.avoid}</p>
          </div>
          <div style={{ border: '1px solid var(--grey-2)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="kicker dark" style={{ fontSize: 13 }}>{t.modules}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.modules.map((m) => <span key={m} className="pill" style={{ border: '1px solid var(--navy-2)', padding: '6px 12px', fontSize: 13 }}>{m}</span>)}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--grey-4)', lineHeight: 1.5 }}>{t.modulesNote}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
