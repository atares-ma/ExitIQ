import { useState } from 'react';
import { Chip, RadioGroup } from '../../components/ui';
import { STATUS_LABELS } from '../../model/options';
import { questionText } from '../../model/routing';
import type { Answer, AnswerStatus, AssessmentContext, Points, QuestionDef } from '../../model/types';
import { reconfirm, setAnswer } from '../../lib/store';

const UNRESOLVED: AnswerStatus[] = ['unknown', 'needs_internal_confirmation', 'needs_adviser_review', 'withheld'];

/** The three anchors plus explicit unresolved statuses (section 2: these are not numeric failures). */
export function ControlAnswer({ q, ctx, answer, showNa = true, title }: { q: QuestionDef; ctx: AssessmentContext; answer: Answer | undefined; showNa?: boolean; title?: string }) {
  const value = answer?.status === 'substantive' ? answer.points ?? null : null;
  const label = title ?? questionText(q, ctx);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {answer?.requiresReconfirmation && (
        <div className="banner" style={{ borderColor: 'rgba(223,254,0,0.5)', background: 'rgba(223,254,0,0.08)' }}>
          <span className="pill" style={{ background: 'var(--lime-2)', color: 'var(--navy)' }}>Reconfirm</span>
          <span>
            This question applies again after a change to your setup. Your earlier answer is kept below; confirm it or choose another.{' '}
            <button type="button" className="btn btn-lime btn-sm" style={{ marginLeft: 6 }} onClick={() => reconfirm(q.id)}>Confirm earlier answer</button>
          </span>
        </div>
      )}
      <RadioGroup layout="list" label={label} value={value}
        choices={q.anchors.map((a, i) => ({ value: (i * 50) as Points, label: a }))}
        onChange={(points) => setAnswer(q.id, { status: 'substantive', points })} />
      <div className="chips" role="group" aria-label="Unresolved answers">
        {UNRESOLVED.map((st) => (
          <Chip key={st} pressed={answer?.status === st} onClick={() => setAnswer(q.id, answer?.status === st ? null : { status: st })}>{STATUS_LABELS[st]}</Chip>
        ))}
        {showNa && (
          <Chip pressed={answer?.status === 'not_applicable_requested'} onClick={() => setAnswer(q.id, answer?.status === 'not_applicable_requested' ? null : { status: 'not_applicable_requested', naReason: answer?.naReason ?? null })}>
            {STATUS_LABELS.not_applicable_requested}
          </Chip>
        )}
      </div>
      {answer?.status === 'not_applicable_requested' && <NaReason key={q.id} qid={q.id} initial={answer.naReason ?? ''} />}
    </div>
  );
}

/** Saved on blur, so the append-only answer history gets one row per explanation, not one per keystroke. */
function NaReason({ qid, initial }: { qid: string; initial: string }) {
  const [text, setText] = useState(initial);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      Why does this not apply? The question stays open until a reviewer confirms it, so nothing is removed from the result silently.
      <textarea className="input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== initial && setAnswer(qid, { status: 'not_applicable_requested', naReason: text || null })} />
    </label>
  );
}
