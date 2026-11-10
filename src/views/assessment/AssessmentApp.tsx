import { useEffect, useState } from 'react';
import { Brand } from '../../components/ui';
import { onSyncStatus, type SyncStatus } from '../../lib/remote';
import { go, hasProgress, hydrateFromRemote, useAssessment, type Screen } from '../../lib/store';
import { ContextScreen } from './Context';
import { Deep } from './Deep';
import { Discovery } from './Discovery';
import { Picture } from './Picture';
import { Result } from './Result';
import { Saved } from './Saved';
import { Summary } from './Summary';
import { Banners } from './Banners';

const STEPS = ['Context', 'Discovery', 'Initial picture', 'Assessment', 'Action plan'];
const PHASE: Record<Screen, number> = { c1: 0, c2: 0, c3: 0, summary: 0, discovery: 1, picture: 2, deep: 3, result: 4, saved: -1 };

function useSync(): [SyncStatus, string | undefined] {
  const [s, set] = useState<[SyncStatus, string | undefined]>(['idle', undefined]);
  useEffect(() => onSyncStatus((a, b) => set([a, b])), []);
  return s;
}

export default function AssessmentApp() {
  const state = useAssessment();
  const [sync, syncDetail] = useSync();
  const [ready, setReady] = useState(hasProgress(state));

  useEffect(() => {
    document.title = 'ExitIQ assessment';
    document.documentElement.lang = 'en';
    if (ready) return;
    // A returning visitor on a fresh browser tab (or after confirming their email) gets their saved assessment back.
    void hydrateFromRemote().finally(() => setReady(true));
  }, [ready]);

  const phase = PHASE[state.screen];
  const time = state.savedAt ? new Date(state.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const saveLabel = !time ? 'Saves after every answer'
    : sync === 'saving' ? 'Saving…'
    : sync === 'error' ? `Saved in this browser at ${time} · online copy failed`
    : sync === 'local-only' ? `Saved in this browser at ${time}`
    : `Saved ${time}`;

  return (
    <div className="app-bg">
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="app-header no-print">
        <div className="app-header-inner">
          <Brand />
          <ol className="stepper" aria-label="Progress">
            {STEPS.map((l, i) => (
              <li key={l} className={i < phase ? 'done' : i === phase ? 'current' : ''} aria-current={i === phase ? 'step' : undefined}>
                <span className="dot" aria-hidden="true">{i < phase ? '✓' : i + 1}</span>
                <span className="label">{l}</span>
              </li>
            ))}
          </ol>
          <div className="save-state">
            <span aria-live="polite" title={syncDetail}>{saveLabel}</span>
            {state.screen !== 'saved' && hasProgress(state) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => go('saved')}>Save and return later</button>
            )}
          </div>
        </div>
      </header>

      <div id="main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!ready ? (
          <main className="app-main"><p className="muted-light">Loading your assessment…</p></main>
        ) : (
          <Screens />
        )}
      </div>

      {state.screen !== 'result' && (
        <footer className="app-footer no-print">
          ExitIQ is a structured self-assessment. It does not replace legal, tax or financial advice, and its results are not a valuation.
        </footer>
      )}
    </div>
  );
}

function Screens() {
  const s = useAssessment();
  switch (s.screen) {
    case 'c1':
    case 'c2':
    case 'c3':
      return <ContextScreen screen={s.screen} />;
    case 'summary':
      return <Wrap><Banners /><Summary /></Wrap>;
    case 'discovery':
      return <Wrap><Banners /><Discovery /></Wrap>;
    case 'picture':
      return <Wrap><Banners /><Picture /></Wrap>;
    case 'deep':
      return <Wrap wide><Banners /><Deep /></Wrap>;
    case 'result':
      return <Result />;
    case 'saved':
      return <Wrap><Saved /></Wrap>;
  }
}

function Wrap({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`app-main${wide ? ' wide' : ''}`}>{children}</main>;
}
