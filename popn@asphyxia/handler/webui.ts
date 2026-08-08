import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type DecorationAsset = { id: number; image: string; label: string };
type MusicCatalogEntry = { id: number; title: string; genre: string; artist: string; chara1?: number; chara2?: number };
type CharacterCatalogEntry = { id: number; name: string; folder?: string; icon?: string; image?: string; iconImage?: string };

const assetUpdateLogBuffer: string[] = [];
const appendAssetUpdateLog = (message: string): void => {
  assetUpdateLogBuffer.push(message);
  if (assetUpdateLogBuffer.length > 500) assetUpdateLogBuffer.splice(0, assetUpdateLogBuffer.length - 500);
  console.log(`[popn] ${message}`);
};

// 128x128 gray placeholder with a light border, written as
// catalog/character/icon-missing.png so the profile page never 404s.
const ICON_MISSING_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAIvSURBVHhe7dehDYAwGAXh7j8FkhGYigSDLQF5gqC5E5/5K9+ZjmXdZpz245yDx3gUgFwByBWAXAHIvQZwP+YfuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtgUgw20LQIbbFoAMty0AGW5bADLctgBkuG0ByHDbApDhtp8CyP8VgFwByBWAXAHIFYDcEwC/DHG5ALYanY704iH4AAAAAElFTkSuQmCC',
  'base64'
);

export const getPopnAssetUpdateLog = async (_data: any, send?: WebUISend) => send?.json({ logs: assetUpdateLogBuffer });

const getAssetRoot = (): string => path.resolve('plugins', 'popn@asphyxia', 'webui', 'asset');
const directorySize = (directory: string): number => {
  if (!fs.existsSync(directory)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(target) : entry.isFile() ? fs.statSync(target).size : 0;
  }
  return total;
};
export const getPopnAssetStorage = async (_data: any, send?: WebUISend) => send?.json({ bytes: directorySize(getAssetRoot()) });
export const clearPopnGeneratedAssets = async (_data: any, send?: WebUISend) => {
  const root = getAssetRoot();
  for (const name of ['catalog', 'deco', 'deco_seal_preview', 'deco_seat_preview', 'touch_theme', 'lane_cover', 'stage_back', 'highlight', 'official_box', 'official_preview', 'official_playdata']) {
    const target = path.join(root, name);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  }
  assetUpdateLogBuffer.length = 0;
  appendAssetUpdateLog('Generated asset cache cleared.');
  send?.json({ status: 'ok', bytes: directorySize(root), logs: assetUpdateLogBuffer });
};

// CORE's embedded Node build can be compiled without ICU's Shift-JIS table.
// Never let that optional decoder abort the whole asset refresh: ASCII titles
// remain readable and a dumped XML catalogue can still override the fallback.
const decodeShiftJis = (bytes: Buffer): string => {
  try {
    return new TextDecoder('shift_jis').decode(bytes);
  } catch {
    return bytes.toString('latin1');
  }
};

const downloadFile = async (url: string, output: string, redirects = 0, timeoutMs = 20000): Promise<void> => {
  if (redirects > 4) throw new Error(`Too many redirects for ${url}`);
  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        downloadFile(next, output, redirects + 1, timeoutMs).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`HTTP ${status} for ${url}`));
        return;
      }
      const stream = fs.createWriteStream(output);
      response.pipe(stream);
      stream.on('finish', () => stream.close(() => resolve()));
      stream.on('error', reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Timed out downloading ${url}`)));
    request.on('error', reject);
  });
};

// The official Pika Pika Pop'n Box pages publish these same thumbnail IDs.
// Keep the WebUI offline after Asset Update by copying successful responses
// into official_box rather than hot-linking the e-amusement site at render time.
const officialBoxThumbnailRanges: Record<string, Array<[number, number]>> = {
  stage_bk: [[1, 21]],
  hi_light: [[1, 21]],
  touch_th: [[4, 32]],
  cover: [[4, 32]],
  deco_sh: [[1, 22]],
  deco_se: [[1, 75], [77, 82]],
};
const officialBoxVolumes = Array.from({ length: 11 }, (_value, index) => index);
const assetId = (id: number): string => id.toString().padStart(4, '0');
const downloadOfficialBoxThumbnails = async (assetRoot: string, log: (message: string) => void): Promise<number> => {
  const outputRoot = path.join(assetRoot, 'official_box');
  fs.mkdirSync(outputRoot, { recursive: true });
  // Revision 62 corrects decoration numbering. Discard only thumbnails made
  // by the old off-by-one mapping once, then repopulate them below.
  const decorationFormatMarker = path.join(outputRoot, '.deco-numbering-v2');
  if (!fs.existsSync(decorationFormatMarker)) {
    for (const name of fs.readdirSync(outputRoot)) {
      if (/^deco_s[eh]_\d{4}\.png$/i.test(name)) fs.rmSync(path.join(outputRoot, name), { force: true });
    }
    fs.writeFileSync(decorationFormatMarker, 'v2');
  }
  // Touch-panel Box files use the same one-based IDs as the game. Clear the
  // previous zero-based cache once so each option previews the item it saves.
  const touchFormatMarker = path.join(outputRoot, '.touch-numbering-v2');
  if (!fs.existsSync(touchFormatMarker)) {
    for (const name of fs.readdirSync(outputRoot)) {
      if (/^touch_th_\d{4}\.png$/i.test(name)) fs.rmSync(path.join(outputRoot, name), { force: true });
    }
    fs.writeFileSync(touchFormatMarker, 'v2');
  }
  const pending: Array<{ type: string; id: number }> = [];
  let cached = 0;
  for (const [type, ranges] of Object.entries(officialBoxThumbnailRanges)) {
    for (const [from, to] of ranges) for (let id = from; id <= to; id++) {
      const output = path.join(outputRoot, `${type}_${assetId(id)}.png`);
      if (fs.existsSync(output) && fs.statSync(output).size > 0) cached++;
      else pending.push({ type, id });
    }
  }
  log(`Official item thumbnails: ${cached} cached, ${pending.length} to fetch.`);
  let downloaded = 0;
  let unavailable = 0;
  // A bounded worker pool keeps refresh responsive and avoids opening hundreds
  // of requests at once while trying the Box volume that owns each item.
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const entry = pending[cursor++];
      const output = path.join(outputRoot, `${entry.type}_${assetId(entry.id)}.png`);
      let success = false;
      for (const volume of officialBoxVolumes) {
        // Stage, highlight and lane-cover list files are zero-based (game
        // stage_bk0001 is list_stage_bk0000.png). Decoration and touch-panel
        // list files already use the game's one-based IDs.
        const remoteId = ['deco_sh', 'deco_se', 'touch_th'].includes(entry.type) ? entry.id : entry.id - 1;
        const url = `https://eacache.s.konaminet.jp/game/popn/popn29/images/p/box/vol${volume}/list_${entry.type}${assetId(remoteId)}.png`;
        try {
          await downloadFile(url, output);
          success = true;
          downloaded++;
          log(`Official thumbnail: ${entry.type} ${assetId(entry.id)} (vol${volume})`);
          break;
        } catch { /* An item belongs to one volume; 404s are expected probes. */ }
      }
      if (!success) {
        unavailable++;
        log(`WARN: official thumbnail unavailable: ${entry.type} ${assetId(entry.id)}.`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  log(`Official item thumbnails: ${downloaded} downloaded, ${cached} cached, ${unavailable} not published.`);
  return downloaded + cached;
};

const listPngFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listPngFiles(entryPath));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) files.push(entryPath);
  }
  return files;
};

