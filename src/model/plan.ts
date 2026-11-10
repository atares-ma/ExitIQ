// Sections 8 and 19: risk rules, priority engine, tasks and the deterministic
// result object that the report renders (and that any narrative must be
// generated from).

import {
  CATALOGUE_VERSION, DIMENSIONS, DOMAIN_ACTIONS, DOMAIN_NAMES, QUESTION_BY_ID, REPORT_VERSION, ROUTE_LABELS, SCORING_VERSION,
  dimensionOf,
} from './catalogue';
import { STATUS_LABELS } from './options';
import { activeModules, pendingModules } from './routing';
import { computeScores, hasConflict, isKnown, type ScoreResult } from './scoring';
import type { AnswerMap, AssessmentContext, Diagnostics, Horizon, RouteCode } from './types';

export type RiskSeverity = 'critical' | 'review';
export interface Risk {
  rule: 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'LIQ' | 'APP';
  severity: RiskSeverity;
  /** confirmed = the stated factual predicate is met; unresolved = a critical fact still needs review. */
  basis: 'confirmed' | 'unresolved';
  title: string;
  text: string;
  questionIds: string[];
}

export type PriorityClass = 1 | 2 | 3;
export type TaskKind = 'critical' | 'open' | 'gap';

export interface Task {
  key: string;
  priorityClass: PriorityClass;
  kind: TaskKind;
  label: string;                 // badge text
  title: string;
  reason: string;
  action: string;
  accountableRole: string;
  suggestedTiming: string;
  timingRank: number;            // for "planned deadline" ordering
  dependencies: string[];
  evidenceRequired: string | null;
  sourceQuestionIds: string[];
  ruleId: string | null;
  dimension: string | null;
  domain: string | null;
  impact: number;                // e_q * (100 - a_q) / 100, or e_q for open facts
}

const v = (answers: AnswerMap, id: string) => (isKnown(answers[id]) ? answers[id].points : null);
const status = (answers: AnswerMap, id: string) => answers[id]?.status;
const unresolved = (answers: AnswerMap, id: string) => !!answers[id] && !isKnown(answers[id]);

