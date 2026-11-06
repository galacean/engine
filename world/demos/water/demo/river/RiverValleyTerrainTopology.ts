import type { WaterTerrainSnapshot } from "@galacean/engine-water/water/index";

/** Compact only the retained native cells; their diagonal and height samples stay unchanged. */
export function createRiverValleyTerrainTopology(
  terrain: Pick<WaterTerrainSnapshot, "columns" | "rows">,
  cells: readonly number[]
) {
  const sampleIndices: number[] = [];
  const indices: number[] = [];
  const vertices = new Map<number, number>();
  const edges = new Map<string, readonly [number, number]>();
  const seen = new Set<number>();
  const cellColumns = terrain.columns - 1;
  const cellCount = cellColumns * (terrain.rows - 1);
  const vertex = (sample: number) => {
    let index = vertices.get(sample);
    if (index === undefined) {
      index = sampleIndices.length;
      vertices.set(sample, index);
      sampleIndices.push(sample);
    }
    return index;
  };
  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cellCount || seen.has(cell))
      throw new Error("河谷地形裁切单元无效。");
    seen.add(cell);
    const sample = Math.floor(cell / cellColumns) * terrain.columns + (cell % cellColumns);
    const a = vertex(sample),
      b = vertex(sample + 1);
    const c = vertex(sample + terrain.columns),
      d = vertex(sample + terrain.columns + 1);
    indices.push(a, c, b, b, c, d);
    for (const [from, to] of [
      [a, c],
      [c, d],
      [d, b],
      [b, a]
    ]) {
      const opposite = `${to}:${from}`;
      if (edges.has(opposite)) edges.delete(opposite);
      else edges.set(`${from}:${to}`, [from, to]);
    }
  }
  if (indices.length === 0) throw new Error("河谷地形裁切范围为空。");
  return { sampleIndices, indices, boundaryEdges: [...edges.values()] };
}
