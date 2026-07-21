import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
const archiver = (global as any).archiver;
import { NauticaSong } from '../models/nautica_song';
import { NominationFeedback } from '../models/nomination_feedback';
import { DeletedNauticaSong } from '../models/deleted_nautica_song';
import { MusicRecord } from '../models/music_record';
import {
  invalidateMusicDbCache,
  getNauticaSlotsStatus,
  nauticaSlotExhaustedError,
} from '../utils';
import { invalidateHiscoreCache } from './features';
import { convertNauticaSong, bulkConvertNauticaSongs, rebuildMergedXml } from './converter';
import { deleteDriveFile } from './drive';


function nauticaGet(urlPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `https://ksm.dev${urlPath}`;
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Failed to parse Nautica response')); }
      });
    }).on('error', reject);
  });
}

// ─── Browse Nautica API ─────────────────────────────────────────────────────

function parseSearch(input: string): { text: string; levels: string | null } {
  let text = input;
  let levels: string | null = null;

  // Extract level:X or levels:X,Y,Z from the query
  const levelMatch = text.match(/\blevels?:(\d+(?:,\d+)*)\b/i);
  if (levelMatch) {
    levels = levelMatch[1];
    text = text.replace(levelMatch[0], '').trim();
  }

  return { text, levels };
}

export const nauticaBrowse = async (data: { page?: number; search?: string }, send: WebUISend) => {
  try {
    const page = data.page || 1;
    const raw = (data.search || '').trim();

    if (!raw) {
      const result = await nauticaGet(`/app/songs?page=${page}`);
      send.json(result);
      return;
    }

    const { text, levels } = parseSearch(raw);
    const levelParam = levels ? `&levels=${levels}` : '';

    // No text query — just filter by level
    if (!text) {
      const result = await nauticaGet(`/app/songs?page=${page}${levelParam}`);
      send.json(result);
      return;
    }

    // Search by title/artist AND effector, merge results
    const [titleResult, effectorResult] = await Promise.all([
      nauticaGet(`/app/songs?page=${page}&q=${encodeURIComponent(text)}${levelParam}`),
      nauticaGet(`/app/songs?page=${page}&effector=${encodeURIComponent(text)}${levelParam}`),
    ]);

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const song of [...(titleResult.data || []), ...(effectorResult.data || [])]) {
      if (!seen.has(song.id)) {
        seen.add(song.id);
        merged.push(song);
      }
    }

    const titleMeta = titleResult.meta || {};
    const effectorMeta = effectorResult.meta || {};
    send.json({
      data: merged,
      meta: {
        current_page: page,
        last_page: Math.max(titleMeta.last_page || 1, effectorMeta.last_page || 1),
      },
    });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to fetch from Nautica' });
  }
};

// ─── Nomination (any user) ──────────────────────────────────────────────────

