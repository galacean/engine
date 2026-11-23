/**
 * Quality presets for screen-space reflection controlling the balance between visual fidelity and performance.
 */
export enum ScreenSpaceReflectionQuality {
  /** Quarter-resolution trace with no temporal accumulation, prioritizing performance on low-end devices. */
  Low = 0,
  /** Half-resolution trace with temporal accumulation for balanced mobile quality and performance (default). */
  Medium = 1,
  /** Half-resolution trace with high-precision virtual-image temporal accumulation and bilateral reconstruction. */
  High = 2,
  /** Full-resolution trace and color pyramid with virtual-image temporal accumulation for desktop and flagship devices. */
  VeryHigh = 3
}
