/**
 * Quality preset for screen-space reflection.
 */
export enum ScreenSpaceReflectionQuality {
  /** Quarter-resolution chain, 12 Hi-Z steps, no temporal accumulation. */
  Low = 0,
  /** Half-resolution chain, 28 Hi-Z steps, surface temporal accumulation (mobile default). */
  Medium = 1,
  /** Half-resolution chain, 28 Hi-Z steps, optional virtual-image temporal accumulation, 4-tap bilateral sampling. */
  High = 2,
  /** Full-resolution trace and color pyramid, 64 Hi-Z steps, virtual-image temporal accumulation, direct 1:1 Forward sampling (desktop / flagship). */
  XHigh = 3
}
