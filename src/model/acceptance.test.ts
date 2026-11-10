// Section 21 acceptance tests, plus routing examples from sections 4-5 and the
// worked example from section 7.
import { describe, expect, it } from 'vitest';
import { DIMENSIONS, PROFILE_WEIGHTS, QUESTIONS, QUESTION_BY_ID } from './catalogue';
import { buildResult } from './plan';
import { applicableQuestions, reconcileApplicability, resolveRoutes, questionText } from './routing';
import { computeScores } from './scoring';
import type { Answer, AnswerMap, AssessmentContext, Points, Profile } from './types';

const T = '2026-11-10T10:00:00.000Z';

function ctx(over: Partial<AssessmentContext> = {}): AssessmentContext {
  return {
    role: 'owner', ownershipTags: ['private_family'], managementModel: 'owner_led', profile: 'OWNER',
    objectives: ['full_sale'], perimeter: 'whole_business', horizon: 'm6_18', liquidity: 'no_pressure',
    triggers: { debt: 'no', acquisitions: 'no', employee_equity: 'no', preferences: 'no', convertibles: 'no', regulated: 'no', contingent: 'no', group_dependency: 'no' },
    sellerType: 'individuals', sellerTaxStatus: 'same',
    company: { businessModel: null, sector: null, revenueBand: null, employeeBand: null, jurisdiction: 'DE' },
    ...over,
  };
}
const sub = (points: Points): Answer => ({ status: 'substantive', points, answeredAt: T });
const st = (status: Answer['status']): Answer => ({ status, answeredAt: T });
function fill(c: AssessmentContext, f: (id: string) => Answer): AnswerMap {
  return Object.fromEntries(applicableQuestions(resolveRoutes(c)).map((q) => [q.id, f(q.id)]));
}

describe('catalogue', () => {
  it('registers 55 controls with unique ids Q01..Q55', () => {
    expect(QUESTIONS).toHaveLength(55);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(55);
    QUESTIONS.forEach((q, i) => expect(q.id).toBe(`Q${String(i + 1).padStart(2, '0')}`));
  });
  it('CORE has 37 controls and special routes add 18', () => {
    expect(QUESTIONS.filter((q) => q.route === 'CORE')).toHaveLength(37);
    expect(QUESTIONS.filter((q) => q.route !== 'CORE')).toHaveLength(18);
  });
});

describe('Weight totals', () => {
  it('every profile sums to 100 separately for S, O and T', () => {
    for (const p of Object.keys(PROFILE_WEIGHTS) as Profile[]) {
      for (const d of DIMENSIONS) expect(d.domains.reduce((t, k) => t + PROFILE_WEIGHTS[p][k], 0)).toBe(100);
    }
  });
  it('effective question weights sum to 100 per applicable dimension, for every profile and route mix', () => {
    const mixes: Partial<AssessmentContext>[] = [
      {},
      { ownershipTags: ['pe', 'private_family'], profile: 'PE', triggers: { ...ctx().triggers, debt: 'yes', employee_equity: 'yes', acquisitions: 'yes' } },
      { ownershipTags: ['corporate_group'], profile: 'CORPORATE', perimeter: 'business_unit_assets' },
      { ownershipTags: ['vc'], profile: 'VC', objectives: ['partial_sale', 'growth_capital'], sellerTaxStatus: 'multiple', triggers: { ...ctx().triggers, convertibles: 'yes', employee_equity: 'yes' } },
    ];
    for (const m of mixes) {
      const s = computeScores(ctx(m), {});
      for (const d of DIMENSIONS) {
        const total = Object.values(s.controls).filter((c) => c.domain[0] === d.key).reduce((t, c) => t + c.effectiveWeight, 0);
        expect(total).toBeCloseTo(100, 9);
      }
    }
  });
});

