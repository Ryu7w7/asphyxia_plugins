import json
import struct
import sys

sys.stdout.reconfigure(encoding='utf-8')


def u16(data, offset): return struct.unpack_from('<H', data, offset)[0]
def u32(data, offset): return struct.unpack_from('<I', data, offset)[0]
def u64(data, offset): return struct.unpack_from('<Q', data, offset)[0]


def extract(filename):
    data = open(filename, 'rb').read()
    pe = u32(data, 0x3c)
    if data[pe:pe + 4] != b'PE\0\0' or u16(data, pe + 24) != 0x20B:
        return []
    optional = pe + 24
    base = u64(data, optional + 24)
    sections = []
    section_offset = optional + u16(data, pe + 20)
    for index in range(u16(data, pe + 6)):
        offset = section_offset + index * 40
        sections.append((u32(data, offset + 12), max(u32(data, offset + 8), u32(data, offset + 16)), u32(data, offset + 20)))

    def raw_to_rva(raw):
        for rva, size, start in sections:
            if start <= raw < start + size:
                return rva + raw - start

    def rva_to_raw(rva):
        for start, size, raw in sections:
            if start <= rva < start + size:
                return raw + rva - start

    def text(pointer):
        if pointer < base or pointer >= base + 0x10000000:
            return None
        raw = rva_to_raw(pointer - base)
        if raw is None:
            return None
        end = data.find(b'\0', raw)
        if end < raw or end - raw > 1024:
            return None
        return data[raw:end].decode('cp932', errors='replace')

    pops = b'\0\x83\x7c\x83\x62\x83\x76\x83\x58\0'
    pops_raw = data.find(pops)
    if pops_raw < 0:
        return []
    target_rva = raw_to_rva(pops_raw + 1)
    if target_rva is None:
        return []
    target = struct.pack('<Q', base + target_rva)
    references, start = [], 0
    while True:
        found = data.find(target, start)
        if found < 0:
            break
        references.append(found)
        start = found + 1
    table, best = None, -1
    for reference in references:
        for pointer_index in range(7):
            candidate = reference - pointer_index * 8
            if candidate < 0:
                continue
            score = 0
            for row in range(20):
                row_offset = candidate + row * 0x138
                if row_offset + 56 > len(data):
                    break
                if all(text(u64(data, row_offset + index * 8)) is not None for index in range(7)):
                    score += 1
            if score > best:
                table, best = candidate, score
    if table is None or best < 18:
        return []
    catalog = []
    for music_id in range(10000):
        row = table + music_id * 0x138
        if row + 64 > len(data):
            break
        strings = [text(u64(data, row + index * 8)) for index in range(7)]
        if any(value is None for value in strings):
            break
        catalog.append({'id': music_id, 'genre': strings[4] or strings[0] or '', 'title': strings[5] or strings[1] or 'MUSIC %d' % music_id, 'artist': strings[6] or strings[2] or '', 'chara1': u16(data, row + 56) or None, 'chara2': u16(data, row + 58) or None})
    return catalog


print(json.dumps(extract(sys.argv[1]), ensure_ascii=False))
