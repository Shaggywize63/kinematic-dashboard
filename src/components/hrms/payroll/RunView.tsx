'use client';
// The pay run page body: header, stepper and the step that is open.

import Link from 'next/link';
import { Badge, Button, HrmsPage, StatusBadge, T, useTabParam } from '../ui';
import type { HrmsDb, PayRun } from '../../../lib/hrms/types';
import { fmtMonthLong } from '../../../lib/hrms/format';
import RunStepper, { STEPS, stepProgress, type Step } from './RunStepper';
import RunInputs from './RunInputs';
import RunChecks from './RunChecks';
import RunCompute from './RunCompute';
import { RunFreeze, RunReview } from './RunFreeze';
import RunPay from './RunPay';

export default function RunView({ db, run }: { db: HrmsDb; run: PayRun }) {
  const [step, setStep] = useTabParam<Step>(STEPS, stepProgress(run.status).next);
  const entity = db.entities.find((e) => e.id === run.entityId);
  const go = (s: Step) => { setStep(s); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); };

  return (
    <HrmsPage
      eyebrow={<Link href="/dashboard/hrms/payroll" style={{ color: T.mute, textDecoration: 'none' }}>Payroll / Runs</Link>}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>Pay run, {fmtMonthLong(run.month)} <StatusBadge status={run.status} /></span>}
      description={<>{entity?.name ?? '—'} · {run.type === 'regular' ? 'Regular run' : 'Off-cycle run'} · {run.lawVersion ? <>computed under <Badge mono>{run.lawVersion}</Badge></> : 'not computed yet'}</>}
      actions={<Button href="/dashboard/hrms/payroll">All runs</Button>}
    >
      <RunStepper status={run.status} value={step} onChange={go} />
      <section aria-label={`Step: ${step}`} data-testid={`step-${step}`}>
        {step === 'inputs' && <RunInputs db={db} run={run} />}
        {step === 'checks' && <RunChecks db={db} run={run} go={go} />}
        {step === 'compute' && <RunCompute db={db} run={run} go={go} />}
        {step === 'review' && <RunReview db={db} run={run} go={go} />}
        {step === 'freeze' && <RunFreeze db={db} run={run} go={go} />}
        {step === 'pay' && <RunPay db={db} run={run} go={go} />}
      </section>
    </HrmsPage>
  );
}
