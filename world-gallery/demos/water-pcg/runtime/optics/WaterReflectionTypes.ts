/** Planar reflection color policy and observable runtime resolution. */
export type WaterPlanarColorMode = "ldr" | "hdr-preferred";

export type WaterPlanarColorFormat =
  | "none"
  | "r8g8b8a8-unorm"
  | "r11g11b10-ufloat"
  | "r16g16b16a16-float";

export type WaterPlanarColorFallbackReason =
  | "hdr-format-unsupported"
  | "hdr-target-failed"
  | "hdr-render-failed";