export const nauticaNominate = async (data: any, send: WebUISend) => {
  try {
    const username = data.__username;
    if (!username) { send.json({ error: 'Not authenticated' }); return; }

    if (!data.nauticaId || !data.title) {
      send.json({ error: 'Missing required fields' }); return;
    }

    // Validate downloadUrl
    if (!data.downloadUrl || !data.downloadUrl.match(/^https:\/\/[a-z0-9.]*cdn\.digitaloceanspaces\.com\/ksm\.dev\//)) {
      send.json({ error: 'Invalid download URL' }); return;
    }

    const existing = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    if (existing) {
      send.json({ error: 'This chart has already been ' + existing.status, status: existing.status });
      return;
    }

    const note = data.nominationNote ? String(data.nominationNote).substring(0, 500) : undefined;

    const song: any = {
      collection: 'nautica_song',
      nauticaId: data.nauticaId,
      mid: 0,
      title: data.title,
      artist: data.artist || '',
      jacketUrl: data.jacketUrl || '',
      downloadUrl: data.downloadUrl,
      charts: data.charts || [],
      tags: data.tags || [],
      status: 'nominated',
      curatedAt: Date.now(),
      nominatedBy: username,
      nominatedAt: Date.now(),
      nominationNote: note,
    };

    await DB.Insert(song);
    send.json({ success: true, nauticaId: data.nauticaId });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to nominate' });
  }
};

export const nauticaMyNominations = async (data: any, send: WebUISend) => {
  try {
    const username = data.__username;
    if (!username) { send.json({ error: 'Not authenticated' }); return; }

    const songs = await DB.Find<NauticaSong>({ collection: 'nautica_song', nominatedBy: username });
    send.json({ success: true, songs: songs || [] });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to fetch nominations' });
  }
};

// ─── Playtesting Feedback (any user, testing charts only) ───────────────────

export const nauticaSubmitFeedback = async (data: any, send: WebUISend) => {
  try {
    const username = data.__username;
    if (!username) { send.json({ error: 'Not authenticated' }); return; }
    if (!data.nauticaId) { send.json({ error: 'Missing nauticaId' }); return; }

    const song = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    if (!song || song.status !== 'testing') {
      send.json({ error: 'Feedback can only be submitted for charts in testing' }); return;
    }

    if (data.vote !== 'up' && data.vote !== 'down') {
      send.json({ error: 'Vote must be up or down' }); return;
    }

    const comment = data.comment ? String(data.comment).substring(0, 200) : undefined;
    const suggestedLevels = Array.isArray(data.suggestedLevels) ? data.suggestedLevels : undefined;

    await DB.Upsert<NominationFeedback>(
      { collection: 'nomination_feedback', nauticaId: data.nauticaId, username },
      { $set: {
        vote: data.vote,
        comment,
        suggestedLevels,
        updatedAt: Date.now(),
      }}
    );

    // Set createdAt only on first insert
    const existing = await DB.FindOne<NominationFeedback>({ collection: 'nomination_feedback', nauticaId: data.nauticaId, username });
    if (existing && !existing.createdAt) {
      await DB.Update<NominationFeedback>(
        { collection: 'nomination_feedback', nauticaId: data.nauticaId, username },
        { $set: { createdAt: Date.now() } }
      );
    }

    send.json({ success: true });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to submit feedback' });
  }
};

// ─── Admin: Nomination Queue ────────────────────────────────────────────────

export const nauticaNominationQueue = async (data: any, send: WebUISend) => {
  try {
    const allSongs = await DB.Find<NauticaSong>({ collection: 'nautica_song' });
    const nominations = (allSongs || []).filter(
      (s: any) => s.status === 'nominated' || s.status === 'testing'
    );

    // Aggregate feedback for each nomination
    const allFeedback = await DB.Find<NominationFeedback>({ collection: 'nomination_feedback' });
    const feedbackByNauticaId: Record<string, NominationFeedback[]> = {};
    for (const fb of (allFeedback || [])) {
      if (!feedbackByNauticaId[fb.nauticaId]) feedbackByNauticaId[fb.nauticaId] = [];
      feedbackByNauticaId[fb.nauticaId].push(fb);
    }

    const result = nominations.map((s: any) => {
      const fb = feedbackByNauticaId[s.nauticaId] || [];
      return {
        ...s,
        feedback: {
          up: fb.filter((f: any) => f.vote === 'up').length,
          down: fb.filter((f: any) => f.vote === 'down').length,
          comments: fb.filter((f: any) => f.comment).map((f: any) => ({
            username: f.username,
            vote: f.vote,
            comment: f.comment,
            suggestedLevels: f.suggestedLevels,
          })),
        },
      };
    });

    send.json({ success: true, nominations: result });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to fetch nominations' });
  }
};

export const nauticaGetFeedback = async (data: { nauticaId: string }, send: WebUISend) => {
  try {
    const feedback = await DB.Find<NominationFeedback>({ collection: 'nomination_feedback', nauticaId: data.nauticaId });
    send.json({ success: true, feedback: feedback || [] });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to fetch feedback' });
  }
};

// ─── Admin: Set Testing ─────────────────────────────────────────────────────

export const nauticaSetTesting = async (data: any, send: WebUISend) => {
  try {
    const song = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    if (!song) { send.json({ error: 'Song not found' }); return; }
    if (song.status !== 'nominated') {
      send.json({ error: 'Only nominated charts can be moved to testing' }); return;
    }

    await DB.Update<NauticaSong>(
      { collection: 'nautica_song', nauticaId: data.nauticaId },
      { $set: { status: 'testing' as const } }
    );

    // On staging servers, auto-convert for playtesting
    const mode = U.GetConfig('sdvx_nomination_mode') || 'production';
    if (mode === 'staging' && song.mid === 0) {
      convertNauticaSong(song).catch((err) => {
        console.error(`[Nautica] Staging conversion failed for ${song.title}: ${err.message}`);
      });
    }

    send.json({ success: true });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to set testing' });
  }
};

// ─── Admin: Reject ──────────────────────────────────────────────────────────

export const nauticaReject = async (data: any, send: WebUISend) => {
  try {
    const song = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    if (!song) { send.json({ error: 'Song not found' }); return; }

    const reason = data.reason ? String(data.reason).substring(0, 500) : 'No reason given';
    const rejectedBy = data.__username || 'admin';

    await DB.Update<NauticaSong>(
      { collection: 'nautica_song', nauticaId: data.nauticaId },
      { $set: {
        status: 'rejected' as const,
        rejectedReason: reason,
        rejectedBy,
        rejectedAt: Date.now(),
      }}
    );

    send.json({ success: true });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to reject' });
  }
};

// ─── Admin: Approve (modified to handle nominations) ────────────────────────

export const nauticaApprove = async (data: any, send: WebUISend) => {
  try {
    // Validate downloadUrl
    if (!data.downloadUrl || !data.downloadUrl.match(/^https:\/\/[a-z0-9.]*cdn\.digitaloceanspaces\.com\/ksm\.dev\//)) {
      send.json({ error: 'Invalid download URL: must be from ksm.dev CDN' });
      return;
    }

    const existing = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });

    // Approving will trigger conversion, which allocates a new music ID for any
    // song without one. If every slot is already used, fail loudly now instead
    // of silently marking the chart as errored inside prepareForConversion.
    const willNeedNewMid = !existing || !existing.mid;
    if (willNeedNewMid) {
      const slots = await getNauticaSlotsStatus();
      if (slots.full) {
        send.json({ error: nauticaSlotExhaustedError(), slotsFull: true, slots });
        return;
      }
    }

    // Approving an existing nomination
    if (existing && (existing.status === 'nominated' || existing.status === 'testing')) {
      await DB.Update<NauticaSong>(
        { collection: 'nautica_song', nauticaId: data.nauticaId },
        { $set: {
          status: 'pending' as const,
          curatedBy: data.__username || 'admin',
          curatedAt: Date.now(),
        }}
      );

      const song = { ...existing, status: 'pending' as const };
      convertNauticaSong(song as any).catch((err) => {
        console.error(`[Nautica] Conversion failed for ${song.title}: ${err.message}`);
      });

      send.json({ success: true, title: existing.title });
      return;
    }

    // Direct approval (existing flow from admin browse)
    if (existing) {
      send.json({ error: 'Song already exists', mid: existing.mid, status: existing.status });
      return;
    }

    const song: any = {
      collection: 'nautica_song',
      nauticaId: data.nauticaId,
      mid: 0,
      title: data.title,
      artist: data.artist,
      jacketUrl: data.jacketUrl,
      downloadUrl: data.downloadUrl,
      charts: data.charts,
      tags: data.tags || [],
      status: 'pending',
      curatedBy: data.__username || 'admin',
      curatedAt: Date.now(),
    };

    await DB.Insert(song);

    convertNauticaSong(song).catch((err) => {
      console.error(`[Nautica] Conversion failed for ${song.title}: ${err.message}`);
    });

    send.json({ success: true, title: data.title });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to approve song' });
  }
};