const decodeXmlText = (file: string): string => {
  const bytes = fs.readFileSync(file);
  // Omnimix databases are normally Shift-JIS. TextDecoder also handles the
  // UTF-8 files commonly produced by newer dumpers when a BOM is present.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.toString('utf8');
  return decodeShiftJis(bytes);
};

const unescapeXml = (value: string): string => value
  .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .trim();

const tagText = (body: string, tag: string): string => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(body);
  return match ? unescapeXml(match[1]) : '';
};

const findCatalogXml = (gameRoot: string, prefixes: string[]): string[] => {
  const roots = [gameRoot, path.join(gameRoot, 'data_mods')];
  const result: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.xml')) continue;
      const name = entry.name.toLowerCase();
      if (prefixes.some((prefix) => name.startsWith(prefix))) result.push(path.join(root, entry.name));
    }
  }
  return result;
};

const characterIfsIndex = new Map<string, Map<string, string>>();

const getCharacterIfsIndex = (gameRoot: string): Map<string, string> => {
  const cached = characterIfsIndex.get(gameRoot);
  if (cached) return cached;
  const texRoot = path.join(gameRoot, 'plain_data', 'tex');
  const index = new Map<string, string>();
  if (!fs.existsSync(texRoot)) return index;
  // High Cheers character art normally lives under tex\\29; prefer it over
  // inherited version folders when two characters share a folder name.
  const versionDirs = fs.readdirSync(texRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => (a === '29' ? -1 : b === '29' ? 1 : b.localeCompare(a, undefined, { numeric: true })));
  for (const version of versionDirs) {
    const dir = path.join(texRoot, version);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.ifs') && !index.has(entry.name.toLowerCase())) index.set(entry.name.toLowerCase(), path.join(dir, entry.name));
    }
  }
  characterIfsIndex.set(gameRoot, index);
  return index;
};

const findCharacterIfs = (gameRoot: string, folder: string): string | undefined => {
  if (!folder) return undefined;
  const index = getCharacterIfsIndex(gameRoot);
  const exact = index.get(`${folder}.ifs`.toLowerCase());
  if (exact) return exact;
  const escaped = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`^${escaped}_.+\\.ifs$`, 'i');
  for (const [name, source] of index) if (expression.test(name)) return source;
  return undefined;
};

const portraitArchiveCache = new Map<string, { stamp: number; root: string }>();

const getPortraitArchiveRoot = async (runtime: IfsRuntime | undefined, gameRoot: string, letter: '23' | '29'): Promise<string | undefined> => {
  const texRoot = path.join(gameRoot, 'plain_data', 'tex', 'system');
  const source = path.join(texRoot, `ha_chara_${letter}_jka.ifs`);
  if (!runtime || !fs.existsSync(source)) return undefined;
  const stamp = fs.statSync(source).size;
  const cached = portraitArchiveCache.get(source);
  if (cached && cached.stamp === stamp && fs.existsSync(cached.root)) return cached.root;
  const root = path.join(getAssetRoot(), 'catalog', 'character', `_ha_${letter}`);
  const marker = path.join(root, '.done');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === `${stamp}`) {
    portraitArchiveCache.set(source, { stamp, root });
    return root;
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  await extractIfsArchive(runtime, source, root);
  fs.writeFileSync(marker, `${stamp}`);
  portraitArchiveCache.set(source, { stamp, root });
  return root;
};

