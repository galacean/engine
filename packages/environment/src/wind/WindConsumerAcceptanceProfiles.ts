import type { WindAcceptanceThresholds } from "./WindAcceptanceRecorder";

export type WindConsumerAcceptanceThresholds = Readonly<Partial<WindAcceptanceThresholds>>;

/**
 * Consumer-scale gates for the shared 21-second protocol.
 *
 * Keeping the tree thresholds named and shared prevents the preview and its automated protocol
 * from quietly weakening the same acceptance flow.
 */
export const WIND_CONSUMER_ACCEPTANCE_THRESHOLDS = Object.freeze({
  tree: Object.freeze({
    maximumResponseRate: 6,
    maximumDirectionChangeDegrees: 22,
    directionSpeedFloor: 0.03,
    minimumPeakResponseSpeed: 0.18,
    minimumResponseSpeedRange: 0.08,
    minimumCumulativeDirectionChangeDegrees: 90,
    // 0.58 Hz roots with a 4.25° authored cap remain below ~15.5°/s at full sinusoidal travel.
    // The margins reject visible one-frame snaps without constraining continuous gale recovery.
    maximumPoseStepRadians: 0.75 * (Math.PI / 180),
    maximumPoseRateRadiansPerSecond: 20 * (Math.PI / 180),
    maximumPoseAccelerationRadiansPerSecondSquared: 120 * (Math.PI / 180)
  } satisfies WindConsumerAcceptanceThresholds)
});
