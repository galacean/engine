import type { WaterDevelopmentTarget } from "../runtime/body/WaterBodyLoader";

export type WaterControlGroup =
  | "Camera"
  | "Lighting"
  | "Lake"
  | "Body"
  | "Surface"
  | "Optics"
  | "Backend"
  | "Authoring (read-only)"
  | "Session";

export type WaterControlUpdateMode = "live" | "frame" | "commit" | "replace" | "readonly";

export type WaterControlValue = string | number | boolean;

export type WaterControlOwner =
  | "scene"
  | "interaction"
  | "physical-wave"
  | "foam-system"
  | "nearshore-system"
  | "surface-appearance-v2"
  | "optical-profile"
  | "reflection-provider"
  | "water-look"
  | "lake-water-level"
  | "ocean-water-level"
  | "runtime-diagnostics"
  | "authoring";

export type WaterControlEffect = "visual" | "state" | "diagnostic" | "authoring";

export type WaterControlAvailability = "active" | "conditional" | "unavailable" | "readonly";

interface WaterControlBase {
  readonly section?: readonly string[];
  readonly id: string;
  readonly label: string;
  readonly group: WaterControlGroup;
  readonly updateMode: WaterControlUpdateMode;
  readonly description?: string;
  /** Runtime consumer that owns the requested value. */
  readonly owner?: WaterControlOwner;
  /** User-visible kind of effect produced by the consumer. */
  readonly effect?: WaterControlEffect;
  /** Whether the active runtime can consume this control, independent of editability. */
  readonly availability?: WaterControlAvailability;
  /** Concise reason for a conditional, unavailable, or read-only control. */
  readonly availabilityReason?: string;
  /** Active runtime conditions required before a visible effect can be expected. */
  readonly prerequisites?: readonly string[];
  /** Reads the effective consumer value when it differs from the authored/requested value. */
  readonly readEffective?: () => WaterControlValue;
  /** Hidden controls remain part of baseline, Reset, patch replay, and JSON export. */
  readonly hidden?: boolean;
  /** Transient controls are UI context and are excluded from baseline, patches, and JSON. */
  readonly sessionScope?: "persistent" | "transient";
  /** Recreate descriptors after applying UI context such as an active Reach selection. */
  readonly rebuildSessionAfterWrite?: boolean;
}

export interface WaterNumberControl extends WaterControlBase {
  /** Unbounded authoring values use a numeric input instead of inventing slider limits. */
  readonly inputOnly?: boolean;
  readonly kind: "number";
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  read(): number;
  write(value: number): void | Promise<void>;
}

export interface WaterBooleanControl extends WaterControlBase {
  readonly kind: "boolean";
  read(): boolean;
  write(value: boolean): void | Promise<void>;
}

export interface WaterColorControl extends WaterControlBase {
  readonly kind: "color";
  read(): string;
  write(value: string): void | Promise<void>;
}

export interface WaterEnumControl extends WaterControlBase {
  readonly kind: "enum";
  readonly options: Readonly<Record<string, string | number>>;
  read(): string | number;
  write(value: string | number): void | Promise<void>;
}

export interface WaterReadonlyControl extends WaterControlBase {
  readonly kind: "readonly";
  readonly updateMode: "readonly";
  read(): string | number | boolean;
}

export type WaterControlDescriptor =
  | WaterNumberControl
  | WaterBooleanControl
  | WaterColorControl
  | WaterEnumControl
  | WaterReadonlyControl;

export interface WaterTuningSession {
  readonly target: WaterDevelopmentTarget;
  readonly controls: readonly WaterControlDescriptor[];
  /** Optional backend-owned structured Authoring Draft used by Copy JSON. */
  exportDraft?(): unknown;
}

export interface WaterTuningAdapter {
  readonly id: string;
  supports(target: WaterDevelopmentTarget): boolean;
  createSession(target: WaterDevelopmentTarget): WaterTuningSession;
}
