# Preserved native laboratory (historical path)

This document describes the earlier port-8769 investigation laboratory. Its statements about pending migration apply to that earlier path, not the browser-only Seed World runtime. See [README.md](README.md) for the current entry. The laboratory and offline oracles remain available for comparison; Seed World imports none of their server or replay code.

# Geometry × Rule × Unit resident prototype

## Seed World migration status (2026-10-15)

The requested final runtime is a browser/Worker TypeScript pipeline. Original
function replay belongs only to offline verification in that target architecture.
**The complete framework has not reached that state yet.** Do not remove the
native provider from fresh wall/Gothic construction until its producers have
independent implementations. A cached scene or a Python-to-Node wrapper is not
that implementation. Seed World's existing scene has not been replaced.

The first migration slice now runs roof arrangements in TypeScript:

- `runtime/RecoveredRoofMath.ts`: f32 operation order, uint64 Wyrand state,
  profile charts, dimensions, quaternion construction.
- `runtime/RecoveredRoofPlacement.ts`: circular rows and dependent first-row
  closures, plus the rectangular closure primitive.
- `runtime/RecoveredRectangularRoof.ts`: the previously admitted gable/hip
  profile domain, side/ridge components and slope rows in original RNG order.

`generateCircularRoof(surface, footprint, seedBigInt, unitMetrics, renderSlot)`
and `generateRectangularRoof(...)` consume geometry and an occupancy footprint;
they do not dispatch on material. Their current return shape retains recovery
metadata and initial64 hex records for the existing compiler adapter. This is an
algorithm migration, not yet the final compact-buffer scene compiler API.
`generateRoofClosure` preserves the first-row and minimum-length guards.
Unsupported profiles are rejected, not approximated.

The recovery compiler's normal GPU-feedback route invokes these TS functions
through its existing request-owned bridge. That development bridge uses Node 24
type stripping; browser/Worker consumers build the TS modules normally. Python
roof implementations remain offline comparison paths. The TS modules themselves
import no Python, filesystem, emulator, original executable or saved scene.
Structure construction, support preparation, authoring orchestration and some
generic arrangements still depend on Python/native providers. The renderer's
Galacean scene/render-graph integration is also pending; the current backend
borrows the engine WebGL device.

The user approved micro-scale numerical differences subject to structural and
pixel checks. Browser `Math` is not the original platform libm: of 35 recovered
cases (19,005 instances), 31 packed outputs are byte-identical; four have position
differences up to 1.90735e-6 m. The numerical gate permits at most 1e-5 in named
floating fields and requires exact identities, counts, producer roles, ownership,
flags and timelines. It is not a general tolerance on arbitrary scene JSON.
Independent pixel checks are required before promotion. This does not establish
cross-browser numerical identity or full-game equivalence.

Verification commands, from this directory:

```sh
node --test tests/roof-runtime.test.mjs tests/runtime-kernel.test.mjs
python3 tests/verify_ts_roof.py --output /absolute/new/evidence-directory
```

The second command uses retained recovered Python mathematics as an **offline
oracle**, not as a runtime fallback. `tests/roof-portability.worker.ts` bundles
for the browser and is exercised by `tests/roof-portability.html`; its fixture
comes from that offline verifier. `tests/verify_runtime_kernel.py` separately
checks four actual compiler/exporter cases, and `tests/direct-buffer.html` checks
pixel parity, material changes and local hiding under the readback guard.

This framework uses geometry, arrangement rules and material units as independent
authoring concepts. It has no Cozy dependency or Cozy compatibility layer.

## Ownership and API

- **Geometry** owns shape, metric coordinates and stable identity. Construction
  parameters produce wall/roof domains. A connection domain references its
  participants; it is not a second copy of their geometry.
- **Rule** produces logical placements, fragments, clipping predicates and
  dependencies. It consumes geometry, footprint and seed, not the material name.
- **Unit** supplies a template and its instance/shader adapter. Changing a unit
  keeps the placement footprint, rule and seed. Roof tile, brick and wooden plank
  variants are prepared in the resident package.
