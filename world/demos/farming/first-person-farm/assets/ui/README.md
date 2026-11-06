# Farm action icons

Original vector artwork for this demo: `sow.svg` (seed bag), `water.svg` (watering can), and `harvest.svg` (produce basket). No third-party icon assets are included.

All three use a 64 × 64 viewBox. The matching transparent PNG files are exported at 128 × 128 and display at 32 × 32 CSS pixels. Runtime uses PNG because the current engine texture loader decodes image bytes without an SVG MIME type. White artwork is tinted by Galacean UI; dark interior details keep their shape at small sizes. Keep silhouettes and strokes consistent across the set.

After editing an SVG, regenerate its PNG with Sharp: `sharp(inputSvg).png().toFile(outputPng)`.
