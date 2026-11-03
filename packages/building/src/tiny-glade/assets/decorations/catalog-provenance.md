# Original decoration mesh catalogue

`catalog-meshes.ts` exposes exact native mesh names and source-order attributes. This is an asset inventory, **not** a count of independently selectable product types. One visible decoration can use a frame, glass, hat, rail and other meshes together.

The source is the installed game's `assets/meshes/decorators/*.json`. The adjacent JSON manifest records each source SHA-256, attribute list, vertex/index counts, packed-byte digest and double-sided metadata. No meshes are inferred or synthesized here. Collision, interaction, outline and flowerbed-location resources are excluded. Native placement and assembly evidence belongs to runtime implementation and its investigation report.

## Inventory

81 meshes / 67,440 source vertices are exposed, including the existing five unchanged exports:

- Cottage: 27 new meshes, plus the legacy wall frame and glass. Rank 1/2/3 frames and glass, corner frames/glass/sill, full dormers, half-dormer frames, legacy-shaped dormer accessories and three broken-glass variants, the native set-dressing lintel used by the corner-window generator, and the original hinged shutter from `assets/meshes/clutter/window_shutter.json`.
- Gothic: 18 meshes. Rank 1/2/3 frames/glass, dormer frames/glass and partial/full hats.
- Doors: 15 new meshes, plus the legacy single door. Cottage and Gothic rank 1/2/3 door bodies and rail assemblies, plus Gothic hats.
- Arrow slits: 9 meshes, including 1x1/1x2/1x3 frames and glass, hats and the 1x3 half-dormer.
- Lanterns: 5 new meshes, plus the legacy wall body and inner light. Flat-roof and terrain bodies/inner lights, plus terrain support.
- Hatches: Cottage and Gothic models.

Additional attributes are preserved without reinterpreting them: Gothic/arrow hats' `is_bevel`, `brick_id`, `bbx_x`; the applicable models' `is_glass`, `is_metal_part`, `flags`, and `soft_normal`. Some glass models have no `is_glass` attribute; absence must not be treated as proof that an assembly part is opaque. All colours retain their original source components. The five legacy meshes retain their previous omissions and JSON signed-zero normalization; this change does not silently alter their existing rendering.

## Representation and cost

New geometry is packed independently per native attribute. Float32 is used only when it reproduces each source number exactly; otherwise Float64 is used (needed by some UV data). Indices use Uint32. Source order, winding and coordinate frame are unchanged.

Six family modules contain 4,141,208 bytes of packed numeric data, represented by 5,555,772 bytes of TypeScript including Base64 and metadata (1,143,965 bytes when gzip-compressing each module independently). They are statically imported, so this is not network streaming. Numeric arrays are decoded only when the corresponding mesh is first requested; subsequent reads return the same cached mesh. Consumers must treat shared source meshes as immutable and transform into destination arrays.

Before adding the lintel, a local Node 24 measurement observed approximately 144 ms to load/type-strip the catalogue and 231 ms to decode **every** mesh. This is not a browser GPU/frame timing, and normal use only decodes requested types. There is no game-directory access, extraction, readback or repeated decoding in the rendering frame loop.

## Reproduce and verify

From repository root, pass the installed `assets/meshes` directory explicitly:

```sh
node world/gallery/shared/tiny-glade/tests/export-decoration-catalog.mjs /absolute/path/to/assets/meshes
node world/gallery/shared/tiny-glade/tests/verify-decoration-catalog.mjs /absolute/path/to/assets/meshes
```

The export checks finite numbers, component counts, index bounds/triangle counts, and exact binary round trips before writing. The verification independently reads the installed source files and compares all exported attributes, triangles, bounds and source digests; it also checks the original five object identities and excludes helper meshes. All 81 meshes and 26 collision bounds passed this source-parity gate again on 2026-10-20. `meshes.ts` and its existing `provenance.json` remain unchanged.

`catalog-bounds.ts` contains lightweight bounds for discovery; it imports no numeric mesh payload. Active generator recipes share these bounds with the API suggested sizes. The parity verifier compares all 81 bound entries against original source vertices as well as the decoded meshes.
