// Section 4: deterministic routing. Evaluated after every relevant answer.
// Module membership controls applicability only; it never adds a second score
// for the same control.

import { QUESTIONS } from './catalogue';
import type { AssessmentContext, Profile, QuestionDef, RouteCode, RouteMap, RouteState, TriState, TriggerKey } from './types';

const fromTri = (v: TriState | undefined): RouteState =>
  v === 'yes' ? 'on' : v === 'unknown' ? 'pending' : v === 'no' ? 'off' : 'pending';

/** on wins over pending, pending wins over off. */
const any = (...xs: RouteState[]): RouteState => (xs.includes('on') ? 'on' : xs.includes('pending') ? 'pending' : 'off');
const bool = (b: boolean): RouteState => (b ? 'on' : 'off');

/**
 * An unanswered trigger counts as pending, not as "no": the brief requires
 * that nothing is hidden by accident. The context screen asks every trigger
 * explicitly, so in practice this only matters for partially saved contexts.
 */
export function trigger(ctx: AssessmentContext, k: TriggerKey): RouteState {
  return fromTri(ctx.triggers[k]);
}

export function resolveRoutes(ctx: AssessmentContext): RouteMap {
  const tags = ctx.ownershipTags;
  const pe = tags.includes('pe');
  const vc = tags.includes('vc');
  const ownershipUnknown = tags.includes('unknown') || tags.length === 0;
  const growth = ctx.objectives.includes('growth_capital');
  const assets = ctx.perimeter === 'business_unit_assets';
  const perimeterOpen = ctx.perimeter === 'undecided' || ctx.perimeter == null;

  // Investor-backed tags known positively switch the module on; an unknown
  // ownership keeps it pending rather than silently off.
  const investorTag: RouteState = pe || vc ? 'on' : ownershipUnknown ? 'pending' : 'off';
  const peTag: RouteState = pe ? 'on' : ownershipUnknown ? 'pending' : 'off';

  const crossBorder: RouteState =
    ctx.sellerTaxStatus === 'different' || ctx.sellerTaxStatus === 'multiple' ? 'on'
      : ctx.sellerTaxStatus === 'same' ? 'off' : 'pending';

  return {
    CORE: 'on',
    DEBT: trigger(ctx, 'debt'),
    CONTINGENT: trigger(ctx, 'contingent'),
    REGULATED: trigger(ctx, 'regulated'),
    INVESTOR_RIGHTS: any(investorTag, trigger(ctx, 'preferences')),
    EMPLOYEE_EQUITY: trigger(ctx, 'employee_equity'),
    // Business-unit/assets disposal OR material dependence on a remaining group.
    // A subsidiary share sale alone does not activate it (acceptance test "Corporate share disposal").
    SEPARATION: any(bool(assets), trigger(ctx, 'group_dependency'), perimeterOpen ? 'pending' : 'off'),
    PE_CONTEXT: peTag,
    CONVERTIBLE: trigger(ctx, 'convertibles'),
    CROSS_BORDER: crossBorder,
    ASSET_TRANSFER: any(bool(assets), perimeterOpen ? 'pending' : 'off'),
    // Partial sale or minority stake; primary equity issuance changes rights as well.
    PARTIAL: bool(ctx.objectives.includes('partial_sale') || ctx.perimeter === 'minority_interest' || growth),
    PRIMARY_CAPITAL: bool(growth),
    ACQUISITIONS: trigger(ctx, 'acquisitions'),
  };
}

export function applicableQuestions(routes: RouteMap): QuestionDef[] {
  return QUESTIONS.filter((q) => routes[q.route] !== 'off');
}

export function activeModules(routes: RouteMap): RouteCode[] {
  return (Object.keys(routes) as RouteCode[]).filter((k) => k !== 'CORE' && routes[k] === 'on');
}

export function pendingModules(routes: RouteMap): RouteCode[] {
  return (Object.keys(routes) as RouteCode[]).filter((k) => routes[k] === 'pending');
}

/** Section 3: a suggestion only. The user always confirms the profile. */
export function suggestProfile(ctx: AssessmentContext): Profile {
  if (ctx.ownershipTags.includes('pe')) return 'PE';
  if (ctx.ownershipTags.includes('vc')) return 'VC';
  if (ctx.perimeter === 'subsidiary' || ctx.perimeter === 'business_unit_assets') {
    if (ctx.ownershipTags.includes('corporate_group')) return 'CORPORATE';
  }
  if (ctx.ownershipTags.includes('corporate_group') && !ctx.ownershipTags.includes('private_family')) return 'CORPORATE';
  return 'OWNER';
}

export function confirmedProfile(ctx: AssessmentContext): Profile | null {
  return ctx.profile && ctx.profile !== 'UNDECIDED' ? ctx.profile : null;
}

/** IPO, distress or confirmed acute liquidity pressure: specialist pathway, no standard conclusion. */
export function specialistReasons(ctx: AssessmentContext): string[] {
  const r: string[] = [];
  if (ctx.liquidity === 'acute') r.push('liquidity');
  if (ctx.objectives.includes('ipo')) r.push('ipo');
  if (ctx.objectives.includes('distress')) r.push('distress');
  return r;
}

/** Wording variants (section 5). Same anchors and score semantics. */
export function questionText(q: QuestionDef, ctx: AssessmentContext): string {
  const v = q.variants;
  if (!v) return q.question;
  const venture = ctx.profile === 'VC' || ctx.ownershipTags.includes('vc');
  if (q.id === 'Q12') return ctx.managementModel === 'employed' ? v.employed! : ctx.managementModel === 'owner_led' ? v.owner_led! : q.question;
  if (q.id === 'Q07' && venture && v.growth) return v.growth;
  if (q.id === 'Q32' && venture && v.venture) return v.venture;
  return q.question;
}

/**
 * Section 18: never delete answers when a context field changes. Answers of
 * controls that leave the applicable set are marked inactive; when their route
 * comes back they must be reconfirmed. Returns the new answer map.
 */
export function reconcileApplicability<T extends { inactiveSince?: string | null; requiresReconfirmation?: boolean }>(
  answers: Record<string, T>, before: RouteMap, after: RouteMap, now: string,
): { answers: Record<string, T>; deactivated: string[]; reactivated: string[] } {
  const out: Record<string, T> = { ...answers };
  const deactivated: string[] = [];
  const reactivated: string[] = [];
  for (const q of QUESTIONS) {
    const a = out[q.id];
    if (!a) continue;
    const was = before[q.route] !== 'off';
    const is = after[q.route] !== 'off';
    if (was && !is) {
      out[q.id] = { ...a, inactiveSince: now };
      deactivated.push(q.id);
    } else if (!was && is && a.inactiveSince) {
      out[q.id] = { ...a, inactiveSince: null, requiresReconfirmation: true };
      reactivated.push(q.id);
    }
  }
  return { answers: out, deactivated, reactivated };
}
