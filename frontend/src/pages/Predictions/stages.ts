import type { PredictionStage } from '@/services/api/types';

export const STAGE_LABELS: Record<PredictionStage, string> = {
  'pre-qualifying': 'Pre-qualifying',
  'post-qualifying': 'Post-qualifying',
  'pre-race': 'Pre-race',
};

export const STAGES: PredictionStage[] = ['pre-qualifying', 'post-qualifying', 'pre-race'];