describe('Answer anchors', () => {
  it('all full anchors: indices 100, coverage 100, evidence shown separately at 0', () => {
    const c = ctx();
    const s = computeScores(c, fill(c, () => sub(100)));
    for (const d of s.dimensions) {
      expect(d.displayIndex).toBe(100);
      expect(d.coverage).toBeCloseTo(1);
      expect(d.evidenceSupport).toBe(0);
      expect(d.status).toBe('complete');
    }
    expect(s.dataComplete).toBe(true);
  });
  it('all absent anchors: indices 0, coverage 100, tasks remain visible', () => {
    const c = ctx();
    const r = buildResult(c, fill(c, () => sub(0)));
    for (const d of r.dimensions) {
      expect(d.displayIndex).toBe(0);
      expect(d.coverage).toBeCloseTo(1);
    }
    // Every control stays visible as a task; Q32/Q33 at 0 are promoted to one critical R03 task.
    const covered = new Set(r.tasks.flatMap((t) => t.sourceQuestionIds));
    expect(covered.size).toBe(37);
    expect(r.tasks.find((t) => t.ruleId === 'R03')?.priorityClass).toBe(1);
  });
  it('all unknown: indices null, coverage 0, ranges 0-100, no complete result', () => {
    const c = ctx();
    const r = buildResult(c, fill(c, () => st('unknown')));
    for (const d of r.dimensions) {
      expect(d.rawIndex).toBeNull();
      expect(d.displayIndex).toBeNull();
      expect(d.coverage).toBe(0);
      expect(d.lower).toBeCloseTo(0);
      expect(d.upper).toBeCloseTo(100);
      expect(d.status).toBe('insufficient_coverage');
    }
    expect(r.dataStatus).toBe('data_incomplete');
  });
});

describe('Partial domain (section 7 worked example)', () => {
  // T4 under OWNER has Q40 (2), Q41 (2), Q42 (2), Q43 (1). Build a 3/2/1 domain from O3:
  // Q12 (3), Q13 (2), Q14 (2) - not 3/2/1. Use S1 with SEPARATION: Q44 (3), Q01 (2), Q02 (1).
  const c = ctx({ perimeter: 'business_unit_assets', ownershipTags: ['corporate_group'], profile: 'CORPORATE' });
  it('3/2/1 with 100/50/UNKNOWN: 80 answered-only, 83.3% coverage, 66.7-83.3 bounds', () => {
    const s = computeScores(c, { Q44: sub(100), Q01: sub(50), Q02: st('unknown') });
    const S1 = s.dimensions[0].domains.find((d) => d.key === 'S1')!;
    expect(S1.index).toBeCloseTo(80);
    expect(S1.localCoverage).toBeCloseTo(5 / 6);
    // Domain-level bounds scaled to the domain: L = (3*100 + 2*50)/6, U = L + 1/6*100
    const e = (id: string) => s.controls[id].effectiveWeight / S1.weight;
    const L = e('Q44') * 100 + e('Q01') * 50;
    expect(L).toBeCloseTo(66.667, 2);
    expect(L + e('Q02') * 100).toBeCloseTo(83.333, 2);
  });
  it('confirmed absent third control scores 0 and the domain becomes 66.7 at 100% coverage', () => {
    const s = computeScores(c, { Q44: sub(100), Q01: sub(50), Q02: sub(0) });
    const S1 = s.dimensions[0].domains.find((d) => d.key === 'S1')!;
    expect(S1.index).toBeCloseTo(66.667, 2);
    expect(S1.localCoverage).toBe(1);
  });
});

