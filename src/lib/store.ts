// Assessment state: one source of truth for the UI, saved to this browser on
// every change and appended to Supabase as an audit trail when available.

import { useSyncExternalStore } from 'react';
import { buildResult } from '../model/plan';
import { activeModules, pendingModules, reconcileApplicability, resolveRoutes, specialistReasons } from '../model/routing';
import type { Answer, AnswerMap, AssessmentContext, Diagnostics, EvidenceRef, RouteCode } from '../model/types';
import * as remote from './remote';

export type Screen = 'c1' | 'c2' | 'c3' | 'summary' | 'discovery' | 'picture' | 'deep' | 'result' | 'saved';
export type TaskStatus = 'open' | 'in_progress' | 'done';

export interface RouteChange { at: string; added: RouteCode[]; removed: RouteCode[]; deactivated: string[]; reactivated: string[] }
export interface SnapshotSummary { at: string; profile: string | null; indices: (number | null)[] }

export interface State {
  v: 1;
  remoteId: string | null;
  answerIds: Record<string, string>;
  screen: Screen;
  resumeTo: Screen | null;
  ctx: AssessmentContext;
  answers: AnswerMap;
  diag: Diagnostics;
  dIdx: number;
  qIdx: number;
  routeChange: RouteChange | null;
  taskStatus: Record<string, TaskStatus>;
  lastSnapshot: SnapshotSummary | null;
  previousSnapshot: SnapshotSummary | null;
  startedAt: string | null;
  savedAt: string | null;
}

const KEY = 'exitiq-assessment-v1';

export function blankContext(): AssessmentContext {
  return {
    role: null, ownershipTags: [], managementModel: null, profile: null, objectives: [], perimeter: null, horizon: null,
    liquidity: null, triggers: {}, sellerType: null, sellerTaxStatus: null,
    company: { businessModel: null, sector: null, revenueBand: null, employeeBand: null, jurisdiction: null },
  };
}

function blank(): State {
  return {
    v: 1, remoteId: null, answerIds: {}, screen: 'c1', resumeTo: null, ctx: blankContext(), answers: {}, diag: {},
    dIdx: 0, qIdx: 0, routeChange: null, taskStatus: {}, lastSnapshot: null, previousSnapshot: null, startedAt: null, savedAt: null,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw) as State;
    if (s.v !== 1) return blank();
    return { ...blank(), ...s, ctx: { ...blankContext(), ...s.ctx, company: { ...blankContext().company, ...s.ctx?.company } } };
  } catch {
    return blank();
  }
}

let state: State = typeof localStorage !== 'undefined' ? load() : blank();
const subs = new Set<() => void>();

function write(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or quota: the in-memory state still works */
  }
  subs.forEach((f) => f());
}

export function useAssessment(): State {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => state,
    () => state,
  );
}

export function getState(): State {
  return state;
}

export function hasProgress(s: State = state): boolean {
  return !!s.startedAt;
}

// ── remote mirroring ─────────────────────────────────────────────────────────

const STAGE: Record<Screen, remote.Stage> = {
  c1: 'CONTEXT', c2: 'CONTEXT', c3: 'CONTEXT', summary: 'CONTEXT', discovery: 'DISCOVERY', picture: 'INITIAL_PICTURE',
  deep: 'DEEP_ASSESSMENT', result: 'RESULT', saved: 'SAVED',
};

function rowInput(s: State): remote.AssessmentRowInput {
  const routes = resolveRoutes(s.ctx);
  const resume = s.screen === 'saved' ? s.resumeTo ?? 'c1' : s.screen;
  const resumeStage = STAGE[resume] as remote.AssessmentRowInput['resumeStage'];
  let stage = STAGE[s.screen];
  if (s.screen === 'result' && specialistReasons(s.ctx).length) stage = 'SPECIALIST_PATH';
  return {
    stage, resumeStage, ctx: s.ctx, diag: s.diag, uiState: { screen: s.screen, resumeTo: s.resumeTo, dIdx: s.dIdx, qIdx: s.qIdx, taskStatus: s.taskStatus },
    activeModules: activeModules(routes), pendingModules: pendingModules(routes),
  };
}

async function remoteId(): Promise<string | null> {
  if (state.remoteId) return state.remoteId;
  const id = await remote.createAssessment(rowInput(state));
  if (id && !state.remoteId) {
    write({ ...state, remoteId: id });
    remote.track('assessment_start', id, { stage: 'CONTEXT' });
  }
  return id;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAssessmentSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const id = await remoteId();
    if (id) void remote.saveAssessment(id, rowInput(state));
  }, 600);
}

async function mirrorAnswer(questionId: string) {
  const id = await remoteId();
  if (!id) return;
  const a = state.answers[questionId] ?? null;
  const newId = await remote.appendAnswer(id, questionId, a, state.answerIds[questionId] ?? null, state.ctx.role);
  if (newId) write({ ...state, answerIds: { ...state.answerIds, [questionId]: newId } });
}

async function mirrorDiagnostic(questionId: string) {
  const id = await remoteId();
  if (!id) return;
  const newId = await remote.appendDiagnostic(id, questionId, state.diag[questionId as keyof Diagnostics] ?? null, state.answerIds[questionId] ?? null);
  if (newId) write({ ...state, answerIds: { ...state.answerIds, [questionId]: newId } });
}

// ── actions ──────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

function touch(next: Partial<State>): State {
  return { ...state, ...next, startedAt: state.startedAt ?? now(), savedAt: now() };
}

