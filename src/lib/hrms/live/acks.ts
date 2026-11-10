// Which pre-run blockers a person has agreed to continue past, per pay run, for live data.
//
// In sample mode this is written into the run's audit trail ("Continued past 2 blockers: ..."). The server has no call that
// appends an audit line, so in live mode the agreement is remembered here, in memory only (nothing is written to browser
// storage), and the screens read the larger of the two. A reload asks again, which is the safe direction.
// Pure and import-free so the payroll helpers can use it in a plain Node test.

const acked = new Map<string, number>();

export const getAcks = (runId: string): number => acked.get(runId) ?? 0;
export function setAcks(runId: string, count: number): void { acked.set(runId, count); }
export function clearAcks(): void { acked.clear(); }
