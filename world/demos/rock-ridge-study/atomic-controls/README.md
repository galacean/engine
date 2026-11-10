# Atomic rock parameter controls

Open `index.html` through the same local HTTP server as the ridge study:
`http://127.0.0.1:8771/atomic-controls/`. The generated page is checked in and only
loads pinned Three.js from the approved CDN. The inline fragment contains the
generator, embedded meshoptimizer WASM, controls and renderer; it performs no API
requests or model downloads.

Choose one of 27 parameters and drag its slider. With **Combine changes** off,
the other values use the upstream defaults. With it on, all retained slider
values participate. Selecting another parameter never resets the orbit angles.
The OBB and metre scale provide a reference as the camera frames changing sizes.

- Shape controls run the exact upstream generator at commit
  `b2887feee34df433303d1c3197a679e4c219367d`. The copied modules are unmodified;
  [upstream.json](upstream.json) records their Git blob IDs. Both upstream and
  meshoptimizer licenses are retained and embedded in the generated fragment.
- An isolated `topDirection` uses a 20-degree roof so rotation has a visible
  effect. `topScale` retains the upstream 0.08 minimum. `wallStagger` is accepted
  but unused upstream; its slider intentionally leaves geometry unchanged.
- Selecting resolution shows the source mesh and wireframe. Selecting a triangle
  target or error shows the reduced mesh. Isolated error uses no triangle target.
  A quality fallback can exceed the target; the result reports this directly.
- Normal strength, roughness, hue and grass are illustrative material/coverage
  controls. The stone uses procedural grain rather than Seed's texture maps, and
  the grass is a small instanced cap preview rather than the Seed grass runtime.
  Neither changes the measured rock mesh.

Generation is queued in an embedded Worker, with a main-thread fallback where
Workers are unavailable. Only the latest requested revision is displayed. The
Worker retains its source mesh for reduction-only changes and transfers owned
copies so the cache cannot become detached. An input debounce coalesces slider
movement. State restores from the host; state echoes do not reapply camera poses.

Run from the repository root:

```sh
node world/demos/rock-ridge-study/atomic-controls/build.mjs
node world/demos/rock-ridge-study/atomic-controls/verify.mjs
```

The focused suite checks 40 shape-control endpoint cases against the upstream
module buffers, finite bounded geometry, inactive stagger behavior, isolated and
combined edits, appearance/geometry independence, source-cache immutability,
resolution changes, effective roof slope and truthful simplification budgets.
The default 200-triangle request retains 252 triangles for quality; the 1,000
request returns 1,000, while a 5,000 ceiling uses 1,196 rather than filling the
allowance. See [validation.json](validation.json).

Browser checks at 736 px and 320 px covered narrowing the crown, face count,
requested/effective roof slope, combined dimensions, source/reduced mesh,
wireframe and grass/material preview. No JavaScript or shader errors were
observed. Native drag automation did not establish a visible orbit gesture;
gesture-level orbit acceptance remains unverified.