// ─── List + Remove + Status (existing) ──────────────────────────────────────

export const nauticaList = async (data: any, send: WebUISend) => {
  try {
    let query: any = { collection: 'nautica_song' };
    if (data.status) query.status = data.status;
    const songs = await DB.Find<NauticaSong>(query);
    send.json({ success: true, songs: songs || [] });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to list curated songs' });
  }
};

export const nauticaDeletedList = async (data: any, send: WebUISend) => {
  try {
    const deleted = await DB.Find<DeletedNauticaSong>({ collection: 'deleted_nautica_song' });
    const rejected = await DB.Find<NauticaSong>({ collection: 'nautica_song', status: 'rejected' });

    const deletedItems = (deleted || []).map((r: any) => ({
      nauticaId: r.nauticaId,
      title: r.title,
      artist: r.artist,
      jacketUrl: r.jacketUrl,
      mid: r.mid || 0,
      previousStatus: r.previousStatus || '',
      deletedReason: r.deletedReason || '',
      deletedBy: r.deletedBy || '',
      deletedAt: r.deletedAt || 0,
      source: 'deleted',
    }));

    const rejectedItems = (rejected || []).map((r: any) => ({
      nauticaId: r.nauticaId,
      title: r.title,
      artist: r.artist,
      jacketUrl: r.jacketUrl,
      mid: r.mid || 0,
      previousStatus: 'rejected',
      deletedReason: r.rejectedReason || 'No reason given',
      deletedBy: r.rejectedBy || '',
      deletedAt: r.rejectedAt || 0,
      source: 'rejected',
    }));

    const all = [...deletedItems, ...rejectedItems];
    all.sort((a: any, b: any) => (b.deletedAt || 0) - (a.deletedAt || 0));
    send.json({ success: true, deleted: all });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to list deleted charts' });
  }
};

