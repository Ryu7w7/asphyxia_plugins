import re

import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PLUGIN_ROOT = os.path.dirname(SCRIPT_DIR)
PUG_FILE = os.path.join(PLUGIN_ROOT, "webui", "profile_----setting.pug")

def get_select_html(name, data_key, val_var):
    return f"""            .select
              select(name="{name}", id="{name}")
                each val, index in customData.{data_key}
                  option(value=index selected=(index=={val_var})) #{{val}}"""

def main():
    with open(PUG_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Insert include _custom_data.pug
    if "include _custom_data.pug" not in content:
        content = content.replace("lm_custom: DB.FindOne(refid, { collection: \"lightning_custom\" })\n",
                                  "lm_custom: DB.FindOne(refid, { collection: \"lightning_custom\" })\n\ninclude _custom_data.pug\n")

    mappings = [
        ("frame", "frame", "custom.frame"),
        ("turntable", "turntable", "custom.turntable"),
        ("note_burst", "note_burst", "custom.note_burst"),
        ("menu_music", "menu_music", "custom.menu_music"),
        ("lane_cover", "lane_cover", "custom.lane_cover"),
        ("category_vox", "category_vox", "custom.category_vox"),
        ("note_skin", "note_skin", "custom.note_skin"),
        ("full_combo_splash", "full_combo_splash", "custom.full_combo_splash"),
        ("note_beam", "note_beam", "custom.note_beam"),
        ("judge_font", "judge_font", "custom.judge_font"),
        ("effect", "effect", "custom.effect"),
        ("bomb_size", "bomb_size", "custom.bomb_size"),
        ("qpro_head", "qpro_head", "custom.qpro_head"),
        ("qpro_hair", "qpro_hair", "custom.qpro_hair"),
        ("qpro_hand", "qpro_hand", "custom.qpro_hand"),
        ("qpro_face", "qpro_face", "custom.qpro_face"),
        ("qpro_body", "qpro_body", "custom.qpro_body"),
    ]

    for name, data_key, val_var in mappings:
        pattern = re.compile(r'input\.input\(type="number" name="' + name + r'", id="' + name + r'", value=' + val_var + r'\)')
        content = pattern.sub(get_select_html(name, data_key, val_var), content)

    # For qpro_back, lm_bg, etc. which have conditional values in pug
    # e.g., input.input(type="number" name="qpro_back", id="qpro_back", value="0")
    # or input.input(type="number" name="qpro_back", id="qpro_back", value=custom.qpro_back)
    
    # Replace qpro_back
    qpro_back_pattern1 = r'input\.input\(type="number" name="qpro_back", id="qpro_back", value="0"\)'
    qpro_back_pattern2 = r'input\.input\(type="number" name="qpro_back", id="qpro_back", value=custom.qpro_back\)'
    
    content = re.sub(qpro_back_pattern1, get_select_html("qpro_back", "qpro_back", "0"), content)
    content = re.sub(qpro_back_pattern2, get_select_html("qpro_back", "qpro_back", "custom.qpro_back"), content)

    # lm_bg
    content = re.sub(r'input\.input\(type="number" name="lm_bg", id="lm_bg", value=lm_custom.premium_bg\)', get_select_html("lm_bg", "premium_bg", "lm_custom.premium_bg"), content)
    
    # lm_entry_bg
    content = re.sub(r'input\.input\(type="number" name="lm_entry_bg", id="lm_entry_bg", value="0"\)', get_select_html("lm_entry_bg", "entry_bg", "0"), content)
    content = re.sub(r'input\.input\(type="number" name="lm_entry_bg", id="lm_entry_bg", value=lm_custom.entry_bg\)', get_select_html("lm_entry_bg", "entry_bg", "lm_custom.entry_bg"), content)

    with open(PUG_FILE, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Replaced pug inputs")

if __name__ == "__main__":
    main()