const findCharacterPortrait = (root: string, folder: string): string | undefined => {
  if (!folder) return undefined;
  const archiveDir = fs.readdirSync(root, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.startsWith('ha_chara_') && entry.name.endsWith('_ifs'));
  if (!archiveDir) return undefined;
  const candidate = path.join(root, archiveDir.name, `ha_${folder}_ifs`, `ha_${folder}.png`);
  return fs.existsSync(candidate) ? candidate : undefined;
};

const extractCharacterArtwork = async (runtime: IfsRuntime, gameRoot: string, character: CharacterCatalogEntry, characterOutput: string): Promise<string | undefined> => {
  const output = path.join(characterOutput, `${character.id}.png`);
  const portraitArchive = await getPortraitArchiveRoot(runtime, gameRoot, '23');
  const portrait = portraitArchive && findCharacterPortrait(portraitArchive, character.folder || '');
  if (portrait) {
    fs.copyFileSync(portrait, output);
    return `catalog/character/${character.id}.png`;
  }
  const source = findCharacterIfs(gameRoot, character.folder || '');
  if (!source) return undefined;
  const temporary = path.join(characterOutput, `_ifs_${character.id}`);
  fs.mkdirSync(temporary, { recursive: true });
  await extractIfsArchive(runtime, source, temporary);
  const images = listPngFiles(temporary).filter((image) => !path.basename(image).startsWith('_canvas_'));
  if (!images.length) return undefined;
  const portraitImage = images.find((image) => path.basename(image).toLowerCase() === 'f.png');
  fs.copyFileSync(portraitImage || images.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0], output);
  return `catalog/character/${character.id}.png`;
};

const parseMusicCatalog = (files: string[]): MusicCatalogEntry[] => {
  const entries = new Map<number, MusicCatalogEntry>();
  for (const file of files) {
    const xml = decodeXmlText(file);
    const pattern = /<music\s+[^>]*\bid\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)<\/music>/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
      const id = Number(match[1]);
      const body = match[2];
      if (!Number.isInteger(id)) continue;
      const title = tagText(body, 'title') || tagText(body, 'fw_title');
      if (!title) continue;
      entries.set(id, {
        id,
        title,
        genre: tagText(body, 'genre') || tagText(body, 'fw_genre'),
        artist: tagText(body, 'artist') || tagText(body, 'fw_artist'),
        chara1: Number.parseInt(tagText(body, 'chara1'), 10) || undefined,
        chara2: Number.parseInt(tagText(body, 'chara2'), 10) || undefined,
      });
    }
  }
  return [...entries.values()].sort((a, b) => a.id - b.id);
};

const parseCharacterCatalog = (files: string[]): CharacterCatalogEntry[] => {
  const entries = new Map<number, CharacterCatalogEntry>();
  for (const file of files) {
    const xml = decodeXmlText(file);
    const pattern = /<chara\s+[^>]*\bid\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)<\/chara>/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(xml)) !== null) {
      const id = Number(match[1]);
      const body = match[2];
      if (!Number.isInteger(id)) continue;
      const name = tagText(body, 'disp_name') || tagText(body, 'chara_id') || tagText(body, 'sort_name');
      entries.set(id, { id, name: name || `CHARACTER ${id}`, folder: tagText(body, 'folder') || undefined, icon: tagText(body, 'icon1') || undefined });
    }
  }
  return [...entries.values()].sort((a, b) => a.id - b.id);
};

type PeSection = { rva: number; size: number; raw: number };

export const extractM39CharacterCatalog = (gameRoot: string): CharacterCatalogEntry[] => {
  const dllPath = path.join(gameRoot, 'modules', 'popn.dll');
  const python = findPortablePython();
  const extractor = path.join(__dirname, 'm39_character_catalog.py');
  if (!fs.existsSync(dllPath) || !python || !fs.existsSync(extractor)) return [];
  try {
    const stdout = execFileSync(python.executable, [extractor, dllPath], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: python.sitePackages }, maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout) as CharacterCatalogEntry[];
  } catch (error) {
    console.log(`[popn] M39 character catalog Python decoder failed: ${String(error)}`);
    return [];
  }
};

