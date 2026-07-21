export type InteractivePoolGridQuality = "low" | "medium";

export interface InteractivePoolMetrics {
  readonly ready: boolean;
  readonly runtimeError: string;
  readonly finite: boolean;
  readonly quality: InteractivePoolGridQuality;
  readonly ballSpawned: boolean;
  readonly ballHeight: number;
  readonly ballVerticalSpeed: number;
  readonly ballInWater: boolean;
  readonly initialBallHeightAboveSurface: number;
  readonly freeFallObserved: boolean;
  readonly upwardBounceObserved: boolean;
  readonly settled: boolean;
  readonly entryImpactCount: number;
  readonly continuousInteractionCount: number;
  readonly contactInteractionCount: number;
  readonly firstImpactTime: number;
  readonly maximumAbsSurfaceHeight: number;
  readonly centerSurfaceHeight: number;
  readonly centerSurfaceVerticalSpeed: number;
  readonly currentContactDepression: number;
  readonly maximumContactDepression: number;
  readonly currentContactRimHeight: number;
  readonly maximumContactRimHeight: number;
  readonly rippleRadius: number;
  readonly reflectedWaveObserved: boolean;
  readonly rippleHighlightPeak: number;
  readonly maximumHighlightedVertexCount: number;
  readonly surfaceVertexCount: number;
  readonly meshUploadsPerRenderFrame: number;
  readonly totalMeshUploads: number;
  readonly physicsFixedTimeStep: number;
  readonly renderFrameCount: number;
  readonly targetFrameRate: number;
}

declare global {
  interface Window {
    readonly waterPcgInteractivePoolMetrics?: InteractivePoolMetrics;
    waterPcgResetInteractivePool?: () => void;
    waterPcgSetInteractivePoolTargetFrameRate?: (framesPerSecond: number) => void;
  }
}
