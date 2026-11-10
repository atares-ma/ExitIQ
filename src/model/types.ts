// Core types for the ExitIQ v1 model (Product and Implementation Brief, 4 Nov 2026).
// Everything here is plain data so the same structures can be persisted,
// snapshotted and tested without a browser.

export type DimensionKey = 'S' | 'O' | 'T';
export type DomainKey =
  | 'S1' | 'S2' | 'S3'
  | 'O1' | 'O2' | 'O3' | 'O4' | 'O5'
  | 'T1' | 'T2' | 'T3' | 'T4';

export type Profile = 'OWNER' | 'CORPORATE' | 'PE' | 'VC';

export type RouteCode =
  | 'CORE' | 'DEBT' | 'CONTINGENT' | 'REGULATED' | 'INVESTOR_RIGHTS' | 'EMPLOYEE_EQUITY'
  | 'SEPARATION' | 'PE_CONTEXT' | 'CONVERTIBLE' | 'CROSS_BORDER' | 'ASSET_TRANSFER'
  | 'PARTIAL' | 'PRIMARY_CAPITAL' | 'ACQUISITIONS';

/** on = applicable, off = not applicable, pending = applicability unresolved (stays in the denominator). */
export type RouteState = 'on' | 'off' | 'pending';
export type RouteMap = Record<RouteCode, RouteState>;

export type Points = 0 | 50 | 100;

/** Section 18 answer states. Only SUBSTANTIVE carries points. */
export type AnswerStatus =
  | 'substantive'
  | 'unknown'
  | 'needs_internal_confirmation'
  | 'needs_adviser_review'
  | 'withheld'
  | 'conflicted'
  | 'not_applicable_requested'
  | 'not_applicable_confirmed';

export const UNRESOLVED_STATUSES: AnswerStatus[] = [
  'unknown', 'needs_internal_confirmation', 'needs_adviser_review', 'withheld', 'conflicted', 'not_applicable_requested',
];

/** Evidence factor v_q (section 7): 0 self-report, 0.5 dated reference with named role, 1 reviewed by an authorised reviewer. */
export type EvidenceReviewStatus = 'self_reported' | 'dated_reference' | 'reviewed';

export interface EvidenceRef {
  reference: string;          // restricted reference, e.g. "Board minutes 2026-03, data room 4.2"; never the document itself
  ownerRole: string;          // named responsible role
  asOfDate: string | null;    // ISO date
  reviewStatus: EvidenceReviewStatus;
  reviewerId?: string | null;
  reviewedAt?: string | null;
}

/** One contributor's submission for a control. More than one diverging submission makes the control CONFLICTED. */
export interface Submission {
  respondent: string;
  status: AnswerStatus;
  points?: Points;
  at: string;
}

export interface Answer {
  status: AnswerStatus;
  points?: Points;
  answeredAt: string;
  evidence?: EvidenceRef | null;
  /** Set when the control's route was switched off and on again; the old answer must be reconfirmed. */
  requiresReconfirmation?: boolean;
  /** Set while the control is outside the applicable set (answer kept for audit, excluded from calculation). */
  inactiveSince?: string | null;
  naReason?: string | null;
  submissions?: Submission[];
}

export type AnswerMap = Record<string, Answer>;

// ── Context (section 3): unscored routing metadata ───────────────────────────

export type RespondentRole = 'owner' | 'management' | 'cfo' | 'corporate_ma' | 'investor' | 'adviser' | 'other';
export type OwnershipTag = 'private_family' | 'corporate_group' | 'pe' | 'vc' | 'other' | 'unknown';
export type ManagementModel = 'owner_led' | 'employed' | 'mixed' | 'unknown';
export type Objective = 'full_sale' | 'partial_sale' | 'succession' | 'growth_capital' | 'exploration' | 'ipo' | 'distress';
export type Perimeter = 'whole_business' | 'subsidiary' | 'business_unit_assets' | 'minority_interest' | 'undecided';
export type Horizon = 'under_6' | 'm6_18' | 'm19_36' | 'over_36' | 'undecided';
export type Liquidity = 'no_pressure' | 'potential' | 'acute' | 'unknown';
export type TriState = 'yes' | 'no' | 'unknown';
export type TriggerKey = 'debt' | 'acquisitions' | 'employee_equity' | 'preferences' | 'convertibles' | 'regulated' | 'contingent' | 'group_dependency';
export type SellerType = 'individuals' | 'holding_companies' | 'corporate_parent' | 'funds' | 'mixed' | 'unknown';
export type SellerTaxStatus = 'same' | 'different' | 'multiple' | 'unknown';

export interface CompanyProfile {
  businessModel: string | null;
  sector: string | null;
  revenueBand: string | null;
  employeeBand: string | null;
  jurisdiction: string | null;
}

export interface AssessmentContext {
  role: RespondentRole | null;
  ownershipTags: OwnershipTag[];
  managementModel: ManagementModel | null;
  /** Explicitly confirmed by the user; 'UNDECIDED' keeps scoring pending. */
  profile: Profile | 'UNDECIDED' | null;
  objectives: Objective[];
  perimeter: Perimeter | null;
  horizon: Horizon | null;
  liquidity: Liquidity | null;
  triggers: Partial<Record<TriggerKey, TriState>>;
  sellerType: SellerType | null;
  sellerTaxStatus: SellerTaxStatus | null;
  company: CompanyProfile;
}

export type Diagnostics = Partial<Record<'E01' | 'E03' | 'E04' | 'E07', string | string[]>>;

export interface QuestionDef {
  id: string;
  domain: DomainKey;
  localWeight: 1 | 2 | 3;
  route: RouteCode;
  name: string;
  question: string;
  /** anchors[0] = 0 points, [1] = 50, [2] = 100 */
  anchors: [string, string, string];
  contributor: string;
  help?: string;
  evidenceRequest?: string;
  /** Context-specific wording that keeps the meaning of the control. */
  variants?: Partial<Record<'owner_led' | 'employed' | 'growth' | 'venture', string>>;
  dependsOn?: string[];
}
