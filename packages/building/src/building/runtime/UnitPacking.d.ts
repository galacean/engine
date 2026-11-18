import type { SupportCell } from "./PlacementSupport";
import type { MaterialUnit } from "./UnitPlacementStyle";

/** Round-to-nearest-even float32 bits to float16 bits. */
export function f32BitsToHalf(bits: number): number;
/** A 96-byte brick domain record to its 64-byte packed form. */
export function encodeBrick96(input: Uint8Array): Uint8Array;
/** Validates roof design records against their cells; returns the records by cell id. */
export function validateRoofDesign(
  value: unknown,
  cells: readonly SupportCell[],
  slot: number
): Map<string, Uint8Array>;
/** Packs cells into the instance records of every unit family. */
export function packUnits(spec: {
  cells: readonly SupportCell[];
  slot: number;
  roof_design?: unknown;
  source_render_metadata?: unknown;
}): Promise<Record<MaterialUnit, Uint8Array>>;
