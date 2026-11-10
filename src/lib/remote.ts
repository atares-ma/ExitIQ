// Remote persistence in the ExitIQ Supabase project. Every visitor gets a real
// auth user through anonymous sign-in, so RLS can enforce owner-only access on
// auth.uid(). If anonymous sign-in is disabled or the network is down, the app
// keeps working from this browser's storage and says so.

import { CATALOGUE_VERSION, REPORT_VERSION, SCORING_VERSION } from '../model/catalogue';
import type { ResultSnapshot, Task } from '../model/plan';
import type { Answer, AnswerMap, AssessmentContext, Diagnostics, EvidenceRef } from '../model/types';
import { supabase } from './supabase';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'local-only' | 'error';
type Listener = (s: SyncStatus, detail?: string) => void;

let status: SyncStatus = 'idle';
let detail: string | undefined;
const listeners = new Set<Listener>();
let queue: Promise<unknown> = Promise.resolve();
let userPromise: Promise<string | null> | null = null;
let remoteDisabledReason: string | null = null;

function setStatus(s: SyncStatus, d?: string) {
  status = s;
  detail = d;
  listeners.forEach((l) => l(s, d));
}

export function onSyncStatus(l: Listener): () => void {
  listeners.add(l);
  l(status, detail);
  return () => listeners.delete(l);
}

export function remoteAvailable(): boolean {
  return remoteDisabledReason === null;
}

/** Returns the auth user id, signing in anonymously if needed. Null means local-only. */
export function ensureUser(): Promise<string | null> {
  if (!userPromise) {
    userPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) return data.session.user.id;
        const { data: anon, error } = await supabase.auth.signInAnonymously();
        if (error || !anon.user) throw error ?? new Error('No user returned');
        return anon.user.id;
      } catch (e) {
        remoteDisabledReason = e instanceof Error ? e.message : String(e);
        setStatus('local-only', remoteDisabledReason);
        userPromise = null; // allow a later retry
        return null;
      }
    })();
  }
  return userPromise;
}

