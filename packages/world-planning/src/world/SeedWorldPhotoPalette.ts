/** Opaque sRGB colors only. Brush opacity is intentionally not configurable. */
export const DEFAULT_PHOTO_INK = "#71e6ff";
/** Default high-contrast vivid red ink for screen markup annotations. */
export const DEFAULT_MARKUP_INK = "#ff453a";
export const PHOTO_TOOLBAR = { width: 52, height: 52, padding: 2, step: 48 } as const;
export const PHOTO_BADGE = { width: 128, height: 36, radius: 18 } as const;
export const PHOTO_PALETTE = {
  padding: 12,
  cell: 28,
  columns: 8,
  rows: 6,
  width: 248,
  height: 192
} as const;
/** Shared square reference canvas for the voice, camera, and markup HUD. */
export const SEED_WORLD_HUD_REFERENCE_SHORT_SIDE = 720;

/** UI units to pixels; pass CSS or backbuffer dimensions for the desired space. */
export function resolveSeedWorldHudScale(width: number, height: number): number {
  return Math.max(Math.min(width, height), 1) / SEED_WORLD_HUD_REFERENCE_SHORT_SIDE;
}

/** Single source of truth for Voice Orb anchor geometry and wide/narrow HUD breakpoints. */
export const SEED_WORLD_VOICE_ORB_LAYOUT = {
  size: 148,
  listenScale: 0.72,
  expandHalf: Math.ceil(148 * 0.72 * 0.5),
  rightWide: 116,
  bottomWide: 64,
  rightNarrow: 64,
  bottomNarrow: 108,
  reservedRightGap: 24,
  panelMinWidth: 260,
  narrowPanelGap: 20,
  narrowPanelLiftPadding: 8
} as const;

export const SEED_WORLD_VOICE_ORB_RESERVED_RIGHT =
  SEED_WORLD_VOICE_ORB_LAYOUT.rightWide +
  SEED_WORLD_VOICE_ORB_LAYOUT.size +
  SEED_WORLD_VOICE_ORB_LAYOUT.expandHalf +
  SEED_WORLD_VOICE_ORB_LAYOUT.reservedRightGap;

export interface SeedWorldVoiceOrbLayoutMetrics {
  readonly hudScale: number;
  readonly referenceWidth: number;
  readonly referenceHeight: number;
  readonly availableCenteredWidthUnits: number;
  readonly useWideLayout: boolean;
  readonly orbSizeUnits: number;
  readonly orbExpandHalfUnits: number;
  readonly orbRightUnits: number;
  readonly orbBottomUnits: number;
  readonly orbReservedRightUnits: number;
  readonly orbSizePx: number;
  readonly orbRightPx: number;
  readonly orbBottomPx: number;
  readonly orbLeftPx: number;
  readonly orbCenterXPx: number;
  readonly orbTopPx: number;
  readonly orbReservedRightPx: number;
}

