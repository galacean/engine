const RIPPLE_UPWARD_HEIGHT_VISIBILITY_SCALE = 12;
const RIPPLE_STATIC_UPWARD_HEIGHT_VISIBILITY_SCALE = 3;
const RIPPLE_DOWNWARD_HEIGHT_VISIBILITY_SCALE = 0.25;
const RIPPLE_FULL_SLOPE_VISIBILITY_SCALE = 16;
const RIPPLE_STATIC_SLOPE_VISIBILITY_SCALE = 2;
const RIPPLE_TROUGH_SLOPE_VISIBILITY_SCALE = 1.5;
const RIPPLE_TROUGH_SUPPRESSION_DEPTH = 0.03;
const RIPPLE_VELOCITY_DEADBAND = 0.015;
const RIPPLE_FULL_MOTION_SPEED = 0.12;
const RIPPLE_VELOCITY_VISIBILITY_SCALE = 0.6;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Keeps moving crests readable without painting a persistent dark decal over
 * the pressure depression beneath a settled floating body.
 */
export function computeInteractivePoolRippleVisibility(height: number, slope: number, velocity: number): number {
  const upwardHeight = Math.max(0, height);
  const downwardHeight = Math.max(0, -height);
  const troughSuppression = clamp01(downwardHeight / RIPPLE_TROUGH_SUPPRESSION_DEPTH);
  const motion = Math.max(0, Math.abs(velocity) - RIPPLE_VELOCITY_DEADBAND);
  const motionEmphasis = clamp01(motion / RIPPLE_FULL_MOTION_SPEED);
  const upwardHeightVisibilityScale =
    RIPPLE_STATIC_UPWARD_HEIGHT_VISIBILITY_SCALE +
    (RIPPLE_UPWARD_HEIGHT_VISIBILITY_SCALE - RIPPLE_STATIC_UPWARD_HEIGHT_VISIBILITY_SCALE) * motionEmphasis;
  const activeSlopeVisibilityScale =
    RIPPLE_STATIC_SLOPE_VISIBILITY_SCALE +
    (RIPPLE_FULL_SLOPE_VISIBILITY_SCALE - RIPPLE_STATIC_SLOPE_VISIBILITY_SCALE) * motionEmphasis;
  const slopeVisibilityScale =
    activeSlopeVisibilityScale +
    (RIPPLE_TROUGH_SLOPE_VISIBILITY_SCALE - activeSlopeVisibilityScale) * troughSuppression;

  return clamp01(
    upwardHeight * upwardHeightVisibilityScale +
      downwardHeight * RIPPLE_DOWNWARD_HEIGHT_VISIBILITY_SCALE +
      Math.max(0, slope) * slopeVisibilityScale +
      motion * RIPPLE_VELOCITY_VISIBILITY_SCALE
  );
}
