# Roof finial recovery — 2026-10-17

The executable was identity-bound through REA `open_binary` with the Ghidra provider. Whole-program Ghidra analysis was cancelled before completion; no pseudocode result is claimed. The following facts were recovered directly from the installed arm64 executable's bounded LLVM disassembly, the shipped mesh JSON, and SPIR-V decoded with SPIRV-Cross. No native function replay is required at runtime.

| Installed input | SHA-256 |
| --- | --- |
| `TinyGlade.app/Contents/MacOS/tiny-glade` | `4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a` |
| `assets/meshes/roof_spire.json` | `af514e50487a7c4079dcfd45a1a078fae8fccf51a9c1ee6cbbe4819d9a146857` |
| `compiled-shaders/country-core/compiled/instanced_roof_spire.precomp` | `b7a6f1705064dbd673867077b5d4c97ae1c68e9fd1f73d26c88a7ce78f5e81b2` |

`roof-spire.ts` retains all 828 authored positions, normals and profile multipliers, and all 1,242 indices (414 triangles). The shipped mesh has no texture UV attribute.

## Native placement

Call chain: `place_roof_spires` at `0x100573c38` → iterator collection `0x100559ea0` → filter-map `0x1005597e4` → placement closure `0x10056eb9c`.

- `Roof::ty` at `0x101595234` accepts float32 height parameter strictly greater than float32 `0.1`.
- `RoofRidgeDims::from` at `0x1015941f4` produces `.1 × .1` for circular roofs; for rectangular roofs one axis is `.1`, the other is `mix(.1, selected footprint dimension, ridge_parameter)`.
- `0x10056ebec–0x10056ec08` rejects `max(width/depth, depth/width) >= float32(1.01)`. Thus a pointed rectangular roof also receives a finial; a long ridge does not.
- `0x10056ec0c–0x10056ec74` sets origin to the roof pivot plus the authored tip offset and computed roof height. `Roof::pivot_3d` is `0x10159540c`; `Roof::roof_tip_offset_xz` is `0x101594ba0`.
- `0x10056ec7c–0x10056ec84` writes the radius **constant `.25`**, alongside roof profile at source offset `0x2c`. It does not use the building's radius.
- No neighbour collision query occurs in this closure. As with the native pitched roof owners, neighbouring geometry occludes this mesh through normal depth testing.

## Native shader

The precomp contains four SPIR-V modules. Solid vertex module 0 exposes `Vertex_Position`, `Vertex_Normal`, `roof_profile_mult` and a 32-byte per-instance record: position vec4, animation, profile, radius, padding.

Vertices with `roof_profile_mult > -.001` scale in XZ by:

`max(.6, radius * 2 * mix(.6, 1, roof_profile_mult) * mix(.4, 1.5, 1 - roof_profile))`.

All positions then use the original elastic grow expression, multiplied by `.5`, and translate by the instance position. A world XZ two-dimensional hash noise adds up to `.3` to Y; correlated three-dimensional noise adds at most `.03` to X and Z. The TS realization uses the settled animation value 1, including that expression's small residual overshoot; it does not silently substitute a different collar model.

Vertex color is the constant linear RGB `[.20675000548362732, .17693302035331726, .10665000975131989]`. The fragment module retains original normal XZ and replaces normal Y by the deformed face normal for profile-morphed vertices. The host adapter splits triangle corners to represent that face-owned normal before submitting to the shared decoration lighting shader.

## Framework adaptation and limits

The generated finial belongs to the roof geometry and uses its stable edit chart. An authored hidden region or Gothic hole containing its attachment anchor suppresses the complete accessory, so hiding the roof cannot leave a floating finial. This edit ownership rule is a framework policy, not a claimed native brush feature.

Preview, resident medium and resident full LOD consume the same generated positions and normals; resident finials merge into existing per-owner decoration draws. Geometry is regenerated only with author changes, not camera motion. Tile/plank substitutions and roof tint do not recolor or resize the original separate metal accessory. Shape edits legitimately change the structural outline; material edits retain identical structure.

Host scene lighting replaces Tiny Glade's deferred G-buffer lighting. JavaScript's transcendental and interpolation arithmetic may differ slightly from the native GPU; this recovery claims the observed formula and data, not bit-identical raster output. Decorative growth is realized at its settled state, consistent with the current static decoration adapter.

Reproduction: use LLVM `--disassemble --start-address=... --stop-address=...` on the pinned executable; parse each precomp SPIR-V magic `0x07230203` with the preceding little-endian word count, then run SPIRV-Cross. Focused regression entry: `demos/terrain/project-tests/ConstructionRoofSpire.spec.ts`.
