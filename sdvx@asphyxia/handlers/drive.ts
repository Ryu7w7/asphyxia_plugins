import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { NauticaSong } from '../models/nautica_song';

const archiver = (global as any).archiver;

// ─── Config + token cache ───────────────────────────────────────────────────

function getOAuthConfig() {
  const clientId = (U.GetConfig('sdvx_drive_oauth_client_id') || '').trim();
  const clientSecret = (U.GetConfig('sdvx_drive_oauth_client_secret') || '').trim();
  const refreshToken = (U.GetConfig('sdvx_drive_oauth_refresh_token') || '').trim();
  return { clientId, clientSecret, refreshToken };
}

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;
let cachedAccessTokenKey = '';

async function getAccessToken(): Promise<string | null> {
  const { clientId, clientSecret, refreshToken } = getOAuthConfig();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const key = `${clientId}|${refreshToken}`;
  if (cachedAccessToken && cachedAccessTokenKey === key && cachedAccessTokenExpiresAt > Date.now() + 30_000) {
    return cachedAccessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const res = await httpsRequest(
    {
      method: 'POST',
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body
  );

  if (res.statusCode !== 200) {
    console.error(`[Drive] Token refresh failed: HTTP ${res.statusCode} — ${res.body}`);
    return null;
  }

  let data: any;
  try { data = JSON.parse(res.body); } catch { return null; }
  if (!data.access_token) return null;

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  cachedAccessTokenKey = key;
  return cachedAccessToken;
}

// ─── HTTPS helper ───────────────────────────────────────────────────────────

interface HttpsResponse {
  statusCode: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function httpsRequest(options: https.RequestOptions, body?: Buffer | string): Promise<HttpsResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
        })
      );
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Public API (unchanged signatures) ──────────────────────────────────────

export function isDriveEnabled(): boolean {
  if (!U.GetConfig('sdvx_drive_enabled')) return false;
  const { clientId, clientSecret, refreshToken } = getOAuthConfig();
  if (!clientId || !clientSecret || !refreshToken) return false;
  const folderId = (U.GetConfig('sdvx_drive_folder_id') || '').trim();
  return !!folderId;
}

export function getDirectDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

export async function uploadSongZip(song: NauticaSong): Promise<{ fileId: string; size: number } | null> {
  const folderId = (U.GetConfig('sdvx_drive_folder_id') || '').trim();
  if (!folderId) return null;

  const gameRoot = U.GetConfig('sdvx_eg_root_dir');
  const mixName = U.GetConfig('sdvx_custom_mix_name') || 'asphyxia_custom';
  if (!gameRoot || !fs.existsSync(gameRoot)) return null;

  const modBase = path.join(gameRoot, 'data_mods', mixName);
  const musicBase = path.join(modBase, 'music');
  if (!fs.existsSync(musicBase)) return null;

  const idStr = String(song.mid).padStart(4, '0');
  const songFolder = fs.readdirSync(musicBase).find(d => d.startsWith(idStr + '_'));
  if (!songFolder) return null;

  const zipBuffer = await buildSongZip(modBase, songFolder, idStr);

  // Replace previous upload for this chart if present
  if (song.driveFileId) {
    try { await deleteDriveFile(song.driveFileId); } catch {}
  }

  const token = await getAccessToken();
  if (!token) return null;

  const fileName = `${idStr}_${song.nauticaId}.zip`;
  const fileId = await driveMultipartUpload(token, fileName, folderId, zipBuffer);
  if (!fileId) return null;

  // Make the file publicly readable so the sync script can fetch it without auth
  try {
    await drivePermissionsCreate(token, fileId);
  } catch (err: any) {
    console.error(`[Drive] Failed to set public permission on ${fileId}: ${err.message}`);
  }

  return { fileId, size: zipBuffer.length };
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;

  try {
    const res = await httpsRequest({
      method: 'DELETE',
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      headers: { 'Authorization': `Bearer ${token}` },
    });
    // 404 means the file is already gone (manually deleted or never existed) —
    // that's the desired end state, so don't surface it as an error.
    if (res.statusCode === 404) return;
    if (res.statusCode !== 204 && res.statusCode !== 200) {
      console.error(`[Drive] Delete failed for ${fileId}: HTTP ${res.statusCode} — ${res.body}`);
    }
  } catch (err: any) {
    console.error(`[Drive] Delete failed for ${fileId}: ${err.message}`);
  }
}

// ─── Drive REST calls ───────────────────────────────────────────────────────

async function driveMultipartUpload(
  accessToken: string,
  fileName: string,
  folderId: string,
  content: Buffer
): Promise<string | null> {
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    mimeType: 'application/zip',
  });

  const boundary = `asphyxia_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const prefix = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/zip\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, content, suffix]);

  const res = await httpsRequest(
    {
      method: 'POST',
      hostname: 'www.googleapis.com',
      path: '/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    },
    body
  );

  if (res.statusCode !== 200 && res.statusCode !== 201) {
    throw new Error(`Drive upload failed: HTTP ${res.statusCode} — ${res.body}`);
  }

  try {
    const data = JSON.parse(res.body);
    return data.id || null;
  } catch {
    return null;
  }
}

async function drivePermissionsCreate(accessToken: string, fileId: string): Promise<void> {
  const body = JSON.stringify({ role: 'reader', type: 'anyone' });
  const res = await httpsRequest(
    {
      method: 'POST',
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body
  );
  if (res.statusCode !== 200 && res.statusCode !== 201 && res.statusCode !== 204) {
    throw new Error(`HTTP ${res.statusCode} — ${res.body}`);
  }
}

// ─── Zip builder (unchanged) ────────────────────────────────────────────────

function buildSongZip(modBase: string, songFolder: string, idStr: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 5 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    const musicDir = path.join(modBase, 'music', songFolder);
    if (fs.existsSync(musicDir)) {
      archive.directory(musicDir, `music/${songFolder}`);
    }

    const thumbDir = path.join(modBase, 'graphics', 's_jacket00_ifs');
    if (fs.existsSync(thumbDir)) {
      for (const t of fs.readdirSync(thumbDir).filter((f: string) => f.startsWith(`jk_${idStr}_`))) {
        archive.file(path.join(thumbDir, t), { name: `graphics/s_jacket00_ifs/${t}` });
      }
    }

    archive.finalize();
  });
}
