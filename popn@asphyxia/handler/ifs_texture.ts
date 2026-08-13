import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

type KNode = {
  name: string;
  type: number;
  attrs: Record<string, string>;
  values: Array<number | string>;
  children: KNode[];
  parent?: KNode;
};

type KFormat = { size: number; count: number; signed?: boolean; float?: boolean };

const SIX_BIT = '0123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const K_FORMATS: Record<number, KFormat> = {
  1: { size: 0, count: 0 }, 2: { size: 1, count: 1, signed: true }, 3: { size: 1, count: 1 },
  4: { size: 2, count: 1, signed: true }, 5: { size: 2, count: 1 }, 6: { size: 4, count: 1, signed: true }, 7: { size: 4, count: 1 },
  8: { size: 8, count: 1, signed: true }, 9: { size: 8, count: 1 }, 10: { size: 1, count: -1 }, 11: { size: 1, count: -1 },
  12: { size: 4, count: 1 }, 13: { size: 4, count: 1 }, 14: { size: 4, count: 1, float: true }, 15: { size: 8, count: 1, float: true },
  16: { size: 1, count: 2, signed: true }, 17: { size: 1, count: 2 }, 18: { size: 2, count: 2, signed: true }, 19: { size: 2, count: 2 },
  20: { size: 4, count: 2, signed: true }, 21: { size: 4, count: 2 }, 22: { size: 8, count: 2, signed: true }, 23: { size: 8, count: 2 },
  24: { size: 4, count: 2, float: true }, 25: { size: 8, count: 2, float: true },
  26: { size: 1, count: 3, signed: true }, 27: { size: 1, count: 3 }, 28: { size: 2, count: 3, signed: true }, 29: { size: 2, count: 3 },
  30: { size: 4, count: 3, signed: true }, 31: { size: 4, count: 3 }, 32: { size: 8, count: 3, signed: true }, 33: { size: 8, count: 3 },
  34: { size: 4, count: 3, float: true }, 35: { size: 8, count: 3, float: true },
  36: { size: 1, count: 4, signed: true }, 37: { size: 1, count: 4 }, 38: { size: 2, count: 4, signed: true }, 39: { size: 2, count: 4 },
  40: { size: 4, count: 4, signed: true }, 41: { size: 4, count: 4 }, 42: { size: 8, count: 4, signed: true }, 43: { size: 8, count: 4 },
  44: { size: 4, count: 4, float: true }, 45: { size: 8, count: 4, float: true },
  48: { size: 1, count: 16, signed: true }, 49: { size: 1, count: 16 }, 50: { size: 2, count: 8, signed: true }, 51: { size: 2, count: 8 },
  52: { size: 1, count: 1, signed: true }, 53: { size: 1, count: 2, signed: true }, 54: { size: 1, count: 3, signed: true },
  55: { size: 1, count: 4, signed: true }, 56: { size: 1, count: 16, signed: true },
};

const align4 = (value: number): number => (value + 3) & ~3;

