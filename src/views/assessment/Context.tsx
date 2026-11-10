import { navigate } from '../../App';
import { CheckboxGroup, Field, RadioGroup, Segmented } from '../../components/ui';
import { PROFILES } from '../../model/catalogue';
import {
  BUSINESS_MODELS, EMPLOYEE_BANDS, HORIZON_OPTIONS, LIQUIDITY_OPTIONS, MANAGEMENT_OPTIONS, OBJECTIVE_OPTIONS, OWNERSHIP_OPTIONS,
  PERIMETER_OPTIONS, REVENUE_BANDS, ROLE_OPTIONS, SELLER_TAX_OPTIONS, SELLER_TYPE_OPTIONS, TRIGGER_OPTIONS,
} from '../../model/options';
import { suggestProfile } from '../../model/routing';
import type { AssessmentContext, OwnershipTag, TriState } from '../../model/types';
import { go, setContext, useAssessment } from '../../lib/store';
import { Banners } from './Banners';

function toggle<T>(xs: T[], v: T): T[] {
  return xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v];
}

const TRI: { value: TriState; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Not sure' },
];

export function ContextScreen({ screen }: { screen: 'c1' | 'c2' | 'c3' }) {
  const { ctx } = useAssessment();
  const set = (p: Partial<AssessmentContext>) => setContext(p);

  let kicker = '';
  let title = '';
  let sub = '';
  let ok = false;
  let body: React.ReactNode = null;

  if (screen === 'c1') {
    kicker = 'Context · 1 of 3';
    title = 'Tell us about you and the business.';
    sub = 'These answers are not scored. They decide which questions apply to you and how they are worded.';
    ok = !!ctx.role && ctx.ownershipTags.length > 0 && !!ctx.managementModel;
    body = (
      <>
        <PrivacyNotice />
        <Field id="f-role" label="Which best describes your role?" why="Used to phrase questions. It does not change access rights or scoring.">
          <RadioGroup label="Your role" choices={ROLE_OPTIONS} value={ctx.role} onChange={(role) => set({ role })} />
        </Field>
        <Field id="f-own" label="Who owns the business today?" why="Select all that apply. Mixed ownership is common and fully supported.">
          <CheckboxGroup label="Ownership" choices={OWNERSHIP_OPTIONS} values={ctx.ownershipTags}
            onToggle={(v: OwnershipTag) => set({ ownershipTags: v === 'unknown' ? (ctx.ownershipTags.includes('unknown') ? [] : ['unknown']) : toggle(ctx.ownershipTags.filter((x) => x !== 'unknown'), v) })} />
        </Field>
        <Field id="f-mgmt" label="Who runs the business day to day?" why="Changes the wording of some questions, for example who would be absent.">
          <RadioGroup label="Management" choices={MANAGEMENT_OPTIONS} value={ctx.managementModel} onChange={(managementModel) => set({ managementModel })} />
        </Field>
        <Field id="f-company" label="About the company (optional)" why="Helps us describe your result. Not scored and not used for routing. The company’s country is never used to infer where sellers pay tax.">
          <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: 12 }}>
            <Select label="Business model" value={ctx.company.businessModel} options={BUSINESS_MODELS} onChange={(businessModel) => set({ company: { ...ctx.company, businessModel } })} />
            <Select label="Annual revenue" value={ctx.company.revenueBand} options={REVENUE_BANDS} onChange={(revenueBand) => set({ company: { ...ctx.company, revenueBand } })} />
            <Select label="Employees" value={ctx.company.employeeBand} options={EMPLOYEE_BANDS} onChange={(employeeBand) => set({ company: { ...ctx.company, employeeBand } })} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              Company country
              <input className="input" value={ctx.company.jurisdiction ?? ''} maxLength={60} placeholder="e.g. Germany"
                onChange={(e) => set({ company: { ...ctx.company, jurisdiction: e.target.value || null } })} />
            </label>
          </div>
        </Field>
      </>
    );
  } else if (screen === 'c2') {
    const sug = suggestProfile(ctx);
    kicker = 'Context · 2 of 3';
    title = 'What kind of transaction are you preparing?';
    sub = 'Timing changes the urgency of tasks, never the readiness result.';
    ok = ctx.objectives.length > 0 && !!ctx.perimeter && !!ctx.horizon && !!ctx.profile;
    body = (
      <>
        <Field id="f-obj" label="What should the transaction achieve?" why="Select all that apply. Exploring options is a valid objective and is not penalised.">
          <CheckboxGroup label="Objectives" choices={OBJECTIVE_OPTIONS} values={ctx.objectives} onToggle={(v) => set({ objectives: toggle(ctx.objectives, v) })} />
        </Field>
        <Field id="f-per" label="What would be transferred?" why="The perimeter decides whether separation and asset transfer questions apply.">
          <RadioGroup label="Perimeter" choices={PERIMETER_OPTIONS} value={ctx.perimeter} onChange={(perimeter) => set({ perimeter })} />
        </Field>
        <Field id="f-hor" label="When could a transaction start?" why="Used to order your tasks. It does not change the readiness result.">
          <RadioGroup label="Horizon" choices={HORIZON_OPTIONS} value={ctx.horizon} onChange={(horizon) => set({ horizon })} min="160px" />
        </Field>
        <Field id="f-prof" label="Which perspective best describes the transaction you are preparing?" why="This sets how the areas are weighted. We suggest one from your answers; you confirm it and can change it later. Mixed ownership keeps all its questions, whichever perspective drives the weighting.">
          <RadioGroup label="Perspective" min="280px"
            choices={[...PROFILES.map((p) => ({ value: p.key as AssessmentContext['profile'] & string, label: p.name, sub: p.description, tag: p.key === sug ? 'Suggested' : '' })),
              { value: 'UNDECIDED', label: 'Not decided yet', sub: 'Discovery works. Scoring stays pending until you confirm a perspective.', tag: '' }]}
            value={ctx.profile} onChange={(profile) => set({ profile })} />
        </Field>
      </>
    );
  } else {
    kicker = 'Context · 3 of 3';
    title = 'A few specialist topics.';
    sub = 'Each one switches on a short set of extra questions only if it applies. “Not sure” keeps those questions open until clarified, so nothing is hidden by accident.';
    ok = !!ctx.liquidity && TRIGGER_OPTIONS.every((t) => !!ctx.triggers[t.value]) && !!ctx.sellerType && !!ctx.sellerTaxStatus;
    body = (
      <>
        <Field id="f-liq" label="Are there known or expected difficulties meeting payment obligations during the next six months?" why="Not scored. It decides whether a specialist route should come first. ExitIQ does not diagnose insolvency.">
          <RadioGroup label="Liquidity" choices={LIQUIDITY_OPTIONS} value={ctx.liquidity} onChange={(liquidity) => set({ liquidity })} min="220px" />
        </Field>
        <Field id="f-trig" label="Do any of these apply?" why="One answer per line.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TRIGGER_OPTIONS.map((t) => (
              <div key={t.value} className="opt" style={{ cursor: 'default', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span id={`trig-${t.value}`}>{t.label}</span>
                <Segmented label={t.label} choices={TRI} value={ctx.triggers[t.value]} onChange={(v) => set({ triggers: { ...ctx.triggers, [t.value]: v } })} />
              </div>
            ))}
          </div>
        </Field>
        <Field id="f-sel" label="Who would sell?" why="The legal form of the sellers matters for tax preparation. Exact identities are not needed here.">
          <RadioGroup label="Seller type" choices={SELLER_TYPE_OPTIONS} value={ctx.sellerType} onChange={(sellerType) => set({ sellerType })} />
        </Field>
        <Field id="f-tax" label="Where are the sellers resident for tax?" why="Decides whether cross-border tax coordination applies. We do not infer this from the company’s address.">
          <RadioGroup label="Seller tax residence" choices={SELLER_TAX_OPTIONS} value={ctx.sellerTaxStatus} onChange={(sellerTaxStatus) => set({ sellerTaxStatus })} min="220px" />
        </Field>
      </>
    );
  }

  const order = ['c1', 'c2', 'c3', 'summary'] as const;
  const i = order.indexOf(screen);
  return (
    <main className="app-main">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="kicker">{kicker}</div>
        <h1 className="h1" style={{ fontSize: 'clamp(30px,3.6vw,44px)' }}>{title}</h1>
        <p className="lead" style={{ color: 'rgba(255,255,255,0.86)', fontSize: 17 }}>{sub}</p>
      </div>
      {screen !== 'c1' && <Banners />}
      {body}
      <div className="nav-row">
        <button type="button" className="btn btn-ghost" onClick={() => (i === 0 ? navigate('/') : go(order[i - 1]))}>Back</button>
        <div className="right">
          {!ok && <span className="hint">Answer each question to continue</span>}
          <button type="button" className="btn btn-lime" disabled={!ok} onClick={() => go(order[i + 1])}>{screen === 'c3' ? 'Review setup' : 'Continue'}</button>
        </div>
      </div>
    </main>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string | null; options: string[]; onChange: (v: string | null) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      {label}
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not specified</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function PrivacyNotice() {
  return (
    <section className="glass" aria-labelledby="privacy-title" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.6 }}>
      <h2 id="privacy-title" style={{ margin: 0, fontSize: 15 }}>How your answers are stored</h2>
      <p style={{ margin: 0, color: 'rgba(255,255,255,0.84)' }}>
        Each answer is saved in this browser and in the ExitIQ database run by atares, linked to an anonymous session, so you can pause and return.
        This is not anonymous: the answers are stored against that session, and they would be linked to you if you later add an email address or contact atares.
        No AI processes your answers in this version. Contacting atares, report delivery and newsletters are separate, optional choices.
        You can delete the assessment at any time from the action plan or the save screen; retention otherwise follows the atares privacy notice.
      </p>
    </section>
  );
}
