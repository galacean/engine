import type { PlanningHeightmap } from "./PlanningHeightmap";
import type { PlanningAlphamap } from "./PlanningAlphamap";
import type { OceanWaterCompiledTransferV1 } from "@galacean/engine-water/water/runtime/ocean/index";

export interface PlanningRasterSnapshot {
  height: Omit<PlanningHeightmap, "sample">;
  alpha: PlanningAlphamap;
  ocean?: OceanWaterCompiledTransferV1;
}
interface HeightPatch {
  runs: { start: number; heights: Float32Array; encoded: Uint16Array }[];
}
export type PlanningRasterPacket =
  | { kind: "full"; baseId?: number; snapshot: PlanningRasterSnapshot }
  | {
      kind: "patch";
      baseId: number;
      height: HeightPatch;
      alpha?: PlanningAlphamap;
      ocean?: OceanWaterCompiledTransferV1;
      hasOcean: boolean;
    };
function compatible(a: PlanningRasterSnapshot["height"], b: PlanningRasterSnapshot["height"]): boolean {
  return (
    a.resolution === b.resolution &&
    a.spacingX === b.spacingX &&
    a.spacingZ === b.spacingZ &&
    a.decodeOffset === b.decodeOffset &&
    a.decodeScale === b.decodeScale &&
    a.heights.length === b.heights.length &&
    a.encoded.length === b.encoded.length
  );
}
/** Exact patches against an explicitly identified baseline, never against the last received response.
 * Sender and receiver each keep the requested baseline and candidate. No published buffer is mutated.
 */
export class PlanningRasterTransfer {
  private snapshots = new Map<number, PlanningRasterSnapshot>();
  get(id: number | undefined): PlanningRasterSnapshot | undefined {
    return id === undefined ? undefined : this.snapshots.get(id);
  }
  clear(): void {
    this.snapshots.clear();
  }
  private retain(id: number, snapshot: PlanningRasterSnapshot, baseId?: number): void {
    for (const key of this.snapshots.keys()) if (key !== baseId) this.snapshots.delete(key);
    this.snapshots.set(id, snapshot);
  }
  encode(id: number, snapshot: PlanningRasterSnapshot, baseId?: number): PlanningRasterPacket {
    const base = this.get(baseId);
    let packet: PlanningRasterPacket;
    if (!base || !compatible(base.height, snapshot.height)) packet = { kind: "full", baseId, snapshot };
    else {
      const before = base.height,
        after = snapshot.height,
        runs: HeightPatch["runs"] = [];
      if (before.heights !== after.heights || before.encoded !== after.encoded) {
        let i = 0;
        while (i < after.heights.length) {
          if (Object.is(before.heights[i], after.heights[i]) && before.encoded[i] === after.encoded[i]) {
            i++;
            continue;
          }
          const start = i++;
          while (
            i < after.heights.length &&
            (!Object.is(before.heights[i], after.heights[i]) || before.encoded[i] !== after.encoded[i])
          )
            i++;
          runs.push({ start, heights: after.heights.slice(start, i), encoded: after.encoded.slice(start, i) });
        }
      }
      packet = {
        kind: "patch",
        baseId: baseId!,
        height: { runs },
        alpha: snapshot.alpha === base.alpha ? undefined : snapshot.alpha,
        ocean: snapshot.ocean === base.ocean ? undefined : snapshot.ocean,
        hasOcean: !!snapshot.ocean
      };
    }
    this.retain(id, snapshot, baseId);
    return packet;
  }
  decode(id: number, packet: PlanningRasterPacket): PlanningRasterSnapshot {
    if (packet.kind === "full") {
      this.retain(id, packet.snapshot, packet.baseId);
      return packet.snapshot;
    }
    const base = this.get(packet.baseId);
    if (!base) throw new Error(`Missing raster baseline ${packet.baseId}`);
    const patch = packet.height;
    const heights = patch.runs.length ? base.height.heights.slice() : base.height.heights;
    const encoded = patch.runs.length ? base.height.encoded.slice() : base.height.encoded;
    for (const run of patch.runs) {
      if (
        !Number.isSafeInteger(run.start) ||
        run.start < 0 ||
        run.heights.length !== run.encoded.length ||
        run.start + run.heights.length > heights.length
      )
        throw new Error("Invalid raster patch range");
      heights.set(run.heights, run.start);
      encoded.set(run.encoded, run.start);
    }
    const snapshot = {
      height: { ...base.height, heights, encoded },
      alpha: packet.alpha ?? base.alpha,
      ocean: packet.hasOcean ? (packet.ocean ?? base.ocean) : undefined
    };
    if (packet.hasOcean && !snapshot.ocean) throw new Error("Missing Ocean baseline");
    this.retain(id, snapshot, packet.baseId);
    return snapshot;
  }
}
/** Numeric payload only; excludes vector layout, author document and protocol/string overhead. */
export function rasterPacketNumericBytes(packet: PlanningRasterPacket): number {
  const seen = new Set<object>();
  const count = (value: unknown): number => {
    if (!value || typeof value !== "object" || seen.has(value)) return 0;
    seen.add(value);
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (Array.isArray(value))
      return value.every((v) => typeof v === "number") ? value.length * 8 : value.reduce((n, v) => n + count(v), 0);
    return Object.values(value).reduce<number>((n, v) => n + count(v), 0);
  };
  return count(packet);
}