/** Context edits re-run routing. Answers are never deleted: they go inactive and need reconfirmation on return. */
export function setContext(patch: Partial<AssessmentContext>) {
  const before = resolveRoutes(state.ctx);
  const ctx = { ...state.ctx, ...patch };
  const after = resolveRoutes(ctx);
  const t = now();
  const rec = reconcileApplicability(state.answers, before, after, t);
  const added = activeModules(after).filter((m) => !activeModules(before).includes(m));
  const removed = activeModules(before).filter((m) => !activeModules(after).includes(m));
  const changed = added.length || removed.length || rec.deactivated.length || rec.reactivated.length;
  write(touch({ ctx, answers: rec.answers, routeChange: changed ? { at: t, added, removed, deactivated: rec.deactivated, reactivated: rec.reactivated } : state.routeChange }));
  scheduleAssessmentSave();
  [...rec.deactivated, ...rec.reactivated].forEach((q) => void mirrorAnswer(q));
  // Only a change to an assessment already under way is a route change worth counting.
  if (changed && state.remoteId && Object.keys(state.answers).length) remote.track('route_change', state.remoteId, { stage: 'CONTEXT' });
}

export function setAnswer(questionId: string, answer: Omit<Answer, 'answeredAt'> | null) {
  const answers = { ...state.answers };
  if (answer) {
    const prev = answers[questionId];
    answers[questionId] = { ...answer, answeredAt: now(), evidence: answer.status === 'substantive' ? answer.evidence ?? prev?.evidence ?? null : null, requiresReconfirmation: false, inactiveSince: null };
  } else delete answers[questionId];
  write(touch({ answers }));
  void mirrorAnswer(questionId);
}

/** Reconfirm an earlier answer unchanged after its route came back. */
export function reconfirm(questionId: string) {
  const a = state.answers[questionId];
  if (!a) return;
  write(touch({ answers: { ...state.answers, [questionId]: { ...a, requiresReconfirmation: false, answeredAt: now() } } }));
  void mirrorAnswer(questionId);
}

export function setEvidence(questionId: string, ev: EvidenceRef | null) {
  const a = state.answers[questionId];
  if (!a) return;
  write(touch({ answers: { ...state.answers, [questionId]: { ...a, evidence: ev } } }));
  if (ev) {
    void remoteId().then((id) => {
      if (id) void remote.addEvidence(id, questionId, ev);
    });
  }
  void mirrorAnswer(questionId);
}

export function setDiagnostic(id: keyof Diagnostics, value: string | string[] | null) {
  const diag = { ...state.diag };
  if (value == null) delete diag[id];
  else diag[id] = value;
  write(touch({ diag }));
  void mirrorDiagnostic(id);
  scheduleAssessmentSave();
}

export function go(screen: Screen, extra: Partial<State> = {}) {
  const resumeTo = screen === 'saved' ? (state.screen === 'saved' ? state.resumeTo : state.screen) : state.resumeTo;
  write(touch({ screen, resumeTo, ...extra }));
  scheduleAssessmentSave();
  remote.track(screen === 'saved' ? 'save' : 'stage_view', state.remoteId, { stage: STAGE[screen], profile: state.ctx.profile });
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    /* jsdom / old browsers */
  }
}

export function setPosition(extra: Partial<Pick<State, 'dIdx' | 'qIdx'>>) {
  write(touch(extra));
  scheduleAssessmentSave();
}

export function setTaskStatus(key: string, s: TaskStatus) {
  write(touch({ taskStatus: { ...state.taskStatus, [key]: s } }));
  if (state.remoteId) void remote.setTaskStatus(state.remoteId, key, s);
}

export function dismissRouteChange() {
  write({ ...state, routeChange: null });
}

/** Called when the action plan is shown: stores a versioned snapshot when the result changed. */
export function recordResult() {
  const { score, ...snapshot } = buildResult(state.ctx, state.answers);
  const r = { ...snapshot, dimensions: score.dimensions };
  const indices = r.dimensions.map((d) => d.displayIndex);
  const summary: SnapshotSummary = { at: r.generatedAt, profile: r.profile, indices };
  const last = state.lastSnapshot;
  const changed = !last || last.profile !== summary.profile || JSON.stringify(last.indices) !== JSON.stringify(indices);
  if (changed) {
    const previousSnapshot = last && last.profile !== summary.profile ? last : state.previousSnapshot;
    write({ ...state, lastSnapshot: summary, previousSnapshot });
  }
  void remoteId().then((id) => {
    if (!id) return;
    if (changed) void remote.saveResult(id, r);
    remote.track('result_view', id, { stage: 'RESULT', profile: state.ctx.profile });
  });
}

export function resume() {
  const target = state.resumeTo && state.resumeTo !== 'saved' ? state.resumeTo : 'c1';
  remote.track('resume', state.remoteId, { stage: STAGE[target] });
  go(target);
}

export async function hydrateFromRemote(): Promise<boolean> {
  if (hasProgress()) return false;
  try {
    const r = await remote.loadLatest();
    if (!r) return false;
    const ui = r.uiState as Partial<State>;
    write({
      ...blank(), remoteId: r.id, answerIds: r.answerIds, ctx: { ...blankContext(), ...r.ctx }, answers: r.answers, diag: r.diag,
      screen: 'saved', resumeTo: (ui.resumeTo as Screen) ?? (ui.screen as Screen) ?? 'c1', dIdx: ui.dIdx ?? 0, qIdx: ui.qIdx ?? 0,
      taskStatus: (ui.taskStatus as State['taskStatus']) ?? {}, startedAt: r.updatedAt, savedAt: r.updatedAt,
    });
    return true;
  } catch {
    return false;
  }
}

/** Deletes the assessment everywhere this app stored it. */
export async function deleteEverything() {
  if (state.remoteId) await remote.deleteAssessment(state.remoteId);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  remote.resetCreation();
  write(blank());
}

export function startNew() {
  remote.resetCreation();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  write(blank());
}