export const extractM39MusicCatalog = (gameRoot: string): MusicCatalogEntry[] => {
  const dllPath = path.join(gameRoot, 'modules', 'popn.dll');
  if (!fs.existsSync(dllPath)) return [];
  // CORE v1.60b's Node has no Shift-JIS decoder. Use the bundled Python
  // runtime (whose standard library has CP932) for this one complete pass.
  const python = findPortablePython();
  const extractor = path.join(__dirname, 'm39_music_catalog.py');
  if (python && fs.existsSync(extractor)) {
    try {
      const stdout = execFileSync(python.executable, [extractor, dllPath], { encoding: 'utf8', env: { ...process.env, PYTHONPATH: python.sitePackages }, maxBuffer: 16 * 1024 * 1024 });
      const catalog = JSON.parse(stdout) as MusicCatalogEntry[];
      if (catalog.length) return catalog;
    } catch (error) {
      console.log(`[popn] M39 music catalog Python decoder failed: ${String(error)}`);
    }
  }
  // Do not write mojibake when neither decoder is available. XML overrides
  // may still provide a catalog until the bundled Python runtime is restored.
  try { new TextDecoder('shift_jis'); } catch { return []; }
  const dll = fs.readFileSync(dllPath);
  const peOffset = dll.readUInt32LE(0x3c);
  if (dll.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0' || dll.readUInt16LE(peOffset + 24) !== 0x20b) return [];
  const optionalOffset = peOffset + 24;
  const imageBase = Number(dll.readBigUInt64LE(optionalOffset + 24));
  const sectionOffset = optionalOffset + dll.readUInt16LE(peOffset + 20);
  const sections: PeSection[] = [];
  for (let index = 0; index < dll.readUInt16LE(peOffset + 6); index++) {
    const offset = sectionOffset + index * 40;
    sections.push({ rva: dll.readUInt32LE(offset + 12), size: Math.max(dll.readUInt32LE(offset + 8), dll.readUInt32LE(offset + 16)), raw: dll.readUInt32LE(offset + 20) });
  }
  const rawToRva = (raw: number): number | undefined => {
    const section = sections.find((entry) => raw >= entry.raw && raw < entry.raw + entry.size);
    return section ? section.rva + raw - section.raw : undefined;
  };
  const rvaToRaw = (rva: number): number | undefined => {
    const section = sections.find((entry) => rva >= entry.rva && rva < entry.rva + entry.size);
    return section ? section.raw + rva - section.rva : undefined;
  };
  const stringAtPointer = (pointer: number): string | undefined => {
    if (pointer < imageBase || pointer >= imageBase + 0x10000000) return undefined;
    const raw = rvaToRaw(pointer - imageBase);
    if (raw === undefined || raw >= dll.length) return undefined;
    const end = dll.indexOf(0, raw);
    if (end < raw || end - raw > 1024) return undefined;
    return decodeShiftJis(dll.subarray(raw, end));
  };
  const isStringPointer = (pointer: number): boolean => stringAtPointer(pointer) !== undefined;

  // The x64 M39 DB has seven 64-bit text pointers followed by the legacy
  // chart fields. Locate it from the first POPS entry rather than hard-code a
  // build-specific table offset. The accepted candidate has a 0x138 stride.
  const pops = Buffer.from([0, 0x83, 0x7c, 0x83, 0x62, 0x83, 0x76, 0x83, 0x58, 0]);
  const popsRaw = dll.indexOf(pops);
  const popsRva = popsRaw >= 0 ? rawToRva(popsRaw + 1) : undefined;
  if (popsRva === undefined) return [];
  const target = imageBase + popsRva;
  const targetBytes = Buffer.alloc(8); targetBytes.writeBigUInt64LE(BigInt(target));
  const references: number[] = [];
  for (let offset = dll.indexOf(targetBytes); offset >= 0; offset = dll.indexOf(targetBytes, offset + 1)) references.push(offset);
  let tableStart: number | undefined;
  let bestScore = -1;
  for (const reference of references) {
    for (let pointerIndex = 0; pointerIndex < 7; pointerIndex++) {
      const candidate = reference - pointerIndex * 8;
      if (candidate < 0) continue;
      let score = 0;
      for (let row = 0; row < 20 && candidate + row * 0x138 + 56 <= dll.length; row++) {
        const rowOffset = candidate + row * 0x138;
        if ([0, 1, 2, 3, 4, 5, 6].every((index) => isStringPointer(Number(dll.readBigUInt64LE(rowOffset + index * 8))))) score++;
      }
      if (score > bestScore) { bestScore = score; tableStart = candidate; }
    }
  }
  if (tableStart === undefined || bestScore < 18) return [];

  const catalog: MusicCatalogEntry[] = [];
  for (let id = 0; id < 10000; id++) {
    const row = tableStart + id * 0x138;
    if (row + 64 > dll.length) break;
    const text = [0, 1, 2, 3, 4, 5, 6].map((index) => stringAtPointer(Number(dll.readBigUInt64LE(row + index * 8))));
    if (text.some((value) => value === undefined)) break;
    catalog.push({
      id,
      genre: text[4] || text[0] || '',
      title: text[5] || text[1] || `MUSIC ${id}`,
      artist: text[6] || text[2] || '',
      chara1: dll.readUInt16LE(row + 56) || undefined,
      chara2: dll.readUInt16LE(row + 58) || undefined,
    });
  }
  return catalog;
};

const findPortablePython = (): { executable: string; sitePackages: string } | null => {
  // CORE can run plugins from either asphyxia_160b or its plugins directory.
  // Probe both layouts so the asset refresh does not depend on the launch CWD.
  const toolRoot = [
    path.resolve(process.cwd(), '.tools', 'ifs-preview'),
    path.resolve(process.cwd(), '..', '.tools', 'ifs-preview'),
    path.resolve(process.cwd(), '..', '..', '.tools', 'ifs-preview'),
  ].find((candidate) => fs.existsSync(path.join(candidate, 'python')) && fs.existsSync(path.join(candidate, 'cache', 'archive-v0')));
  if (!toolRoot) return null;
  const pythonRoot = path.join(toolRoot, 'python');
  const archiveRoot = path.join(toolRoot, 'cache', 'archive-v0');
  const executables: string[] = [];
  const findPython = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) findPython(entryPath);
      else if (entry.isFile() && entry.name.toLowerCase() === 'python.exe') executables.push(entryPath);
    }
  };
  findPython(pythonRoot);
  const executable = executables.find((file) => !file.includes(`${path.sep}venv${path.sep}`));
  if (!executable) return null;
  for (const archive of fs.readdirSync(archiveRoot)) {
    const sitePackages = path.join(archiveRoot, archive, 'Lib', 'site-packages');
    if (fs.existsSync(path.join(sitePackages, 'ifstools'))) return { executable, sitePackages };
  }
  return null;
};

