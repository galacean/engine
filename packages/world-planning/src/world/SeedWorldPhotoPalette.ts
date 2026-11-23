/** Opaque sRGB colors only. Brush opacity is intentionally not configurable. */
export const DEFAULT_PHOTO_INK = "#71e6ff";
export const PHOTO_TOOLBAR = { width: 52, height: 204, padding: 6, step: 48 } as const;
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
  // Mirror SeedWorldChatPanel's exact Voice Orb HUD anchor math (720 short-side reference)
  // so the vertical photo toolbar stacks cleanly on the exact same vertical centerline above the orb.
  const hudScale = Math.max(1, Math.min(width, height)) / 720;
  const referenceWidth = width / hudScale;
  const orbSizeUnits = 148;
  const orbRightWideUnits = 196;
  const orbBottomWideUnits = 62;
  const orbRightNarrowUnits = 32;
  const orbBottomNarrowUnits = 108;
  const orbReservedRightUnits = orbRightWideUnits + orbSizeUnits + 24;
  const useWideHudLayout = referenceWidth - orbReservedRightUnits * 2 >= 260;

  const orbSize = orbSizeUnits * hudScale;
  const orbRight = (useWideHudLayout ? orbRightWideUnits : orbRightNarrowUnits) * hudScale;
  const orbBottom = (useWideHudLayout ? orbBottomWideUnits : orbBottomNarrowUnits) * hudScale;
  const orbLeft = width - orbRight - orbSize;
  const orbCenterX = orbLeft + orbSize * 0.5;
  const orbTop = height - orbBottom - orbSize;

  const isWideLandscape = width > height * 1.15;
  const orbClearanceGap = 14;
  const availableAboveOrb = Math.max(1, orbTop - margin - orbClearanceGap);
  const scale = Math.min(
    1,
    Math.max(1, width - margin * 2) / (PHOTO_PALETTE.width + gap + PHOTO_TOOLBAR.width),
    Math.max(1, height - margin * 2) / PHOTO_TOOLBAR.height,
    availableAboveOrb / PHOTO_TOOLBAR.height
  );
  const toolbarWidth = PHOTO_TOOLBAR.width * scale;
  const toolbarHeight = PHOTO_TOOLBAR.height * scale;
  const toolbarX = Math.min(width - margin - toolbarWidth, Math.max(margin, orbCenterX - toolbarWidth * 0.5));
  const toolbarY = Math.max(margin, margin + (availableAboveOrb - toolbarHeight) * 0.5);
  const toolbar = {
    x: toolbarX,
    y: toolbarY,
    width: toolbarWidth,
    height: toolbarHeight
  };
  const palette = {
    x: Math.max(margin, toolbar.x - (gap + PHOTO_PALETTE.width) * scale),
    y: Math.max(
      margin,
      Math.min(
        height - margin - PHOTO_PALETTE.height * scale,
        toolbar.y + (toolbar.height - PHOTO_PALETTE.height * scale) * 0.5
      )
    ),
    width: PHOTO_PALETTE.width * scale,
    height: PHOTO_PALETTE.height * scale
  };
  const photoRightLimit = isWideLandscape ? Math.min(toolbar.x, orbLeft) - gap : toolbar.x - gap;
  const photoAreaHeight = isWideLandscape
    ? Math.max(1, height - margin * 2)
    : Math.max(1, orbTop - margin - orbClearanceGap);
  return {
    scale,
    toolbar,
    palette,
    photo: {
      x: margin,
      y: margin,
      width: Math.max(1, photoRightLimit - margin),
      height: photoAreaHeight
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