export function evaluateRisks(ctx: AssessmentContext, answers: AnswerMap, score: ScoreResult): Risk[] {
  const r: Risk[] = [];
  const applicable = new Set(score.applicable.map((q) => q.id));
  const nearLaunch = ctx.horizon === 'under_6';

  // R01 Liquidity
  if (ctx.liquidity === 'acute') {
    r.push({ rule: 'R01', severity: 'critical', basis: 'confirmed', title: 'Confirmed acute payment pressure',
      text: 'You confirmed acute payment pressure. This needs a specialist route first; there is no standard transaction-ready conclusion. ExitIQ does not diagnose insolvency, so obtain a qualified assessment.', questionIds: [] });
  } else if (ctx.liquidity === 'potential' || ctx.liquidity === 'unknown') {
    r.push({ rule: 'LIQ', severity: 'review', basis: 'unresolved', title: 'Liquidity over the next six months needs a review',
      text: ctx.liquidity === 'unknown'
        ? 'Whether payment obligations can be met over the next six months is unknown. Review the cash position before preparation work continues.'
        : 'You reported potential payment pressure. Review it with your finance lead before preparation work continues.', questionIds: ['Q08'] });
  }

  // R02 Authority: Q04 = 0 AND a launch is planned before authority can be obtained.
  if (v(answers, 'Q04') === 0 && nearLaunch) {
    r.push({ rule: 'R02', severity: 'critical', basis: 'confirmed', title: 'Required approvals are not mapped',
      text: 'Required approvals are not mapped, but a launch is planned within six months. Name the approval and its owner.', questionIds: ['Q04'] });
  } else if (unresolved(answers, 'Q04') && nearLaunch) {
    r.push({ rule: 'R02', severity: 'review', basis: 'unresolved', title: 'Approval map not confirmed',
      text: 'It is open whether required approvals are mapped, and a launch is planned within six months. Confirm the approval map.', questionIds: ['Q04'] });
  }

  // R03 Essential rights: confirmed 0 anchors only; UNKNOWN alone never asserts a defect.
  const rightsZero = ['Q32', 'Q33'].filter((id) => v(answers, id) === 0);
  if (rightsZero.length) {
    r.push({ rule: 'R03', severity: 'critical', basis: 'confirmed', title: 'Essential ownership or IP rights unresolved',
      text: 'You reported essential ownership or IP rights as undocumented or unresolved. This needs a critical legal review before a transaction.', questionIds: rightsZero });
  }
  const rightsOpen = ['Q32', 'Q33'].filter((id) => unresolved(answers, id));
  if (rightsOpen.length) {
    r.push({ rule: 'R03', severity: 'review', basis: 'unresolved', title: 'Essential rights need review',
      text: 'The status of essential ownership or IP rights is open. This is not a confirmed defect; it needs review.', questionIds: rightsOpen });
  }

  // R04 Tax timing: only a specialist can confirm. Restructuring history creates a review task.
  if (status(answers, 'Q28') === 'needs_adviser_review' || v(answers, 'Q28') === 0) {
    r.push({ rule: 'R04', severity: 'review', basis: 'unresolved', title: 'Historical tax restrictions need specialist review',
      text: 'Past reorganisations and transfers have not been fully reviewed. A tax adviser should confirm whether any restriction or deadline affects the timetable. This is not an assertion that a tax charge applies.', questionIds: ['Q28'] });
  }

  // R05 Separation: SEPARATION active and an essential service lacks a continuity plan.
  if (score.routes.SEPARATION === 'on' && v(answers, 'Q46') === 0) {
    r.push({ rule: 'R05', severity: 'critical', basis: 'confirmed', title: 'Essential group services lack a continuity plan',
      text: 'Essential group-provided services lack a viable continuity response at completion. This is a critical separation prerequisite.', questionIds: ['Q46'] });
  }

  // R06 Funding: no forecast while liquidity pressure is possible. A confirmed gap needs specialist judgement.
  if (v(answers, 'Q08') === 0 && (ctx.liquidity === 'potential' || ctx.liquidity === 'unknown' || ctx.objectives.includes('growth_capital'))) {
    r.push({ rule: 'R06', severity: 'review', basis: 'unresolved', title: 'Funding through the transaction period is unplanned',
      text: 'There is no usable cash forecast while funding needs may arise before the transaction. Assess whether a funding gap exists and how it would be bridged.', questionIds: ['Q08'] });
  }

  // R07 Contradiction
  const conflicted = score.applicable.filter((q) => hasConflict(answers[q.id])).map((q) => q.id);
  if (conflicted.length) {
    r.push({ rule: 'R07', severity: 'review', basis: 'unresolved', title: 'Conflicting answers',
      text: 'Answers or contributors conflict. The affected answers are excluded from coverage until the facts are reconfirmed.', questionIds: conflicted });
  }

  // Applicability unresolved
  for (const m of pendingModules(score.routes)) {
    const ids = score.applicable.filter((q) => q.route === m).map((q) => q.id).filter((id) => applicable.has(id));
    r.push({ rule: 'APP', severity: 'review', basis: 'unresolved', title: `Applicability unresolved: ${ROUTE_LABELS[m]}`,
      text: `Clarify whether ${ROUTE_LABELS[m].toLowerCase()} applies. Until then its questions stay open and the assessment cannot be complete.`, questionIds: ids });
  }

  return r;
}

const HORIZON_TIMING: Record<Horizon, string[]> = {
  under_6: ['Before launch', 'Within 4 weeks', 'Within 3 months'],
  m6_18: ['Before launch', 'Within 3 months', 'Within 6 months'],
  m19_36: ['Before launch', 'Within 6 months', 'Within 12 months'],
  over_36: ['Before launch', 'Within 12 months', 'Before preparation starts'],
  undecided: ['Before launch', 'Early in preparation', 'During preparation'],
};