// Official Windows build of https://github.com/mon/ifstools. When no portable
// Python runtime is present the plugin fetches this single executable and uses
// it directly, so no local Python install is required.
const IFS_TOOLS_DOWNLOAD_URL = 'https://github.com/mon/ifstools/releases/latest/download/ifstools.exe';

const ifsToolsExeCandidates = (): string[] => [
  path.resolve(process.cwd(), 'plugins', 'popn@asphyxia', '.tools', 'ifstools.exe'),
  path.resolve(process.cwd(), '..', 'plugins', 'popn@asphyxia', '.tools', 'ifstools.exe'),
  path.resolve(process.cwd(), '..', '..', 'plugins', 'popn@asphyxia', '.tools', 'ifstools.exe'),
];

const findBundledIfsToolsExe = (): string | null =>
  ifsToolsExeCandidates().find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).size > 0) || null;

const downloadIfsToolsExe = async (log: (message: string) => void): Promise<string | null> => {
  const target = [...ifsToolsExeCandidates()].find((candidate) => {
    try { fs.mkdirSync(path.dirname(candidate), { recursive: true }); return true; } catch { return false; }
  });
  if (!target) return null;
  log('ifstools runtime: downloading ifstools.exe from GitHub releases...');
  const temporary = `${target}.part`;
  try {
    fs.rmSync(temporary, { force: true });
    await downloadFile(IFS_TOOLS_DOWNLOAD_URL, temporary, 0, 300000);
    if (!fs.existsSync(temporary) || fs.statSync(temporary).size === 0) throw new Error('Empty download');
    fs.rmSync(target, { force: true });
    fs.renameSync(temporary, target);
    log(`ifstools runtime: installed (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB).`);
    return target;
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    log(`ERROR: could not download ifstools.exe (${String(error)}).`);
    return null;
  }
};

type IfsRuntime =
  | { kind: 'python'; executable: string; sitePackages: string }
  | { kind: 'exe'; executable: string };

const findIfsRuntime = async (log: (message: string) => void): Promise<IfsRuntime | null> => {
  const python = findPortablePython();
  if (python) return { kind: 'python', ...python };
  const bundled = findBundledIfsToolsExe();
  if (bundled) return { kind: 'exe', executable: bundled };
  const downloaded = await downloadIfsToolsExe(log);
  return downloaded ? { kind: 'exe', executable: downloaded } : null;
};

const extractIfsArchive = async (runtime: IfsRuntime, source: string, output: string): Promise<void> => {
  if (runtime.kind === 'python') {
    await execFileAsync(runtime.executable, ['-c', 'from ifstools.ifstools import main; main()', '--tex-only', '--silent', '-y', '-o', output, source], { timeout: 600000, env: { ...process.env, PYTHONPATH: runtime.sitePackages } });
  } else {
    await execFileAsync(runtime.executable, ['--tex-only', '--silent', '-y', '-o', output, source], { timeout: 600000 });
  }
};