export const nauticaRemove = async (data: { nauticaId: string; reason?: string; __username?: string }, send: WebUISend) => {
  try {
    const reason = data.reason ? String(data.reason).trim().substring(0, 500) : '';
    if (!reason) { send.json({ error: 'A deletion reason is required' }); return; }

    const song = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    if (!song) { send.json({ error: 'Song not found' }); return; }

    const auditRecord: DeletedNauticaSong = {
      collection: 'deleted_nautica_song',
      nauticaId: song.nauticaId,
      title: song.title || '',
      artist: song.artist || '',
      jacketUrl: song.jacketUrl || '',
      mid: song.mid || 0,
      previousStatus: song.status,
      deletedReason: reason,
      deletedBy: data.__username || 'admin',
      deletedAt: Date.now(),
    };
    await DB.Upsert<DeletedNauticaSong>(
      { collection: 'deleted_nautica_song', nauticaId: song.nauticaId },
      { $set: auditRecord }
    );

    if (song.driveFileId) {
      deleteDriveFile(song.driveFileId).catch((err: any) => {
        console.error(`[Nautica] Drive delete failed for ${song.title}: ${err.message}`);
      });
    }

    await DB.Remove<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    await DB.Remove<NominationFeedback>({ collection: 'nomination_feedback', nauticaId: data.nauticaId });

    if (song.mid > 0) {
      // Delete all player scores for this music ID so it can be reused
      const profiles = await DB.Find<any>(null, { collection: 'profile' });
      for (const p of (profiles || [])) {
        if (p.__refid) await DB.Remove<MusicRecord>(p.__refid, { collection: 'music', mid: song.mid });
      }

      removeFromCustomMusicDb(song.mid);

      const gameRoot = U.GetConfig('sdvx_eg_root_dir');
      const mixName = U.GetConfig('sdvx_custom_mix_name') || 'asphyxia_custom';
      if (gameRoot) {
        rebuildMergedXml().catch(err => {
          console.error(`[Nautica] XML rebuild failed after removing ${song.title}: ${err.message}`);
        });

        const idStr = String(song.mid).padStart(4, '0');
        const musicDir = path.join(gameRoot, 'data_mods', mixName, 'music', `${idStr}_nautica`);
        if (fs.existsSync(musicDir)) {
          fs.rmSync(musicDir, { recursive: true, force: true });
        }
        const thumbDir = path.join(gameRoot, 'data_mods', mixName, 'graphics', 's_jacket00_ifs');
        const thumbPath = path.join(thumbDir, `jk_${idStr}_0_t.png`);
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      }

      invalidateMusicDbCache();
      invalidateHiscoreCache();
    }

    send.json({ success: true });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to remove song' });
  }
};

