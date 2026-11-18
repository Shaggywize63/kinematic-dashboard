// "Today" for the Learning screens. Sample mode keeps the preview's fixed day, so the sample stays deterministic. Live mode
// uses the server's date in India (from the bootstrap), so due / overdue / lapsed match what the server enforces.

import { isLive } from '../live/store';
import { PREVIEW_TODAY } from '../seed';
import type { ISODate } from '../types';
import { getLiveLearningToday } from './live/learningSource';

export const learnToday = (): ISODate => (isLive() ? getLiveLearningToday() ?? PREVIEW_TODAY : PREVIEW_TODAY);