export const syncPopnDecorationAssets = async (_data: any, send?: WebUISend) => {
  assetUpdateLogBuffer.length = 0;
  const log = (message: string) => appendAssetUpdateLog(message);
  const gameRoot = String(U.GetConfig('popn_m39_root_dir') || '').trim();
  // M39 dumps may expose the content root directly or place it under
  // plain_data. Accept both so the Config value can be the game folder.
  const ifsDirectory = [
    path.join(gameRoot, 'tex', 'system', 'deco', 'deco_sh'),
    path.join(gameRoot, 'plain_data', 'tex', 'system', 'deco', 'deco_sh'),
  ].find((candidate) => fs.existsSync(candidate));
  const assetRoot = getAssetRoot();
  const outputRoot = path.join(assetRoot, 'deco');
  if (!gameRoot || !ifsDirectory) {
    log('ERROR: Configure a valid Game Data Directory first.');
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
    return;
  }

  const python = await findIfsRuntime(log);
  if (!python) {
    log('ERROR: ifstools runtime is unavailable. The asset refresh needs ifstools (portable Python build or the official ifstools.exe, which this page can download automatically).');
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
    return;
  }
  log(`Using game data: ${ifsDirectory}`);

  fs.mkdirSync(outputRoot, { recursive: true });

  // Rebuild the official web thumbnail cache first. The selector can then use
  // these compact, accurate images even when the original IFS preview differs
  // from the site artwork or has no browser-facing thumbnail at all.
  await downloadOfficialBoxThumbnails(assetRoot, log);

  // Cache the small status-page icons locally as well. The profile page must
  // not depend on a live e-amusement connection just to render its settings.
  const officialIconRoot = path.join(assetRoot, 'official_playdata');
  fs.mkdirSync(officialIconRoot, { recursive: true });
  const officialBase = 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/playdata/';
  const officialIcons = [
    'type.png', 'brightness.png', 'keybeam.png', 'line.png', 'on.png', 'off.png',
    'lane0.png', 'lane1.png',
  ].map((name) => ({ url: officialBase + name, name }));
  officialIcons.push(...Array.from({ length: 7 }, (_, gauge) => ({
    url: `${officialBase}extra/txt_ex_${gauge}.png`,
    name: `txt_ex_${gauge}.png`,
  })));
  const medalBase = 'https://eacache.s.konaminet.jp/game/popn/popn29/images/p/common/medal/';
  officialIcons.push(...[
    'meda_none', 'meda_a', 'meda_b', 'meda_c', 'meda_d', 'meda_e', 'meda_f', 'meda_g', 'meda_h', 'meda_i', 'meda_j', 'meda_k',
    'rank_none', 'rank_e', 'rank_d', 'rank_c', 'rank_b', 'rank_a1', 'rank_a1_plus', 'rank_a2', 'rank_a2_plus', 'rank_a3', 'rank_s', 'rank_s_plus',
  ].map((name) => ({ url: `${medalBase}${name}.png`, name: `medal/${name}.png` })));
  officialIcons.push(...Array.from({ length: 9 }, (_, id) => ({
    url: `https://p.eagate.573.jp/game/popn/popn29/images/p/playdata/popclass${id}.png?0`,
    name: `popclass${id}.png`,
  })));
  let downloadedIcons = 0;
  for (const icon of officialIcons) {
    log(`Status icon: ${icon.name}`);
    try {
      const output = path.join(officialIconRoot, icon.name);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      await downloadFile(icon.url, output);
      downloadedIcons++;
    } catch (error) {
      log(`WARN: official status icon ${icon.name} was not downloaded (${String(error)}).`);
    }
  }
  log(`Official player-data icons: ${downloadedIcons}/${officialIcons.length} cached locally.`);

  // These small IFS files are the game's ID-indexed previews. Unlike the
  // deco_shNNNN bundles, one image here corresponds to one selectable item.
  const extractIndexedPreview = async (sourceName: string, outputName: string, prefix: string, label: string) => {
    const source = path.join(path.dirname(path.dirname(ifsDirectory)), `${sourceName}.ifs`);
    const output = path.join(assetRoot, outputName);
    fs.mkdirSync(output, { recursive: true });
    log(`${label}: extracting ${sourceName}.ifs`);
    try {
      await extractIfsArchive(python, source, output);
    } catch (error) { log(`ERROR ${sourceName}.ifs: ${String(error)}`); return []; }
    const result = listPngFiles(output).map((image) => ({ image, match: new RegExp(`^${prefix}(\\d{4})\\.png$`).exec(path.basename(image)) }))
      .filter((entry): entry is { image: string; match: RegExpExecArray } => entry.match !== null)
      .map((entry) => ({ id: Number(entry.match[1]), image: `${outputName}/${path.relative(output, entry.image).replace(/\\/g, '/')}`, label: `${label} ${entry.match[1]}` }))
      .sort((a, b) => a.id - b.id);
    fs.writeFileSync(path.join(output, 'catalog.json'), JSON.stringify(result, null, 2));
    return result;
  };
  const sealPreviews = await extractIndexedPreview('deco_sh_s', 'deco_seal_preview', 'deco_sh_s', 'SEAL');
  const seatPreviews = await extractIndexedPreview('deco_se_s', 'deco_seat_preview', 'deco_se_s', 'SEAT');
  // The selector retains its historical asset path but now contains the
  // ID-indexed previews rather than the incorrect deco_sh bundle images.
  if (sealPreviews.length) fs.writeFileSync(path.join(outputRoot, 'catalog.json'), JSON.stringify(sealPreviews, null, 2));

  const touchDirectory = path.join(path.dirname(ifsDirectory), 'touch_th');
  const touchOutputRoot = path.join(assetRoot, 'touch_theme');
  const touchCatalog: DecorationAsset[] = [];
  if (fs.existsSync(touchDirectory)) {
    fs.mkdirSync(touchOutputRoot, { recursive: true });
    const touchFiles = fs.readdirSync(touchDirectory)
      .map((name) => ({ name, match: /^touch_th(\d{4})\.ifs$/i.exec(name) }))
      .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));
    for (const { name, match } of touchFiles) {
      const id = Number(match[1]);
      if (fs.existsSync(path.join(assetRoot, 'official_box', `touch_th_${assetId(id)}.png`))) {
        log(`THEME: ${name} uses official Box thumbnail.`);
        continue;
      }
      const destination = path.join(touchOutputRoot, `${path.basename(name, '.ifs')}_ifs`);
      log(`THEME: extracting ${name}`);
      fs.mkdirSync(destination, { recursive: true });
      try {
        await extractIfsArchive(python, path.join(touchDirectory, name), destination);
      } catch (error) {
        log(`ERROR ${name}: ${String(error)}`);
        continue;
      }
      const images = listPngFiles(destination).filter((image) => !path.basename(image).startsWith('_canvas_')).sort();
      if (images.length > 0) touchCatalog.push({ id, image: `touch_theme/${path.relative(touchOutputRoot, images[0]).replace(/\\/g, '/')}`, label: `THEME ${id.toString().padStart(4, '0')}` });
    }
  }
  fs.writeFileSync(path.join(touchOutputRoot, 'catalog.json'), JSON.stringify(touchCatalog, null, 2));
  const extractPlayAssets = async (folder: string, expression: RegExp, outputName: string, label: string) => {
    const sourceDirectory = path.join(path.dirname(ifsDirectory), folder);
    const outputDirectory = path.join(assetRoot, outputName);
    const result: DecorationAsset[] = [];
    if (!fs.existsSync(sourceDirectory)) return result;
    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const name of fs.readdirSync(sourceDirectory)) {
      const match = expression.exec(name);
      if (!match) continue;
      const id = Number(match[1]);
      if (fs.existsSync(path.join(assetRoot, 'official_box', `${folder}_${assetId(id)}.png`))) {
        log(`${label}: ${name} uses official Box thumbnail.`);
        continue;
      }
      const destination = path.join(outputDirectory, `${path.basename(name, '.ifs')}_ifs`);
      log(`${label}: extracting ${name}`);
      fs.mkdirSync(destination, { recursive: true });
      try {
        await extractIfsArchive(python, path.join(sourceDirectory, name), destination);
      } catch (error) { log(`ERROR ${name}: ${String(error)}`); continue; }
      const images = listPngFiles(destination).filter((image) => !path.basename(image).startsWith('_canvas_')).sort();
      if (images.length) result.push({ id, image: `${outputName}/${path.relative(outputDirectory, images[0]).replace(/\\/g, '/')}`, label: `${label} ${id}` });
    }
    result.sort((a, b) => a.id - b.id);
    fs.writeFileSync(path.join(outputDirectory, 'catalog.json'), JSON.stringify(result, null, 2));
    return result;
  };
  const covers = await extractPlayAssets('cover', /^cover(\d{4})\.ifs$/i, 'lane_cover', 'COVER');
  const stages = await extractPlayAssets('stage_bk', /^stage_bk(\d{4})\.ifs$/i, 'stage_back', 'STAGE');
  const highlights = await extractPlayAssets('hi_light', /^hi_light(\d{4})\.ifs$/i, 'highlight', 'HIGHLIGHT');

  // Catalog dumping deliberately accepts the same complete XML DB files used
  // by popnhax_tools. A partial custom_musicdb is also useful: it simply
  // updates the IDs it contains without inventing names for the rest.
  const catalogRoot = path.join(assetRoot, 'catalog');
  fs.mkdirSync(catalogRoot, { recursive: true });
  const musicFiles = findCatalogXml(gameRoot, ['musicdb', 'custom_musicdb']);
  const charaFiles = findCatalogXml(gameRoot, ['charadb', 'custom_charadb']);
  const dllMusicCatalog = extractM39MusicCatalog(gameRoot);
  const xmlMusicCatalog = parseMusicCatalog(musicFiles);
  // XML is an explicit user override (useful for Omnimix additions); the DLL
  // remains the complete base catalog and needs no external database file.
  const musicCatalog = [...new Map([...dllMusicCatalog, ...xmlMusicCatalog].map((entry) => [entry.id, entry])).values()].sort((a, b) => a.id - b.id);
  const xmlCharacterCatalog = parseCharacterCatalog(charaFiles);
  const dllCharacterCatalog = extractM39CharacterCatalog(gameRoot);
  // The x64 DLL is the complete stock database; XML is an explicit Omnimix
  // override and may add or replace entries without changing base IDs.
  const characterCatalog = [...new Map([...dllCharacterCatalog, ...xmlCharacterCatalog].map((entry) => [entry.id, entry])).values()].sort((a, b) => a.id - b.id);
  fs.writeFileSync(path.join(catalogRoot, 'music.json'), JSON.stringify(musicCatalog, null, 2));

  // The catalog is complete, but extracting every full-body archive consumes
  // a very large amount of disk and time. Cache art only for characters that
  // are actually selected by a local High Cheers profile.
  const currentCharacterIds = new Set<number>();
  for (const profile of await DB.Find<any>(null, { collection: 'params', version: 'v29' })) {
    const id = Number(profile.params?.chara);
    if (Number.isInteger(id) && id >= 0) currentCharacterIds.add(id);
  }
  const selectedCharacters = characterCatalog.filter((character) => currentCharacterIds.has(character.id));
  log(`Character art: ${selectedCharacters.length}/${characterCatalog.length} currently selected profile character(s).`);

  const characterOutput = path.join(catalogRoot, 'character');
  fs.mkdirSync(characterOutput, { recursive: true });
  // Fallback icon written once so the profile page never 404s, even for
  // characters whose icon archive or per-character art is missing.
  const iconMissingPath = path.join(characterOutput, 'icon-missing.png');
  if (!fs.existsSync(iconMissingPath) || fs.statSync(iconMissingPath).size !== ICON_MISSING_PNG.length) {
    fs.writeFileSync(iconMissingPath, ICON_MISSING_PNG);
  }
  const iconImages = new Map<string, string>();
  const iconSource = path.join(gameRoot, 'plain_data', 'tex', 'system', 'icon.ifs');
  if (fs.existsSync(iconSource)) {
    const iconTemporary = path.join(characterOutput, '_icon_ifs');
    fs.mkdirSync(iconTemporary, { recursive: true });
    try {
      await extractIfsArchive(python, iconSource, iconTemporary);
      for (const image of listPngFiles(iconTemporary)) iconImages.set(path.basename(image).toLowerCase(), image);
    } catch (error) { log(`ERROR character icon archive: ${String(error)}`); }
  }
  // Portraits are a few kilobytes each, so copy them for the whole catalog;
  // this keeps the profile page working even before any character is played.
  let iconCopied = 0;
  for (const character of characterCatalog) {
    const exactIcon = character.icon ? iconImages.get(`${character.icon}.png`.toLowerCase()) : undefined;
    const folderIcon = !exactIcon && character.folder ? iconImages.get(`cs_${character.folder}.png`.toLowerCase()) : undefined;
    const icon = exactIcon || folderIcon;
    if (icon) {
      const output = path.join(characterOutput, `icon-${character.id}.png`);
      fs.copyFileSync(icon, output);
      if (folderIcon && character.icon !== `cs_${character.folder}`) character.icon = `cs_${character.folder}`;
      character.iconImage = `catalog/character/icon-${character.id}.png`;
      iconCopied++;
    }
  }
  log(`Character portraits: ${iconCopied}/${characterCatalog.length} icons available.`);
  for (const character of selectedCharacters) {
    log(`CHARACTER ${character.id}: ${character.name}`);
    try {
      const image = await extractCharacterArtwork(python, gameRoot, character, characterOutput);
      if (image) character.image = image;
    } catch (error) { log(`ERROR character ${character.id}: ${String(error)}`); }
  }
  fs.writeFileSync(path.join(catalogRoot, 'character.json'), JSON.stringify(characterCatalog, null, 2));
  if (dllMusicCatalog.length) log(`Catalog: extracted ${dllMusicCatalog.length} base songs directly from modules\\popn.dll.`);
  else log('ERROR: Could not identify the M39 music table in modules\\popn.dll. No guessed song catalog was written.');
  if (musicFiles.length) log(`Catalog: merged ${xmlMusicCatalog.length} song override entries from ${musicFiles.map((file) => path.basename(file)).join(', ')}.`);
  if (dllCharacterCatalog.length) log(`Catalog: extracted ${dllCharacterCatalog.length} base characters directly from modules\\popn.dll.`);
  else log('ERROR: Could not identify the M39 character table in modules\\popn.dll. No guessed character catalog was written.');
  if (charaFiles.length) log(`Catalog: merged ${xmlCharacterCatalog.length} character override entries from ${charaFiles.map((file) => path.basename(file)).join(', ')}.`);
  log(`Done: ${sealPreviews.length} seal previews, ${seatPreviews.length} seat previews, ${touchCatalog.length} touch themes, ${covers.length + stages.length + highlights.length} play assets.`);
  send?.json({ status: 'ok', logs: assetUpdateLogBuffer, decorations: sealPreviews.length, seats: seatPreviews.length, touchThemes: touchCatalog.length, playAssets: covers.length + stages.length + highlights.length, songs: musicCatalog.length, characters: characterCatalog.length });
};

