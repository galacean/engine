import { unionRectangles } from "./ComposedShape";
import { envelope } from "./IslandPlanAtoms";
import type { PlanPoint, PlanRock } from "./IslandPlanModel";
import { contains, overlap, ringArea } from "./WorldPlanningGeometry";

/**
 * Returns dense occupancy rings derived from accepted rocks, without bridging
 * distant members. Each edge has at most 10% of the rock's short side (12 m)
 * of margin, reduced at the coast, water and occupied places. Terrain influence
 * is intentionally independent of this footprint.
 */
export function mountainDensityFootprints(
  rocks: PlanRock[],
  land: PlanPoint[],
  exclusions: PlanPoint[][]
): PlanPoint[][] {
  const blocks = rocks.map((rock) => {
    const block = {
      id: rock.id,
      ...rock.center,
      width: rock.width,
      length: rock.depth,
      yaw: (rock.yaw * 180) / Math.PI
    };
    const padding = Math.min(12, Math.min(rock.width, rock.depth) * 0.1);
    for (const factor of [1, 0.5, 0.25, 0.125, 0]) {
      const candidate = {
        ...block,
        width: block.width + padding * factor * 2,
        length: block.length + padding * factor * 2
      };
      const ring = envelope(rock.center, candidate.width, candidate.length, rock.yaw);
      if (contains(land, ring) && !exclusions.some((other) => overlap(ring, other))) return candidate;
    }
    // Never drop a solid already accepted by the layout's physical checks.
    return block;
  });
  return unionRectangles(blocks).sort((a, b) => ringArea(b) - ringArea(a));
}