const readKBin = (input: Buffer): KNode => {
  if (input.length < 12 || input[0] !== 0xa0 || (input[1] !== 0x42 && input[1] !== 0x45)) throw new Error('Invalid binary XML');
  const compressed = input[1] === 0x42;
  let nodeOffset = 8;
  const nodeEnd = input.readUInt32BE(4) + 8;
  let dataOffset = nodeEnd + 4;
  let byteOffset = nodeEnd;
  let wordOffset = nodeEnd;
  const root: KNode = { name: '$root', type: 1, attrs: {}, values: [], children: [] };
  let current = root;

  const readName = (): string => {
    if (!compressed) {
      const length = (input[nodeOffset++] & ~64) + 1;
      const value = input.toString('latin1', nodeOffset, nodeOffset + length);
      nodeOffset += length;
      return value;
    }
    const length = input[nodeOffset++];
    const byteLength = Math.ceil(length * 6 / 8);
    let bits = BigInt(0);
    for (let index = 0; index < byteLength; index++) bits = (bits << BigInt(8)) | BigInt(input[nodeOffset++]);
    const padding = (8 - (length * 6 % 8)) % 8;
    bits >>= BigInt(padding);
    const chars = new Array<string>(length);
    for (let index = length - 1; index >= 0; index--) { chars[index] = SIX_BIT[Number(bits & BigInt(63))]; bits >>= BigInt(6); }
    return chars.join('');
  };
  const readNumber = (offset: number, format: KFormat): number => {
    if (format.float) return format.size === 4 ? input.readFloatBE(offset) : input.readDoubleBE(offset);
    if (format.size === 1) return format.signed ? input.readInt8(offset) : input.readUInt8(offset);
    if (format.size === 2) return format.signed ? input.readInt16BE(offset) : input.readUInt16BE(offset);
    if (format.size === 4) return format.signed ? input.readInt32BE(offset) : input.readUInt32BE(offset);
    const value = format.signed ? input.readBigInt64BE(offset) : input.readBigUInt64BE(offset);
    return Number(value);
  };
  const readValues = (format: KFormat, count: number, array: boolean): number[] => {
    const result: number[] = [];
    let offset: number;
    if (array || format.size * count > 2) {
      offset = dataOffset;
      for (let index = 0; index < count; index++) result.push(readNumber(offset + index * format.size, format));
      dataOffset = align4(offset + count * format.size);
      return result;
    }
    if (format.size === 1) {
      if (byteOffset % 4 === 0) byteOffset = dataOffset;
      offset = byteOffset;
      byteOffset += count;
    } else {
      if (wordOffset % 4 === 0) wordOffset = dataOffset;
      offset = wordOffset;
      wordOffset += format.size * count;
    }
    for (let index = 0; index < count; index++) result.push(readNumber(offset + index * format.size, format));
    const trailing = Math.max(byteOffset, wordOffset);
    if (dataOffset < trailing) dataOffset = align4(trailing);
    return result;
  };
  const readString = (): string => {
    const size = input.readInt32BE(dataOffset);
    const start = dataOffset + 4;
    dataOffset = align4(start + size);
    return input.toString('utf8', start, start + Math.max(0, size - 1)).replace(/\0+$/, '');
  };

  while (nodeOffset < nodeEnd) {
    while (nodeOffset < nodeEnd && input[nodeOffset] === 0) nodeOffset++;
    if (nodeOffset >= nodeEnd) break;
    const rawType = input[nodeOffset++];
    const array = (rawType & 64) !== 0;
    const type = rawType & ~64;
    if (type === 190) { if (current.parent) current = current.parent; continue; }
    if (type === 191) break;
    const name = readName();
    if (type === 46) { current.attrs[name] = readString(); continue; }
    const format = K_FORMATS[type];
    if (!format) throw new Error(`Unsupported binary XML node type ${type}`);
    const node: KNode = { name, type, attrs: {}, values: [], children: [], parent: current };
    current.children.push(node);
    current = node;
    if (type === 1) continue;
    let count = format.count;
    let isArray = array;
    if (count === -1) { count = input.readUInt32BE(dataOffset); dataOffset += 4; isArray = true; }
    else if (array) { count *= input.readUInt32BE(dataOffset) / (format.size * format.count); dataOffset += 4; }
    node.values = readValues(format, count, isArray);
  }
  if (root.children.length !== 1) throw new Error('Binary XML has no root node');
  return root.children[0];
};

const fixedName = (name: string): string => {
  let result = name.replace(/_E/g, '.').replace(/__/g, '_');
  if (/^_\d/.test(result)) result = result.slice(1);
  return result;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const pngChunk = (name: string, data: Buffer): Buffer => {
  const type = Buffer.from(name, 'ascii');
  const header = Buffer.alloc(8); header.writeUInt32BE(data.length, 0); type.copy(header, 4);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  return Buffer.concat([header, data, checksum]);
};
const encodePng = (width: number, height: number, rgba: Buffer): Buffer => {
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(scanlines)), pngChunk('IEND', Buffer.alloc(0))]);
};

const decompressAvslz = (input: Buffer): Buffer => {
  const output: number[] = [];
  let offset = 0;
  while (offset < input.length) {
    const flag = input[offset++];
    for (let bit = 0; bit < 8; bit++) {
      if ((flag >> bit) & 1) { if (offset >= input.length) throw new Error('Truncated AVSLZ literal'); output.push(input[offset++]); continue; }
      if (offset + 1 >= input.length) throw new Error('Truncated AVSLZ reference');
      const word = input.readUInt16BE(offset); offset += 2;
      const position = word >> 4;
      let length = (word & 15) + 3;
      if (position === 0) return Buffer.from(output);
      if (position > output.length) { const zeros = Math.min(position - output.length, length); for (let index = 0; index < zeros; index++) output.push(0); length -= zeros; }
      for (let index = 0; index < length; index++) output.push(output[output.length - position]);
    }
  }
  throw new Error('AVSLZ stream has no terminator');
};

