# Water

## Usage Guide

Use `tools.water.author` to read or edit Source water components. Read `editor/water/authoring.md` and `editor/water/WaterAuthoring.d.ts` for the input contract. Use `list` and `get` to obtain the component ID and its current authoring values. A world-query Ref is not a Source component ID.

Shape coordinates and elevations are in local metres. The Entity Transform supplies placement. A lake has a fixed reference level and a separate level offset. A river has control points, widths, depths and section forms. Ocean supports only the fields declared by its backend.

Each water component references one native Material for its complete appearance and stores typed Quality values on the component. The Material owns visual values, appearance policies and native Texture references. Shader-family code defines the fixed compiler structure. Do not create or select a separate Look asset. Choose `shared` to edit a shared resource. Choose `instance` to create an independent Material. Source connections use component references.

Quality controls geometry, shading, scene fields, reflection and caustics budgets, query density and spatial-field limits. Use a typed `quality` patch such as `{ query: "off" }`. Omitted fields retain their current values; creation uses defaults for the body kind. Explicit `false` and `0` are values. Do not reference or create a Quality file. Quality edits do not change the shape, bed or Material. Prefab templates provide shared defaults and leaf overrides.

The tool returns `prepared-in-draft`. This means that the change is in the current draft. Wait for the outer transaction to commit and activate before reporting an accepted change or an active runtime. Wait for saving separately. The UI and tools use the same project transaction and history.

A manual bed is read-only. It cannot carve Terrain. The Seed World host can prepare Terrain and Water together. A failed runtime retains the previous published water. Report the target, field or asset path and the failure reason. Do not report a successful water operation from draft data alone.

Hiding a water surface preserves its queries. Disabling a body removes its queries. Query fields report `actual`, `proxy` or `unsupported`. Ocean reports its datum without visual wave crests. Query a waterfall curtain with `sampleDrops`; a curtain is not an ordinary wet surface.

## API Reference Index

<!-- API_INDEX: generated from executable contracts at load time. -->
