"""Resize Farmlands flat dirt and encode the Planner's compact, mipmapped KTX2 assets.

Usage: python3 encode-farm-land-textures.py /path/to/farmlands-viewer /path/to/ktx
Requires Pillow and KTX-Software 4.4.2. Source project is read-only.
"""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile

from PIL import Image

source_root = Path(sys.argv[1]) / "Assets/Polyart/PolyartStudio/Farmlands/Textures/Terrain/Dirt"
ktx = sys.argv[2]
output = Path(__file__).resolve().parents[1] / "seed-world-planner/assets/farm-land"
output.mkdir(parents=True, exist_ok=True)
records = []
with tempfile.TemporaryDirectory(prefix="farm-land-") as temporary:
    for suffix, size, name, transfer in [("C", 512, "color", "srgb"), ("N", 256, "normal", "linear")]:
        source = source_root / f"T_Farm_Dirt_Flat_{suffix}.tga"
        image = Image.open(source).convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
        if name == "normal":
            pixels = image.load()
            for y in range(size):
                for x in range(size):
                    vector = [v / 127.5 - 1 for v in pixels[x, y]]
                    length = math.sqrt(sum(v * v for v in vector)) or 1
                    pixels[x, y] = tuple(round((v / length + 1) * 127.5) for v in vector)
        png = Path(temporary) / f"{name}.png"
        image.save(png)
        target = output / f"dirt-flat-{name}-{size}.ktx2"
        subprocess.run([
            ktx, "create", "--format", "R8G8B8_SRGB" if transfer == "srgb" else "R8G8B8_UNORM",
            "--encode", "uastc", "--uastc-quality", "2", "--zstd", "18", "--assign-tf", transfer,
            "--assign-primaries", "srgb" if transfer == "srgb" else "none", "--generate-mipmap",
            "--mipmap-filter", "lanczos4", "--mipmap-wrap", "wrap", "--assign-texcoord-origin", "top-left",
            "--threads", "1", "--testrun", str(png), str(target)
        ], check=True)
        subprocess.run([ktx, "validate", "--gltf-basisu", str(target)], check=True)
        records.append({
            "source": source.name, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "sourceDimensions": list(Image.open(source).size), "file": target.name, "dimensions": [size, size],
            "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "transferFunction": transfer
        })
(output / "manifest.json").write_text(json.dumps({
    "material": "M_Farm_DirtFlat",
    "source": "farmlands-viewer/Assets/Polyart/PolyartStudio/Farmlands/Textures/Terrain/Dirt",
    "encoding": {"tool": "KTX-Software 4.4.2", "codec": "UASTC", "quality": 2, "zstd": 18, "mipmaps": "full"},
    "textures": records
}, indent=2) + "\n")
print(json.dumps(records, indent=2))