/** Serialises writes so answer history lands in order. */
function enqueue<T>(job: () => Promise<T>): Promise<T | null> {
  const run = async (): Promise<T | null> => {
    const uid = await ensureUser();
    if (!uid) return null;
    setStatus('saving');
    try {
      const r = await job();
      setStatus('saved');
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
      setStatus('error', msg);
      return null;
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

export type Stage = 'CONTEXT' | 'DISCOVERY' | 'INITIAL_PICTURE' | 'DEEP_ASSESSMENT' | 'RESULT' | 'SAVED' | 'SPECIALIST_PATH' | 'APPLICABILITY_PENDING';

export interface AssessmentRowInput {
  stage: Stage;
  resumeStage: Exclude<Stage, 'SAVED' | 'SPECIALIST_PATH' | 'APPLICABILITY_PENDING'> | null;
  ctx: AssessmentContext;
  diag: Diagnostics;
  uiState: Record<string, unknown>;
  activeModules: string[];
  pendingModules: string[];
}

function row(input: AssessmentRowInput) {
  const c = input.ctx;
  return {
    stage: input.stage,
    resume_stage: input.resumeStage,
    perimeter: c.perimeter,
    respondent_role: c.role,
    confirmed_profile: c.profile && c.profile !== 'UNDECIDED' ? c.profile : null,
    ownership_tags: c.ownershipTags,
    objectives: c.objectives,
    horizon: c.horizon,
    jurisdictions: { company: c.company.jurisdiction, sellerTaxStatus: c.sellerTaxStatus },
    context: c,
    diagnostics: input.diag,
    ui_state: input.uiState,
    active_modules: input.activeModules,
    pending_modules: input.pendingModules,
    catalogue_version: CATALOGUE_VERSION,
    scoring_version: SCORING_VERSION,
    report_version: REPORT_VERSION,
  };
}

let creating: Promise<string | null> | null = null;

/** Creates the assessment row once; later calls return the same id. */
export function createAssessment(input: AssessmentRowInput): Promise<string | null> {
  if (!creating) {
    creating = enqueue(async () => {
      const { data, error } = await supabase.from('assessments').insert(row(input)).select('id').single();
      if (error) throw error;
      return data.id as string;
    }).then((id) => {
      if (!id) creating = null;
      return id;
    });
  }
  return creating;
}

export function resetCreation() {
  creating = null;
}

export function saveAssessment(id: string, input: AssessmentRowInput) {
  return enqueue(async () => {
    const { error } = await supabase.from('assessments').update(row(input)).eq('id', id);
    if (error) throw error;
  });
}

export function appendAnswer(id: string, questionId: string, a: Answer | null, previousId: string | null, role: string | null) {
  return enqueue(async () => {
    const payload: Record<string, unknown> = a
      ? {
          assessment_id: id, question_id: questionId, status: a.status, points: a.status === 'substantive' ? a.points ?? null : null,
          option_id: a.status === 'substantive' && a.points != null ? `a${a.points}` : null,
          evidence_level: a.evidence && a.evidence.reviewStatus === 'dated_reference' && a.evidence.ownerRole && a.evidence.asOfDate ? 0.5 : 0,
          requires_reconfirmation: !!a.requiresReconfirmation, inactive_since: a.inactiveSince ?? null, na_reason: a.naReason ?? null,
          previous_answer_id: previousId, respondent_role: role, source_version: CATALOGUE_VERSION,
        }
      : { assessment_id: id, question_id: questionId, status: 'cleared', previous_answer_id: previousId, respondent_role: role, source_version: CATALOGUE_VERSION };
    const { data, error } = await supabase.from('answers').insert(payload).select('id').single();
    if (error) throw error;
    return data.id as string;
  });
}

export function appendDiagnostic(id: string, questionId: string, value: unknown, previousId: string | null) {
  return enqueue(async () => {
    const statusFor = value === 'Unknown' ? 'unknown' : value === 'Prefer not to answer' ? 'withheld' : value == null || (Array.isArray(value) && !value.length) ? 'cleared' : 'diagnostic';
    const { data, error } = await supabase.from('answers').insert({
      assessment_id: id, question_id: questionId, status: statusFor, value: statusFor === 'diagnostic' ? value : null,
      previous_answer_id: previousId, source_version: CATALOGUE_VERSION,
    }).select('id').single();
    if (error) throw error;
    return data.id as string;
  });
}

export function addEvidence(id: string, questionId: string, ev: EvidenceRef) {
  return enqueue(async () => {
    const dated = !!(ev.ownerRole.trim() && ev.asOfDate);
    const { error } = await supabase.from('evidence_refs').insert({
      assessment_id: id, question_id: questionId, reference: ev.reference.trim() || 'Not specified', owner_role: ev.ownerRole.trim() || null,
      as_of_date: ev.asOfDate, review_status: dated ? 'dated_reference' : 'self_reported',
    });
    if (error) throw error;
  });
}

export function saveResult(id: string, snapshot: ResultSnapshot) {
  return enqueue(async () => {
    const { error } = await supabase.from('result_snapshots').insert({
      assessment_id: id, profile: snapshot.profile, catalogue_version: snapshot.versions.catalogue, scoring_version: snapshot.versions.scoring,
      report_version: snapshot.versions.report, data_status: snapshot.dataStatus, risk_status: snapshot.riskStatus, result: snapshot,
    });
    if (error) throw error;
    if (snapshot.tasks.length) {
      // Upsert only the derived fields; status and agreed due dates set by the user are preserved.
      const { error: tErr } = await supabase.from('tasks').upsert(
        snapshot.tasks.map((t: Task) => ({
          assessment_id: id, task_key: t.key, source_question_ids: t.sourceQuestionIds, rule_id: t.ruleId, priority_class: t.priorityClass,
          title: t.title, reason: t.reason, accountable_role: t.accountableRole, suggested_timing: t.suggestedTiming,
          dependencies: t.dependencies, evidence_required: t.evidenceRequired,
        })),
        { onConflict: 'assessment_id,task_key' },
      );
      if (tErr) throw tErr;
    }
  });
}

export function setTaskStatus(id: string, taskKey: string, taskStatus: string) {
  return enqueue(async () => {
    const { error } = await supabase.from('tasks').update({ status: taskStatus }).eq('assessment_id', id).eq('task_key', taskKey);
    if (error) throw error;
  });
}

export function deleteAssessment(id: string) {
  return enqueue(async () => {
    const { error } = await supabase.from('assessments').delete().eq('id', id);
    if (error) throw error;
  });
}

type EventName = 'stage_view' | 'assessment_start' | 'theme_complete' | 'route_change' | 'save' | 'resume' | 'result_view' | 'contact_request' | 'export';

/** Minimal analytics (section 20): no answer text, tax details or evidence. Best effort, never blocks. */
export function track(event: EventName, assessmentId: string | null, meta: { stage?: string; profile?: string | null } = {}) {
  if (!remoteAvailable()) return;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const device = w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  void ensureUser().then((uid) => {
    if (!uid) return;
    // Query builders are lazy: without .then() the request is never sent.
    void supabase.from('analytics_events').insert({
      assessment_id: assessmentId, event, stage: meta.stage ?? null, broad_context: meta.profile ?? null, device,
      channel: params?.get('utm_source')?.slice(0, 60) ?? null, is_internal: params?.has('internal') ?? false,
    }).then(() => undefined, () => undefined);
  });
}

export interface RemoteAssessment {
  id: string;
  ctx: AssessmentContext;
  diag: Diagnostics;
  uiState: Record<string, unknown>;
  answers: AnswerMap;
  answerIds: Record<string, string>;
  updatedAt: string;
}

/** Loads the signed-in user's most recent assessment, with current answers and latest evidence. */
export async function loadLatest(): Promise<RemoteAssessment | null> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;
  const { data: a, error } = await supabase.from('assessments').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !a) return null;
  const [{ data: ans }, { data: ev }] = await Promise.all([
    supabase.from('current_answers').select('*').eq('assessment_id', a.id),
    supabase.from('evidence_refs').select('*').eq('assessment_id', a.id).order('created_at', { ascending: true }),
  ]);
  const answers: AnswerMap = {};
  const answerIds: Record<string, string> = {};
  const diag: Diagnostics = { ...(a.diagnostics ?? {}) };
  for (const r of ans ?? []) {
    answerIds[r.question_id] = r.id;
    if (r.question_id.startsWith('E') || r.status === 'cleared') continue;
    answers[r.question_id] = {
      status: r.status, points: r.points ?? undefined, answeredAt: r.created_at,
      requiresReconfirmation: r.requires_reconfirmation, inactiveSince: r.inactive_since, naReason: r.na_reason,
    };
  }
  for (const e of ev ?? []) {
    const target = answers[e.question_id];
    if (target) target.evidence = { reference: e.reference, ownerRole: e.owner_role ?? '', asOfDate: e.as_of_date, reviewStatus: e.review_status, reviewerId: e.reviewer_id, reviewedAt: e.reviewed_at };
  }
  return { id: a.id, ctx: a.context, diag, uiState: a.ui_state ?? {}, answers, answerIds, updatedAt: a.updated_at };
}

/**
 * Links the anonymous user to an email address so the assessment can be
 * resumed on another device. Supabase sends a confirmation link.
 */
export async function linkEmail(email: string): Promise<{ ok: boolean; message: string }> {
  const uid = await ensureUser();
  if (!uid) return { ok: false, message: 'Online saving is not available right now. Your progress stays in this browser.' };
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${location.origin}/assessment` });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Check your inbox and confirm the address. The link brings you back to this assessment.' };
}

export async function signOutAndForget() {
  await supabase.auth.signOut().catch(() => undefined);
  userPromise = null;
  creating = null;
}
