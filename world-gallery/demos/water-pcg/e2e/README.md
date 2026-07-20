# Water PCG debug visual baselines

These images capture the `multi-tributary-river` example at `1200 × 765`, Medium quality, WebGL 1, and a fixed `surfaceTime=12.5`.

- `authoring-control-points.png`
- `geometry-raw-mesh.png`
- `fields-sdf.png`
- `surface-macro-height.png`
- `final.png`

The captures intentionally include both the Water PCG Debug panel and dat.GUI. Before replacing a baseline, open `/demos/water-pcg/?webgl=1&quality=medium&surfaceTime=12.5`, select the multi-tributary example, switch with `window.waterPcgDebug.select(...)`, and verify that the browser console has no warnings or errors.
