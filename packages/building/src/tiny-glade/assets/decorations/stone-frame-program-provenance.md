# Original stone-frame shader (native colour sentinel 999)

Native Gothic frame selection at `0x10118b284` / store `0x10118b54c`, and Arrow frame selection at `0x101102e2c` / store `0x1011030cc`, choose `nani_solid_vertex_color_bricks` for colour 999. Normal timber frames use `nani_solid_vertex_color_window`. Gothic hat bricks use the separate `nani_gothic_window_bricks` program; they are not interchangeable with this shader.

`stone-frame-program.ts` contains the original main vertex/fragment programs adapted to ES300 by the existing `tools/port_shader.py`. The installed precomp SHA is `bb1eaa75c04089a229a492d0540190b7a18b9d7b183e7fee34c6709ba39164b5`. All four retained SPIR-V modules were checked against their exact byte ranges in that installed precomp. Fresh SPIRV-Cross output and reflection for the two main stages matched the retained files byte-for-byte / structurally. Ported hashes and bindings are recorded in the adjacent JSON.

## Native contract

- Vertex inputs: position location 0 (vec3), normal location 2 (vec3), UV location 3 (vec2).
- Instance stride 64 bytes: affine 3×4 at 0; packed wall-arclength half2 at 48; seed at 52; wall slot plus wooden-wall high bit at 56; native mesh width at 60.
- Vertex deformation is the original world-position noise (0.06 strength). Stone UVs derive from wall arclength, height, wall identity and instance seed.
- Wall colours and identity must come from their current owners. Colour 999 is a **program-selection sentinel**, not a valid brick palette layer.
- The fragment program samples brick palette arrays and preserves the original per-instance variation. It is not timber with a stone tint.
- The native high-bit wooden-wall branch requires halftimber colour IDs and a halftimber colour texture. An absent texture cannot silently be replaced with another texture.

`runtime/ConstructionStoneFrameTemplate.ts` provides the isolated template/ABI utility. The caller must provide immutable original attributes/indices, the source colour-library uniform, and the correctly resolved halftimber texture name; publish the program under `decoration_stone_frame` and supply current instance/state buffers. The utility does not alter the existing decoration consumer or assume missing resources.

The native mapping is now resolved by REA evidence `ev_499994a971b2f506be4a4a96728ec056432bd73fd740e102df7ecba8add0d082` (`0x10048f7bc`, lines 677–692): `halftimber_colors.tex` binds the same `timberframe` asset as ordinary window frames. All 10 existing compressed mip files were compared byte-for-byte against that 512² × 11-layer source package. Supply `nativeDecorationTextureBindings.halfTimber` (`"timberframe"`) to the utility; no new texture or alias allocation is needed. See `halftimber-texture-binding-provenance.json`. The colour-ID buffers and UV-generation algorithms are still separate.

The ES adapter replaces native storage buffers with integer textures and native G-buffer output with the existing resident colour wrapper. Host scene lighting, entrance/LOD handling, renderer integration and actual visual validation remain consumer responsibilities. This asset extraction alone does not prove that a stone frame is displayed in the scene.

## Validation

- Verified all four SPIR-V modules against current installed precomp bytes.
- Re-generated both main GLSL/reflection outputs with SPIRV-Cross and matched the retained sources.
- Existing `engineShaderSource` lowered all uniform blocks at their reflected sizes: view 1024, frame 352, colour library 592 bytes.
- Every reflected storage, uniform and sampler binding is represented in the template utility.

Reproduce: `python world/gallery/shared/tiny-glade/tests/export-decoration-stone-frame.py /absolute/path/to/material-lod-audit-20261016`.

## Seed World consumer integration (2026-10-19)

This subsection records the first integration and its then-current coverage. It is not the current type support matrix: current supported frame choices come from `ConstructionDecorationRecipe.ts` and `ConstructionDecorationCatalog.ts`, including connected wall, half-dormer and full-dormer variants. Later acceptance is recorded separately; the historical measurements below are not refreshed by this note.

The 64-byte packer is additionally checked against the native updater `0x1015a0cec`,
Evidence `ev_acad4b68d2b126175cae75f2be54e24b566418307f2be67318bdd1ac2121bdf9`.
`DecorationStoneFrameAssets` reconstructs ten original templates from catalog-owned
positions/normals/material UVs/indices; every derived buffer is SHA-checked in tests.
The original halftimber sampler consumes Seed World's authored `wood_color` owner
array (`woodenColors`); this is a host adapter, not a claim that the native game
has the same author schema.

The public `window-gothic` recipe supports explicit `frameMaterial: "wall"` for
all three ranks. Omission still selects the existing timber path. Other types
reject this choice until their own producer attributes are connected. The native
Gothic generator explicitly overrides its width by rank before computing the
BrickColor range (`gothic-wall-generator.c` lines 485–499, 609–610, 880–887).
Consequently `mesh_size_x` is producer-owned; the raw frame AABB cannot replace it.
Author resizing scales the wall range with the aperture while preserving the
original UV divisor; arbitrary resize is our host extension.

Fine and coarse consumers use the same original program with existing scene
lighting, entrance and LOD fade adapters. Structural capture includes the same
unwarped source frame geometry for both materials, independently of draw batching.
A real browser red/green test caught the initially omitted GPU frame in structural
capture. After repair, wall→wood→wall restores pixels exactly without publishing
a structure change. Local raster edits, roof material replacement and explicit
zero emission remain in the same fixture's sequential/queued edit checks.

Actual browser coverage so far: independent three Gothic ranks and Arrow ranks
2/3 under both material branches; production rectangular house, Gothic rank 2,
all three LODs and material round-trip. This does not prove all ten installed
variants, original-game visual parity, curved-host coverage, or full-scene budget.
The shader's original world-Y<0 clipping is retained; smoke geometry is placed
above zero rather than removing original clipping to pass the test.
