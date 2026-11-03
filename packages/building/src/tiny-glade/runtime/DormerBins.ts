/** Original 0x101150834..0x101150ac8 spatial upload; caller order and duplicates
 * retained. Physical capacity 50, original admitted count 49, no slot filtering. */
import { f32, add, sub, mul, div } from "./RecoveredRoofMath";
export const DORMER_GRID_SIZE = 15,
  DORMER_BIN_CAPACITY = 50,
  DORMER_ADMITTED_COUNT = 49;
const CELL_WIDTH = f32(8.666666984558105);
export type DormerGrid = [number, number, number, number];
export const NATIVE_DORMER_GRID: DormerGrid = [-65, -65, f32(0.11538460850715637), f32(0.11538460850715637)];
function dormerBounds(record: Uint8Array) {
  if (record.byteLength !== 48) throw Error("Dormer record must be 48 bytes");
  const v = new DataView(record.buffer, record.byteOffset, 48),
    [x, z, width, depth, ox, oz] = [0, 8, 16, 24, 32, 36].map((i) => v.getFloat32(i, true));
  if (![x, z, width, depth, ox, oz].every(Number.isFinite) || width < 0 || depth < 0)
    throw Error("Invalid finite dormer geometry");
  const hw = mul(width, 0.5),
    hd = mul(depth, 0.5),
    dx = add(mul(hw, Math.abs(ox)), mul(hd, Math.abs(oz))),
    dz = add(mul(hd, Math.abs(ox)), mul(hw, Math.abs(oz)));
  return { min: [sub(x, dx), sub(z, dz)], max: [add(x, dx), add(z, dz)] };
}
export function dormerSelectedBins(record: Uint8Array, grid?: DormerGrid): number[] {
  const bounds = dormerBounds(record);
  const index = (x: number, axis: number) => {
    const v = grid ? mul(sub(x, grid[axis]), grid[axis + 2]) : div(add(x, 65), CELL_WIDTH);
    if (!Number.isFinite(v)) throw Error("Dormer bin intermediate exceeds finite f32");
    return Math.max(-0x80000000, Math.min(0x7fffffff, Math.floor(v)));
  };
  const xmin = Math.max(0, index(bounds.min[0], 0)),
    xmax = Math.min(14, index(bounds.max[0], 0)),
    zmin = Math.max(0, index(bounds.min[1], 1)),
    zmax = Math.min(14, index(bounds.max[1], 1)),
    out: number[] = [];
  for (let row = zmin; row <= zmax; row++) for (let col = xmin; col <= xmax; col++) out.push(row * 15 + col);
  return out;
}
export function encodeDormerBins(records: readonly Uint8Array[], grid?: DormerGrid) {
  const counts = new Uint32Array(225),
    holes = new Uint8Array(225 * 50 * 48),
    overflow: number[] = [];
  let droppedAssignments = 0;
  records.forEach((record) => {
    for (const bin of dormerSelectedBins(record, grid)) {
      if (counts[bin] === 49) {
        droppedAssignments++;
        if (!overflow.includes(bin)) overflow.push(bin);
        continue;
      }
      holes.set(record, (bin * 50 + counts[bin]) * 48);
      counts[bin]++;
    }
  });
  return {
    counts,
    holes,
    report: {
      inputCount: records.length,
      physicalCapacity: 50,
      admittedCount: 49,
      droppedAssignments,
      overflowBins: overflow,
      policy: "Original first-49 per spatial bin; later assignments dropped, duplicates retained",
      occupiedBins: Array.from(counts, (count, bin) => ({ bin, count })).filter((x) => x.count)
    }
  };
}

/** The native bins are local to a fixed 130 m domain. Host-authored groups may
 * extend beyond it. Keep the native addressing exactly for in-domain content;
 * otherwise derive one shared CPU/GPU address transform from every hole bound.
 * Hole coordinates, cubic clipping and first-49 capacity remain unchanged. */
export function encodeConstructionDormerBins(records: readonly Uint8Array[]) {
  const lo = [-65, -65],
    hi = [65, 65];
  for (const record of records) {
    const bounds = dormerBounds(record);
    for (let axis = 0; axis < 2; axis++) {
      if (bounds.min[axis] < lo[axis]) lo[axis] = sub(bounds.min[axis], 1);
      if (bounds.max[axis] >= hi[axis]) hi[axis] = add(bounds.max[axis], 1);
    }
  }
  const native = lo[0] === -65 && lo[1] === -65 && hi[0] === 65 && hi[1] === 65;
  const grid: DormerGrid = native
    ? [...NATIVE_DORMER_GRID]
    : [lo[0], lo[1], div(15, sub(hi[0], lo[0])), div(15, sub(hi[1], lo[1]))];
  if (!grid.every(Number.isFinite) || grid[2] <= 0 || grid[3] <= 0)
    throw Error("Dormer grid exceeds finite address domain");
  return { ...encodeDormerBins(records, native ? undefined : grid), grid };
}

/** A candidate must not publish geometry whose native GPU holes would be lost.
 * The original first-49 encoder stays available for original-format replay. */
export class DormerBinCapacityError extends Error {
  readonly report: ReturnType<typeof encodeConstructionDormerBins>["report"];
  constructor(report: ReturnType<typeof encodeConstructionDormerBins>["report"]) {
    super(
      `Roof attachment clipping exceeds the native ${DORMER_ADMITTED_COUNT}-hole spatial-bin capacity (${report.droppedAssignments} dropped assignments in ${report.overflowBins.length} bins); placement was not published`
    );
    this.report = report;
  }
}
export function encodeCompleteConstructionDormerBins(records: readonly Uint8Array[]) {
  const bins = encodeConstructionDormerBins(records);
  if (bins.report.droppedAssignments) throw new DormerBinCapacityError(bins.report);
  return bins;
}
