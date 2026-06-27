export interface NauticaChart {
  difficulty: number; // 1=NOV, 2=ADV, 3=EXH, 4=INF/MXM
  level: number;
  effector: string;
}

export interface NauticaSong {
  collection: 'nautica_song';

  nauticaId: string;       // UUID from ksm.dev
  mid: number;             // Assigned game ID (10000+), 0 until approved
  title: string;
  artist: string;
  jacketUrl: string;       // ksm.dev jacket URL
  downloadUrl: string;     // ksm.dev CDN download URL
  charts: NauticaChart[];
  tags: string[];

  status: 'nominated' | 'testing' | 'approved' | 'pending' | 'converting' | 'ready' | 'error' | 'rejected';
  errorMessage?: string;
  convertedAt?: number;
  curatedBy?: string;
  curatedAt: number;

  // Nomination fields
  nominatedBy?: string;
  nominatedAt?: number;
  nominationNote?: string;

  // Rejection fields
  rejectedReason?: string;
  rejectedBy?: string;
  rejectedAt?: number;

  // BPM range extracted from the KSH source during conversion
  bpmMin?: number;
  bpmMax?: number;

  // Google Drive offload (set once uploaded post-conversion)
  driveFileId?: string;
  driveFileSize?: number;
  driveUploadedAt?: number;
}