const color565 = (value: number): [number, number, number] => [Math.round(((value >> 11) & 31) * 255 / 31), Math.round(((value >> 5) & 63) * 255 / 63), Math.round((value & 31) * 255 / 31)];
const decodeDxtColors = (data: Buffer, offset: number, forceFour: boolean): Array<[number, number, number, number]> => {
  const first = data.readUInt16LE(offset), second = data.readUInt16LE(offset + 2);
  const a = color565(first), b = color565(second);
  const colors: Array<[number, number, number, number]> = [[...a, 255], [...b, 255]];
  if (first > second || forceFour) colors.push([Math.round((2 * a[0] + b[0]) / 3), Math.round((2 * a[1] + b[1]) / 3), Math.round((2 * a[2] + b[2]) / 3), 255], [Math.round((a[0] + 2 * b[0]) / 3), Math.round((a[1] + 2 * b[1]) / 3), Math.round((a[2] + 2 * b[2]) / 3), 255]);
  else colors.push([Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2), Math.round((a[2] + b[2]) / 2), 255], [0, 0, 0, 0]);
  return colors;
};
const decodeDxt = (raw: Buffer, width: number, height: number, dxt5: boolean): Buffer => {
  const data = Buffer.from(raw);
  for (let index = 0; index + 1 < data.length; index += 2) { const byte = data[index]; data[index] = data[index + 1]; data[index + 1] = byte; }
  const rgba = Buffer.alloc(width * height * 4);
  const blockSize = dxt5 ? 16 : 8;
  let offset = 0;
  for (let by = 0; by < height; by += 4) for (let bx = 0; bx < width; bx += 4) {
    if (offset + blockSize > data.length) return rgba;
    let alpha: number[] = new Array(16).fill(255);
    let colorOffset = offset;
    if (dxt5) {
      const a0 = data[offset], a1 = data[offset + 1];
      const palette = [a0, a1];
      if (a0 > a1) for (let i = 1; i <= 6; i++) palette.push(Math.round(((7 - i) * a0 + i * a1) / 7));
      else { for (let i = 1; i <= 4; i++) palette.push(Math.round(((5 - i) * a0 + i * a1) / 5)); palette.push(0, 255); }
      let bits = BigInt(0); for (let i = 0; i < 6; i++) bits |= BigInt(data[offset + 2 + i]) << BigInt(i * 8);
      alpha = alpha.map((_value, i) => palette[Number((bits >> BigInt(i * 3)) & BigInt(7))]);
      colorOffset += 8;
    }
    const colors = decodeDxtColors(data, colorOffset, dxt5);
    const indices = data.readUInt32LE(colorOffset + 4);
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
      const x = bx + px, y = by + py; if (x >= width || y >= height) continue;
      const pixel = py * 4 + px, color = colors[(indices >>> (pixel * 2)) & 3], target = (y * width + x) * 4;
      rgba[target] = color[0]; rgba[target + 1] = color[1]; rgba[target + 2] = color[2]; rgba[target + 3] = dxt5 ? alpha[pixel] : color[3];
    }
    offset += blockSize;
  }
  return rgba;
};

const decodePixels = (format: string, data: Buffer, width: number, height: number): Buffer => {
  const pixels = width * height;
  if (format === 'argb8888rev') {
    const rgba = Buffer.alloc(pixels * 4);
    for (let index = 0; index < pixels; index++) { const source = index * 4; rgba[source] = data[source + 2] || 0; rgba[source + 1] = data[source + 1] || 0; rgba[source + 2] = data[source] || 0; rgba[source + 3] = data[source + 3] || 0; }
    return rgba;
  }
  if (format === 'argb4444') {
    const rgba = Buffer.alloc(pixels * 4);
    for (let index = 0; index < pixels; index++) { const word = index * 2 + 1 < data.length ? data.readUInt16BE(index * 2) : 0; const target = index * 4; rgba[target] = (word & 15) * 17; rgba[target + 1] = ((word >> 8) & 15) * 17; rgba[target + 2] = ((word >> 12) & 15) * 17; rgba[target + 3] = ((word >> 4) & 15) * 17; }
    return rgba;
  }
  if (format === 'dxt1') return decodeDxt(data, width, height, false);
  if (format === 'dxt5') return decodeDxt(data, width, height, true);
  throw new Error(`Unsupported IFS texture format ${format}`);
};