describe('Display rules', () => {
  it('shows "Indicative, incomplete" between 80 and 99% coverage, with a range', () => {
    const c = ctx();
    const answers = fill(c, () => sub(100));
    answers.Q02 = st('unknown'); // S1 local weight 1 of 3
    const s = computeScores(c, answers);
    const S = s.dimensions[0];
    expect(S.status).toBe('indicative');
    expect(S.coverage).toBeGreaterThanOrEqual(0.8);
    expect(S.coverage).toBeLessThan(1);
    expect(S.upper - S.lower).toBeGreaterThan(0);
  });
  it('withholds the index when a single domain is under 50% local coverage even if the dimension is above 80%', () => {
    const c = ctx();
    const answers = fill(c, () => sub(100));
    // O5 has Q19 and Q20, each local weight 2 of 4. Leaving both open drops O5 to 0% local coverage.
    answers.Q19 = st('unknown');
    answers.Q20 = st('unknown');
    const O = computeScores(c, answers).dimensions[1];
    expect(O.coverage).toBeGreaterThanOrEqual(0.8);
    expect(O.status).toBe('insufficient_coverage');
    expect(O.displayIndex).toBeNull();
  });
  it('keeps scoring pending until a profile is confirmed', () => {
    const c = ctx({ profile: 'UNDECIDED' });
    const s = computeScores(c, fill(c, () => sub(100)));
    expect(s.dimensions.every((d) => d.status === 'pending_profile' && d.displayIndex === null)).toBe(true);
    expect(s.dataComplete).toBe(false);
  });
});

describe('Not applicable', () => {
  it('N/A requested removes no weight until confirmed; confirmation recomputes', () => {
    const c = ctx();
    const answers = fill(c, () => sub(100));
    answers.Q17 = { ...st('not_applicable_requested'), naReason: 'No in-house systems' };
    const before = computeScores(c, answers);
    expect(before.controls.Q17).toBeDefined();
    expect(before.dimensions[1].coverage).toBeLessThan(1);

    answers.Q17 = { ...st('not_applicable_confirmed'), naReason: 'No in-house systems' };
    const after = computeScores(c, answers);
    expect(after.controls.Q17).toBeUndefined();
    expect(after.dimensions[1].coverage).toBeCloseTo(1);
    const O4 = Object.values(after.controls).filter((x) => x.domain === 'O4').reduce((t, x) => t + x.effectiveWeight, 0);
    expect(O4).toBeCloseTo(15); // domain weight stays with the domain
  });
});