// Export every row of the nautica_song collection as a portable JSON bundle.
// Strips the internal `collection` field and Drive-specific state (which is
// site-local) but keeps everything needed to recreate the entry elsewhere:
// nauticaId, mid, title/artist metadata, chart array, download URL, status.
export const nauticaExportList = async (data: any, send: WebUISend) => {
  try {
    const songs = await DB.Find<NauticaSong>({ collection: 'nautica_song' });
    const exported = (songs || []).map((s: any) => ({
      nauticaId:       s.nauticaId,
      mid:             s.mid || 0,
      title:           s.title,
      artist:          s.artist,
      jacketUrl:       s.jacketUrl,
      downloadUrl:     s.downloadUrl,
      charts:          s.charts || [],
      tags:            s.tags || [],
      status:          s.status,
      curatedBy:       s.curatedBy,
      curatedAt:       s.curatedAt,
      nominatedBy:     s.nominatedBy,
      nominatedAt:     s.nominatedAt,
      nominationNote:  s.nominationNote,
    }));
    send.json({
      version: 1,
      exportedAt: Date.now(),
      exportedBy: data.__username || 'admin',
      count: exported.length,
      songs: exported,
    });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to export list' });
  }
};

// Import a previously-exported list. New entries land with status 'pending'
// and mid=0 so the admin can Reconvert All to actually build the audio
// assets. Entries whose nauticaId already exists locally are left alone —
// we never overwrite an existing chart's state on import.
export const nauticaImportList = async (data: any, send: WebUISend) => {
  try {
    const incoming: any[] = Array.isArray(data.songs) ? data.songs : null;
    if (!incoming) { send.json({ error: 'Invalid import payload — expected { songs: [...] }' }); return; }

    let added = 0, skippedExisting = 0, skippedInvalid = 0;
    const newSongs: NauticaSong[] = [];
    for (const s of incoming) {
      if (!s || !s.nauticaId || !s.title || !s.downloadUrl) { skippedInvalid++; continue; }
      if (!s.downloadUrl.match(/^https:\/\/[a-z0-9.]*cdn\.digitaloceanspaces\.com\/ksm\.dev\//)) {
        skippedInvalid++;
        continue;
      }

      const existing = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: s.nauticaId });
      if (existing) { skippedExisting++; continue; }

      const doc: any = {
        collection: 'nautica_song',
        nauticaId:   s.nauticaId,
        mid:         0,
        title:       String(s.title),
        artist:      s.artist ? String(s.artist) : '',
        jacketUrl:   s.jacketUrl ? String(s.jacketUrl) : '',
        downloadUrl: String(s.downloadUrl),
        charts:      Array.isArray(s.charts) ? s.charts : [],
        tags:        Array.isArray(s.tags) ? s.tags : [],
        status:      'pending' as const,
        curatedBy:   data.__username || 'import',
        curatedAt:   Date.now(),
      };
      await DB.Insert(doc);
      newSongs.push(doc as NauticaSong);
      added++;
    }

    if (newSongs.length > 0) bulkConvertNauticaSongs(newSongs);
    send.json({ success: true, added, skippedExisting, skippedInvalid });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to import list' });
  }
};

