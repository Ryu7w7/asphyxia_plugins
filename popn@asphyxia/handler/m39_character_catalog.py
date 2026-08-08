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
        try:
            return data[raw:end].decode('cp932')
        except UnicodeDecodeError:
            return None

    # The stock x64 table begins at the first legacy character, bamb_1a.
    # Each 0x80-byte row is indexed directly by the in-game chara_num.
    anchor = b'\0bamb_1a\0'
    anchor_raw = data.find(anchor)
    if anchor_raw < 0:
        return []
    anchor_rva = raw_to_rva(anchor_raw + 1)
    if anchor_rva is None:
        return []
    references, start = [], 0
    target = struct.pack('<Q', base + anchor_rva)
    while True:
        found = data.find(target, start)
        if found < 0:
            break
        references.append(found)
        start = found + 1

    table, best = None, -1
    for candidate in references:
        score = 0
        for row in range(32):
            offset = candidate + row * 0x80
            if offset + 0x70 > len(data):
                break
            if text(u64(data, offset)) and text(u64(data, offset + 0x48)) and text(u64(data, offset + 0x50)):
                score += 1
        if score > best:
            table, best = candidate, score
    if table is None or best < 30:
        return []

    catalog = []
    # This table contains a few deliberately empty/deleted slots. Its x64
    # allocation is well below 4096 entries; skip those holes, but never scan
    # unboundedly into unrelated pointer data after the allocation.
    empty_run = 0
    for chara_id in range(4096):
        row = table + chara_id * 0x80
        if row + 0x70 > len(data):
            break
        folder = text(u64(data, row))
        sort_name = text(u64(data, row + 0x48))
        display_name = text(u64(data, row + 0x50))
        if not folder or not sort_name or not display_name:
            empty_run += 1
            # The active table has isolated holes, but a long empty run marks
            # its end. This prevents a coincidental string triple later in
            # .data from being treated as a character.
            if chara_id > 100 and empty_run >= 128:
                break
            continue
        empty_run = 0
        icon = text(u64(data, row + 0x20))
        catalog.append({'id': chara_id, 'name': display_name, 'folder': folder, 'icon': icon or None})
    return catalog


print(json.dumps(extract(sys.argv[1]), ensure_ascii=False))