// Extract the full-body artwork for a single character on demand, keeping the
// profile page up to date even after the profile's chosen character changes.
export const syncPopnCharacterArt = async (data: any, send?: WebUISend) => {
  assetUpdateLogBuffer.length = 0;
  const log = (message: string) => appendAssetUpdateLog(message);
  const gameRoot = String(U.GetConfig('popn_m39_root_dir') || '').trim();
  const id = Number.parseInt(String(data?.characterId ?? data?.id ?? ''), 10);
  if (!gameRoot) {
    log('ERROR: Configure a valid Game Data Directory first.');
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
    return;
  }
  if (!Number.isInteger(id) || id < 0) {
    log(`ERROR: Invalid character id: ${String(data?.characterId ?? data?.id)}`);
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
    return;
  }
  const python = await findIfsRuntime(log);
  if (!python) {
    log('ERROR: ifstools runtime is unavailable. The asset refresh needs ifstools (portable Python build or the official ifstools.exe, which this page can download automatically).');
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
    return;
  }
  const assetRoot = getAssetRoot();
  const catalogRoot = path.join(assetRoot, 'catalog');
  const catalogPath = path.join(catalogRoot, 'character.json');
  if (!fs.existsSync(catalogPath)) {
    log('ERROR: character.json not found. Run a full asset update first.');
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
    return;
  }
  const characterCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as CharacterCatalogEntry[];
  const character = characterCatalog.find((entry) => entry.id === id);
  if (!character) {
    log(`ERROR: Character ${id} is not in the local catalog.`);
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
    return;
  }
  const characterOutput = path.join(catalogRoot, 'character');
  fs.mkdirSync(characterOutput, { recursive: true });
  try {
    const image = await extractCharacterArtwork(python, gameRoot, character, characterOutput);
    if (!image) {
      log(`ERROR: No character archive found for ${character.name} (folder "${character.folder || '?'}").`);
      send?.json({ status: 'error', logs: assetUpdateLogBuffer });
      return;
    }
    character.image = image;
    fs.writeFileSync(catalogPath, JSON.stringify(characterCatalog, null, 2));
    log(`Character ${character.id} (${character.name}) artwork extracted: ${image}`);
    send?.json({ status: 'ok', image, characterId: id, logs: assetUpdateLogBuffer });
  } catch (error) {
    log(`ERROR character ${character.id}: ${String(error)}`);
    send?.json({ status: 'error', logs: assetUpdateLogBuffer });
  }
};


