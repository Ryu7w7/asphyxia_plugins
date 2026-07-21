import re

import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
file_path = os.path.join(PLUGIN_ROOT, "webui", "profile_----setting.pug")

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
expected_indent = 0
in_select_block = False

for i, line in enumerate(lines):
    stripped = line.lstrip()
    
    if in_select_block:
        if stripped.startswith("select("):
            new_lines.append(" " * (expected_indent + 2) + stripped)
            continue
        elif stripped.startswith("each "):
            new_lines.append(" " * (expected_indent + 4) + stripped)
            continue
        elif stripped.startswith("option("):
            new_lines.append(" " * (expected_indent + 6) + stripped)
            in_select_block = False
            continue

    if stripped == ".select" or stripped == ".select\n":
        # Find previous non-empty line
        prev = ""
        for j in range(i-1, -1, -1):
            if lines[j].strip():
                prev = lines[j]
                break
        
        prev_indent = len(prev) - len(prev.lstrip())
        expected_indent = prev_indent + 2
        new_lines.append(" " * expected_indent + stripped)
        in_select_block = True
    else:
        new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Fixed pug indentation")