const findChild = (node: KNode, name: string): KNode | undefined => node.children.find((child) => fixedName(child.name) === name);
const walk = function* (node: KNode): IterableIterator<KNode> { yield node; for (const child of node.children) yield* walk(child); };

/** Extracts the texture images in an IFS without Python or external tools.
 *
 * Reads only the manifest section first (at most a few kilobytes) to decide
 * whether the archive contains extractable textures. Files like
 * ha_chara_23_jka.ifs (1.1 GB) are nested-IFS containers with no tex node
 * and are skipped immediately without loading their data section into memory.
 */
export const extractIfsTextures = (source: string, outputRoot: string): string[] => {
  // --- Phase 1: read just the header + manifest to check for a tex node ---
  const fd = fs.openSync(source, 'r');
  const header = Buffer.alloc(36);
  const headerRead = fs.readSync(fd, header, 0, 36, 0);
  if (headerRead < 36 || header.readUInt32BE(0) !== 0x6cad8f89) {
    fs.closeSync(fd);
    throw new Error('Unsupported or invalid IFS file');
  }
  const manifestEnd = header.readUInt32BE(16);
  if (manifestEnd <= 36) { fs.closeSync(fd); throw new Error('Invalid IFS manifest size'); }
  const manifestBuf = Buffer.alloc(manifestEnd - 36);
  fs.readSync(fd, manifestBuf, 0, manifestBuf.length, 36);
  fs.closeSync(fd);
  const manifest = readKBin(manifestBuf);
  const tex = findChild(manifest, 'tex');
  // No tex node means this is a nested-IFS container or an animation-only
  // archive; skip it without reading the (potentially gigabyte-scale) data.
  if (!tex) return [];

  // --- Phase 2: now safe to load the full file ---
  const input = fs.readFileSync(source);
  if (manifestEnd > input.length) throw new Error('Invalid IFS manifest size');
  const files = new Map<string, { offset: number; size: number }>();
  for (const entry of tex.children) if (entry.values.length >= 2) files.set(fixedName(entry.name), { offset: Number(entry.values[0]), size: Number(entry.values[1]) });
  const textureListEntry = [...files.entries()].find(([name]) => name.endsWith('.xml'));
  if (!textureListEntry) throw new Error('IFS texture list was not found');
  const textureListData = input.subarray(manifestEnd + textureListEntry[1].offset, manifestEnd + textureListEntry[1].offset + textureListEntry[1].size);
  const textureList = readKBin(textureListData);
  const compress = textureList.attrs.compress || '';
  const outputDirectory = path.join(outputRoot, `${path.basename(source, path.extname(source))}_ifs`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputs: string[] = [];
  for (const texture of textureList.children) {
    const format = texture.attrs.format;
    for (const image of texture.children.filter((node) => node.name === 'image')) {
      const imageName = image.attrs.name;
      const manifestName = crypto.createHash('md5').update(Buffer.from(imageName, 'utf8')).digest('hex');
      const entry = files.get(manifestName) || files.get(`_${manifestName}`);
      const imgrect = findChild(image, 'imgrect')?.values.map(Number);
      if (!entry || !imageName || !imgrect || imgrect.length < 4) continue;
      let data = input.subarray(manifestEnd + entry.offset, manifestEnd + entry.offset + entry.size);
      if (compress === 'avslz') {
        if (data.length < 8) throw new Error(`Invalid AVSLZ texture ${imageName}`);
        const uncompressed = data.readUInt32BE(0), compressed = data.readUInt32BE(4);
        if (data.length === compressed + 8) { data = decompressAvslz(data.subarray(8)); if (data.length !== uncompressed) throw new Error(`AVSLZ size mismatch for ${imageName}`); }
        else data = Buffer.concat([data.subarray(8), data.subarray(0, 8)]);
      }
      const width = Math.floor((imgrect[1] - imgrect[0]) / 2), height = Math.floor((imgrect[3] - imgrect[2]) / 2);
      if (width <= 0 || height <= 0) continue;
      const output = path.join(outputDirectory, `${imageName}.png`);
      fs.writeFileSync(output, encodePng(width, height, decodePixels(format, data, width, height)));
      outputs.push(output);
    }
  }
  return outputs;
};
