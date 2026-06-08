import re
import json
import os

PHP_FILE = r"C:\Users\RyuPC\Desktop\github\easervers\hydrogen.eamu.fun\mermaidserver\src\Helper\IIDXTheme.php"
OUTPUT_JSON = r"C:\Users\RyuPC\Desktop\github\asphyxia_plugins\iidx@asphyxia\data\customization.json"

def extract_options(method_name, content):
    method_start = content.find(f"function {method_name}")
    if method_start == -1:
        return {}
    
    next_method_start = content.find("function getOption", method_start + 20)
    if next_method_start == -1:
        next_method_start = len(content)
        
    method_content = content[method_start:next_method_start]
    
    pattern = r"(?:0x([0-9A-Fa-f]+)|(\d+))\s*=>\s*'([^']+)'"
    
    options = {}
    for match in re.finditer(pattern, method_content):
        hex_val = match.group(1)
        int_val = match.group(2)
        label = match.group(3)
        
        if hex_val is not None:
            key = int(hex_val, 16)
        else:
            key = int(int_val)
            
        options[str(key)] = label
        
    return options

def main():
    if not os.path.exists(PHP_FILE):
        print(f"File not found: {PHP_FILE}")
        return

    with open(PHP_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    categories = {
        "turntable": "getOptionTurntable",
        "note_burst": "getOptionBomb",
        "lane_cover": "getOptionLane",
        "note_skin": "getOptionNote",
        "full_combo_splash": "getOptionFullCombo",
        "note_beam": "getOptionBeam",
        "judge_font": "getOptionFont",
        "menu_music": "getOptionBGM",
        "category_vox": "getOptionVoice",
        "frame": "getOptionFrame",
        "effect": "getOptionEffect",
        "bomb_size": "getOptionBombSize",
        "premium_bg": "getOptionPremiumAreaBackground",
        "entry_bg": "getOptionEntryCardBackground"
    }

    result = {}
    for cat_name, method_name in categories.items():
        opts = extract_options(method_name, content)
        if not opts:
            result[cat_name] = []
            continue
            
        max_id = max(int(k) for k in opts.keys())
        arr = []
        for i in range(max_id + 1):
            arr.append(opts.get(str(i), f"Unknown ({i})"))
        
        result[cat_name] = arr

    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully extracted {len(result)} categories to {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
