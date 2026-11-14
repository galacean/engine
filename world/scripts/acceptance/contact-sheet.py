"""Generate paired thumbnails without altering original evidence screenshots."""
import json
import sys
import re
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[3]
directory = root / 'world/.acceptance' / (sys.argv[1] if len(sys.argv) > 1 else 'browser')
rows = []
for entry in json.loads((root / 'world/demos.json').read_text()):
    identity = re.sub(r'[^a-zA-Z0-9]+', '-', entry['entry'])
    shots = [directory / f'{identity}-{variant}.png' for variant in ('baseline', 'migrated')]
    if any(p.exists() for p in shots):
        rows.append((entry['entry'], shots))
for start in range(0, len(rows), 6):
    batch = rows[start:start + 6]
    sheet = Image.new('RGB', (1024, len(batch) * 316), '#dddddd')
    draw = ImageDraw.Draw(sheet)
    for row, (name, shots) in enumerate(batch):
        y = row * 316
        draw.text((6, y + 5), name + '     baseline / migrated', fill='black')
        for column, shot in enumerate(shots):
            if shot.exists():
                picture = Image.open(shot).convert('RGB')
                picture.thumbnail((512, 288))
                sheet.paste(picture, (column * 512, y + 26))
    sheet.save(directory / f'contact-{start // 6 + 1}.jpg', quality=92)
print(f'{len(rows)} paired entries; {(len(rows)+5)//6} contact sheets')
