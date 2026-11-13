# Shared mountain features

The ridge study and Seed World use these same runtime algorithms. The study's old
module paths re-export this package; its packer reads this directory directly.
There are no stored mountain layouts or atomic recipes here. A seed creates the
atomic role library and either a spatial ridge graph or a Perlin-derived network.

`createRuntimeMountainBuilder` composes registered shaping and arrangement stages.
Each stage owns its bypass and bounded cache. `atomSeed` optionally lets a world
reuse one seeded atom library across different per-formation topology seeds.
Without it, existing study output remains unchanged.

Seed World's native adapter is
`packages/world-planning/src/integrations/terrain/rock-formation/MountainSurface.ts`.
It uses the current terrain atomic generator, carves and reduces the library once,
fits connected masses, and maps the result into each authored mountain OBB. It
keeps per-corner sharp normals separate from the indexed physics surface. Shaping
and arrangement are independent. Both off restores the existing atomic path;
shaping alone displays a carved summit in each mountain envelope. Decorative and
streamed stones retain their previous generation path.

The production adapter's Meshopt reduction targets the authoring triangle budget
with relative error capped at 0.0005. This is Meshopt's estimate, not a guaranteed
Hausdorff bound; it never displaces vertices. The study retains unreduced carving
output for comparison. Arrangement remains overlap-based assembly, not a Boolean
union of every mass.

Native controls are saved through the `rockFormation` component and its native
scene properties. In Seed World debug mode open **05 Rocks > Rock formation**:

- **Mountain arrangement**: enable arrangement, choose seeded or manual counts,
  or use Perlin frequency/octave controls. Manual counts apply to direct growth;
  Perlin topology is extracted from the field.
- **Mountain shaping**: independently enable sharp-face carving and tune fracture
  depth, width, and irregularity.
- **Apply formation settings** publishes through the existing worker transaction.
- **Individual OBB** controls width, height, and depth; **View selected mountain**
  frames the selected surface without changing its geometry.
- **Generation** reports the last publication's wall time and the CPU timings
  attached to its resident meshes (including reused meshes).

Flags default off for compatibility with existing worlds. They persist per world
once enabled. Preview: `/world/demos/seed-world/index.html?seed=1&template=original&debug=1&view=3d`.