/** Resolve Voice Orb anchor metrics and wide/narrow HUD breakpoint in one shared place. */
export function resolveSeedWorldVoiceOrbLayout(width: number, height: number): SeedWorldVoiceOrbLayoutMetrics {
  const hudScale = resolveSeedWorldHudScale(width, height);
  const referenceWidth = width / hudScale;
  const referenceHeight = height / hudScale;
  const orbReservedRightUnits = SEED_WORLD_VOICE_ORB_RESERVED_RIGHT;
  const availableCenteredWidthUnits = referenceWidth - orbReservedRightUnits * 2;
  const useWideLayout = availableCenteredWidthUnits >= SEED_WORLD_VOICE_ORB_LAYOUT.panelMinWidth;
  const orbSizeUnits = SEED_WORLD_VOICE_ORB_LAYOUT.size;
  const orbExpandHalfUnits = SEED_WORLD_VOICE_ORB_LAYOUT.expandHalf;
  const orbRightUnits = useWideLayout ? SEED_WORLD_VOICE_ORB_LAYOUT.rightWide : SEED_WORLD_VOICE_ORB_LAYOUT.rightNarrow;
  const orbBottomUnits = useWideLayout
    ? SEED_WORLD_VOICE_ORB_LAYOUT.bottomWide
    : SEED_WORLD_VOICE_ORB_LAYOUT.bottomNarrow;
  const orbSizePx = orbSizeUnits * hudScale;
  const orbRightPx = orbRightUnits * hudScale;
  const orbBottomPx = orbBottomUnits * hudScale;
  const orbLeftPx = width - orbRightPx - orbSizePx;
  const orbCenterXPx = orbLeftPx + orbSizePx * 0.5;
  const orbTopPx = height - orbBottomPx - orbSizePx;
  const orbReservedRightPx = orbReservedRightUnits * hudScale;
  return {
    hudScale,
    referenceWidth,
    referenceHeight,
    availableCenteredWidthUnits,
    useWideLayout,
    orbSizeUnits,
    orbExpandHalfUnits,
    orbRightUnits,
    orbBottomUnits,
    orbReservedRightUnits,
    orbSizePx,
    orbRightPx,
    orbBottomPx,
    orbLeftPx,
    orbCenterXPx,
    orbTopPx,
    orbReservedRightPx
  };
}

/** Shared CSS-pixel layout for engine geometry, pointer hits and photo fitting. */
export function photoDetailLayout(width: number, height: number) {
  const margin = 16,
    gap = 12;
  const {
    orbLeftPx: orbLeft,
    orbCenterXPx: orbCenterX,
    orbTopPx: orbTop
  } = resolveSeedWorldVoiceOrbLayout(width, height);

  const isWideLandscape = width > height * 1.15;
  // Clear iPhone Dynamic Island / notch: left edge in landscape, top edge in portrait.
  const notchSafeMargin = isWideLandscape
    ? Math.max(margin, Math.min(60, width * 0.068))
    : Math.max(margin, Math.min(58, height * 0.068));
  const photoLeft = isWideLandscape ? notchSafeMargin : margin;
  const photoTop = isWideLandscape ? margin : notchSafeMargin;
  const orbClearanceGap = 14;
  const availableAboveOrb = Math.max(1, orbTop - photoTop - orbClearanceGap);
  const scale = Math.min(
    1,
    Math.max(1, width - margin * 2) / (PHOTO_PALETTE.width + gap + PHOTO_TOOLBAR.width),
    Math.max(1, height - margin * 2) / PHOTO_TOOLBAR.height,
    availableAboveOrb / PHOTO_TOOLBAR.height
  );
  const toolbarWidth = PHOTO_TOOLBAR.width * scale;
  const toolbarHeight = PHOTO_TOOLBAR.height * scale;
  const toolbarX = Math.min(width - margin - toolbarWidth, Math.max(margin, orbCenterX - toolbarWidth * 0.5));
  const toolbarY = Math.max(photoTop, photoTop + (availableAboveOrb - toolbarHeight) * 0.5);
  const toolbar = {
    x: toolbarX,
    y: toolbarY,
    width: toolbarWidth,
    height: toolbarHeight
  };
  const palette = {
    x: Math.max(photoLeft, toolbar.x - (gap + PHOTO_PALETTE.width) * scale),
    y: Math.max(
      photoTop,
      Math.min(
        height - margin - PHOTO_PALETTE.height * scale,
        toolbar.y + (toolbar.height - PHOTO_PALETTE.height * scale) * 0.5
      )
    ),
    width: PHOTO_PALETTE.width * scale,
    height: PHOTO_PALETTE.height * scale
  };
  const photoRightLimit = isWideLandscape ? orbLeft - gap : width - margin;
  const photoAreaHeight = isWideLandscape
    ? Math.max(1, height - photoTop - margin)
    : Math.max(1, orbTop - photoTop - orbClearanceGap);
  return {
    scale,
    toolbar,
    palette,
    photo: {
      x: photoLeft,
      y: photoTop,
      width: Math.max(1, photoRightLimit - photoLeft),
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