- **Overrides** are persistent intent on a binding and a region in its metric
  domain. They do not address vertex indices or transient fragment IDs. The
  compiler normalizes logical anchors through the existing provider's anchor
  owner; the renderer never reconstructs anchors from clipped polygons.

The authoring document retains the provider's version-2 contract:

```js
{
  version: 2,
  construction: { /* stable building identities and shape parameters */ },
  geometries: [{ id: "tower-roof", source: { type: "building_roof", building_id: "tower" } }],
  bindings: [{
    id: "roof-cover", geometry_id: "tower-roof",
    rule: { type: "overlap_rows" },
    footprint: { width: 0.5, height: 0.4375, depth: 0.1 },
    seed: "source", unit_id: "roof_tile"
  }],
  overrides: [{
    id: "repair", binding_id: "roof-cover",
    region: { space: "surface_uv", polygon: [[2,.4],[4,.4],[4,1.4],[2,1.4]] },
    effect: { unit_id: "brick" }
  }]
}
```

This is an excerpt, not a complete construction document. The laboratory JSON
editor exposes complete validated examples. LLMs edit this document through the
same API as the UI; they never edit generated buffers.

Local HTTP requests use `X-Lab-Workspace: round-gothic`:

1. `GET /api/project` reads saved intent and `document_revision`.
2. `POST /api/project` with `{document, expected_revision}` validates and saves
   a draft. Saving does not publish it.
3. `GET /api/resident/state` reads published intent and its immutable cache URL.
4. If geometry, footprint, seed or rule changed, `POST /api/resident/compile`
   with `{document_revision, cache_sha256}` prepares a candidate. The caller loads
   that candidate and applies its document before publication.
5. `POST /api/resident/publish` with the same pair publishes only that document
   revision and compatible cache. The UI swaps the canvas after successful
   preparation. Failure leaves the previous scene visible and the draft saved.
6. Material and region changes reuse the current cache, resolve selection indices
   and upload only changed selection masks/index textures. `POST /api/resident/camera` updates
   view constants without geometry compilation.

Automatic roof edges are derived by the rule. An optional independent connection
binding (`roof_boundaries` + `roof_boundary_assembly`) changes ownership of the
same cells. Its material wins over parent material; parent hiding still propagates
through closure dependencies. Roof intersections use participating roof geometry
and its clipping; they do not invent a separate strip of tiles. Connection intent
is retained when a different rule produces no cells and resumes on regeneration.

## Implementation and scope

`runtime/` owns document resolution, camera ABI and a persistent WebGL2 backend.
`tools/compile_resident.py --gpu-feedback` generates logical placements and initial
64-byte roof records. Circular/rectangular placement, support geometry, edge
closure, dormer spatial bins and ABI packing use recovered arithmetic in this repository. No roof
gravity readback is used to create editing anchors. `roof_anchors.py` prepares
projection invariants once and preserves the previous UV/tie policy exactly.

