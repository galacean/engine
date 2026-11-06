import type { CarriedActionIntent } from "../domain/ResolveCarriedAction";

export type FarmSelectionAction = CarriedActionIntent["intent"] | null;

export const FARM_ACTION_CUES = {
  cultivate: { label: "锄地", path: "M5 19L17 5M12 4L21 11" },
  irrigate: { label: "浇水", path: "M12 2C9 7 5 11 5 15a7 7 0 0014 0C19 11 15 7 12 2Z" },
  plant: { label: "播种", path: "M12 22V10M12 13C3 13 2 7 3 4c7 0 9 4 9 9ZM12 10c0-7 5-9 10-9 0 7-4 10-10 9Z" },
  harvest: { label: "收获", path: "M3 10h18l-3 11H6L3 10ZM7 10V8a5 5 0 0110 0v2M9 14v3M15 14v3" },
  "remove-crop": { label: "移除作物", path: "M12 21V10M12 13C4 13 3 8 3 4c6 0 9 3 9 9ZM3 22L22 3" },
  restore: { label: "恢复土地", path: "M4 8a9 9 0 111 11M4 2v7h7" }
} as const;

export function selectionNeedsOutline(action: FarmSelectionAction): boolean {
  return action === "cultivate" || action === "restore" || action === "remove-crop";
}

/** About a centimetre-wide inner contour on a default cell, with no interior fill. */
export function farmSelectionPixel(u: number, v: number): readonly [number, number, number, number] {
  const edge = Math.min(u, v, 1 - u, 1 - v);
  if (edge <= 0 || edge >= 0.014) return [0, 0, 0, 0];
  const coverage = Math.max(0, 1 - Math.abs(edge - 0.007) / 0.007);
  return [210, 204, 177, Math.round(150 * coverage)];
}

export function drawFarmSelectionTexture(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const size = canvas.width,
    pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      pixels.data.set(farmSelectionPixel(x / (size - 1), y / (size - 1)), (y * size + x) * 4);
  ctx.putImageData(pixels, 0, 0);
}