export function buildTasks(ctx: AssessmentContext, answers: AnswerMap, score: ScoreResult, risks: Risk[]): Task[] {
  const timing = HORIZON_TIMING[ctx.horizon ?? 'undecided'];
  const tasks: Task[] = [];

  for (const risk of risks) {
    if (risk.rule === 'APP' || risk.rule === 'R07') {
      tasks.push({
        key: `${risk.rule}:${risk.questionIds.join(',') || risk.title}`, priorityClass: 2, kind: 'open', label: risk.rule === 'R07' ? 'Reconfirm' : 'Clarify',
        title: risk.title, reason: risk.text, action: risk.rule === 'R07' ? 'Reconfirm the facts with the contributors and record the resolution.' : 'Answer the related context question.',
        accountableRole: 'Transaction lead', suggestedTiming: timing[1], timingRank: 1, dependencies: [], evidenceRequired: null,
        sourceQuestionIds: risk.questionIds, ruleId: risk.rule, dimension: null, domain: null, impact: 0,
      });
      continue;
    }
    const q = risk.questionIds[0] ? QUESTION_BY_ID[risk.questionIds[0]] : undefined;
    tasks.push({
      key: `${risk.rule}:${risk.basis}`, priorityClass: risk.basis === 'confirmed' ? 1 : 2, kind: risk.basis === 'confirmed' ? 'critical' : 'open',
      label: risk.basis === 'confirmed' ? 'Critical' : 'Needs review', title: risk.title, reason: risk.text,
      action: q ? DOMAIN_ACTIONS[q.domain].action : 'Obtain a qualified specialist assessment.',
      accountableRole: q ? q.contributor : 'CFO / qualified adviser',
      suggestedTiming: risk.basis === 'confirmed' ? timing[0] : timing[1], timingRank: risk.basis === 'confirmed' ? 0 : 1,
      dependencies: [], evidenceRequired: q?.evidenceRequest ?? null, sourceQuestionIds: risk.questionIds, ruleId: risk.rule,
      dimension: q ? DIMENSIONS.find((d) => d.key === dimensionOf(q.domain))!.name : null, domain: q ? DOMAIN_NAMES[q.domain] : null,
      impact: q ? score.controls[q.id]?.effectiveWeight ?? 0 : 0,
    });
  }

  const coveredByRisk = new Set(tasks.flatMap((t) => (t.priorityClass === 1 ? t.sourceQuestionIds : [])));

  for (const q of score.applicable) {
    if (coveredByRisk.has(q.id)) continue;
    const a = answers[q.id];
    const c = score.controls[q.id];
    const e = c?.effectiveWeight ?? 0;
    const dim = DIMENSIONS.find((d) => d.key === dimensionOf(q.domain))!.name;
    const base = {
      dependencies: q.dependsOn ?? [], evidenceRequired: q.evidenceRequest ?? null, sourceQuestionIds: [q.id], ruleId: null,
      dimension: dim, domain: DOMAIN_NAMES[q.domain], accountableRole: q.contributor, action: DOMAIN_ACTIONS[q.domain].action,
    };
    if (isKnown(a)) {
      if (a.points === 100) continue;
      tasks.push({ ...base, key: `Q:${q.id}`, priorityClass: 3, kind: 'gap', label: a.points === 0 ? 'Gap' : 'Partial', title: q.name,
        reason: `Today: ${q.anchors[a.points / 50]} Target: ${q.anchors[2]}`, suggestedTiming: timing[2], timingRank: 2,
        impact: (e * (100 - a.points)) / 100 });
    } else {
      const st = !a ? 'unanswered' : a.requiresReconfirmation ? 'reconfirm' : hasConflict(a) ? 'conflicted' : a.status;
      const label = st === 'unanswered' ? 'Unanswered' : st === 'needs_adviser_review' ? 'Adviser review' : st === 'reconfirm' ? 'Reconfirm' : 'Confirm';
      const reason = st === 'unanswered' ? 'Not answered yet.'
        : st === 'reconfirm' ? 'This question applies again after a context change. Reconfirm the earlier answer.'
        : `Marked as ${(STATUS_LABELS[st] ?? st).toLowerCase()}. Resolve it to include it in coverage.`;
      tasks.push({ ...base, key: `Q:${q.id}`, priorityClass: 3, kind: 'open', label, title: q.name, reason,
        suggestedTiming: timing[2], timingRank: 2, impact: e });
    }
  }

  // Confirmed critical first, unresolved critical facts second, ordinary gaps third;
  // within a class by planned timing, then impact.
  return tasks.sort((x, y) => x.priorityClass - y.priorityClass || x.timingRank - y.timingRank || y.impact - x.impact);
}

export interface Observation { tag: string; tone: 'positive' | 'attention' | 'neutral'; text: string; answerIds: string[] }

/** Section 9: at most three observations, each linked to actual answers. No valuation, no verdicts. */
export function initialObservations(ctx: AssessmentContext, answers: AnswerMap, diag: Diagnostics): Observation[] {
  const out: Observation[] = [];
  const pts = (id: string) => v(answers, id);
  const strengths = (Array.isArray(diag.E01) ? diag.E01 : []) as string[];
  const rel = strengths.includes('Personal customer relationships');
  const absent = ctx.managementModel === 'employed' ? 'a key executive' : 'you';

  if (rel && pts('Q12') != null && pts('Q12')! < 100) {
    out.push({ tag: 'Continuity', tone: 'attention', answerIds: ['E01', 'Q12'],
      text: 'You identified personal customer relationships as a strength. Your continuity answers suggest checking how these relationships can be maintained after a change of ownership.' });
  } else if (strengths.length) {
    out.push({ tag: 'Strengths', tone: 'neutral', answerIds: ['E01'],
      text: `You would lead with ${strengths.slice(0, 2).map((s) => s.toLowerCase()).join(' and ')}. The detailed assessment asks what evidence supports this.` });
  }
  if (pts('Q12') === 100 && pts('Q13') === 100) {
    out.push({ tag: 'Leadership', tone: 'positive', answerIds: ['Q12', 'Q13'],
      text: 'Material decisions and critical expertise are covered during an absence. That supports the transferability of leadership.' });
  } else if (pts('Q12') === 0) {
    out.push({ tag: 'Decisions', tone: 'attention', answerIds: ['Q12'],
      text: `Many routine decisions would wait if ${absent} were away for four weeks. Buyers will look at how authority is delegated.` });
  } else if (pts('Q13') === 0) {
    out.push({ tag: 'Expertise', tone: 'attention', answerIds: ['Q13'],
      text: 'Critical work currently has no cover. Buyers will ask how essential knowledge is shared.' });
  }
  if (diag.E04 === 'Over 30%' && out.length < 3) {
    out.push({ tag: 'Customers', tone: 'attention', answerIds: ['E04'],
      text: 'Your largest customer accounts for more than 30% of revenue. The share alone is not a verdict. The detailed assessment looks at how the exposure is managed.' });
  }
  if (pts('Q25') === 0 && out.length < 3) {
    out.push({ tag: 'Tax', tone: 'attention', answerIds: ['Q25'],
      text: 'No transaction tax workstream is assigned yet. Tax preparation often sets the timetable, so it is worth starting early.' });
  }
  if (pts('Q19') === 100 && out.length < 3) {
    out.push({ tag: 'Proposition', tone: 'positive', answerIds: ['Q19'],
      text: 'You can support why customers choose you with evidence. That is a solid basis for explaining the business to buyers.' });
  }
  if (!out.length) {
    out.push({ tag: 'More detail needed', tone: 'neutral', answerIds: [],
      text: 'Your answers do not yet support an observation. The detailed assessment can fill this in.' });
  }
  return out.slice(0, 3);
}

