import type { PlotState } from "../../domain/FarmState";
import { WATER_DIRECTIONS } from "../../domain/fields/SoilWaterField";

type Cell = Pick<PlotState, "plotId" | "groundId" | "cellX" | "cellZ">;
type MoistureCell = Cell & { readonly ground: Pick<PlotState["ground"], "waterMask"> };

/** Connect only the temporary visual cell; persisted water connectivity stays untouched. */
function withPreview(plots: readonly PlotState[], preview?: Cell): readonly MoistureCell[] {
  if (!preview || plots.some((plot) => plot.plotId === preview.plotId)) return plots;
  let mask = 0;
  const opposite = [1, 0, 3, 2];
  const cells: MoistureCell[] = plots.map((plot) => {
    if (plot.groundId !== preview.groundId || plot.ground.availability !== "available") return plot;
    const direction = WATER_DIRECTIONS.findIndex(
      ([x, z]) => plot.cellX === preview.cellX + x && plot.cellZ === preview.cellZ + z
    );
    if (direction < 0) return plot;
    mask |= 1 << direction;
    return {
      ...plot,
      ground: { ...plot.ground, waterMask: (plot.ground.waterMask ?? 0) | (1 << opposite[direction]) }
    };
  });
  return [...cells, { ...preview, ground: { waterMask: mask } }];
}

/** Each stencil has nine lists of contributors, in row-major order from (-X,-Z). */
export function buildMoistureStencils(
  plots: readonly PlotState[],
  preview?: Cell
): Map<string, readonly (readonly string[])[]> {
  const cells = withPreview(plots, preview);
  const key = (g: string, x: number, z: number) => JSON.stringify([g, x, z]);
  const byCell = new Map(cells.map((p) => [key(p.groundId, p.cellX, p.cellZ), p]));
  const opposite = [1, 0, 3, 2];
  const connected = (p: MoistureCell, q: MoistureCell) => {
    const d = WATER_DIRECTIONS.findIndex(([x, z]) => q.cellX - p.cellX === x && q.cellZ - p.cellZ === z);
    return (
      d >= 0 && Boolean((p.ground.waterMask ?? 0) & (1 << d)) && Boolean((q.ground.waterMask ?? 0) & (1 << opposite[d]))
    );
  };
  const shared = new Map<string, readonly string[]>();
  const result = new Map<string, readonly (readonly string[])[]>();
  for (const p of cells) {
    const samples: (readonly string[])[] = [];
    for (let z = -1; z <= 1; z++)
      for (let x = -1; x <= 1; x++) {
        const candidates = [p];
        for (const [dx, dz] of [
          [x, 0],
          [0, z],
          [x, z]
        ]) {
          const q = byCell.get(key(p.groundId, p.cellX + dx, p.cellZ + dz));
          if (q && !candidates.includes(q)) candidates.push(q);
        }
        const visited = new Set([p]);
        for (const a of visited) for (const b of candidates) if (!visited.has(b) && connected(a, b)) visited.add(b);
        const ids = [...visited].map((v) => v.plotId).sort();
        const sampleKey = JSON.stringify(ids);
        const contributors = shared.get(sampleKey) ?? ids;
        shared.set(sampleKey, contributors);
        samples.push(contributors);
      }
    result.set(p.plotId, samples);
  }
  return result;
}

/** Missing display nodes use the remaining contributors, never an artificial dry value. */
export function sampleMoisture(
  stencil: readonly (readonly string[])[],
  values: ReadonlyMap<string, number>,
  preview?: { readonly plotId: string; readonly weight: number }
): number[] {
  return stencil.map((ids) => {
    let sum = 0,
      count = 0;
    for (const id of ids) {
      const value = values.get(id);
      if (value !== undefined) {
        const weight = id === preview?.plotId ? preview.weight : 1;
        sum += value * weight;
        count += weight;
      }
    }
    // A preview-only centre keeps its own moisture even at zero visual weight.
    return count ? sum / count : preview && ids.includes(preview.plotId) ? (values.get(preview.plotId) ?? 0) : 0;
  });
}
