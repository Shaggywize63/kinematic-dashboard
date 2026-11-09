// The whole "people" area seed. People come from the core sample company (emp_1 .. emp_25), so the module reads as
// one company. Deterministic: no clock, no Math.random.

import { makeSeed } from '../seed';
import { makeEngagementSeed } from './seedEngagement';
import { makeLearningSeed } from './seedLearning';
import { makeTalentSeed } from './seedTalent';
import { makeTimesheetSeed } from './seedTimesheets';
import type { PeopleState } from './types';

export function makePeopleSeed(): PeopleState {
  const { employees } = makeSeed();
  return {
    learning: makeLearningSeed(employees),
    talent: makeTalentSeed(employees),
    engagement: makeEngagementSeed(),
    timesheets: makeTimesheetSeed(),
  };
}
