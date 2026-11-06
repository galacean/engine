/** Recovered 0x100929110 spawn_stitches from pinned Tiny Glade macOS binary
 * 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * Candidate generation, BrickInstance encoding and beam material packing are
 * separate producers. No original executable, emulator or cached scene is used. */
import { add, sub, mul, div, sqrt, RoofRandom, randomSplits, quaternionAxes, f32 } from "./RecoveredRoofMath";
import type { WallStitchCandidate, WallStitchPlacement } from "./WallConnectionTypes";
import { IDENTITY_UNIT_SCALE } from "./MaterialFootprint";

export function generateWallConnectionStitches(candidates: readonly WallStitchCandidate[]): WallStitchPlacement[] {
  const out: WallStitchPlacement[] = [];
  candidates.forEach((c, index) => {
    const scale = c.unitScale ?? IDENTITY_UNIT_SCALE;
    if (c.tag & 1 && c.endpointDistance < mul(0.2, scale.width)) return;
    const x = add(c.directions[0][0], c.directions[1][0]);
    const z = add(c.directions[0][1], c.directions[1][1]);
    const inv = div(1, sqrt(add(mul(x, x), mul(z, z))));
    if (!Number.isFinite(inv)) throw Error("Opposed stitch directions require a resolved native candidate");
    const nx = mul(x, inv),
      nz = mul(z, inv);
    const quaternion = quaternionAxes([nz, -0, -nx], [0, 1, 0], [nx, 0, nz]);
    const height = sub(c.maxY, c.minY);
    const base = {
      quaternion,
      direction: [nx, nz] as [number, number],
      wallIds: c.wallIds,
      ...(c.wallSeeds ? { wallSeeds: c.wallSeeds } : {}),
      kinds: c.kinds,
      sourceCandidate: index
    };
    if (c.beam) {
      let side: number;
      if (c.kinds[0] < 2) {
        if (c.kinds[1] < 2) throw Error("Beam candidate has no beam owner");
        side = 1;
      } else if (c.kinds[1] < 2) side = 0;
      else {
        const seeds = c.wallSeeds ?? c.wallIds;
        side = Number(seeds[1] === seeds[0] ? c.wallIds[1] < c.wallIds[0] : seeds[1] < seeds[0]);
      }
      out.push({
        ...base,
        unit: "wooden_plank",
        position: [c.point[0], c.minY, c.point[1]],
        scale: [mul(0.25, scale.width), height, mul(0.3, scale.depth)],
        selectedWallId: c.wallIds[side],
        selectedKind: c.kinds[side]
      });
    } else if (height > mul(0.1, scale.height)) {
      const count = Math.min(1000, Math.max(3, Math.ceil(div(add(height, height), scale.height))));
      const rng = new RoofRandom(BigInt.asUintN(64, (c.wallSeeds ?? c.wallIds)[0] + (c.wallSeeds ?? c.wallIds)[1]));
      const splits = randomSplits(count - 1, div(mul(0.2, scale.height), height), rng);
      let previous = add(mul(height, splits[0]), c.minY);
      for (let i = 1; i < splits.length; ++i) {
        const next = add(c.minY, mul(height, splits[i]));
        const r = rng.next();
        const width = mul(add(mul(sub(mul(r, 0.5), mul(sub(1, r), 0.5)), 0.1), 0.4), scale.width);
        out.push({
          ...base,
          unit: "brick",
          position: [c.point[0], mul(add(next, previous), 0.5), c.point[1]],
          scale: [width, add(sub(next, previous), -mul(0.1, scale.height)), mul(0.3, scale.depth)]
        });
        previous = next;
      }
    }
  });
  return out;
}