export interface TaxRow { id: string; name: string; scope: 'company' | 'seller' | 'cross_border'; status: 'Not yet assessed' | 'Needs review' | 'Not started' | 'In progress' | 'Prepared' }

const TAX_SCOPE: Record<string, TaxRow['scope']> = {
  Q25: 'company', Q27: 'company', Q28: 'company', Q29: 'company', Q30: 'company', Q49: 'company',
  Q26: 'seller', Q31: 'seller', Q52: 'cross_border',
};

export function taxSection(answers: AnswerMap, score: ScoreResult): TaxRow[] {
  return score.applicable.filter((q) => q.domain === 'T2').map((q) => {
    const a = answers[q.id];
    const st: TaxRow['status'] = !a ? 'Not yet assessed' : !isKnown(a) ? 'Needs review'
      : a.points === 100 ? 'Prepared' : a.points === 50 ? 'In progress' : 'Not started';
    return { id: q.id, name: q.name, scope: TAX_SCOPE[q.id] ?? 'company', status: st };
  });
}

export interface ResultSnapshot {
  versions: { catalogue: string; scoring: string; report: string };
  generatedAt: string;
  context: AssessmentContext;
  profile: string | null;
  activeModules: RouteCode[];
  pendingModules: RouteCode[];
  effectiveWeights: Record<string, number>;
  dimensions: ScoreResult['dimensions'];
  dataStatus: 'data_complete' | 'data_incomplete';
  riskStatus: 'critical' | 'review' | 'none';
  specialist: string[];
  risks: Risk[];
  strengths: { id: string; name: string; text: string }[];
  tasks: Task[];
  tax: TaxRow[];
  unresolved: string[];
}

/** Section 18 recalculation order, end to end. Pure and deterministic. */
export function buildResult(ctx: AssessmentContext, answers: AnswerMap, now = new Date().toISOString()): ResultSnapshot & { score: ScoreResult } {
  const score = computeScores(ctx, answers);
  const risks = evaluateRisks(ctx, answers, score);
  const tasks = buildTasks(ctx, answers, score, risks);
  const strengths = score.applicable
    .filter((q) => isKnown(answers[q.id]) && answers[q.id].points === 100)
    .sort((a, b) => (score.controls[b.id]?.effectiveWeight ?? 0) - (score.controls[a.id]?.effectiveWeight ?? 0))
    .slice(0, 3)
    .map((q) => ({ id: q.id, name: q.name, text: q.anchors[2] }));
  return {
    score,
    versions: { catalogue: CATALOGUE_VERSION, scoring: SCORING_VERSION, report: REPORT_VERSION },
    generatedAt: now,
    context: ctx,
    profile: score.profile,
    activeModules: activeModules(score.routes),
    pendingModules: pendingModules(score.routes),
    effectiveWeights: Object.fromEntries(Object.values(score.controls).map((c) => [c.id, c.effectiveWeight])),
    dimensions: score.dimensions,
    dataStatus: score.dataComplete ? 'data_complete' : 'data_incomplete',
    riskStatus: risks.some((r) => r.severity === 'critical') ? 'critical' : risks.length ? 'review' : 'none',
    specialist: score.specialist,
    risks,
    strengths,
    tasks,
    tax: taxSection(answers, score),
    unresolved: score.applicable.filter((q) => !isKnown(answers[q.id])).map((q) => q.id),
  };
}
