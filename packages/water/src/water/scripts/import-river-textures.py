"""Bake the authorized Stylized Water 2 texture subset. Requires Pillow.
Usage: python3 import-river-textures.py /path/to/Assets/StylizedWater2
"""
from pathlib import Path
import base64
import sys
from PIL import Image

source = Path(sys.argv[1]) / "Materials/Textures"
target = Path(__file__).resolve().parents[1] / "resources/river/assets"
textures = [
    Image.open(source / path).convert("RGBA")
    for path in ("Normals/SmoothWaves.png", "Normals/StreamWaves.png", "Foam/WaterfallFoam.png")
]
textures[:2] = [image.resize((512, 512), Image.Resampling.LANCZOS) for image in textures[:2]]
normal = Image.merge("RGBA", (
    textures[0].getchannel("R"), textures[0].getchannel("G"),
    textures[1].getchannel("R"), textures[1].getchannel("G")
))
# Unity imports foam as sRGB. Bake its linear values before GPU filtering/mipmaps.
linear = [round((v / 255 / 12.92 if v <= 10 else ((v / 255 + 0.055) / 1.055) ** 2.4) * 255) for v in range(256)]
foam = textures[2].point(linear * 3 + list(range(256))).resize((512, 512), Image.Resampling.LANCZOS)
target.mkdir(parents=True, exist_ok=True)
for name, texture in (("normals", normal), ("foam", foam)):
    (target / f"{name}.rgba.base64").write_text(base64.b64encode(texture.tobytes()).decode("ascii") + "\n")
