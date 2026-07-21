export interface DeletedNauticaSong {
  collection: 'deleted_nautica_song';

  nauticaId: string;       // UUID from ksm.dev — used to exclude from Nautica search
  title: string;
  artist: string;
  jacketUrl: string;
  mid: number;             // Game ID if it had one at deletion time, else 0
  previousStatus: string;  // Status the song had immediately before deletion

  deletedReason: string;
  deletedBy: string;
  deletedAt: number;
}
