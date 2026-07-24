import type { Texture2D } from "@galacean/engine-core";

export enum WaterFoamSourceKind {
  Whitecap = "whitecap",
  Breaker = "breaker",
  Shore = "shore",
  Obstacle = "obstacle",
  Impact = "impact",
  Wake = "wake"
}

export type WaterFoamBoundedSourceKind = Exclude<
  WaterFoamSourceKind,
  WaterFoamSourceKind.Whitecap
>;

export enum WaterFoamBlendMode {
  Add = "add",
  Maximum = "maximum"
}

export enum WaterFoamDebugView {
  Final = 0,
  Source = 1,
  History = 2
}

interface WaterFoamSourceBase {
  readonly bodyId: string;
  readonly intensity: number;
  readonly lifetimeSeconds: number;
  readonly priority: number;
  readonly blend: WaterFoamBlendMode;
}

export interface WaterFoamUnboundedSource extends WaterFoamSourceBase {
  readonly kind: WaterFoamSourceKind.Whitecap;
  readonly range: Readonly<{ readonly kind: "unbounded" }>;
}

export interface WaterFoamBoundedSource extends WaterFoamSourceBase {
  readonly kind: WaterFoamBoundedSourceKind;
  readonly range: Readonly<{
    readonly kind: "circle";
    readonly worldX: number;
    readonly worldZ: number;
    readonly radius: number;
  }>;
}

export type WaterFoamSource =
  | WaterFoamUnboundedSource
  | WaterFoamBoundedSource;

export interface WaterTemporalFoamBinding {
  readonly texture: Texture2D;
  /** Minimum world X/Z followed by inverse length/width. */
  readonly region: readonly [number, number, number, number];
  /** Inverse texture width/height for debug-only neighborhood visualization. */
  readonly texelSize: readonly [number, number];
  readonly debugView: WaterFoamDebugView;
}

export function isValidWaterFoamSource(
  source: Readonly<WaterFoamSource>
): boolean {
  if (
    source.bodyId.length === 0 ||
    !Number.isFinite(source.intensity) ||
    source.intensity < 0 ||
    source.intensity > 1 ||
    !Number.isFinite(source.lifetimeSeconds) ||
    source.lifetimeSeconds < 0 ||
    !Number.isFinite(source.priority)
  ) {
    return false;
  }
  if (source.range.kind === "unbounded") {
    return source.kind === WaterFoamSourceKind.Whitecap;
  }
  return (
    source.kind !== WaterFoamSourceKind.Whitecap &&
    Number.isFinite(source.range.worldX) &&
    Number.isFinite(source.range.worldZ) &&
    Number.isFinite(source.range.radius) &&
    source.range.radius > 0
  );
}
