# ════════════════════════════════════════════════════════════════════════
# GymTrack — Capsule-Export aus Blender
# ════════════════════════════════════════════════════════════════════════
# In Blender ausführen (Text Editor → diese Datei öffnen → "Run Script")
# ODER per Claude via MCP — dann landen die JS-Werte in der Console-Ausgabe.
#
# Liest alle Empties in der Collection "CapsuleEditor" mit den Custom-
# Properties capsule_muscle / capsule_idx / capsule_point / capsule_radius
# und generiert daraus JS-Code für MUSCLE_REGIONS.

import bpy

# Blender → Three.js Koord-Konvertierung
# Beim glTF-Import wandelt Blender Y-up (glTF) → Z-up (Blender), und
# Z-forward (glTF) → -Y (Blender). Wir reverse das:
#   bl (x, y, z)  →  ts (x, z, -y)
def bl_to_ts(loc):
    return (round(loc.x, 4), round(loc.z, 4), round(-loc.y, 4))

# Sammle Empties pro (muscle, capsule_idx)
groups = {}
for o in bpy.data.objects:
    if not o.name.startswith('CAP_'):
        continue
    if 'capsule_muscle' not in o:
        continue
    mid = o['capsule_muscle']
    cidx = o['capsule_idx']
    pt = o['capsule_point']
    r = o.get('capsule_radius', 0.05)
    # Falls User den Radius über empty_display_size geändert hat: priorisieren
    if abs(o.empty_display_size - r) > 1e-4:
        r = o.empty_display_size
    key = (mid, cidx)
    groups.setdefault(key, {'A': None, 'B': None, 'r': r})
    groups[key][pt] = o
    groups[key]['r'] = r

# Sortiere für stabile Reihenfolge (Muskel-Reihenfolge alphabetisch innerhalb Block;
# Reihenfolge im JS folgt dem ursprünglichen Layout)
MUSCLE_ORDER = [
    'chest', 'shoulders_front', 'shoulders_side', 'shoulders_rear',
    'traps', 'mid_back', 'biceps', 'triceps', 'abs', 'obliques',
    'lats', 'lower_back', 'glutes', 'quads', 'hamstrings', 'calves',
]

lines = []
lines.append('/* MUSCLE_REGIONS — exportiert aus Blender ' + __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M') + ' */')

for mid in MUSCLE_ORDER:
    # alle Capsules dieses Muskels finden, nach idx sortieren
    items = [(k[1], v) for (k, v) in groups.items() if k[0] == mid]
    if not items:
        continue
    items.sort(key=lambda x: x[0])
    for (idx, v) in items:
        if not v['A'] or not v['B']:
            continue
        a_ts = bl_to_ts(v['A'].location)
        b_ts = bl_to_ts(v['B'].location)
        r = round(v['r'], 4)
        lines.append(f"  {{ id:'{mid}', a:[{a_ts[0]:>7}, {a_ts[1]:>6}, {a_ts[2]:>7}], b:[{b_ts[0]:>7}, {b_ts[1]:>6}, {b_ts[2]:>7}], r:{r} }},")

js_out = '\n'.join(lines)
print(js_out)

# Zusätzlich: in eine Datei schreiben (damit nichts verloren geht)
import os
candidate_paths = [
    r'C:\Users\wolte\Desktop\gymtrack\model\export_capsules_out.js',
    os.path.join(os.path.expanduser('~'), 'Desktop', 'export_capsules_out.js'),
]
for out_path in candidate_paths:
    try:
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(js_out)
        print(f'\n→ Auch geschrieben nach: {out_path}')
        break
    except Exception as e:
        print(f'(Datei-Schreiben fehlgeschlagen für {out_path}: {e})')