export const nauticaReconvert = async (data: { nauticaId: string }, send: WebUISend) => {
  try {
    if (!data.nauticaId) { send.json({ error: 'Missing nauticaId' }); return; }

    const song = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    if (!song) { send.json({ error: 'Song not found' }); return; }
    if (song.status === 'nominated' || song.status === 'testing' || song.status === 'rejected') {
      send.json({ error: `Cannot reconvert a ${song.status} chart` });
      return;
    }
    // mid === 0 means this chart was approved but first-time conversion never
    // completed — prepareForConversion allocates a fresh mid via
    // GetNextNauticaId(). Fail early if no slot is available, otherwise the
    // reconversion silently marks the chart as errored.
    if (!song.mid) {
      const slots = await getNauticaSlotsStatus();
      if (slots.full) {
        send.json({ error: nauticaSlotExhaustedError(), slotsFull: true, slots });
        return;
      }
    }

    await DB.Update<NauticaSong>(
      { collection: 'nautica_song', nauticaId: data.nauticaId },
      { $set: { status: 'pending' as const, errorMessage: '' } }
    );
    convertNauticaSong(song as any).catch((err) => {
      console.error(`[Nautica] Reconversion failed for ${song.title}: ${err.message}`);
    });

    send.json({ success: true });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to queue reconversion' });
  }
};

// Lightweight WebUI endpoint for the admin tab to poll slot usage. Used to
// render the remaining-slots banner and to disable approve/import buttons
// client-side when capacity is exhausted.
export const nauticaSlotsStatus = async (_data: any, send: WebUISend) => {
  try {
    const slots = await getNauticaSlotsStatus();
    send.json({ success: true, slots });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to fetch slot status' });
  }
};

export const nauticaReconvertAll = async (data: any, send: WebUISend) => {
  try {
    const allSongs = await DB.Find<NauticaSong>({ collection: 'nautica_song' });
    // Include everything that should be on the server post-approval: ready
    // charts (to refresh audio / re-apply fixes), errored charts, and any
    // pending/converting rows orphaned by a restart mid-run. The conversion
    // queue is in-memory, so those last two states accumulate if the server
    // crashed or was killed before finishing. mid === 0 is allowed too —
    // prepareForConversion allocates a fresh mid when needed, so never-
    // converted charts get picked up on the first Reconvert All just like
    // charts that have been converted before.
    const toReconvert = (allSongs || []).filter(
      (s: any) =>
        s.status === 'ready' ||
        s.status === 'error' ||
        s.status === 'pending' ||
        s.status === 'converting'
    );

    for (const song of toReconvert) {
      await DB.Update<NauticaSong>(
        { collection: 'nautica_song', nauticaId: song.nauticaId },
        { $set: { status: 'pending' as const, errorMessage: '' } }
      );
    }

    // Each mid===0 song consumes a fresh slot when it reaches
    // prepareForConversion. If the batch wants more new slots than remain,
    // flag the response so the UI can warn — we still fire the job so songs
    // that already have mids convert fine; only the overflow entries fail.
    const needSlot = toReconvert.filter((s: any) => !s.mid).length;
    const slots = await getNauticaSlotsStatus();
    const overflow = Math.max(0, needSlot - slots.remaining);

    // Fire-and-forget: the bulk runner invokes VoxCharger once with a manifest
    // of every target chart instead of calling it N times. Dramatically
    // faster than per-chart conversion (one .exe startup, one DB save,
    // parallel KSH parsing inside VoxCharger).
    bulkConvertNauticaSongs(toReconvert as any).catch(err => {
      console.error(`[Nautica] Bulk reconvert failed: ${err.message}`);
    });

    send.json({
      success: true,
      count: toReconvert.length,
      needSlot,
      slots,
      slotsOverflow: overflow,
    });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to queue reconversion' });
  }
};

export const nauticaConvertStatus = async (data: { nauticaId: string }, send: WebUISend) => {
  try {
    const song = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', nauticaId: data.nauticaId });
    if (!song) { send.json({ error: 'Song not found' }); return; }
    send.json({ success: true, status: song.status, errorMessage: song.errorMessage });
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to get status' });
  }
};

