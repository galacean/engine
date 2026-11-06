# SW2 contact-effect assets

Source: purchased Stylized Water 2 v1.7.0, Staggart Creations. Original license applies.
These PNGs are unchanged copies of the original flipbook atlases. The renderer uses analytic quad particles,
not the SW2 shader or Unity particle runtime. `scene.json` records original prefab IDs, scene anchors,
source checksums and texture checksums. Sizes, lifetimes and density are Galacean Look adaptations.

Reproduce from the repository root:

```sh
python3 world/gallery/demos/water/scripts/export-river-contact-effects.py --source-project /Users/xingyi/Documents/github_code/stylized-water-2-demo
```

The source project is read-only. The script requires the reference scene's identity VFX parent and 12 active
instances; it fails on unexpected hierarchy/count rather than silently importing a different layout.
