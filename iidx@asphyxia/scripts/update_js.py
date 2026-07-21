import re

import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
JS_FILE = os.path.join(PLUGIN_ROOT, "webui", "asset", "js", "setting.js")

with open(JS_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

safe_set_func = """function safeSet(selector, val) {
  if (val === undefined || val === null) return;
  var el = $(selector);
  if (el.is("select") && el.find("option[value='" + val + "']").length === 0) {
    el.append($("<option></option>").attr("value", val).text("Unknown (" + val + ")"));
  }
  el.val(val);
}

"""

if "function safeSet(" not in content:
    content = safe_set_func + content

content = re.sub(r'\$\(("[^"]+")\)\.val\(([^)]+)\)', r'safeSet(\1, \2)', content)

with open(JS_FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated setting.js")
