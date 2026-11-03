/** Opaque sRGB colors only. Brush opacity is intentionally not configurable. */
export const DEFAULT_PHOTO_INK = "#71e6ff";
export const PHOTO_TOOLBAR = { width: 52, height: 252, padding: 6, step: 48 } as const;
export const PHOTO_PALETTE = {
  padding: 12,
  cell: 28,
  columns: 8,
  rows: 6,
  width: 248,
  height: 192
} as const;
/** Shared CSS-pixel layout for engine geometry, pointer hits and photo fitting. */
export function photoDetailLayout(width: number, height: number) {
  const margin = 16,
    gap = 12;
  const scale = Math.min(
    1,
    Math.max(1, width - margin * 2) / (PHOTO_PALETTE.width + gap + PHOTO_TOOLBAR.width),
    Math.max(1, height - margin * 2) / PHOTO_TOOLBAR.height
  );
  const toolbar = {
    x: width - margin - PHOTO_TOOLBAR.width * scale,
    y: (height - PHOTO_TOOLBAR.height * scale) / 2,
    width: PHOTO_TOOLBAR.width * scale,
    height: PHOTO_TOOLBAR.height * scale
  };
  const palette = {
    x: toolbar.x - (gap + PHOTO_PALETTE.width) * scale,
    y: (height - PHOTO_PALETTE.height * scale) / 2,
    width: PHOTO_PALETTE.width * scale,
    height: PHOTO_PALETTE.height * scale
  };
  return {
    scale,
    toolbar,
    palette,
    photo: {
      x: margin,
      y: margin,
      width: Math.max(1, toolbar.x - gap - margin),
      height: Math.max(1, height - margin * 2)
    }
  };
}
const hues = ["#ff453a", "#ff9138", "#ffd438", "#7cd45a", DEFAULT_PHOTO_INK, "#4285ff", "#ac6bfa", "#ffffff"];
export const PHOTO_INK_COLORS = Array.from({ length: 48 }, (_, i) => {
  const row = Math.floor(i / 8),
    column = i % 8;
  const channels = hues[column]
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16));
  const white = row < 2 ? (2 - row) * 0.32 : 0;
  const dark = row > 2 ? 1 - (row - 2) * 0.27 : 1;
  if (column === 7) channels.fill(Math.round(255 * (1 - row / 5)));
  return (
    "#" +
    channels
      .map((value) =>
        Math.round(column === 7 ? value : (value + (255 - value) * white) * dark)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
});
