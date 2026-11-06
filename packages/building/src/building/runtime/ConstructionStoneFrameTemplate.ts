export const stoneFrameProgramName = "decoration_stone_frame";
export const stoneFrameInstanceStride = 64;
/** Reflected native record layout. Packing remains owned by the scene compiler. */
export const stoneFrameInstanceOffsets = {
  affine3Packed: 0,
  wallspaceXRangePackedHalf2: 48,
  seed: 52,
  wallSlotIsWoodenPacked: 56,
  meshSizeX: 60
} as const;

export const stoneFrameTemplateName = (mesh: string) => "stone-frame/" + mesh;
