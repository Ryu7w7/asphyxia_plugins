import re
import json
import sys
import os
import glob

# Instrucciones:
# 1. Pon todos los archivos XML de música (`video_music_list.xml`, `video_music_omni.xml`, etc.) en esta carpeta (`data/`).
# 2. Ejecuta este script haciendo doble clic o desde la consola con: `python update_music_data.py`
# 3. El script leerá todos los archivos XML, extraerá las canciones y sobrescribirá `music_data.json`.
# 4. Una vez terminado, puedes borrar los archivos XML.

json_path = "music_data.json"
xml_files = glob.glob("*.xml")

if not xml_files:
    print("Error: No se encontro ningun archivo XML en la carpeta data.")
    print("Por favor, copia los archivos XML (ej. video_music_list.xml) a esta carpeta y vuelve a ejecutar el script.")
    input("Presiona Enter para salir...")
    sys.exit(1)

music_map = {}

for xml_path in xml_files:
    print(f"Procesando {xml_path}...")
    with open(xml_path, 'rb') as f:
        content = f.read()

    try:
        text = content.decode('shift_jis', errors='ignore')
    except Exception as e:
        text = content.decode('utf-8', errors='ignore')

    # Match <music id="123">...<title_name>TITLE</title_name>...<artist_name>ARTIST</artist_name>
    regex = r'<music id="(\d+)">[\s\S]*?<title_name>(.*?)</title_name>[\s\S]*?<artist_name>(.*?)</artist_name>'
    matches = re.findall(regex, text)

    for m in matches:
        music_id = m[0]
        title = m[1].replace('<![CDATA[', '').replace(']]>', '')
        artist = m[2].replace('<![CDATA[', '').replace(']]>', '')
        music_map[music_id] = { "title": title, "artist": artist }
        
    print(f"-> {len(matches)} canciones extraidas de {xml_path}.")

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(music_map, f, ensure_ascii=False, indent=2)

print(f"\n¡Exito! Se ha actualizado music_data.json con {len(music_map)} canciones totales.")
input("Presiona Enter para salir...")