describe('Routing scenarios', () => {
  it('family-owned IT services, full share sale, no debt: OWNER + CORE only', () => {
    const s = computeScores(ctx(), {});
    expect(s.applicable).toHaveLength(37);
  });
  it('mixed founder and PE: PE weights used once, continuity controls retained, PE_CONTEXT active', () => {
    const c = ctx({ ownershipTags: ['private_family', 'pe'], profile: 'PE', triggers: { ...ctx().triggers, debt: 'yes', employee_equity: 'yes', acquisitions: 'yes' } });
    const r = resolveRoutes(c);
    expect(r.PE_CONTEXT).toBe('on');
    expect(r.INVESTOR_RIGHTS).toBe('on');
    expect(r.DEBT).toBe('on');
    expect(r.EMPLOYEE_EQUITY).toBe('on');
    expect(r.ACQUISITIONS).toBe('on');
    const ids = applicableQuestions(r).map((q) => q.id);
    for (const id of ['Q12', 'Q13', 'Q14', 'Q18', 'Q24', 'Q38', 'Q39', 'Q50']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate scoring
    const s = computeScores(c, {});
    expect(s.weightingProfile).toBe('PE');
  });
  it('corporate share disposal: SEPARATION follows dependency, ASSET_TRANSFER stays off', () => {
    const independent = resolveRoutes(ctx({ ownershipTags: ['corporate_group'], profile: 'CORPORATE', perimeter: 'subsidiary' }));
    expect(independent.SEPARATION).toBe('off');
    expect(independent.ASSET_TRANSFER).toBe('off');
    const dependent = resolveRoutes(ctx({ ownershipTags: ['corporate_group'], profile: 'CORPORATE', perimeter: 'subsidiary', triggers: { ...ctx().triggers, group_dependency: 'yes' } }));
    expect(dependent.SEPARATION).toBe('on');
    expect(dependent.ASSET_TRANSFER).toBe('off');
    const assets = resolveRoutes(ctx({ perimeter: 'business_unit_assets' }));
    expect(assets.SEPARATION).toBe('on');
    expect(assets.ASSET_TRANSFER).toBe('on');
  });
  it('VC growth losses: no adverse profitability score; Q07 uses growth-economics wording', () => {
    const c = ctx({ ownershipTags: ['vc'], profile: 'VC', objectives: ['partial_sale', 'growth_capital'], triggers: { ...ctx().triggers, convertibles: 'yes', employee_equity: 'yes' } });
    expect(questionText(QUESTION_BY_ID.Q07, c)).toMatch(/unit economics/);
    const r = resolveRoutes(c);
    expect(['INVESTOR_RIGHTS', 'EMPLOYEE_EQUITY', 'CONVERTIBLE', 'PARTIAL', 'PRIMARY_CAPITAL'].every((k) => r[k as keyof typeof r] === 'on')).toBe(true);
    expect(r.CROSS_BORDER).toBe('off');
  });
  it('preference and notes: Q38 for VC/PE tags and Q51 for outstanding notes, separately', () => {
    const ids = applicableQuestions(resolveRoutes(ctx({ ownershipTags: ['vc'], triggers: { ...ctx().triggers, convertibles: 'yes' } }))).map((q) => q.id);
    expect(ids).toContain('Q38');
    expect(ids).toContain('Q51');
  });
  it('an unknown trigger leaves the module pending, keeps it in the denominator and blocks completion', () => {
    const c = ctx({ triggers: { ...ctx().triggers, debt: 'unknown' } });
    const s = computeScores(c, fill(c, (id) => (id === 'Q24' ? st('unknown') : sub(100))));
    expect(s.routes.DEBT).toBe('pending');
    expect(s.controls.Q24.pendingApplicability).toBe(true);
    expect(s.dataComplete).toBe(false);
    const all = computeScores(c, fill(c, () => sub(100)));
    expect(all.dimensions[2].status).toBe('indicative'); // coverage 100 but applicability pending
  });
  it('seller tax residence is never inferred from the company address', () => {
    expect(resolveRoutes(ctx({ sellerTaxStatus: null })).CROSS_BORDER).toBe('pending');
    expect(resolveRoutes(ctx({ sellerTaxStatus: 'different' })).CROSS_BORDER).toBe('on');
  });
});

describe('Edited trigger', () => {
  it('deactivates answers without deleting them and requires reconfirmation upon reactivation', () => {
    const on = resolveRoutes(ctx({ triggers: { ...ctx().triggers, debt: 'yes' } }));
    const off = resolveRoutes(ctx());
    const a1 = reconcileApplicability({ Q24: sub(100), Q01: sub(50) }, on, off, T);
    expect(a1.answers.Q24.inactiveSince).toBe(T);
    expect(a1.deactivated).toEqual(['Q24']);
    expect(computeScores(ctx(), a1.answers).controls.Q24).toBeUndefined();

    const a2 = reconcileApplicability(a1.answers, off, on, T);
    expect(a2.reactivated).toEqual(['Q24']);
    expect(a2.answers.Q24.requiresReconfirmation).toBe(true);
    const s = computeScores(ctx({ triggers: { ...ctx().triggers, debt: 'yes' } }), a2.answers);
    expect(s.controls.Q24.known).toBe(false);
    expect(s.controls.Q24.status).toBe('reconfirm');
  });
});

describe('Conflicting contributors', () => {
  it('affected controls become CONFLICTED and leave known coverage', () => {
    const c = ctx();
    const answers = fill(c, () => sub(100));
    answers.Q12 = { ...sub(100), submissions: [
      { respondent: 'owner', status: 'substantive', points: 100, at: T },
      { respondent: 'cfo', status: 'substantive', points: 0, at: T },
    ] };
    const r = buildResult(c, answers);
    expect(r.score.controls.Q12.status).toBe('conflicted');
    expect(r.score.controls.Q12.known).toBe(false);
    expect(r.dimensions[1].coverage).toBeLessThan(1);
    expect(r.risks.some((x) => x.rule === 'R07')).toBe(true);
  });
});

describe('Risks and priorities', () => {
  it('R02 needs Q04 = 0 and a launch within six months; UNKNOWN only creates a review', () => {
    const near = ctx({ horizon: 'under_6' });
    expect(buildResult(near, { Q04: sub(0) }).risks.find((r) => r.rule === 'R02')?.basis).toBe('confirmed');
    expect(buildResult(near, { Q04: st('unknown') }).risks.find((r) => r.rule === 'R02')?.basis).toBe('unresolved');
    expect(buildResult(ctx({ horizon: 'over_36' }), { Q04: sub(0) }).risks.find((r) => r.rule === 'R02')).toBeUndefined();
  });
  it('R03 is not inferred from UNKNOWN alone', () => {
    const r = buildResult(ctx(), { Q33: st('unknown') });
    expect(r.risks.filter((x) => x.rule === 'R03' && x.severity === 'critical')).toHaveLength(0);
  });
  it('tax history: Q28 needing review creates a specialist review, never a critical tax charge', () => {
    const r = buildResult(ctx(), { Q28: st('needs_adviser_review') });
    const r04 = r.risks.find((x) => x.rule === 'R04')!;
    expect(r04.severity).toBe('review');
  });
  it('critical risks stay visible and are not cleared by high scores elsewhere', () => {
    const c = ctx({ horizon: 'under_6' });
    const answers = fill(c, () => sub(100));
    answers.Q04 = sub(0);
    const r = buildResult(c, answers);
    expect(r.riskStatus).toBe('critical');
    expect(r.dataStatus).toBe('data_complete');
    expect(r.tasks[0].priorityClass).toBe(1);
  });
  it('orders confirmed critical, then unresolved critical facts, then preparation gaps by impact', () => {
    const c = ctx({ horizon: 'under_6', liquidity: 'potential' });
    const answers = fill(c, () => sub(100));
    answers.Q04 = sub(0);
    answers.Q21 = sub(0);   // T1 local 3: larger impact
    answers.Q43 = sub(50);  // T4 local 1: smaller impact
    const t = buildResult(c, answers).tasks;
    const classes = t.map((x) => x.priorityClass);
    expect([...classes].sort()).toEqual(classes);
    const gaps = t.filter((x) => x.kind === 'gap');
    expect(gaps[0].sourceQuestionIds).toEqual(['Q21']);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i - 1].impact).toBeGreaterThanOrEqual(gaps[i].impact);
  });
  it('specialist pathway withholds a standard conclusion', () => {
    const c = ctx({ liquidity: 'acute' });
    const r = buildResult(c, fill(c, () => sub(100)));
    expect(r.dimensions.every((d) => d.status === 'specialist_route' && d.displayIndex === null)).toBe(true);
    expect(r.riskStatus).toBe('critical');
  });
});

describe('Evidence', () => {
  it('a filename alone never earns evidence; a dated reference with a named role earns 0.5', () => {
    const c = ctx();
    const answers = fill(c, () => sub(100));
    answers.Q21 = { ...sub(100), evidence: { reference: 'financials.xlsx', ownerRole: '', asOfDate: null, reviewStatus: 'dated_reference' } };
    expect(computeScores(c, answers).controls.Q21.evidenceFactor).toBe(0);
    answers.Q21 = { ...sub(100), evidence: { reference: 'Audited accounts 2023-2025', ownerRole: 'CFO', asOfDate: '2026-10-01', reviewStatus: 'dated_reference' } };
    expect(computeScores(c, answers).controls.Q21.evidenceFactor).toBe(0.5);
    answers.Q21 = { ...sub(100), evidence: { reference: 'x', ownerRole: 'CFO', asOfDate: '2026-10-01', reviewStatus: 'reviewed' } };
    expect(computeScores(c, answers).controls.Q21.evidenceFactor).toBe(0.5); // no reviewer recorded
  });
});
