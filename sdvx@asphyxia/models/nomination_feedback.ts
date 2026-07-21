export interface NominationFeedback {
  collection: 'nomination_feedback';

  nauticaId: string;
  username: string;
  vote: 'up' | 'down';
  comment?: string;
  suggestedLevels?: Array<{ difficulty: number; level: number }>;
  createdAt: number;
  updatedAt?: number;
}
