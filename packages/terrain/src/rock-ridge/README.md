# Shared mountain features

The ridge study and Seed World use these same runtime algorithms. The study's old
module paths re-export this package; its packer reads this directory directly.
There are no stored mountain layouts or atomic recipes here. A seed creates the
atomic role library and either a spatial ridge graph or a Perlin-derived network.

`createRuntimeMountainBuilder` composes registered shaping and arrangement stages.
Each stage owns its bypass and bounded cache. `atomSeed` optionally lets a world
reuse one seeded atom library across different per-formation topology seeds.
Without it, the scene seed also selects the atomic library.

Seed World's native adapter is
`packages/world-planning/src/integrations/terrain/rock-formation/MountainSurface.ts`.
It uses the current terrain atomic generator, carves and reduces the library once,
fits connected masses, and maps the result into each authored mountain OBB. It
keeps render normals separate from the indexed physics surface, with adjustable
fracture smoothing and the original smooth body field. Shaping
and arrangement are independent. Both off restores the existing atomic path;
shaping alone displays a carved summit in each mountain envelope. Decorative and
streamed stones retain their previous generation path.

The production adapter's Meshopt reduction targets the authoring triangle budget
with relative error capped at 0.0005. Source/cut seams are split during reduction
and welded at GPU position precision for the canonical physics mesh. This is Meshopt's estimate, not a guaranteed
Hausdorff bound; it selects existing vertices, with Float32 rounding for the native upload. The study retains unreduced carving
output for comparison. The triangle target is soft when preserving seams at this
error limit: the eight seed-1 atoms use 1,162–1,216 triangles at a 1,000 target.
Arrangement remains overlap-based assembly, not a Boolean union of every mass.

Native controls are saved through the `rockFormation` component and its native
scene properties. In Seed World debug mode open **05 Rocks > Rock formation**:

- **Mountain arrangement**: enable arrangement, choose seeded or manual counts,
  or use Perlin frequency/octave controls. Manual counts apply to direct growth;
  Perlin topology is extracted from the field.
- **Mountain shaping**: independently enable sharp-face carving and tune fracture
  depth, width, irregularity, and normal smoothing (0–1, default 0.65).
- **Apply formation settings** publishes through the existing worker transaction.
- **Individual OBB** controls width, height, and depth; **View selected mountain**
  frames the selected surface without changing its geometry.
- **Generation** reports the last publication's wall time and the CPU timings
  attached to its resident meshes (including reused meshes).

Flags default off for compatibility with existing worlds. They persist per world
once enabled. Preview: `/world/demos/seed-world/index.html?seed=1&template=original&debug=1&view=3d`.

## Rounded source bodies

Runtime recipes retain broad crowns and shoulders, near the original atomic
profile. Peak is a fitting role, not a needle-shaped mesh template. Live carving
has no whole-body planar hull cuts: it samples the source surface for each
vertical joint and removes only a local wedge. The connected cutter ends remain
outside the body, so no horizontal end cap can become a shelf. Zero depth or
width retains the exact source positions and indices.

Body normals are interpolated from the original atomic triangles at new Boolean
vertices. Cutter faces start with hard plane normals. `rock-normals.mjs` blends
fracture-adjacent corner normals toward an angle-weighted shared normal; 0 retains
hard cuts, 1 fully smooths their lighting. Pure body vertices are unchanged.
This render-only stage changes no positions, topology, bounds, collision, or
arrangement and is excluded from the carving/fitting cache keys. The native
adapter applies the inverse-transpose normal transform through each fitted
stretch and OBB scale. The study updates existing GPU normal buffers live;
Seed World publishes the setting through its normal Apply transaction.
