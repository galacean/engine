/** Opaque sRGB colors only. Brush opacity is intentionally not configurable. */
export const DEFAULT_PHOTO_INK = "#71e6ff";
/** Default high-contrast vivid red ink for screen markup annotations. */
export const DEFAULT_MARKUP_INK = "#ff453a";
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
  const { orbLeftPx: orbLeft, orbTopPx: orbTop } = resolveSeedWorldVoiceOrbLayout(width, height);

  const isWideLandscape = width > height * 1.15;
  // Clear iPhone Dynamic Island / notch: left edge in landscape, top edge in portrait.
  const notchSafeMargin = isWideLandscape
    ? Math.max(margin, Math.min(60, width * 0.068))
    : Math.max(margin, Math.min(58, height * 0.068));
  const photoLeft = isWideLandscape ? notchSafeMargin : margin;
  const photoTop = isWideLandscape ? margin : notchSafeMargin;
  const orbClearanceGap = 14;
  const photoRightLimit = isWideLandscape ? orbLeft - gap : width - margin;
  const photoAreaHeight = isWideLandscape
    ? Math.max(1, height - photoTop - margin)
    : Math.max(1, orbTop - photoTop - orbClearanceGap);
  return {
    photo: {
      x: photoLeft,
      y: photoTop,
      width: Math.max(1, photoRightLimit - photoLeft),
      height: photoAreaHeight
    }
  };
}