`EngineRoofFeedback.ts` uses the engine overlay implementation from
[Galacean PR #3071](https://github.com/galacean/engine/pull/3071), pinned to
`d8c9b3d32efd824953797d204fb1485103b55716`. Its
`TransformFeedbackSimulator → TransformFeedbackPrimitive → GLTransformFeedbackPrimitive`
path owns ping-pong storage and GPU copies. The output `readBinding.buffer` is
bound directly as four `uvec4` instance attributes on the same engine device;
there is no intermediate download or instance-texture upload. A thin `UInt4`
vertex-format extension preserves packed ABI bits, including NaN-like bit patterns.
Original roof vertex deformation and fragment clipping consume those records.
Particle and realtime SH consumers are migrated with the generic PR API, not
maintained as a second feedback implementation.
`export_resident.py` packages original templates, instance data and shader ports
without loading diagnostic images or expanded vertex buffers. `lab_server.py`
owns workspace revisions, immutable candidates and atomic publication.

Source and the PR feedback engine are in engine-next under `world/`. The
recovered material-shader renderer borrows that same WebGL device and buffer;
its draw submission is not yet a Galacean MeshRenderer/render-graph integration. Recovered CPU
producers and extracted assets remain an explicit local provider outside this
repository. This is not a claim that every Tiny Glade algorithm has been moved.

The admitted construction path is the round/rectangular pitched-roof example with
Gothic dormer, native masonry/plaster/frame/glass and generic roof bindings.
Visible floors, structural timber, foundation/autoclutter and other decorator
families are rejected when not supported; they are not silently replaced by Cozy.
Arbitrary free wall/curve bindings are not yet admitted by this resident compiler.
Wood uses the recovered zero-pointer window-cut specialization with a separate
Gothic roof-domain clipping adapter. Local runtime edits currently use nonperiodic
`surface_uv`; curve and periodic selectors require further adapters.

The renderer uploads templates once per package and draws compact instances.
Materials/local edits preserve that context. A new geometry package is prepared
in a new context before replacing the old one; cross-package GPU reuse is not
implemented. The original house workspace is preserved with its existing display
path; the new round-Gothic workspace rejects the old diagnostic render endpoint.

Normal feedback generation and resident rendering have no GPU-to-CPU state,
image, depth or vertex readback. CPU design anchors and GPU animation state have
separate owners. The preserved 60-step initialization is our existing extraction
timeline, not evidence that Tiny Glade waits 60 frames before showing a house.
Optional asynchronous GPU timer-query results are instrumentation, not image
readback. `feedbackSubmitMs` measures CPU submission; `feedbackGpuMs` measures
GPU execution. `uploadMs` includes feedback preparation and must not be added to
`feedbackSubmitMs` as independent time. `engineInitMs` includes loading the engine
bridge; `loadTotalMs` covers the full renderer load.

New wall/Gothic/structure construction still uses the explicitly configured
native CPU provider. `construction_cache.py` caches immutable source bundles by
construction, stable identity order, provider/runtime and actual input hashes.
Rule/material/region edits do not invalidate construction. Cache hits verify
referenced artifacts; failed builds never publish an index. This removes repeated
construction without pretending that all native CPU producers are ported. `demos/tiny-glade-resident/audit.js` is an explicit, separate
pixel-readback harness and is not served by the normal laboratory endpoint.

## Local execution

Use an already configured local investigation (`I`) and Pillow-capable server/export
Python. The server invokes the provider-selected compiler Python (3.9.6 in this
verification); keep that runtime for exact persisted UV parity. The construction
cache includes Python/runtime identity. A different Python version can change
floating summation even when packed GPU assets are identical:

```sh
python3 tools/export_resident.py "$I" "$CURRENT_JSON" "$ASSETS"
node tools/build-feedback.mjs "$ENGINE_ASSETS"
python3 tools/lab_server.py --provider "$I/surface-layout" --assets "$ASSETS" \
  --session-dir "$ORIGINAL_SESSION" --example-session "$ROUND_SESSION" --port 8769 \
  --gpu-feedback --engine-assets "$ENGINE_ASSETS"
```

Build the bridge after the official world engine materialization and module
build described in `world/README.md`. Compile new initial packages with
`compile_resident.py --gpu-feedback`; the normal server requires the matching
bridge directory. The no-flag compiler path remains an explicit comparison path,
not a second runtime feedback backend.

The initial assets directory also needs the selected scene's `lab-scene.json` and
precomputed material variants (`prepare_variants.py`). The exporter records the
explicit extraction resource directory; compilation does not infer it from a
workspace snapshot path. Assets, evidence and generated binaries stay outside Git.

Run contract comparisons against the actual retained provider:

```sh
python3 tests/verify_recovered_contract.py "$I/surface-layout" "$ASSETS/scene.json" "$FIXTURE"
TG_CONTRACT_FIXTURE="$FIXTURE" node --test tests/contract.test.mjs
```

See [ACCEPTANCE.md](ACCEPTANCE.md) for measured results and limits.

### First construction scheduling

`compile_resident.py --gpu-feedback` uses `resident_construction.build`. It keeps
original CPU topology and stable owner IDs while removing full block tracing,
repeated platform/support audit work and redundant trigger preparation. The
request-owned `construction_runtime` dispatches only ABI, shim and guard events;
its provenance explicitly does not claim full executed-block coverage. The
original provider remains unchanged for oracle comparisons.

`construction_decorators` reuses exact recovered roof trigger streams within the
same source owner and invalidates them on Roof88 changes. `recovered_roof_prepare`
produces initial instances and the original static animation timeline directly;
PR3071 feedback still owns gravity, with its output buffer rendered directly.
Gothic blueprint generation, collision dependencies and variable wall topology
remain CPU work. No GPU readback is introduced to satisfy those consumers.

Construction cache identity includes the selected builder, bound parameters,
product modules, provider sources, binary/runtime and observed inputs. Repeated
unchanged file reads reuse a digest only while their stat identity is unchanged;
all observed file identities are checked again before publication; changed signatures are rehashed. Material and local
edits continue to reuse the published placement package.

For a fresh, no-output-cache comparison of the full production boundary:

```sh
"$ORACLE_PYTHON" tests/verify_structure_generation.py \
  --provider "$I/surface-layout" --document "$DOCUMENT" \
  --baseline "$BASELINE" --resources "$RESOURCES" \
  --export-python "$EXPORT_PYTHON" --output "$NEW_PRIVATE_OUTPUT"
```

This verifies all exported GPU resource hashes, programs, arrangement identities,
edit anchors and material variants against the original construction provider.


### Portable geometry and material kernels (2026-10-15)

`runtime/SurfaceProjector.js` owns validation and metric projection for plane and
triangulated charts. `new SurfaceProjector(geometry).anchors(points)` preserves
finite-patch ranking, seam ties and unclamped authoring UVs. A prepared chart is
reused; changing geometry creates a new owner. This is framework chart math,
not an assertion that Tiny Glade uses this implementation.

`runtime/UnitPacking.js` exposes `packUnits({cells, slot, roof_design?})`, returning
`Uint8Array` buffers for roof tiles, bricks and wooden planks from the same logical
placements. Initial roof state is validated against its geometry before packing.
Captured source metadata requires the explicit offline adapter and is rejected by
this runtime API. Both modules run directly in browsers/workers and have no Python,
Node, filesystem, original binary or emulator imports.

The recovery compiler currently invokes these modules through a single
request-owned `runtime_kernel.py` / `runtime-kernel.mjs` process bridge. Messages
stay in memory; material encoding no longer launches a Python child or writes
three duplicate cell documents per group. The Python projector and encoder remain
only as comparison/offline paths. The baseline construction document is normalized
through the same owner as submitted intent before deciding whether to regenerate;
f32 normalization alone must not trigger a new native build.

The server reuses its explicitly selected prepared texture package. New manifests
may contain `sharedAssets: {baseUrl, files}` for content-addressed immutable data;
`ResidentRenderer` resolves those files from that asset owner. Existing manifests
without shared assets continue to load. Keep the configured initial asset package
available while its derived publications exist. Shared bytes are hash-verified
before export; texture decoding and static copies are outside the edit path.

**The full construction pipeline is not yet standalone.** Wall/Gothic topology,
other generic arrangement producers and recovery orchestration still require the
configured Python/native provider. This change removes specific runtime costs and
makes two kernels reusable in the project; it is not a complete removal of Python.
A production browser-only framework still needs those producers ported and the
recovery coordinator replaced. The renderer and the two portable kernels already
run without that provider once their inputs/assets have been supplied.

Checks: `node --test tests/runtime-kernel.test.mjs`; `tests/verify_runtime_kernel.py`
compares real exported packages and anchors against retained native cases;
`tests/kernel-portability.html` executes the same modules directly in a browser.
Audit pages remain separate from normal application rendering.


Verified construction fingerprints are persisted across recovery processes. Each
reuse checks device, inode, size, mtime and ctime. Changed/replaced inputs are
hashed again; failed builds do not publish fingerprint updates. This is local
edit-time cache validation, not a forensic re-audit of unchanged content. Equal
size plus a restored mtime does not bypass ctime/inode invalidation.
