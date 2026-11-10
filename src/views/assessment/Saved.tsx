import { useState } from 'react';
import { navigate } from '../../App';
import { linkEmail, remoteAvailable } from '../../lib/remote';
import { deleteEverything, resume, startNew, useAssessment } from '../../lib/store';

export function Saved() {
  const s = useAssessment();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'new' | null>(null);
  const answered = Object.keys(s.answers).length;
  const when = s.savedAt ? new Date(s.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kicker">Saved</div>
        <h1 className="h1">Your progress is saved.</h1>
        <p className="lead" style={{ color: 'rgba(255,255,255,0.86)', fontSize: 17 }}>
          {answered} scored question{answered === 1 ? '' : 's'} answered{when ? `, last saved ${when}` : ''}. Come back to this page in the same browser to continue where you left off.
        </p>
      </div>

      <section className="glass" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="link-title">
        <h2 id="link-title" style={{ margin: 0, fontSize: 18 }}>Continue on another device (optional)</h2>
        {remoteAvailable() ? (
          <>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>
              Add your email address and confirm it. The confirmation link brings you back to this assessment on any device. Your email is used only for signing in; newsletters and contact with atares are separate choices.
            </p>
            <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(await linkEmail(email)); setBusy(false); }}>
              <label className="sr-only" htmlFor="save-email">Email address</label>
              <input id="save-email" className="input" style={{ flex: '1 1 260px' }} type="email" required autoComplete="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" className="btn btn-lime" disabled={busy}>{busy ? 'Sending…' : 'Send link'}</button>
            </form>
            {msg && <p role="status" style={{ margin: 0, fontSize: 14, color: msg.ok ? 'var(--lime)' : 'var(--lime-2)' }}>{msg.message}</p>}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>Online saving is not available right now, so your progress is kept in this browser only. Use the same browser to continue.</p>
        )}
      </section>

      <div className="nav-row">
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>Back to the start page</button>
        <div className="right">
          <button type="button" className="btn btn-lime" onClick={resume}>Resume assessment <span aria-hidden="true">→</span></button>
        </div>
      </div>

      <section style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.74)', alignItems: 'center' }}>
        {confirm === null && (
          <>
            <button type="button" className="btn-link" style={{ background: 'none', cursor: 'pointer' }} onClick={() => setConfirm('new')}>Start a new assessment</button>
            <button type="button" className="btn-link" style={{ background: 'none', cursor: 'pointer', color: '#ff9c8f' }} onClick={() => setConfirm('delete')}>Delete this assessment</button>
          </>
        )}
        {confirm === 'new' && (
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            Start over in this browser? Your current assessment stays stored online if online saving is on.
            <button type="button" className="btn btn-lime btn-sm" onClick={() => startNew()}>Start new</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
          </span>
        )}
        {confirm === 'delete' && (
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            This removes your answers from this browser and from the ExitIQ database.
            <button type="button" className="btn btn-sm" style={{ background: 'var(--red)', color: 'var(--white)' }} onClick={async () => { await deleteEverything(); navigate('/'); }}>Delete</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
          </span>
        )}
      </section>
    </>
  );
}