export const nauticaDownloadSong = async (data: { mid: number }, send: WebUISend) => {
  try {
    const song = await DB.FindOne<NauticaSong>({ collection: 'nautica_song', mid: data.mid });
    if (!song || song.status !== 'ready') {
      send.json({ error: 'Song not available for download' }); return;
    }

    const gameRoot = U.GetConfig('sdvx_eg_root_dir');
    const mixName = U.GetConfig('sdvx_custom_mix_name') || 'asphyxia_custom';
    if (!gameRoot) { send.json({ error: 'Game directory not configured' }); return; }

    const modBase = path.join(gameRoot, 'data_mods', mixName);
    const idStr = String(song.mid).padStart(4, '0');
    const musicBase = path.join(modBase, 'music');
    if (!fs.existsSync(musicBase)) { send.json({ error: 'No converted files found' }); return; }

    const songFolder = fs.readdirSync(musicBase).find(d => d.startsWith(idStr + '_'));
    if (!songFolder) { send.json({ error: 'Converted song folder not found' }); return; }

    const zipBuffer = await createSongZip(modBase, mixName, songFolder, idStr);
    send.buffer(zipBuffer);
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to create download' });
  }
};

export const nauticaDownloadAll = async (data: any, send: WebUISend) => {
  try {
    const gameRoot = U.GetConfig('sdvx_eg_root_dir');
    const mixName = U.GetConfig('sdvx_custom_mix_name') || 'asphyxia_custom';
    if (!gameRoot) { send.json({ error: 'Game directory not configured' }); return; }

    const modBase = path.join(gameRoot, 'data_mods', mixName);
    if (!fs.existsSync(modBase)) { send.json({ error: 'No custom charts folder found' }); return; }

    const zipBuffer = await createFullMixZip(modBase, mixName);
    send.buffer(zipBuffer);
  } catch (err: any) {
    send.json({ error: err.message || 'Failed to create download' });
  }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function createSongZip(modBase: string, mixName: string, songFolder: string, idStr: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    const prefix = `data_mods/${mixName}`;
    const musicDir = path.join(modBase, 'music', songFolder);
    if (fs.existsSync(musicDir)) archive.directory(musicDir, `${prefix}/music/${songFolder}`);
    const thumbDir = path.join(modBase, 'graphics', 's_jacket00_ifs');
    if (fs.existsSync(thumbDir)) {
      for (const t of fs.readdirSync(thumbDir).filter(f => f.startsWith(`jk_${idStr}_`))) {
        archive.file(path.join(thumbDir, t), { name: `${prefix}/graphics/s_jacket00_ifs/${t}` });
      }
    }
    const xmlPath = path.join(modBase, 'others', 'music_db.merged.xml');
    if (fs.existsSync(xmlPath)) archive.file(xmlPath, { name: `${prefix}/others/music_db.merged.xml` });
    archive.finalize();
  });
}

function createFullMixZip(modBase: string, mixName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.directory(modBase, `data_mods/${mixName}`);
    archive.finalize();
  });
}

function removeFromCustomMusicDb(musicId: number) {
  try {
    const customDbPath = IO.Resolve('webui/asset/json/custom_music_db.json');
    if (!fs.existsSync(customDbPath)) return;
    const data = JSON.parse(fs.readFileSync(customDbPath, 'utf8'));
    if (!data?.mdb?.music) return;
    data.mdb.music = data.mdb.music.filter((s: any) => String(s.id) !== String(musicId));
    fs.writeFileSync(customDbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

export async function resumePendingConversions(): Promise<void> {
  try {
    const allSongs = await DB.Find<NauticaSong>({ collection: 'nautica_song' });
    const stuck = (allSongs || []).filter(
      (s: any) => s.status === 'pending' || s.status === 'converting'
    );
    if (stuck.length === 0) return;
    console.log(`[Nautica] Resuming ${stuck.length} pending/interrupted conversion(s) from before restart...`);
    bulkConvertNauticaSongs(stuck as any).catch((err: any) => {
      console.error(`[Nautica] Startup conversion resume failed: ${err?.message ?? err}`);
    });
  } catch (err: any) {
    console.error(`[Nautica] Failed to query pending songs on startup: ${err?.message ?? err}`);
  }
}

