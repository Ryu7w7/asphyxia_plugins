import json

import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
PUG_FILE = os.path.join(PLUGIN_ROOT, "webui", "profile_----setting.pug")
JSON_FILE = os.path.join(PLUGIN_ROOT, "data", "customization.json")

def main():
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        custom_data = json.load(f)

    with open(PUG_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the exact `const customData = {` block
    START_MARKER = '  const customData = {'
    END_MARKER = '  };'

    start_idx = content.find(START_MARKER)
    if start_idx == -1:
        # Maybe it was already overwritten to just `  {`
        START_MARKER = '  {'
        start_idx = content.find(START_MARKER)
        if start_idx == -1:
            print("Could not find start marker!")
            return

    # Find the matching `};` after the start
    search_from = start_idx + len(START_MARKER)
    end_idx = content.find(END_MARKER, search_from)
    if end_idx == -1:
        print("Could not find end marker!")
        return

    # Build replacement: const customData = { ... };
    # We need Pug-safe JS: only ASCII-safe strings inside the block
    # Use JSON.stringify equivalent but keep it as a JS object literal
    inner = json.dumps(custom_data, ensure_ascii=False, indent=4)

    # Replace full block
    new_block = f'  const customData = {inner};'

    # Indent replacement to 2 spaces like the rest of the file
    indented_lines = []
    for line in new_block.split('\n'):
        indented_lines.append('  ' + line if not line.startswith('  ') else line)
    new_block = '\n'.join(indented_lines)

    new_content = content[:start_idx] + new_block + content[end_idx + len(END_MARKER):]

    with open(PUG_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print("Done! customData block replaced correctly.")

if __name__ == "__main__":
    main()
