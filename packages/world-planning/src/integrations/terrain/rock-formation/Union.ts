import type { loadSolidAPI } from "@galacean/engine-terrain/rock-formation/generator/solid-api.js";
type SolidAPI = Awaited<ReturnType<typeof loadSolidAPI>>;
import { readSolidSurface } from "@galacean/engine-terrain/rock-formation/generator/solid-surface.js";
import { buildRockGrassSurface } from "@galacean/engine-terrain/rock-formation/GrassSurface";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";

/** One Boolean exterior, partitioned back into owner patches for existing editing,
 * tile metres and material lifetimes. Patches have no hidden/interpenetrating faces.
 * Coordinates stay group-local during the Boolean to retain Float32 precision.
 */
export function unionRockFormations(inputs: RockFormationMesh[], api: SolidAPI): RockFormationMesh[] {
  const started = performance.now(),
    origin = inputs[0].origin;
  const originals = new Map<number, { input: number; owner: string }>();
  const solids: InstanceType<SolidAPI["Manifold"]>[] = [];
  try {
    for (const [i, formation] of inputs.entries()) {
      const { mesh, grass } = formation,
        properties = new Float32Array((mesh.positions.length / 3) * 7);
      for (let v = 0; v < mesh.positions.length / 3; v++) {
        for (let k = 0; k < 3; k++) properties[v * 7 + k] = mesh.positions[v * 3 + k] + formation.origin[k] - origin[k];
        properties.set(mesh.normals!.subarray(v * 3, v * 3 + 3), v * 7 + 3);
      }
      if (grass) for (let c = 0; c < mesh.indices.length; c++) properties[mesh.indices[c] * 7 + 6] = grass.coverage[c];
      const ownerIDs = new Map<string, number>(),
        runIndex: number[] = [],
        runOriginalID: number[] = [];
      let previous: string | undefined;
      formation.owners.forEach((owner, t) => {
        if (owner === previous) return;
        previous = owner;
        if (!ownerIDs.has(owner)) {
          const id = api.Manifold.reserveIDs(1);
          ownerIDs.set(owner, id);
          originals.set(id, { input: i, owner });
        }
        runIndex.push(t * 3);
        runOriginalID.push(ownerIDs.get(owner)!);
      });
      runIndex.push(mesh.indices.length);
      solids.push(
        new api.Manifold(
          new api.Mesh({
            numProp: 7,
            vertProperties: properties,
            triVerts: mesh.indices,
            runIndex: new Uint32Array(runIndex),
            runOriginalID: new Uint32Array(runOriginalID)
          })
        )
      );
    }
    const combined = api.Manifold.union(solids);
    solids.push(combined);
    const surface = readSolidSurface(combined, new Set(originals.keys()));
    const parts = inputs.map(() => ({
      positions: [] as number[],
      normals: [] as number[],
      coverage: [] as number[],
      indices: [] as number[],
      owners: [] as string[],
      remap: new Map<number, number>()
    }));
    for (let t = 0; t < surface.sourceIDs.length; t++) {
      const source = originals.get(surface.sourceIDs[t]);
      if (!source) throw Error("Boolean exterior lost rock ownership");
      const part = parts[source.input],
        formation = inputs[source.input];
      part.owners.push(source.owner);
      for (let corner = 0; corner < 3; corner++) {
        const v = surface.indices[t * 3 + corner];
        let dest = part.remap.get(v);
        if (dest === undefined) {
          dest = part.positions.length / 3;
          part.remap.set(v, dest);
          for (let k = 0; k < 3; k++)
            part.positions.push(surface.positions[v * 3 + k] + origin[k] - formation.origin[k]);
          part.normals.push(...surface.normals.subarray(v * 3, v * 3 + 3));
          part.coverage.push(surface.surfaceRoles[v]);
        }
        part.indices.push(dest);
      }
    }
    const result = parts.map((part, i): RockFormationMesh => {
      const source = inputs[i];
      const ownerTriangles = new Map<string, number>();
      for (const owner of part.owners) ownerTriangles.set(owner, (ownerTriangles.get(owner) ?? 0) + 1);
      const formation: RockFormationMesh = {
        ...source,
        mesh: {
          positions: new Float32Array(part.positions),
          normals: new Float32Array(part.normals),
          indices: new Uint32Array(part.indices)
        },
        owners: part.owners,
        grass: undefined,
        stats: {
          ...source.stats,
          vertices: part.positions.length / 3,
          overBudgetBodies: source.stats.targetTriangles
            ? [...ownerTriangles.values()].filter((count) => count > source.stats.targetTriangles!).length
            : source.stats.overBudgetBodies,
          unionInputTriangles: source.mesh.indices.length / 3,
          unionMs: 0
        }
      };
      if (source.grass)
        formation.grass = buildRockGrassSurface(formation, formation.mesh.normals!, new Float32Array(part.coverage));
      return formation;
    });
    const unionMs = performance.now() - started;
    // Account once per group, not once per exterior patch.
    result[0].stats.unionMs = unionMs;
    result[0].stats.generationMs += unionMs;
    return result;
  } finally {
    solids.reverse().forEach((solid) => solid.delete());
  }
}
