import type { RiverDropLook } from "../authoring/river/RiverDropLook";
import { createPresentationWaterTuningSession } from "./WaterPresentationSession";
import { createWaterReflectionPresentationPolicy } from "../authoring/optics/WaterReflectionPolicy";
import type { WaterBodyRuntimeVariant } from "../authoring/body/WaterBodyAuthoringTypes";
import {
  resolveWaterReflectionSamplingSettings,
  type WaterReflectionSamplingSettings
} from "../authoring/optics/WaterReflectionSampling";
import {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfacePrimaryColorClosure,
  type WaterBoundaryEffectV2,
  type WaterExponentialDepthTermV2,
  type WaterPatternV2,
  type WaterSurfaceAppearanceAssetV2,
  type WaterSurfaceAppearanceColor,
  type WaterSurfaceDepthResponseV2,
  type WaterSurfaceDetailLayerV2
} from "../authoring/surface/WaterSurfaceAppearanceTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { WaterSurfaceAppearanceCompiler } from "../compiler/surface/WaterSurfaceAppearanceCompiler";
import type { WaterBodyActivationHandle, WaterDevelopmentTarget } from "../runtime/body/WaterBodyLoader";
import { isLakeWaterLevelRuntimeDevelopmentPort } from "../runtime/body/LakeWaterLevelRuntimeDevelopmentPort";
import { isOceanWaterLevelRuntimeDevelopmentPort } from "../runtime/body/OceanWaterLevelRuntimeDevelopmentPort";
import type { WaterLookAuthoringPort } from "../runtime/state/WaterLookAuthoringPort";
import { HEIGHTFIELD_WATER_BACKEND_ID } from "../runtime/heightfield/HeightfieldWaterBackend";
import type { HeightfieldWaterRuntimeController } from "../runtime/heightfield/HeightfieldWaterRuntimeController";
import { HeightfieldWaterDebugMode } from "../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "../runtime/heightfield/types";
import { OCEAN_WATER_BACKEND_ID } from "../runtime/ocean/OceanWaterBackend";
import type { OceanWaterRuntimeController } from "../runtime/ocean/OceanWaterRuntimeController";
import { OceanDebugView } from "../runtime/ocean/OceanDebugView";
import {
  OCEAN_TUNING_LIMITS,
  type OceanRuntimeTuning,
  type OceanTuningRange
} from "../runtime/ocean/OceanRuntimeTuning";
import { RIVER_WATER_BACKEND_ID } from "../runtime/river/RiverWaterBackend";
import type { RiverRuntimeController } from "../runtime/river/RiverRuntimeController";
import { RiverSurfaceDebugMode } from "../runtime/river/RiverRuntimeEnums";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../runtime/optics/WaterOpticalProfile";
import {
  MAX_WATER_OPTICAL_COEFFICIENT,
  MAX_WATER_REFLECTION_INTENSITY,
  MAX_WATER_REFRACTION_STRENGTH
} from "../runtime/optics/WaterSurfaceOpticsMath";
import { type WaterReflectionSource } from "../runtime/optics/WaterReflectionPolicy";
import type { WaterSurfaceAppearanceBindingV2 } from "../runtime/surface/WaterSurfaceAppearanceRuntimeTypes";
import type {
  WaterBooleanControl,
  WaterColorControl,
  WaterControlDescriptor,
  WaterEnumControl,
  WaterNumberControl,
  WaterReadonlyControl,
  WaterTuningAdapter,
  WaterTuningSession
} from "./WaterDevToolsTypes";

const WATER_OPTICS_LIMITS = Object.freeze({
  absorption: Object.freeze([0, 10, 0.001] as const),
  scatteringCoefficient: Object.freeze([0, 10, 0.001] as const),
  maximumViewDistance: Object.freeze([0, 1_000, 0.001] as const),
  indexOfRefraction: Object.freeze([1, 4, 0.001] as const),
  maximumSurfaceOpticalDistance: Object.freeze([0, 1_000, 0.001] as const),
  refractionStrength: Object.freeze([0, MAX_WATER_REFRACTION_STRENGTH, 0.01] as const),
  roughness: Object.freeze([0, 1, 0.01] as const),
  reflectionIntensity: Object.freeze([0, MAX_WATER_REFLECTION_INTENSITY, 0.01] as const)
});

const WATER_REFLECTION_SAMPLING_LIMITS = Object.freeze({
  screenSpaceCompositeIntensity: Object.freeze([0, 1, 0.01] as const),
  environmentFallbackIntensity: Object.freeze([0, 4, 0.01] as const)
});

const MINIMUM_DEPTH_RESPONSE_SLIDER_MAXIMUM_METRES = 32;

function depthResponseSliderMaximum(distanceMeters: number): number {
  return Math.min(100_000, Math.max(MINIMUM_DEPTH_RESPONSE_SLIDER_MAXIMUM_METRES, Math.ceil(distanceMeters * 4)));
}

const RESIDENT_BATCHES_DESCRIPTION =
  "Resident geometry batches; excludes SSR receiver/Forward multi-pass submission and camera culling; not actual per-frame draws. 常驻几何批次，不含 SSR receiver/Forward 多 pass 与相机剔除，不等于每帧实际绘制数。";

const NO_SHARED_LOOK_AUTHORING_REASON =
  "The active body has no shared Water Look authoring port; this control is read-only.";

function numberControl(control: Omit<WaterNumberControl, "kind">): WaterNumberControl {
  return Object.freeze({ kind: "number", ...control });
}

function booleanControl(control: Omit<WaterBooleanControl, "kind">): WaterBooleanControl {
  return Object.freeze({ kind: "boolean", ...control });
}

function colorControl(control: Omit<WaterColorControl, "kind">): WaterColorControl {
  return Object.freeze({ kind: "color", ...control });
}

function enumControl(control: Omit<WaterEnumControl, "kind">): WaterEnumControl {
  return Object.freeze({ kind: "enum", ...control });
}

function readonlyControl(control: Omit<WaterReadonlyControl, "kind" | "updateMode">): WaterReadonlyControl {
  return Object.freeze({
    kind: "readonly",
    updateMode: "readonly",
    description:
      control.description ?? "Read-only diagnostic or authoring value; no safe runtime write contract is exposed.",
    ...control
  });
}

function unavailableReadonlyControl(
  control: Exclude<WaterControlDescriptor, WaterReadonlyControl>,
  reason: string
): WaterReadonlyControl {
  return readonlyControl({
    id: control.id,
    label: control.label,
    group: control.group,
    owner: control.owner,
    effect: control.effect,
    description: reason,
    availability: "unavailable",
    availabilityReason: reason,
    prerequisites: control.prerequisites,
    hidden: control.hidden,
    sessionScope: control.sessionScope,
    read: control.read,
    readEffective: control.readEffective
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function linearToSrgb(value: number): number {
  const channel = clamp(value, 0, 1);
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

function srgbToLinear(value: number): number {
  const channel = clamp(value, 0, 1);
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function byteToHex(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function linearRgbToHex(color: readonly number[]): string {
  return `#${byteToHex(linearToSrgb(color[0] ?? 0) * 255)}${byteToHex(
    linearToSrgb(color[1] ?? 0) * 255
  )}${byteToHex(linearToSrgb(color[2] ?? 0) * 255)}`;
}

function canonicalHex(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  throw new RangeError(`Water color '${value}' must use #RRGGBB.`);
}

function hexToLinearRgba(value: string, alpha: number): readonly [number, number, number, number] {
  const color = canonicalHex(value);
  const read = (offset: number): number => Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
  return Object.freeze([
    srgbToLinear(read(1)),
    srgbToLinear(read(3)),
    srgbToLinear(read(5)),
    clamp(alpha, 0, 1)
  ] as const);
}

function hexToLinearRgb(value: string): readonly [number, number, number] {
  const rgba = hexToLinearRgba(value, 1);
  return Object.freeze([rgba[0], rgba[1], rgba[2]] as const);
}

function matchesRuntimeVariant(target: WaterDevelopmentTarget, variant: WaterBodyRuntimeVariant): boolean {
  const instance = target.handle.instance;
  if (instance) {
    return variant.qualityPlanId === instance.qualityPlanId;
  }
  return false;
}

export function getActiveWaterRuntimeVariantId(target: WaterDevelopmentTarget): string | undefined {
  return target.variants.find((variant) => matchesRuntimeVariant(target, variant))?.id;
}

function replaceWaterRuntimeVariant(target: WaterDevelopmentTarget, variantId: string): Promise<void> {
  const variant = target.variants.find((candidate) => candidate.id === variantId);
  if (!variant) {
    throw new RangeError(`Water runtime variant '${variantId}' is not registered for '${target.bodyId}'.`);
  }
  const instance = target.handle.instance;
  if (instance) {
    if (matchesRuntimeVariant(target, variant)) return Promise.resolve();
    return target.handle.replaceInstance(
      Object.freeze({
        ...instance,
        qualityPlanId: variant.qualityPlanId
      })
    );
  }
  throw new Error(`Water body '${target.bodyId}' does not expose an authoritative instance.`);
}

function createCommonControls(
  target: WaterDevelopmentTarget,
  buoyancyUnavailableReason?: string
): WaterControlDescriptor[] {
  const controls: WaterControlDescriptor[] = [
    booleanControl({
      id: "body.visible",
      label: "Visible",
      group: "Body",
      updateMode: "live",
      read: () => target.handle.visible,
      write: (value) => target.handle.setVisible(value)
    }),
    booleanControl({
      id: "body.query",
      label: "Query routing",
      group: "Body",
      updateMode: "live",
      read: () => target.handle.queryEnabled,
      write: (value) => target.handle.setQueryEnabled(value)
    })
  ];
  const routingControls = [
    {
      id: "body.buoyancy",
      label: "Buoyancy routing",
      read: () => target.handle.buoyancyEnabled,
      write: (value: boolean) => target.handle.setBuoyancyEnabled(value),
      reason:
        buoyancyUnavailableReason ??
        (!target.handle.body.capabilities.finalSurfaceQuery
          ? "The active backend does not expose a final surface query for buoyancy."
          : undefined)
    },
    {
      id: "body.wake",
      label: "Wake routing",
      read: () => target.handle.wakeEnabled,
      write: (value: boolean) => target.handle.setWakeEnabled(value),
      reason: !target.handle.body.interactionSink
        ? "The active backend does not expose an interaction sink."
        : undefined
    }
  ];
  for (const { reason, ...control } of routingControls) {
    controls.push(
      reason
        ? readonlyControl({
            id: control.id,
            label: control.label,
            group: "Body",
            read: control.read,
            description: reason
          })
        : booleanControl({
            ...control,
            group: "Body",
            updateMode: "live",
            description: "Requires query routing. Disable buoyancy and wake before disabling query routing."
          })
    );
  }
  if (target.lookAuthoring && target.bodyKind !== "ocean")
    controls.push(
      enumControl({
        id: "optics.reflectionPolicy",
        label: "Reflection source",
        group: "Optics",
        updateMode: "commit",
        options: Object.freeze({ Environment: "environment", SSR: "ssr" }),
        read: () => target.lookAuthoring!.read().reflectionPolicy.policy.preferred,
        write: (value) =>
          target
            .lookAuthoring!.update((current) => ({
              ...current,
              reflectionPolicy: {
                ...current.reflectionPolicy,
                policy: createWaterReflectionPresentationPolicy(value === "ssr" ? "ssr" : "environment")
              }
            }))
            .then(() => undefined)
      })
    );
  if (target.variants.length > 0) {
    const activeVariantId = getActiveWaterRuntimeVariantId(target);
    const options: Record<string, string> = {};
    if (!activeVariantId) options["Current (unregistered)"] = "__current__";
    for (const variant of target.variants) {
      options[variant.label] = variant.id;
    }
    controls.push(
      enumControl({
        id: "body.variant",
        label: "Runtime variant",
        group: "Body",
        updateMode: "replace",
        options: Object.freeze(options),
        read: () => getActiveWaterRuntimeVariantId(target) ?? "__current__",
        write: (value) => {
          if (value === "__current__") return;
          if (typeof value !== "string") {
            throw new TypeError("Water runtime variant id must be a string.");
          }
          return replaceWaterRuntimeVariant(target, value);
        }
      })
    );
  }
  controls.push(
    readonlyControl({
      id: "authoring.resolvedBackendId",
      label: "Resolved backend",
      group: "Authoring (read-only)",
      description: "Selected algorithm backend; semantic identity is Body kind + Representation.",
      read: () => target.backendId
    }),
    readonlyControl({
      id: "authoring.bodyKind",
      label: "Body kind",
      group: "Authoring (read-only)",
      read: () => target.bodyKind
    }),
    readonlyControl({
      id: "authoring.domain",
      label: "Domain",
      group: "Authoring (read-only)",
      read: () => target.representation.domain
    }),
    readonlyControl({
      id: "authoring.macroSurface",
      label: "Macro surface",
      group: "Authoring (read-only)",
      read: () => target.representation.macroSurface
    }),
    readonlyControl({
      id: "authoring.backendId",
      label: "Backend",
      group: "Authoring (read-only)",
      read: () => target.backendId
    }),
    readonlyControl({
      id: "authoring.assetId",
      label: "Asset",
      group: "Authoring (read-only)",
      read: () => target.handle.instance?.assetId ?? "unversioned"
    }),
    readonlyControl({
      id: "authoring.lookPreset",
      label: "Look preset",
      group: "Authoring (read-only)",
      read: () => target.handle.instance?.lookPresetId ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.quality",
      label: "Quality preset / plan",
      group: "Authoring (read-only)",
      description: "Arbitrary compile parameters are not changed at runtime.",
      read: () => target.handle.instance?.qualityPlanId ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.quality.geometry",
      label: "Geometry quality",
      group: "Authoring (read-only)",
      read: () => target.handle.effectiveState?.qualityPlan?.geometry ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.quality.surfaceShading",
      label: "Surface shading quality",
      group: "Authoring (read-only)",
      read: () => target.handle.effectiveState?.qualityPlan?.surfaceShading ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.quality.sceneFields",
      label: "Scene fields quality",
      group: "Authoring (read-only)",
      read: () => target.handle.effectiveState?.qualityPlan?.sceneFields ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.quality.reflection.environment",
      label: "Environment reflection budget",
      group: "Authoring (read-only)",
      read: () => target.handle.effectiveState?.qualityPlan?.reflectionBudget.environment ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.quality.reflection.screenSpace",
      label: "Screen-space reflection budget",
      group: "Authoring (read-only)",
      read: () => target.handle.effectiveState?.qualityPlan?.reflectionBudget.screenSpace ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.quality.query",
      label: "Query quality",
      group: "Authoring (read-only)",
      read: () => target.handle.effectiveState?.qualityPlan?.query ?? "unavailable"
    }),
    readonlyControl({
      id: "authoring.source",
      label: "Source kind",
      group: "Authoring (read-only)",
      read: () => target.sourceKind
    }),
    readonlyControl({
      id: "backend.drawCount",
      label: "Resident batches",
      description: RESIDENT_BATCHES_DESCRIPTION,
      group: "Backend",
      read: () => target.handle.body.metrics.drawCount
    }),
    readonlyControl({
      id: "backend.triangleCount",
      label: "Triangles",
      group: "Backend",
      read: () => target.handle.body.metrics.triangleCount
    }),
    readonlyControl({
      id: "backend.meshUploads",
      label: "Mesh uploads",
      group: "Backend",
      read: () => target.handle.body.metrics.meshUploadCount
    }),
    readonlyControl({
      id: "backend.resourceBytes",
      label: "Owned bytes",
      group: "Backend",
      read: () => target.handle.body.metrics.memory.totalBytes
    })
  );
  return controls;
}

interface WaterOpticsPort {
  readProfile(): Readonly<WaterOpticalProfile>;
  readEffectiveProfile?(): Readonly<WaterOpticalProfile>;
  writeProfile(profile: Readonly<WaterOpticalProfile>): void | Promise<void>;
  readonly authoringWritable?: boolean;
  readonly authoringReadonlyReason?: string;
  readRefraction(): boolean;
  readonly refractionWritable: boolean;
  readonly refractionReadonlyReason?: string;
  writeRefraction(enabled: boolean): void | Promise<void>;
  readonly maximumViewDistanceWritable?: boolean;
  readonly maximumViewDistanceReadonlyReason?: string;
  readonly refractionStrengthWritable?: boolean;
  readonly refractionStrengthReadonlyReason?: string;
  readProfileControlAccess?(key: keyof WaterOpticalProfile): Readonly<{ writable: boolean; reason?: string }>;
  readEffectiveReflectionSource?(): WaterReflectionSource;
  readReflectionSampling?(): Readonly<WaterReflectionSamplingSettings>;
  writeReflectionSampling?(settings: Readonly<WaterReflectionSamplingSettings>): void;
}

const WATER_OPTICAL_PROFILE_CONTROL_KEY_BY_SUFFIX = Object.freeze({
  absorptionR: "absorptionCoefficient",
  absorptionG: "absorptionCoefficient",
  absorptionB: "absorptionCoefficient",
  scatteringColor: "scatteringColor",
  scatteringCoefficient: "scatteringCoefficient",
  maximumViewDistance: "maximumViewDistance",
  indexOfRefraction: "indexOfRefraction",
  maximumSurfaceOpticalDistance: "maximumSurfaceOpticalDistance",
  refractionStrength: "refractionStrength",
  roughness: "roughness",
  reflectionIntensity: "reflectionIntensity"
} as const satisfies Readonly<Record<string, keyof WaterOpticalProfile>>);

function createOpticsControls(idPrefix: string, port: WaterOpticsPort): WaterControlDescriptor[] {
  const readEffectiveProfile = (): Readonly<WaterOpticalProfile> => port.readEffectiveProfile?.() ?? port.readProfile();
  const updateProfile = (patch: Partial<WaterOpticalProfile>): void | Promise<void> => {
    const profile = port.readProfile();
    return port.writeProfile(
      Object.freeze({
        ...profile,
        ...patch
      })
    );
  };
  const updateAbsorption = (index: 0 | 1 | 2, value: number): void | Promise<void> => {
    const profile = port.readProfile();
    const absorption = [...profile.absorptionCoefficient] as [number, number, number];
    absorption[index] = value;
    return updateProfile({ absorptionCoefficient: Object.freeze(absorption) });
  };
  const profileValue = <Key extends keyof WaterOpticalProfile>(
    key: Key,
    fallback: NonNullable<WaterOpticalProfile[Key]>
  ): NonNullable<WaterOpticalProfile[Key]> =>
    (port.readProfile()[key] ?? fallback) as NonNullable<WaterOpticalProfile[Key]>;
  const refractionControl: WaterControlDescriptor = port.refractionWritable
    ? booleanControl({
        id: `${idPrefix}.refractionEnabled`,
        label: "Refraction",
        group: "Optics",
        updateMode: "commit",
        description: "Updates the shared Water Look optics gate and camera feature request transactionally.",
        read: () => port.readRefraction(),
        write: (value) => port.writeRefraction(value)
      })
    : readonlyControl({
        id: `${idPrefix}.refractionEnabled`,
        label: "Refraction",
        group: "Optics",
        description:
          port.refractionReadonlyReason ??
          "The active optics preset does not allow a refraction override; switch a registered runtime variant.",
        availability: "unavailable",
        availabilityReason:
          port.refractionReadonlyReason ??
          "The active optics preset does not allow a refraction override; switch a registered runtime variant.",
        read: () => port.readRefraction()
      });
  const maximumViewDistanceControl: WaterControlDescriptor =
    port.maximumViewDistanceWritable === false
      ? readonlyControl({
          id: `${idPrefix}.maximumViewDistance`,
          label: "Max view distance",
          group: "Optics",
          owner: "optical-profile",
          availability: "unavailable",
          availabilityReason:
            port.maximumViewDistanceReadonlyReason ??
            "The active body has no underwater-volume consumer for maximum view distance.",
          read: () => port.readProfile().maximumViewDistance,
          readEffective: () => readEffectiveProfile().maximumViewDistance
        })
      : numberControl({
          id: `${idPrefix}.maximumViewDistance`,
          label: "Max view distance",
          group: "Optics",
          updateMode: "frame",
          minimum: WATER_OPTICS_LIMITS.maximumViewDistance[0],
          maximum: WATER_OPTICS_LIMITS.maximumViewDistance[1],
          step: WATER_OPTICS_LIMITS.maximumViewDistance[2],
          read: () => port.readProfile().maximumViewDistance,
          readEffective: () => readEffectiveProfile().maximumViewDistance,
          write: (value) => updateProfile({ maximumViewDistance: value })
        });
  const refractionStrengthControl: WaterControlDescriptor =
    port.refractionStrengthWritable === false
      ? readonlyControl({
          id: `${idPrefix}.refractionStrength`,
          label: "Refraction strength",
          group: "Optics",
          owner: "optical-profile",
          availability: "unavailable",
          availabilityReason:
            port.refractionStrengthReadonlyReason ??
            "The active surface closure does not consume optical-profile refraction strength.",
          read: () => profileValue("refractionStrength", DEFAULT_WATER_OPTICAL_PROFILE.refractionStrength ?? 1),
          readEffective: () =>
            readEffectiveProfile().refractionStrength ?? DEFAULT_WATER_OPTICAL_PROFILE.refractionStrength ?? 1
        })
      : numberControl({
          id: `${idPrefix}.refractionStrength`,
          label: "Refraction strength",
          group: "Optics",
          updateMode: "frame",
          minimum: WATER_OPTICS_LIMITS.refractionStrength[0],
          maximum: WATER_OPTICS_LIMITS.refractionStrength[1],
          step: WATER_OPTICS_LIMITS.refractionStrength[2],
          read: () => profileValue("refractionStrength", DEFAULT_WATER_OPTICAL_PROFILE.refractionStrength ?? 1),
          readEffective: () =>
            readEffectiveProfile().refractionStrength ?? DEFAULT_WATER_OPTICAL_PROFILE.refractionStrength ?? 1,
          write: (value) => updateProfile({ refractionStrength: value })
        });
  const controls: WaterControlDescriptor[] = [
    refractionControl,
    numberControl({
      id: `${idPrefix}.absorptionR`,
      label: "Absorption R",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.absorption[0],
      maximum: WATER_OPTICS_LIMITS.absorption[1],
      step: WATER_OPTICS_LIMITS.absorption[2],
      read: () => port.readProfile().absorptionCoefficient[0],
      readEffective: () => readEffectiveProfile().absorptionCoefficient[0],
      write: (value) => updateAbsorption(0, value)
    }),
    numberControl({
      id: `${idPrefix}.absorptionG`,
      label: "Absorption G",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.absorption[0],
      maximum: WATER_OPTICS_LIMITS.absorption[1],
      step: WATER_OPTICS_LIMITS.absorption[2],
      read: () => port.readProfile().absorptionCoefficient[1],
      readEffective: () => readEffectiveProfile().absorptionCoefficient[1],
      write: (value) => updateAbsorption(1, value)
    }),
    numberControl({
      id: `${idPrefix}.absorptionB`,
      label: "Absorption B",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.absorption[0],
      maximum: WATER_OPTICS_LIMITS.absorption[1],
      step: WATER_OPTICS_LIMITS.absorption[2],
      read: () => port.readProfile().absorptionCoefficient[2],
      readEffective: () => readEffectiveProfile().absorptionCoefficient[2],
      write: (value) => updateAbsorption(2, value)
    }),
    colorControl({
      id: `${idPrefix}.scatteringColor`,
      label: "Scattering color",
      group: "Optics",
      updateMode: "frame",
      read: () => linearRgbToHex(port.readProfile().scatteringColor),
      readEffective: () => linearRgbToHex(readEffectiveProfile().scatteringColor),
      write: (value) => updateProfile({ scatteringColor: hexToLinearRgb(value) })
    }),
    numberControl({
      id: `${idPrefix}.scatteringCoefficient`,
      label: "Scattering",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.scatteringCoefficient[0],
      maximum: WATER_OPTICS_LIMITS.scatteringCoefficient[1],
      step: WATER_OPTICS_LIMITS.scatteringCoefficient[2],
      read: () => port.readProfile().scatteringCoefficient,
      readEffective: () => readEffectiveProfile().scatteringCoefficient,
      write: (value) => updateProfile({ scatteringCoefficient: value })
    }),
    maximumViewDistanceControl,
    numberControl({
      id: `${idPrefix}.indexOfRefraction`,
      label: "IOR",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.indexOfRefraction[0],
      maximum: WATER_OPTICS_LIMITS.indexOfRefraction[1],
      step: WATER_OPTICS_LIMITS.indexOfRefraction[2],
      read: () => profileValue("indexOfRefraction", DEFAULT_WATER_OPTICAL_PROFILE.indexOfRefraction ?? 1.333),
      readEffective: () =>
        readEffectiveProfile().indexOfRefraction ?? DEFAULT_WATER_OPTICAL_PROFILE.indexOfRefraction ?? 1.333,
      write: (value) => updateProfile({ indexOfRefraction: value })
    }),
    numberControl({
      id: `${idPrefix}.maximumSurfaceOpticalDistance`,
      label: "Surface distance",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.maximumSurfaceOpticalDistance[0],
      maximum: WATER_OPTICS_LIMITS.maximumSurfaceOpticalDistance[1],
      step: WATER_OPTICS_LIMITS.maximumSurfaceOpticalDistance[2],
      read: () =>
        profileValue(
          "maximumSurfaceOpticalDistance",
          DEFAULT_WATER_OPTICAL_PROFILE.maximumSurfaceOpticalDistance ?? 64
        ),
      readEffective: () =>
        readEffectiveProfile().maximumSurfaceOpticalDistance ??
        DEFAULT_WATER_OPTICAL_PROFILE.maximumSurfaceOpticalDistance ??
        64,
      write: (value) => updateProfile({ maximumSurfaceOpticalDistance: value })
    }),
    refractionStrengthControl,
    numberControl({
      id: `${idPrefix}.roughness`,
      label: "Reflection roughness",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.roughness[0],
      maximum: WATER_OPTICS_LIMITS.roughness[1],
      step: WATER_OPTICS_LIMITS.roughness[2],
      read: () => profileValue("roughness", DEFAULT_WATER_OPTICAL_PROFILE.roughness ?? 0),
      readEffective: () => readEffectiveProfile().roughness ?? DEFAULT_WATER_OPTICAL_PROFILE.roughness ?? 0,
      write: (value) => updateProfile({ roughness: value })
    }),
    numberControl({
      id: `${idPrefix}.reflectionIntensity`,
      label: "Reflection intensity",
      group: "Optics",
      updateMode: "frame",
      minimum: WATER_OPTICS_LIMITS.reflectionIntensity[0],
      maximum: WATER_OPTICS_LIMITS.reflectionIntensity[1],
      step: WATER_OPTICS_LIMITS.reflectionIntensity[2],
      read: () => profileValue("reflectionIntensity", DEFAULT_WATER_OPTICAL_PROFILE.reflectionIntensity ?? 1),
      readEffective: () =>
        readEffectiveProfile().reflectionIntensity ?? DEFAULT_WATER_OPTICAL_PROFILE.reflectionIntensity ?? 1,
      write: (value) => updateProfile({ reflectionIntensity: value })
    })
  ];
  if (port.readProfile().surfaceScattering) {
    for (const [axis, name] of ["R", "G", "B"].entries())
      controls.push(
        numberControl({
          id: `${idPrefix}.surfaceScattering.${axis}`,
          label: `Surface scattering ${name} / m`,
          group: "Optics",
          updateMode: "frame",
          minimum: 0,
          maximum: MAX_WATER_OPTICAL_COEFFICIENT,
          step: 0.001,
          inputOnly: true,
          read: () => port.readProfile().surfaceScattering!.coefficientPerMeter[axis],
          write: (value) => {
            const current = port.readProfile().surfaceScattering!,
              coefficientPerMeter: [number, number, number] = [...current.coefficientPerMeter];
            coefficientPerMeter[axis] = value;
            return updateProfile({ surfaceScattering: { ...current, coefficientPerMeter } });
          }
        })
      );
    controls.push(
      numberControl({
        id: `${idPrefix}.surfaceScattering.phaseG`,
        label: "Scattering anisotropy",
        group: "Optics",
        updateMode: "frame",
        minimum: -0.95,
        maximum: 0.95,
        step: 0.001,
        read: () => port.readProfile().surfaceScattering!.phaseG,
        write: (value) =>
          updateProfile({ surfaceScattering: { ...port.readProfile().surfaceScattering!, phaseG: value } })
      })
    );
  }
  if (port.readProfile().fresnelF0 !== undefined)
    controls.push(
      numberControl({
        id: `${idPrefix}.fresnelF0`,
        label: "Fresnel F0",
        group: "Optics",
        updateMode: "frame",
        minimum: 0,
        maximum: 1,
        step: 0.001,
        read: () => port.readProfile().fresnelF0!,
        write: (value) => updateProfile({ fresnelF0: value })
      })
    );
  const readReflectionSampling = port.readReflectionSampling;
  const writeReflectionSampling = port.writeReflectionSampling;
  if (port.readEffectiveReflectionSource)
    controls.push(
      readonlyControl({
        id: `${idPrefix}.effectiveReflectionSource`,
        label: "Effective reflection",
        group: "Optics",
        owner: "reflection-provider",
        effect: "diagnostic",
        read: () => port.readEffectiveReflectionSource!()
      })
    );
  if (readReflectionSampling && writeReflectionSampling) {
    const updateReflectionSampling = (patch: Partial<WaterReflectionSamplingSettings>): void => {
      writeReflectionSampling(
        Object.freeze({
          ...readReflectionSampling(),
          ...patch
        })
      );
    };
    const reflectionNumber = (
      key: "screenSpaceCompositeIntensity" | "environmentFallbackIntensity",
      label: string
    ): WaterNumberControl => {
      const limits = WATER_REFLECTION_SAMPLING_LIMITS[key];
      const screenSpaceOnly = key === "screenSpaceCompositeIntensity";
      return numberControl({
        id: `${idPrefix}.reflectionSampling.${key}`,
        label,
        group: "Optics",
        owner: "reflection-provider",
        updateMode: "commit",
        description: screenSpaceOnly
          ? "Updates the Water Forward SSR contribution owned by the shared Water Look."
          : "Updates the borrowed Environment fallback intensity after slider commit.",
        availability: screenSpaceOnly ? "conditional" : "active",
        availabilityReason: screenSpaceOnly ? "Consumed only while the effective reflection source is SSR." : undefined,
        prerequisites: screenSpaceOnly ? Object.freeze(["Effective reflection source is SSR"]) : undefined,
        minimum: limits[0],
        maximum: limits[1],
        step: limits[2],
        read: () => readReflectionSampling()[key],
        readEffective: () =>
          !screenSpaceOnly || (screenSpaceOnly && port.readEffectiveReflectionSource?.() === "ssr")
            ? readReflectionSampling()[key]
            : "not currently consumed",
        write: (value) => updateReflectionSampling({ [key]: value })
      });
    };
    controls.push(
      reflectionNumber("screenSpaceCompositeIntensity", "SSR composite intensity"),
      reflectionNumber("environmentFallbackIntensity", "Environment fallback intensity")
    );
  }
  return controls.map((sourceControl) => {
    // Every value produced by this adapter is authored in one shared
    // WaterLook. Backend/provider names are consumers, not parameter owners.
    const control =
      sourceControl.kind === "readonly"
        ? sourceControl
        : (Object.freeze({ ...sourceControl, owner: "water-look" as const }) as WaterControlDescriptor);
    if (control.kind === "readonly") return control;
    if (port.authoringWritable === false) {
      return unavailableReadonlyControl(control, port.authoringReadonlyReason ?? NO_SHARED_LOOK_AUTHORING_REASON);
    }
    const suffix = control.id.startsWith(`${idPrefix}.`) ? control.id.slice(idPrefix.length + 1) : "";
    const key =
      WATER_OPTICAL_PROFILE_CONTROL_KEY_BY_SUFFIX[suffix as keyof typeof WATER_OPTICAL_PROFILE_CONTROL_KEY_BY_SUFFIX];
    if (!key) return control;
    const access = port.readProfileControlAccess?.(key);
    if (!access || access.writable) return control;
    const reason = access.reason ?? `The active Water Look does not expose a runtime override for '${String(key)}'.`;
    return unavailableReadonlyControl(control, reason);
  });
}

function requireLookAuthoringPort(target: WaterDevelopmentTarget): WaterLookAuthoringPort {
  const port = target.lookAuthoring;
  if (!port) throw new Error(`Water body '${target.bodyId}' has no shared Water Look authoring port.`);
  return port;
}

function readTargetOpticalProfileControlAccess(
  target: WaterDevelopmentTarget,
  key: keyof WaterOpticalProfile
): Readonly<{ writable: boolean; reason?: string }> {
  const look = target.lookAuthoring?.read();
  if (look) {
    const physical = look.appearance.appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.PhysicalVolume;
    const singleScattering = look.optics.profile.surfaceScattering !== undefined;
    if (
      (key === "absorptionCoefficient" && !physical && !singleScattering) ||
      ((key === "scatteringColor" || key === "scatteringCoefficient") && (!physical || singleScattering))
    )
      return { writable: false, reason: "The current surface closure does not consume this optical-volume parameter." };
    if (key === "indexOfRefraction" && look.optics.profile.fresnelF0 !== undefined)
      return { writable: false, reason: "The current profile uses an explicit Fresnel F0." };
  }
  return target.lookAuthoring
    ? Object.freeze({ writable: true })
    : Object.freeze({ writable: false, reason: "The active body has no shared Water Look authoring port." });
}

function readTargetOpticalProfile(
  target: WaterDevelopmentTarget,
  fallback: () => Readonly<WaterOpticalProfile>
): Readonly<WaterOpticalProfile> {
  return target.lookAuthoring?.read().optics.profile ?? target.handle.effectiveState?.optics ?? fallback();
}

function readTargetRefractionEnabled(target: WaterDevelopmentTarget, fallback: () => boolean): boolean {
  return (
    target.lookAuthoring?.read().optics.refractionEnabled ??
    target.handle.effectiveState?.refractionEnabled ??
    fallback()
  );
}

function writeTargetOpticalProfile(
  target: WaterDevelopmentTarget,
  profile: Readonly<WaterOpticalProfile>
): Promise<void> {
  return requireLookAuthoringPort(target)
    .update((current) =>
      Object.freeze({
        ...current,
        optics: Object.freeze({
          ...current.optics,
          profile: Object.freeze({
            ...current.optics.profile,
            surfaceScattering: profile.surfaceScattering ?? current.optics.profile.surfaceScattering,
            fresnelF0: profile.fresnelF0 ?? current.optics.profile.fresnelF0,
            ...profile,
            indexOfRefraction: profile.indexOfRefraction ?? current.optics.profile.indexOfRefraction,
            maximumSurfaceOpticalDistance:
              profile.maximumSurfaceOpticalDistance ?? current.optics.profile.maximumSurfaceOpticalDistance,
            refractionStrength: profile.refractionStrength ?? current.optics.profile.refractionStrength,
            roughness: profile.roughness ?? current.optics.profile.roughness,
            reflectionIntensity: profile.reflectionIntensity ?? current.optics.profile.reflectionIntensity
          })
        })
      })
    )
    .then(() => undefined);
}

function updateRefractionOverride(target: WaterDevelopmentTarget, enabled: boolean): Promise<void> {
  return requireLookAuthoringPort(target)
    .update((current) =>
      Object.freeze({
        ...current,
        optics: Object.freeze({ ...current.optics, refractionEnabled: enabled })
      })
    )
    .then(() => undefined);
}

function readTargetReflectionSampling(
  target: WaterDevelopmentTarget,
  fallback: () => Readonly<WaterReflectionSamplingSettings>
): Readonly<WaterReflectionSamplingSettings> {
  return (
    target.lookAuthoring?.read().look.reflectionSampling ??
    target.handle.effectiveState?.reflectionSampling ??
    fallback()
  );
}

function writeTargetReflectionSampling(
  target: WaterDevelopmentTarget,
  settings: Readonly<WaterReflectionSamplingSettings>
): Promise<void> {
  return requireLookAuthoringPort(target)
    .update((current) =>
      Object.freeze({
        ...current,
        look: Object.freeze({ ...current.look, reflectionSampling: settings })
      })
    )
    .then(() => undefined);
}

function requireAppearanceBindingV2(
  controller: HeightfieldWaterRuntimeController
): Readonly<WaterSurfaceAppearanceBindingV2> {
  const binding = controller.surfaceAppearanceBinding;
  if (!binding || !("textureBindings" in binding)) {
    throw new Error("Heightfield runtime has no active Surface Appearance V2 binding.");
  }
  return binding;
}

function updateAppearanceV2(
  target: WaterDevelopmentTarget,
  update: (appearance: Readonly<CompiledWaterSurfaceAppearanceV2>) => CompiledWaterSurfaceAppearanceV2
): Promise<void> {
  const port = requireLookAuthoringPort(target);
  const updated = update(readTargetCompiledAppearance(target));
  const source: WaterSurfaceAppearanceAssetV2 = Object.freeze({
    schemaVersion: updated.schemaVersion,
    id: updated.sourceId,
    primaryColorClosure: updated.primaryColorClosure,
    macroNormalStrength: updated.macroNormalStrength,
    flowNormalStrength: updated.flowNormalStrength,
    detailNormalStrength: updated.detailNormalStrength,
    caustics: updated.caustics,
    directionalHighlight: updated.directionalHighlight,
    detailLayers: updated.detailLayers,
    depthResponse: updated.depthResponse,
    boundaryEffects: updated.boundaryEffects,
    refraction: updated.refraction,
    composition: updated.composition
  });
  const compilation = WaterSurfaceAppearanceCompiler.compile(source);
  if (!compilation.valid || !compilation.data) {
    const details = compilation.diagnostics.map(({ path, message }) => `${path}: ${message}`).join("; ");
    throw new Error(`Surface Appearance V2 edit failed to compile${details ? `: ${details}` : "."}`);
  }
  return port
    .update((current) =>
      Object.freeze({
        ...current,
        appearance: Object.freeze({
          ...current.appearance,
          appearance: source
        })
      })
    )
    .then(() => undefined);
}

const compiledAppearances = new WeakMap<
  WaterLookAuthoringPort,
  {
    revision: number;
    contentHash: string;
    data: Readonly<CompiledWaterSurfaceAppearanceV2>;
  }
>();

function readTargetCompiledAppearance(target: WaterDevelopmentTarget): Readonly<CompiledWaterSurfaceAppearanceV2> {
  const port = requireLookAuthoringPort(target);
  const snapshot = port.read();
  const previous = compiledAppearances.get(port);
  if (previous?.revision === snapshot.revision && previous.contentHash === snapshot.contentHash) return previous.data;
  const source = snapshot.appearance.appearance;
  const compilation = WaterSurfaceAppearanceCompiler.compile(source);
  if (!compilation.valid || !compilation.data) {
    const details = compilation.diagnostics.map(({ path, message }) => `${path}: ${message}`).join("; ");
    throw new Error(`Active Surface Appearance V2 is invalid${details ? `: ${details}` : "."}`);
  }
  if (compilation.data.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2) {
    throw new Error("The active Water Look does not use Surface Appearance V2.");
  }
  compiledAppearances.set(port, {
    revision: snapshot.revision,
    contentHash: snapshot.contentHash,
    data: compilation.data
  });
  return compilation.data;
}

function replaceV2DetailLayer(
  appearance: Readonly<CompiledWaterSurfaceAppearanceV2>,
  index: number,
  update: (layer: Readonly<WaterSurfaceDetailLayerV2>) => WaterSurfaceDetailLayerV2
): CompiledWaterSurfaceAppearanceV2 {
  const detailLayers = appearance.detailLayers.map((layer, layerIndex) =>
    layerIndex === index ? Object.freeze(update(layer)) : layer
  );
  return { ...appearance, detailLayers: Object.freeze(detailLayers) };
}

function replaceV2DepthResponse(
  appearance: Readonly<CompiledWaterSurfaceAppearanceV2>,
  update: (response: Readonly<WaterSurfaceDepthResponseV2>) => WaterSurfaceDepthResponseV2
): CompiledWaterSurfaceAppearanceV2 {
  return { ...appearance, depthResponse: Object.freeze(update(appearance.depthResponse)) };
}

function replaceV2BoundaryEffect(
  appearance: Readonly<CompiledWaterSurfaceAppearanceV2>,
  index: number,
  update: (effect: Readonly<WaterBoundaryEffectV2>) => WaterBoundaryEffectV2
): CompiledWaterSurfaceAppearanceV2 {
  const boundaryEffects = appearance.boundaryEffects.map((effect, effectIndex) =>
    effectIndex === index ? Object.freeze(update(effect)) : effect
  );
  return { ...appearance, boundaryEffects: Object.freeze(boundaryEffects) };
}

function updateV2BoundaryPattern(
  effect: Readonly<WaterBoundaryEffectV2>,
  update: (pattern: Readonly<WaterPatternV2>) => WaterPatternV2
): WaterBoundaryEffectV2 {
  if (!effect.pattern) throw new Error(`Surface Appearance V2 boundary '${effect.id}' has no pattern.`);
  return { ...effect, pattern: Object.freeze(update(effect.pattern)) };
}

function createSurfaceAppearanceV2Controls(
  target: WaterDevelopmentTarget,
  binding?: Readonly<WaterSurfaceAppearanceBindingV2>
): WaterControlDescriptor[] {
  const controls: WaterControlDescriptor[] = [];
  const appearance = target.lookAuthoring
    ? readTargetCompiledAppearance(target)
    : (target.handle.effectiveState?.renderContract.surfaceClosure.appearance ?? binding?.appearance);
  if (!appearance) return controls;
  const readAppearance = (): Readonly<CompiledWaterSurfaceAppearanceV2> =>
    target.lookAuthoring
      ? readTargetCompiledAppearance(target)
      : (target.handle.effectiveState?.renderContract.surfaceClosure.appearance ?? appearance);
  const v2Number = (
    id: string,
    label: string,
    minimum: number,
    maximum: number,
    step: number,
    read: () => number,
    write: (value: number) => void | Promise<void>,
    prerequisites: readonly string[]
  ): WaterNumberControl =>
    numberControl({
      id,
      label,
      group: "Surface",
      owner: "surface-appearance-v2",
      effect: "visual",
      availability: prerequisites.length > 0 ? "conditional" : "active",
      prerequisites,
      updateMode: "frame",
      minimum,
      maximum,
      step,
      inputOnly: true,
      read,
      readEffective: read,
      write
    });

  for (const [id, label, read] of [
    ["closure", "Color closure", () => readAppearance().primaryColorClosure],
    ["depthModel", "Depth model", () => readAppearance().depthResponse.model],
    ["refractionNormal", "Refraction normal", () => readAppearance().refraction.normalSource],
    ["refractionValidation", "Refraction validation", () => readAppearance().refraction.validation]
  ] as const)
    controls.push(
      readonlyControl({
        id: `surface.authoring.${id}`,
        label,
        group: "Authoring (read-only)",
        section: ["Surface contract / 水面契约"],
        read
      })
    );

  for (const key of ["macroNormalStrength", "flowNormalStrength", "detailNormalStrength"] as const) {
    const consumed =
      key === "flowNormalStrength"
        ? appearance.flowNormalStrength !== undefined
        : key === "detailNormalStrength"
          ? appearance.detailLayers.length > 0
          : appearance.directionalHighlight !== undefined || appearance.macroNormalStrength !== undefined;
    if (!consumed) continue;
    controls.push(
      v2Number(
        `surface.appearanceV2.${key}`,
        key === "macroNormalStrength"
          ? "Macro normal strength"
          : key === "flowNormalStrength"
            ? "Flow normal strength"
            : "Detail normal strength",
        0,
        8,
        0.001,
        () => readAppearance()[key] ?? 1,
        (value) => updateAppearanceV2(target, (current) => ({ ...current, [key]: value })),
        []
      )
    );
  }

  const depthNumber = (
    key: "colorCoefficientPerMeter" | "opacityCoefficientPerMeter" | "maximumOpacity",
    label: string
  ): void => {
    if (!(key in appearance.depthResponse)) return;
    controls.push(
      v2Number(
        `surface.appearanceV2.depth.${key}`,
        label,
        0,
        key === "maximumOpacity" ? 1 : 1000,
        0.001,
        () => {
          const depth = readAppearance().depthResponse;
          return key in depth ? Number(depth[key as keyof typeof depth]) : 0;
        },
        (value) =>
          updateAppearanceV2(target, (current) =>
            replaceV2DepthResponse(current, (depth) => ({ ...depth, [key]: value }))
          ),
        ["Depth response enabled"]
      )
    );
  };
  depthNumber("colorCoefficientPerMeter", "Color coefficient / m");
  depthNumber("opacityCoefficientPerMeter", "Opacity coefficient / m");
  depthNumber("maximumOpacity", "Maximum opacity");
  for (const key of ["shallowColor", "deepColor"] as const) {
    const sourceDepth = appearance.depthResponse;
    const tint = "scatteringTint" in sourceDepth ? sourceDepth.scatteringTint : undefined;
    if (!(key in sourceDepth) && !tint) continue;
    const read = () => {
      const depth = readAppearance().depthResponse;
      return key in depth
        ? (depth as { shallowColor: WaterSurfaceAppearanceColor; deepColor: WaterSurfaceAppearanceColor })[key]
        : "scatteringTint" in depth && depth.scatteringTint
          ? depth.scatteringTint[key]
          : ([0, 0, 0, 1] as const);
    };
    controls.push(
      colorControl({
        id: `surface.appearanceV2.depth.${key}`,
        label: key === "shallowColor" ? "Shallow color" : "Deep color",
        group: "Surface",
        updateMode: "frame",
        owner: "surface-appearance-v2",
        read: () => linearRgbToHex(read()),
        write: (value) =>
          updateAppearanceV2(target, (current) =>
            replaceV2DepthResponse(current, (depth) => {
              const color = hexToLinearRgba(value, read()[3]);
              return "scatteringTint" in depth && depth.scatteringTint
                ? { ...depth, scatteringTint: { ...depth.scatteringTint, [key]: color } }
                : { ...depth, [key]: color };
            })
          )
      })
    );
  }
  if ("scatteringTint" in appearance.depthResponse && appearance.depthResponse.scatteringTint) {
    controls.push(
      v2Number(
        "surface.appearanceV2.depth.scatteringTint.coefficientPerMeter",
        "Tint coefficient / m",
        0,
        1000,
        0.001,
        () => {
          const depth = readAppearance().depthResponse;
          return "scatteringTint" in depth ? (depth.scatteringTint?.coefficientPerMeter ?? 0) : 0;
        },
        (value) =>
          updateAppearanceV2(target, (current) =>
            replaceV2DepthResponse(current, (depth) =>
              "scatteringTint" in depth && depth.scatteringTint
                ? { ...depth, scatteringTint: { ...depth.scatteringTint, coefficientPerMeter: value } }
                : depth
            )
          ),
        ["Depth response enabled"]
      )
    );
  }
  if ("terms" in appearance.depthResponse)
    appearance.depthResponse.terms.forEach((term, index) => {
      if (!term) return;
      controls.push(
        v2Number(
          `surface.appearanceV2.depth.term.${index}`,
          `${term.field} coefficient / m`,
          0.001,
          1000,
          0.001,
          () => {
            const depth = readAppearance().depthResponse;
            return "terms" in depth ? (depth.terms[index]?.coefficientPerMeter ?? 0) : 0;
          },
          (value) =>
            updateAppearanceV2(target, (current) =>
              replaceV2DepthResponse(current, (depth) => {
                if (!("terms" in depth)) return depth;
                const terms: [WaterExponentialDepthTermV2, WaterExponentialDepthTermV2?] = [...depth.terms];
                terms[index] = { ...terms[index]!, coefficientPerMeter: value };
                return { ...depth, terms };
              })
            ),
          ["Depth response enabled"]
        )
      );
    });

  if (appearance.caustics) {
    for (const [key, label, minimum, maximum] of [
      ["intensity", "Caustics intensity", 0, 1000],
      ["distortion", "Caustics distortion", -8, 8],
      ["parallaxOffset", "Caustics parallax offset", -100, 100],
      ["parallaxBias", "Caustics parallax bias", 0.0001, 100],
      ["fadeCoefficientPerMeter", "Caustics fade / m", 0, 1000],
      ["opacityContribution", "Caustics opacity", 0, 1]
    ] as const)
      controls.push(
        v2Number(
          `surface.appearanceV2.caustics.${key}`,
          label,
          minimum,
          maximum,
          0.001,
          () => readAppearance().caustics![key],
          (value) =>
            updateAppearanceV2(target, (current) => ({ ...current, caustics: { ...current.caustics!, [key]: value } })),
          []
        )
      );
    for (const key of ["scale", "velocity"] as const)
      for (const axis of [0, 1] as const)
        controls.push(
          v2Number(
            `surface.appearanceV2.caustics.${key}.${axis}`,
            `Caustics ${key} ${axis === 0 ? "X" : "Y"}`,
            key === "scale" ? 0.000001 : -1000,
            key === "scale" ? 10000 : 1000,
            0.001,
            () => readAppearance().caustics![key][axis],
            (value) =>
              updateAppearanceV2(target, (current) => {
                const tuple: [number, number] = [...current.caustics![key]];
                tuple[axis] = value;
                return { ...current, caustics: { ...current.caustics!, [key]: tuple } };
              }),
            []
          )
        );
    controls.push(
      readonlyControl({
        id: "surface.caustics.texture",
        label: "Caustics texture",
        group: "Authoring (read-only)",
        read: () => readAppearance().caustics!.textureAssetId
      })
    );
  }
  if (appearance.directionalHighlight) {
    for (const [key, label, minimum, maximum] of [
      ["strength", "Highlight strength", 0, 64],
      ["exponent", "Highlight exponent", 1, 8196],
      ["distortion", "Highlight distortion", 0, 2]
    ] as const)
      controls.push(
        v2Number(
          `surface.appearanceV2.highlight.${key}`,
          label,
          minimum,
          maximum,
          0.001,
          () => readAppearance().directionalHighlight![key],
          (value) =>
            updateAppearanceV2(target, (current) => ({
              ...current,
              directionalHighlight: { ...current.directionalHighlight!, [key]: value }
            })),
          ["Direct specular enabled"]
        )
      );
    controls.push(
      booleanControl({
        id: "surface.appearanceV2.highlight.sharp",
        label: "Sharp highlight",
        group: "Surface",
        updateMode: "commit",
        read: () => readAppearance().directionalHighlight!.sharp,
        write: (value) =>
          updateAppearanceV2(target, (current) => ({
            ...current,
            directionalHighlight: { ...current.directionalHighlight!, sharp: value }
          }))
      })
    );
  }

  appearance.detailLayers.forEach((sourceLayer, index) => {
    const layer = (): Readonly<WaterSurfaceDetailLayerV2> => readAppearance().detailLayers[index] ?? sourceLayer;
    const updateLayer = (
      update: (current: Readonly<WaterSurfaceDetailLayerV2>) => WaterSurfaceDetailLayerV2
    ): Promise<void> => updateAppearanceV2(target, (current) => replaceV2DetailLayer(current, index, update));
    const name = sourceLayer.id;
    const prefix = `surface.appearanceV2.detail.${name}`;
    const prerequisites = Object.freeze(["Detail layers enabled"]);
    controls.push(
      v2Number(
        `${prefix}.scaleX`,
        `${name} scale X`,
        0.001,
        1_024,
        0.001,
        () => layer().scale[0],
        (value) => updateLayer((current) => ({ ...current, scale: Object.freeze([value, current.scale[1]] as const) })),
        prerequisites
      ),
      v2Number(
        `${prefix}.scaleY`,
        `${name} scale Y`,
        0.001,
        1_024,
        0.001,
        () => layer().scale[1],
        (value) => updateLayer((current) => ({ ...current, scale: Object.freeze([current.scale[0], value] as const) })),
        prerequisites
      ),
      v2Number(
        `${prefix}.velocityX`,
        `${name} velocity X`,
        -1_024,
        1_024,
        0.001,
        () => layer().velocity[0],
        (value) =>
          updateLayer((current) => ({ ...current, velocity: Object.freeze([value, current.velocity[1]] as const) })),
        prerequisites
      ),
      v2Number(
        `${prefix}.velocityY`,
        `${name} velocity Y`,
        -1_024,
        1_024,
        0.001,
        () => layer().velocity[1],
        (value) =>
          updateLayer((current) => ({ ...current, velocity: Object.freeze([current.velocity[0], value] as const) })),
        prerequisites
      ),
      v2Number(
        `${prefix}.rotationDegrees`,
        `${name} rotation`,
        -3_600,
        3_600,
        0.1,
        () => layer().rotationDegrees,
        (value) => updateLayer((current) => ({ ...current, rotationDegrees: value })),
        prerequisites
      ),
      v2Number(
        `${prefix}.strength`,
        `${name} strength`,
        0.001,
        4,
        0.001,
        () => layer().strength,
        (value) => updateLayer((current) => ({ ...current, strength: value })),
        prerequisites
      )
    );
  });

  const depth = appearance.depthResponse;
  if ("distanceMeters" in depth) {
    controls.push(
      v2Number(
        "surface.appearanceV2.depth.distanceMeters",
        "Depth response distance",
        0.001,
        depthResponseSliderMaximum(depth.distanceMeters),
        0.001,
        () => {
          const current = readAppearance().depthResponse;
          return "distanceMeters" in current ? current.distanceMeters : 0;
        },
        (value) =>
          updateAppearanceV2(target, (current) =>
            replaceV2DepthResponse(current, (response) =>
              "distanceMeters" in response ? { ...response, distanceMeters: value } : response
            )
          ),
        Object.freeze(["Depth response enabled"])
      )
    );
  }
  if ("exponent" in depth) {
    controls.push(
      v2Number(
        "surface.appearanceV2.depth.exponent",
        "Depth response exponent",
        0.001,
        32,
        0.001,
        () => {
          const current = readAppearance().depthResponse;
          return "exponent" in current ? current.exponent : 1;
        },
        (value) =>
          updateAppearanceV2(target, (current) =>
            replaceV2DepthResponse(current, (response) =>
              "exponent" in response ? { ...response, exponent: value } : response
            )
          ),
        Object.freeze(["Depth response enabled"])
      )
    );
  }
  if ("color" in depth) {
    controls.push(
      colorControl({
        id: "surface.appearanceV2.depth.color",
        label: "Depth response color",
        group: "Surface",
        owner: "surface-appearance-v2",
        effect: "visual",
        availability: "conditional",
        prerequisites: Object.freeze(["Depth response enabled"]),
        updateMode: "frame",
        read: () => {
          const current = readAppearance().depthResponse;
          return "color" in current ? linearRgbToHex(current.color) : "#000000";
        },
        write: (value) =>
          updateAppearanceV2(target, (current) =>
            replaceV2DepthResponse(current, (response) => {
              if (!("color" in response)) return response;
              return { ...response, color: hexToLinearRgba(value, response.color[3]) };
            })
          )
      })
    );
  }
  if ("colors" in depth) {
    depth.colors.forEach((sourceStop, stopIndex) => {
      controls.push(
        v2Number(
          `surface.appearanceV2.depth.position.${stopIndex}`,
          `Depth stop ${stopIndex + 1}`,
          0,
          1,
          0.001,
          () => {
            const depth = readAppearance().depthResponse;
            return "colors" in depth ? depth.colors[stopIndex].position : sourceStop.position;
          },
          (value) =>
            updateAppearanceV2(target, (current) =>
              replaceV2DepthResponse(current, (depth) =>
                "colors" in depth
                  ? {
                      ...depth,
                      colors: depth.colors.map((stop, index) =>
                        index === stopIndex ? { ...stop, position: value } : stop
                      )
                    }
                  : depth
              )
            ),
          ["Depth response enabled"]
        )
      );
      controls.push(
        colorControl({
          id: `surface.appearanceV2.depth.color.${stopIndex}`,
          label: `Depth color ${stopIndex + 1}`,
          group: "Surface",
          owner: "surface-appearance-v2",
          effect: "visual",
          availability: "conditional",
          prerequisites: Object.freeze(["Depth response enabled"]),
          updateMode: "frame",
          read: () => {
            const current = readAppearance().depthResponse;
            return "colors" in current
              ? linearRgbToHex(current.colors[stopIndex]?.color ?? sourceStop.color)
              : "#000000";
          },
          write: (value) =>
            updateAppearanceV2(target, (current) =>
              replaceV2DepthResponse(current, (response) => {
                if (!("colors" in response)) return response;
                const colors = response.colors.map((stop, index) =>
                  index === stopIndex ? Object.freeze({ ...stop, color: hexToLinearRgba(value, stop.color[3]) }) : stop
                );
                return { ...response, colors: Object.freeze(colors) };
              })
            )
        })
      );
    });
  }

  appearance.boundaryEffects.forEach((sourceEffect, index) => {
    const effect = (): Readonly<WaterBoundaryEffectV2> => readAppearance().boundaryEffects[index] ?? sourceEffect;
    const updateEffect = (update: (current: Readonly<WaterBoundaryEffectV2>) => WaterBoundaryEffectV2): Promise<void> =>
      updateAppearanceV2(target, (current) => replaceV2BoundaryEffect(current, index, update));
    const prefix = `surface.appearanceV2.boundary.${sourceEffect.id}`;
    const prerequisites = Object.freeze([
      sourceEffect.outputs.alpha !== undefined ? "Boundary alpha enabled" : "Boundary material enabled"
    ]);
    controls.push(
      v2Number(
        `${prefix}.rangeMeters`,
        `${sourceEffect.id} range`,
        0.001,
        100_000,
        0.001,
        () => effect().rangeMeters,
        (value) => updateEffect((current) => ({ ...current, rangeMeters: value })),
        prerequisites
      )
    );
    if (sourceEffect.exponent !== undefined) {
      controls.push(
        v2Number(
          `${prefix}.exponent`,
          `${sourceEffect.id} exponent`,
          0.001,
          32,
          0.001,
          () => effect().exponent ?? 1,
          (value) => updateEffect((current) => ({ ...current, exponent: value })),
          prerequisites
        )
      );
    }
    const sourcePattern = sourceEffect.pattern;
    if (sourcePattern) {
      const pattern = (): Readonly<WaterPatternV2> => effect().pattern ?? sourcePattern;
      const updatePattern = (update: (current: Readonly<WaterPatternV2>) => WaterPatternV2): Promise<void> =>
        updateEffect((current) => updateV2BoundaryPattern(current, update));
      controls.push(
        v2Number(
          `${prefix}.pattern.worldScale`,
          `${sourceEffect.id} pattern scale`,
          0.001,
          100_000,
          0.001,
          () => pattern().worldScale,
          (value) => updatePattern((current) => ({ ...current, worldScale: value })),
          prerequisites
        ),
        v2Number(
          `${prefix}.pattern.timeRate`,
          `${sourceEffect.id} pattern speed`,
          0.001,
          1_024,
          0.001,
          () => pattern().timeRate,
          (value) => updatePattern((current) => ({ ...current, timeRate: value })),
          prerequisites
        ),
        v2Number(
          `${prefix}.pattern.opacity`,
          `${sourceEffect.id} pattern opacity`,
          0,
          1,
          0.001,
          () => pattern().opacity,
          (value) => updatePattern((current) => ({ ...current, opacity: value })),
          prerequisites
        ),
        v2Number(
          `${prefix}.pattern.lacunarity`,
          `${sourceEffect.id} lacunarity`,
          0.001,
          64,
          0.001,
          () => pattern().lacunarity,
          (value) => updatePattern((current) => ({ ...current, lacunarity: value })),
          prerequisites
        )
      );
      if (sourcePattern.exponent !== undefined) {
        controls.push(
          v2Number(
            `${prefix}.pattern.exponent`,
            `${sourceEffect.id} pattern exponent`,
            -32,
            32,
            0.001,
            () => pattern().exponent ?? sourcePattern.exponent ?? 1,
            (value) => {
              if (value === 0) throw new RangeError("A Surface Appearance V2 power-pattern exponent must be non-zero.");
              updatePattern((current) => ({ ...current, exponent: value }));
            },
            prerequisites
          )
        );
      }
    }
    if (sourceEffect.outputs.alpha !== undefined) {
      controls.push(
        v2Number(
          `${prefix}.output.alpha`,
          `${sourceEffect.id} alpha`,
          0,
          1,
          0.001,
          () => effect().outputs.alpha ?? 0,
          (value) => updateEffect((current) => ({ ...current, outputs: { ...current.outputs, alpha: value } })),
          prerequisites
        )
      );
    }
    if (sourceEffect.outputs.color !== undefined) {
      controls.push(
        colorControl({
          id: `${prefix}.output.color`,
          label: `${sourceEffect.id} color`,
          group: "Surface",
          owner: "surface-appearance-v2",
          effect: "visual",
          availability: "conditional",
          prerequisites,
          updateMode: "frame",
          read: () => linearRgbToHex(effect().outputs.color ?? [0, 0, 0]),
          write: (value) =>
            updateEffect((current) => ({
              ...current,
              outputs: { ...current.outputs, color: hexToLinearRgb(value) }
            }))
        })
      );
    }
    if (sourceEffect.outputs.roughness !== undefined) {
      controls.push(
        v2Number(
          `${prefix}.output.roughness`,
          `${sourceEffect.id} roughness`,
          0,
          1,
          0.001,
          () => effect().outputs.roughness ?? 0,
          (value) =>
            updateEffect((current) => ({
              ...current,
              outputs: { ...current.outputs, roughness: value }
            })),
          prerequisites
        )
      );
    }
    if (sourceEffect.outputs.refractionSuppression !== undefined) {
      controls.push(
        v2Number(
          `${prefix}.output.refractionSuppression`,
          `${sourceEffect.id} refraction suppression`,
          0,
          1,
          0.001,
          () => effect().outputs.refractionSuppression ?? 0,
          (value) =>
            updateEffect((current) => ({
              ...current,
              outputs: { ...current.outputs, refractionSuppression: value }
            })),
          prerequisites
        )
      );
    }
  });

  if (appearance.refraction.enabled)
    controls.push(
      v2Number(
        "surface.appearanceV2.refraction.uvScale",
        "Refraction UV scale",
        0,
        8,
        0.001,
        () => readAppearance().refraction.uvScale,
        (value) =>
          updateAppearanceV2(target, (current) => ({
            ...current,
            refraction: Object.freeze({ ...current.refraction, uvScale: value })
          })),
        Object.freeze(["Refraction enabled", "Camera opaque color and depth available"])
      )
    );
  return controls;
}

function createSharedSurfaceControls(
  target: WaterDevelopmentTarget,
  binding?: Readonly<WaterSurfaceAppearanceBindingV2>
): WaterControlDescriptor[] {
  const feature = <Key extends keyof HeightfieldWaterSurfaceAppearanceFeatureFlags>(
    key: Key,
    label: string
  ): WaterBooleanControl =>
    booleanControl({
      id: `surface.feature.${key}`,
      label,
      group: "Surface",
      owner: "surface-appearance-v2",
      updateMode: "live",
      read: () =>
        target.lookAuthoring?.read().appearance.featureFlags[key] ??
        target.handle.effectiveState?.appearanceFeatureFlags[key] ??
        false,
      write: (value) =>
        requireLookAuthoringPort(target)
          .update((current) =>
            Object.freeze({
              ...current,
              appearance: Object.freeze({
                ...current.appearance,
                featureFlags: Object.freeze({ ...current.appearance.featureFlags, [key]: value })
              })
            })
          )
          .then(() => undefined)
    });
  const sharedLookControls: WaterControlDescriptor[] = [
    feature("externalNormal", "Detail layers"),
    feature("depthTint", "Depth response"),
    feature("coastalAlpha", "Boundary alpha"),
    feature("contactFoam", "Boundary material"),
    feature("directSpecular", "Direct specular")
  ];
  // River currently binds its V2 layers unconditionally; only its direct-light gate is consumed.
  if (target.bodyKind === "river") sharedLookControls.splice(0, 4);
  const appearance = target.lookAuthoring?.read().appearance.appearance ?? binding?.appearance;
  if (appearance) {
    const available = new Map<string, boolean>([
      ["surface.feature.externalNormal", appearance.detailLayers.length > 0],
      ["surface.feature.coastalAlpha", appearance.boundaryEffects.some((effect) => effect.outputs.alpha !== undefined)],
      [
        "surface.feature.contactFoam",
        appearance.boundaryEffects.some(
          (effect) =>
            effect.outputs.color !== undefined ||
            effect.outputs.roughness !== undefined ||
            effect.outputs.refractionSuppression !== undefined
        )
      ]
    ]);
    for (let index = sharedLookControls.length - 1; index >= 0; index--)
      if (available.get(sharedLookControls[index].id) === false) sharedLookControls.splice(index, 1);
  }
  sharedLookControls.push(...createSurfaceAppearanceV2Controls(target, binding));
  return [
    ...(target.lookAuthoring
      ? sharedLookControls
      : sharedLookControls.map((control) =>
          control.kind === "readonly" ? control : unavailableReadonlyControl(control, NO_SHARED_LOOK_AUTHORING_REASON)
        ))
  ];
}

function createHeightfieldControls(
  target: WaterDevelopmentTarget,
  controller: HeightfieldWaterRuntimeController
): WaterControlDescriptor[] {
  const controls = createCommonControls(target);
  const lakeWaterLevelRuntime =
    target.bodyKind === "lake" && isLakeWaterLevelRuntimeDevelopmentPort(target.development?.runtime)
      ? target.development.runtime
      : undefined;
  if (lakeWaterLevelRuntime) {
    const limits = lakeWaterLevelRuntime.readback;
    controls.push(
      numberControl({
        id: "lake.runtimeWaterLevelMetres",
        label: "Lake water level",
        group: "Body",
        owner: "lake-water-level",
        effect: "state",
        updateMode: "frame",
        sessionScope: "transient",
        minimum: limits.minimumWaterLevelMetres,
        maximum: limits.maximumWaterLevelMetres,
        step: 0.01,
        description:
          "Runtime-only world-space Y. The authored Hydrology level is the hard ceiling, so raising the slider cannot overflow the Lake.",
        read: () => lakeWaterLevelRuntime.readback.effectiveWaterLevelMetres,
        readEffective: () => lakeWaterLevelRuntime.readback.effectiveWaterLevelMetres,
        write: (value) => {
          lakeWaterLevelRuntime.setWaterLevelMetres(value);
        }
      })
    );
  }
  const lookAuthoring = target.lookAuthoring;
  let lastCompiled = controller.activeData;
  const compiled = () => {
    const current = controller.activeData;
    if (current) lastCompiled = current;
    return lastCompiled;
  };
  const publishingLabel = "Publishing runtime generation…";
  const appearanceV2 = requireAppearanceBindingV2(controller);

  controls.push(...createSharedSurfaceControls(target, appearanceV2));

  controls.push(
    ...createOpticsControls("heightfield.optics", {
      readProfile: () => readTargetOpticalProfile(target, () => controller.opticalProfile),
      readEffectiveProfile: () => controller.activeSurfaceOpticsReadback?.opticalProfile ?? controller.opticalProfile,
      writeProfile: (profile) => writeTargetOpticalProfile(target, profile),
      authoringWritable: lookAuthoring !== undefined,
      authoringReadonlyReason: NO_SHARED_LOOK_AUTHORING_REASON,
      readProfileControlAccess: (key) => readTargetOpticalProfileControlAccess(target, key),
      readRefraction: () => readTargetRefractionEnabled(target, () => controller.refractionEnabled),
      refractionWritable: lookAuthoring !== undefined && appearanceV2.appearance.refraction.enabled,
      ...(lookAuthoring ? {} : { refractionReadonlyReason: NO_SHARED_LOOK_AUTHORING_REASON }),
      writeRefraction: (enabled) => updateRefractionOverride(target, enabled),
      maximumViewDistanceWritable: target.handle.body.capabilities.underwaterVolume,
      maximumViewDistanceReadonlyReason:
        "This water body has no underwater-volume provider; maximum view distance has no active consumer.",
      refractionStrengthWritable: false,
      refractionStrengthReadonlyReason:
        "Surface Appearance V2 owns displacement through Refraction UV scale; optical-profile refraction strength is not consumed.",
      readEffectiveReflectionSource: () => controller.activeSurfaceOpticsReadback?.effectiveSource ?? "sky",
      readReflectionSampling: () =>
        readTargetReflectionSampling(
          target,
          () => controller.reflectionSamplingSettings ?? resolveWaterReflectionSamplingSettings()
        ),
      writeReflectionSampling: (settings) => writeTargetReflectionSampling(target, settings)
    }),
    enumControl({
      id: "heightfield.debugMode",
      label: "Debug view",
      group: "Backend",
      updateMode: "live",
      options: Object.freeze({
        Final: HeightfieldWaterDebugMode.Final,
        "Detail normal": HeightfieldWaterDebugMode.DetailNormal,
        "Depth tint": HeightfieldWaterDebugMode.DepthTint,
        "Contact foam": HeightfieldWaterDebugMode.ContactFoam,
        "Coastal alpha": HeightfieldWaterDebugMode.CoastalAlpha,
        "Direct specular": HeightfieldWaterDebugMode.DirectSpecular,
        "Refraction amount": HeightfieldWaterDebugMode.RefractionAmount,
        "Reflection color": HeightfieldWaterDebugMode.ReflectionColor,
        "Effective roughness": HeightfieldWaterDebugMode.EffectiveRoughness,
        "Environment reflection": HeightfieldWaterDebugMode.EnvironmentReflection,
        "Composite reflection": HeightfieldWaterDebugMode.CompositeReflection
      }),
      read: () => controller.debugMode,
      write: (value) => controller.setDebugMode(Number(value) as HeightfieldWaterDebugMode)
    }),
    booleanControl({
      id: "heightfield.animate",
      label: "Use scene time",
      group: "Backend",
      updateMode: "live",
      read: () => controller.surfaceTimeOverride === undefined,
      write: (value) => controller.setSurfaceTimeOverride(value ? undefined : 0)
    }),
    numberControl({
      id: "heightfield.surfaceTime",
      label: "Surface time",
      group: "Backend",
      updateMode: "frame",
      minimum: 0,
      maximum: 120,
      step: 0.01,
      read: () => controller.surfaceTimeOverride ?? 0,
      write: (value) => controller.setSurfaceTimeOverride(value)
    }),
    readonlyControl({
      id: "heightfield.gridResolution",
      label: "Source grid",
      group: "Authoring (read-only)",
      description: "Grid topology is immutable after Heightfield compilation.",
      read: () => {
        const data = compiled();
        return data ? `${data.grid.width} × ${data.grid.height}` : publishingLabel;
      }
    }),
    readonlyControl({
      id: "heightfield.cellSize",
      label: "Cell size XZ",
      group: "Authoring (read-only)",
      description: "Changing cell size requires a new compiled spatial field.",
      read: () => {
        const data = compiled();
        return data ? `${data.grid.cellSizeXZ[0]} × ${data.grid.cellSizeXZ[1]}` : publishingLabel;
      }
    }),
    readonlyControl({
      id: "heightfield.aggregationScale",
      label: "Aggregation",
      group: "Authoring (read-only)",
      read: () => compiled()?.aggregationScale ?? publishingLabel
    }),
    readonlyControl({
      id: "heightfield.componentCount",
      label: "Components",
      group: "Authoring (read-only)",
      read: () => compiled()?.components.length ?? publishingLabel
    }),
    readonlyControl({
      id: "heightfield.chunkCount",
      label: "Chunks",
      group: "Authoring (read-only)",
      read: () => compiled()?.chunks.length ?? publishingLabel
    }),
    readonlyControl({
      id: "heightfield.localMapAtlas",
      label: "Local map atlas",
      group: "Authoring (read-only)",
      description: "Bathymetry, flow and shore distance share this immutable compiled atlas.",
      read: () => {
        const data = compiled();
        return data ? `${data.localMapAtlas.width} × ${data.localMapAtlas.height}` : publishingLabel;
      }
    }),
    readonlyControl({
      id: "heightfield.maximumDepth",
      label: "Max bathymetry depth",
      group: "Authoring (read-only)",
      read: () => compiled()?.localMapAtlas.maxDepth ?? publishingLabel
    }),
    readonlyControl({
      id: "heightfield.shoreDistanceRange",
      label: "Shore SDF range",
      group: "Authoring (read-only)",
      read: () => compiled()?.localMapAtlas.signedDistanceRange ?? publishingLabel
    })
  );
  return controls;
}

/** Only fields with an active RiverDropRenderer receive editable controls. */
function createRiverDropControls(target: WaterDevelopmentTarget): WaterControlDescriptor[] {
  if (
    !target.lookAuthoring ||
    !(target.development?.adapter as { dropCount?: number })?.dropCount ||
    !target.lookAuthoring.read().look.riverDrops
  )
    return [];
  const controls: WaterControlDescriptor[] = [];
  const read = () => target.lookAuthoring!.read().look.riverDrops!;
  const update = (updater: (look: Readonly<RiverDropLook>) => RiverDropLook) =>
    target
      .lookAuthoring!.update((current) => ({
        ...current,
        look: { ...current.look, riverDrops: updater(current.look.riverDrops!) }
      }))
      .then(() => undefined);
  const addNumber = (
    id: string,
    label: string,
    getter: () => number,
    setter: (value: number) => Promise<void>,
    section: string,
    minimum = 0,
    maximum = Number.MAX_VALUE
  ) =>
    controls.push(
      numberControl({
        id: `river.drops.${id}`,
        label,
        group: "Surface",
        section: ["River drops / 落水", section],
        owner: "water-look",
        updateMode: "frame",
        inputOnly: true,
        minimum,
        maximum,
        step: 0.001,
        read: getter,
        write: setter
      })
    );
  for (const key of [
    "speed",
    "opacity",
    "normalStrength",
    "colorContrast",
    "parallaxDepth",
    "foamOpacity",
    "sprayOpacity",
    "mistOpacity"
  ] as const)
    addNumber(
      key,
      key,
      () => read()[key],
      (value) => update((current) => ({ ...current, [key]: value })),
      "Appearance / 外观",
      0,
      ["opacity", "foamOpacity", "sprayOpacity", "mistOpacity"].includes(key) ? 1 : Number.MAX_VALUE
    );
  for (const [index, label] of [
    "Dark body / 深色水体",
    "Light body / 浅色水体",
    "Streaks / 条纹",
    "White water / 白水"
  ].entries()) {
    controls.push(
      colorControl({
        id: `river.drops.color.${index}`,
        label,
        group: "Surface",
        section: ["River drops / 落水", "Appearance / 外观"],
        owner: "water-look",
        updateMode: "frame",
        read: () => linearRgbToHex(read().colors[index]),
        write: (value) =>
          update((current) => {
            const colors = [...current.colors] as [
              readonly [number, number, number],
              readonly [number, number, number],
              readonly [number, number, number],
              readonly [number, number, number]
            ];
            colors[index] = hexToLinearRgb(value);
            return { ...current, colors: colors as RiverDropLook["colors"] };
          })
      })
    );
  }
  for (const group of ["curtain", "impact"] as const) {
    for (const [key, initial] of Object.entries(read()[group])) {
      if (typeof initial !== "number") continue;
      const getter = () => (read()[group] as unknown as Record<string, number>)[key];
      const maximum =
        key === "bottomFoamStart"
          ? 0.999999
          : [
                "bottomFoamThreshold",
                "edgeCutout",
                "edgeFoamThreshold",
                "edgeFoamOpacity",
                "dotsThreshold",
                "dotsOpacity",
                "threshold"
              ].includes(key)
            ? 1
            : Number.MAX_VALUE;
      addNumber(
        `${group}.${key}`,
        key,
        getter,
        (value) => update((current) => ({ ...current, [group]: { ...current[group], [key]: value } })),
        group === "curtain" ? "Curtain / 水帘" : "Impact / 落点",
        key === "velocity" ? -Number.MAX_VALUE : 0,
        maximum
      );
    }
  }
  for (const slot of Object.keys(read().layers) as Array<keyof RiverDropLook["layers"]>) {
    for (const key of ["scale", "velocity"] as const)
      for (const axis of [0, 1] as const)
        addNumber(
          `layers.${slot}.${key}.${axis}`,
          `${key} ${axis === 0 ? "X" : "Y"}`,
          () => read().layers[slot][key][axis],
          (value) =>
            update((current) => {
              const tuple: [number, number] = [...current.layers[slot][key]];
              tuple[axis] = value;
              return { ...current, layers: { ...current.layers, [slot]: { ...current.layers[slot], [key]: tuple } } };
            }),
          slot,
          key === "scale" ? Number.MIN_VALUE : -Number.MAX_VALUE
        );
  }
  for (const axis of [0, 1] as const)
    addNumber(
      `impact.scale.${axis}`,
      `Impact scale ${axis === 0 ? "X" : "Y"}`,
      () => read().impact.scale[axis],
      (value) =>
        update((current) => {
          const scale: [number, number] = [...current.impact.scale];
          scale[axis] = value;
          return { ...current, impact: { ...current.impact, scale } };
        }),
      "Impact / 落点",
      Number.MIN_VALUE
    );
  for (const slot of Object.keys(read().textures) as Array<keyof RiverDropLook["textures"]>)
    controls.push(
      readonlyControl({
        id: `river.drops.texture.${slot}`,
        label: `${slot} texture`,
        group: "Authoring (read-only)",
        section: ["River drops / 落水"],
        read: () => read().textures[slot].assetId
      })
    );
  return controls;
}

function createRiverControls(
  target: WaterDevelopmentTarget,
  controller: RiverRuntimeController
): WaterControlDescriptor[] {
  const controls = createCommonControls(target);
  if (target.lookAuthoring || target.handle.effectiveState?.renderContract.surfaceClosure.appearance)
    controls.push(...createSharedSurfaceControls(target));
  controls.push(...createRiverDropControls(target));
  if (target.lookAuthoring) {
    const readFoam = () => target.lookAuthoring!.read().look.foam;
    const updateFoam = (patch: Partial<ReturnType<typeof readFoam>>) =>
      target
        .lookAuthoring!.update((current) => ({
          ...current,
          look: { ...current.look, foam: { ...current.look.foam, ...patch } }
        }))
        .then(() => undefined);
    controls.push(
      booleanControl({
        id: "river.foam.enabled",
        label: "Surface foam",
        group: "Surface",
        section: ["Surface foam / 水面泡沫"],
        updateMode: "frame",
        read: () => readFoam().enabled,
        write: (value) => updateFoam({ enabled: value })
      }),
      numberControl({
        id: "river.foam.intensity",
        label: "Foam intensity",
        group: "Surface",
        section: ["Surface foam / 水面泡沫"],
        updateMode: "frame",
        minimum: 0,
        maximum: 8,
        step: 0.001,
        read: () => readFoam().intensity,
        write: (value) => updateFoam({ intensity: value })
      }),
      colorControl({
        id: "river.foam.color",
        label: "Foam color",
        group: "Surface",
        section: ["Surface foam / 水面泡沫"],
        updateMode: "frame",
        read: () => readFoam().color,
        write: (value) => updateFoam({ color: value })
      })
    );
  }
  const reach = () => {
    const value = controller.reachSummary.first;
    if (!value) throw new Error("River runtime has no active reach.");
    return value;
  };
  controls.push(
    readonlyControl({
      id: "river.macroDisplacement",
      label: "Macro displacement",
      group: "Authoring (read-only)",
      read: () => controller.macroDisplacementEnabled
    }),
    readonlyControl({
      id: "river.microSurface",
      label: "Micro surface",
      group: "Authoring (read-only)",
      read: () => controller.microSurfaceEnabled
    }),
    readonlyControl({
      id: "river.junctions",
      label: "Junction surfaces",
      group: "Authoring (read-only)",
      read: () => controller.junctionVisibility
    }),
    enumControl({
      id: "river.debugMode",
      label: "Debug view",
      group: "Backend",
      updateMode: "live",
      options: Object.freeze({
        Final: RiverSurfaceDebugMode.Off,
        "Flow coordinate": RiverSurfaceDebugMode.FlowCoordinate,
        "Macro height": RiverSurfaceDebugMode.MacroHeight,
        "Crest mask": RiverSurfaceDebugMode.CrestMask,
        "Micro normal": RiverSurfaceDebugMode.MicroNormal,
        "Shore damping": RiverSurfaceDebugMode.ShoreDamping,
        "Local flow": RiverSurfaceDebugMode.LocalFlow,
        "Local foam": RiverSurfaceDebugMode.LocalFoam,
        "Water depth": RiverSurfaceDebugMode.WaterDepth,
        "Surface normal": RiverSurfaceDebugMode.SurfaceNormal,
        "Refraction validity": RiverSurfaceDebugMode.RefractionValidity,
        "Refracted scene": RiverSurfaceDebugMode.DisplacedScene,
        "SSR validity": RiverSurfaceDebugMode.SsrValidity,
        "SSR radiance": RiverSurfaceDebugMode.SsrRadiance
      }),
      read: () => controller.surfaceDebugMode,
      write: (value) => controller.setSurfaceDebugMode(Number(value) as RiverSurfaceDebugMode)
    }),
    booleanControl({
      id: "river.animate",
      label: "Use scene time",
      group: "Backend",
      updateMode: "live",
      read: () => controller.surfaceTimeOverride === undefined,
      write: (value) => controller.setSurfaceTimeOverride(value ? undefined : 0)
    }),
    numberControl({
      id: "river.surfaceTime",
      label: "Surface time",
      group: "Backend",
      updateMode: "frame",
      minimum: 0,
      maximum: 120,
      step: 0.01,
      read: () => controller.surfaceTimeOverride ?? 0,
      write: (value) => controller.setSurfaceTimeOverride(value)
    }),
    ...createOpticsControls("river.optics", {
      readProfile: () =>
        readTargetOpticalProfile(
          target,
          () => controller.surfaceOpticsBinding?.opticalProfile ?? DEFAULT_WATER_OPTICAL_PROFILE
        ),
      writeProfile: (profile) => writeTargetOpticalProfile(target, profile),
      authoringWritable: target.lookAuthoring !== undefined,
      authoringReadonlyReason: NO_SHARED_LOOK_AUTHORING_REASON,
      readProfileControlAccess: (key) => readTargetOpticalProfileControlAccess(target, key),
      readRefraction: () =>
        readTargetRefractionEnabled(target, () => controller.surfaceOpticsBinding?.refractionEnabled ?? false),
      refractionWritable:
        target.lookAuthoring !== undefined && target.lookAuthoring.read().appearance.appearance.refraction.enabled,
      ...(target.lookAuthoring ? {} : { refractionReadonlyReason: NO_SHARED_LOOK_AUTHORING_REASON }),
      refractionStrengthWritable: false,
      refractionStrengthReadonlyReason: "Surface Appearance V2 consumes Refraction UV scale.",
      maximumViewDistanceWritable: target.handle.body.capabilities.underwaterVolume,
      maximumViewDistanceReadonlyReason:
        "This water body has no underwater-volume provider; maximum view distance has no active consumer.",
      writeRefraction: (enabled) => updateRefractionOverride(target, enabled),
      readReflectionSampling: () =>
        readTargetReflectionSampling(target, () =>
          resolveWaterReflectionSamplingSettings(controller.surfaceOpticsBinding?.reflectionSampling)
        ),
      readEffectiveReflectionSource: () => controller.surfaceOpticsBinding?.reflection?.resolvedSource ?? "sky",
      writeReflectionSampling: (settings) => writeTargetReflectionSampling(target, settings)
    }),
    readonlyControl({
      id: "river.reachCount",
      label: "Reach count",
      group: "Authoring (read-only)",
      read: () => controller.reachSummary.reachCount
    }),
    readonlyControl({
      id: "river.pathMode",
      label: "Path mode",
      group: "Authoring (read-only)",
      read: () => reach().pathMode
    }),
    readonlyControl({
      id: "river.controlPointCount",
      label: "Control points",
      group: "Authoring (read-only)",
      read: () => reach().controlPointCount
    }),
    readonlyControl({
      id: "river.segmentLength",
      label: "Sample spacing",
      group: "Authoring (read-only)",
      description: "Longitudinal sampling density is fixed by authoring, quality and compile budgets.",
      read: () => reach().segmentLength
    }),
    readonlyControl({
      id: "river.width",
      label: "Authored width",
      group: "Authoring (read-only)",
      read: () => reach().width
    }),
    readonlyControl({
      id: "river.depth",
      label: "Authored depth",
      group: "Authoring (read-only)",
      read: () => reach().depth
    }),
    readonlyControl({
      id: "river.flowSpeed",
      label: "Authored flow speed",
      group: "Authoring (read-only)",
      read: () => reach().flowSpeed
    }),
    readonlyControl({
      id: "river.sampleCount",
      label: "Compiled samples",
      group: "Authoring (read-only)",
      read: () => reach().sampleCount
    }),
    readonlyControl({
      id: "river.compiledLength",
      label: "Compiled length",
      group: "Authoring (read-only)",
      read: () => reach().compiledLength
    })
  );
  return controls;
}

function updateOceanTuning<Section extends keyof OceanRuntimeTuning>(
  controller: OceanWaterRuntimeController,
  section: Section,
  patch: Partial<OceanRuntimeTuning[Section]>
): void {
  const current = controller.tuning;
  controller.setTuning(
    Object.freeze({
      ...current,
      [section]: Object.freeze({ ...current[section], ...patch })
    }) as Readonly<OceanRuntimeTuning>
  );
}

function colorWithAlpha(
  color: readonly [number, number, number, number],
  alpha: number
): readonly [number, number, number, number] {
  return Object.freeze([color[0], color[1], color[2], alpha] as const);
}

function oceanNumberControl(
  options: Readonly<{
    id: string;
    label: string;
    group: "Surface" | "Optics";
    limit: OceanTuningRange;
    description?: string;
    read: () => number;
    write: (value: number) => void;
  }>
): WaterNumberControl {
  return numberControl({
    id: options.id,
    label: options.label,
    group: options.group,
    owner: "water-look",
    effect: "visual",
    updateMode: "frame",
    sessionScope: "persistent",
    description: options.description,
    minimum: options.limit.minimum,
    maximum: options.limit.maximum,
    step: options.limit.step,
    read: options.read,
    write: options.write
  });
}

function oceanBooleanControl(
  options: Readonly<{
    id: string;
    label: string;
    group: "Surface" | "Optics";
    read: () => boolean;
    write: (value: boolean) => void;
  }>
): WaterBooleanControl {
  return booleanControl({
    id: options.id,
    label: options.label,
    group: options.group,
    owner: "water-look",
    effect: "visual",
    updateMode: "live",
    sessionScope: "persistent",
    read: options.read,
    write: options.write
  });
}

function oceanColorControl(
  options: Readonly<{
    id: string;
    label: string;
    group: "Surface" | "Optics";
    read: () => readonly [number, number, number, number];
    write: (color: readonly [number, number, number, number]) => void;
  }>
): WaterColorControl {
  return colorControl({
    id: options.id,
    label: options.label,
    group: options.group,
    owner: "water-look",
    effect: "visual",
    updateMode: "live",
    sessionScope: "persistent",
    read: () => linearRgbToHex(options.read()),
    write: (value) => options.write(hexToLinearRgba(value, options.read()[3]))
  });
}

function createOceanRuntimeTuningControls(controller: OceanWaterRuntimeController): WaterControlDescriptor[] {
  const limits = OCEAN_TUNING_LIMITS;
  const controls: WaterControlDescriptor[] = [];
  const waveNumber = (
    key: keyof OceanRuntimeTuning["wave"],
    id: string,
    label: string,
    limit: OceanTuningRange
  ): void => {
    controls.push(
      oceanNumberControl({
        id,
        label,
        group: "Surface",
        limit,
        read: () => controller.tuning.wave[key],
        write: (value) => updateOceanTuning(controller, "wave", { [key]: value })
      })
    );
  };
  waveNumber("height", "ocean.wave.height", "Wave height", limits.wave.height);
  waveNumber("distance", "ocean.wave.distance", "Wave distance", limits.wave.distance);
  waveNumber("speed", "ocean.wave.speed", "Wave speed", limits.wave.speed);
  waveNumber("steepness", "ocean.wave.steepness", "Wave steepness", limits.wave.steepness);
  waveNumber("normalStrength", "ocean.wave.normalStrength", "Macro normal strength", limits.wave.normalStrength);
  controls.push(
    oceanNumberControl({
      id: "ocean.wave.fadeStart",
      label: "Wave fade start",
      group: "Surface",
      limit: limits.wave.fadeStartMetres,
      read: () => controller.tuning.wave.fadeStartMetres,
      write: (value) => {
        const end = controller.tuning.wave.fadeEndMetres;
        updateOceanTuning(controller, "wave", {
          fadeStartMetres: value,
          ...(value >= end ? { fadeEndMetres: value + limits.wave.fadeEndMetres.step } : {})
        });
      }
    }),
    oceanNumberControl({
      id: "ocean.wave.fadeEnd",
      label: "Wave fade end",
      group: "Surface",
      limit: limits.wave.fadeEndMetres,
      read: () => controller.tuning.wave.fadeEndMetres,
      write: (value) => {
        const start = controller.tuning.wave.fadeStartMetres;
        updateOceanTuning(controller, "wave", {
          ...(value <= start ? { fadeStartMetres: Math.max(0, value - limits.wave.fadeEndMetres.step) } : {}),
          fadeEndMetres: value
        });
      }
    })
  );
  waveNumber("animationSpeed", "ocean.wave.animationSpeed", "Surface animation speed", limits.wave.animationSpeed);

  const normalNumber = (
    key: Exclude<keyof OceanRuntimeTuning["normal"], "tiling">,
    id: string,
    label: string,
    limit: OceanTuningRange
  ): void => {
    controls.push(
      oceanNumberControl({
        id,
        label,
        group: "Surface",
        limit,
        read: () => controller.tuning.normal[key],
        write: (value) => updateOceanTuning(controller, "normal", { [key]: value })
      })
    );
  };
  normalNumber("strength", "ocean.normal.strength", "Detail normal strength", limits.normal.strength);
  for (const [axis, label] of [
    [0, "Normal tiling X"],
    [1, "Normal tiling Y"]
  ] as const) {
    controls.push(
      oceanNumberControl({
        id: `ocean.normal.tiling${axis === 0 ? "X" : "Y"}`,
        label,
        group: "Surface",
        limit: limits.normal.tiling,
        read: () => controller.tuning.normal.tiling[axis],
        write: (value) => {
          const current = controller.tuning.normal.tiling;
          updateOceanTuning(controller, "normal", {
            tiling: Object.freeze(axis === 0 ? [value, current[1]] : [current[0], value]) as readonly [number, number]
          });
        }
      })
    );
  }
  normalNumber("subTiling", "ocean.normal.subTiling", "Normal sub-tiling", limits.normal.subTiling);
  normalNumber("speed", "ocean.normal.speed", "Normal speed", limits.normal.speed);
  normalNumber("subSpeed", "ocean.normal.subSpeed", "Normal sub-speed", limits.normal.subSpeed);
  normalNumber("distanceTiling", "ocean.normal.distanceTiling", "Far normal tiling", limits.normal.distanceTiling);
  controls.push(
    oceanNumberControl({
      id: "ocean.normal.fadeStart",
      label: "Normal fade start",
      group: "Surface",
      limit: limits.normal.distanceFadeStartMetres,
      read: () => controller.tuning.normal.distanceFadeStartMetres,
      write: (value) => {
        const end = controller.tuning.normal.distanceFadeEndMetres;
        updateOceanTuning(controller, "normal", {
          distanceFadeStartMetres: value,
          ...(value >= end ? { distanceFadeEndMetres: value + limits.normal.distanceFadeEndMetres.step } : {})
        });
      }
    }),
    oceanNumberControl({
      id: "ocean.normal.fadeEnd",
      label: "Normal fade end",
      group: "Surface",
      limit: limits.normal.distanceFadeEndMetres,
      read: () => controller.tuning.normal.distanceFadeEndMetres,
      write: (value) => {
        const start = controller.tuning.normal.distanceFadeStartMetres;
        updateOceanTuning(controller, "normal", {
          ...(value <= start
            ? { distanceFadeStartMetres: Math.max(0, value - limits.normal.distanceFadeEndMetres.step) }
            : {}),
          distanceFadeEndMetres: value
        });
      }
    })
  );

  for (const [key, label] of [
    ["shallow", "Shallow color"],
    ["deep", "Deep color"],
    ["horizon", "Horizon color"]
  ] as const) {
    controls.push(
      oceanColorControl({
        id: `ocean.color.${key}`,
        label,
        group: "Surface",
        read: () => controller.tuning.color[key],
        write: (color) => updateOceanTuning(controller, "color", { [key]: color })
      }),
      oceanNumberControl({
        id: `ocean.color.${key}Alpha`,
        label: key === "horizon" ? "Horizon strength" : `${label} opacity`,
        group: "Surface",
        limit: Object.freeze({ minimum: 0, maximum: 1, step: 0.001 }),
        read: () => controller.tuning.color[key][3],
        write: (value) =>
          updateOceanTuning(controller, "color", { [key]: colorWithAlpha(controller.tuning.color[key], value) })
      })
    );
  }
  for (const [key, label, limit] of [
    ["horizontal", "Horizontal depth density", limits.depth.horizontal],
    ["vertical", "Vertical depth density", limits.depth.vertical]
  ] as const) {
    controls.push(
      oceanNumberControl({
        id: `ocean.depth.${key}`,
        label,
        group: "Surface",
        limit,
        read: () => controller.tuning.depth[key],
        write: (value) => updateOceanTuning(controller, "depth", { [key]: value })
      })
    );
  }

  const reflectionNumber = (
    key: keyof OceanRuntimeTuning["reflection"],
    label: string,
    limit: OceanTuningRange
  ): void => {
    controls.push(
      oceanNumberControl({
        id: `ocean.reflection.${key}`,
        label,
        group: "Optics",
        limit,
        read: () => controller.tuning.reflection[key],
        write: (value) => updateOceanTuning(controller, "reflection", { [key]: value })
      })
    );
  };
  reflectionNumber("strength", "Reflection intensity", limits.reflection.strength);
  reflectionNumber("distortion", "Reflection distortion", limits.reflection.distortion);
  // Shared Schlick/DFG owns Fresnel; the legacy Ocean exponent is not editable.
  reflectionNumber("blur", "Reflection roughness", limits.reflection.blur);
  reflectionNumber("sunStrength", "Sun reflection strength", limits.reflection.sunStrength);
  reflectionNumber("sunSize", "Sun reflection size", limits.reflection.sunSize);
  reflectionNumber("sunDistortion", "Sun reflection distortion", limits.reflection.sunDistortion);

  controls.push(
    oceanBooleanControl({
      id: "ocean.refraction.enabled",
      label: "Refraction",
      group: "Optics",
      read: () => controller.tuning.refraction.enabled,
      write: (value) => updateOceanTuning(controller, "refraction", { enabled: value })
    }),
    oceanNumberControl({
      id: "ocean.refraction.strength",
      label: "Refraction strength",
      group: "Optics",
      limit: limits.refraction.strength,
      read: () => controller.tuning.refraction.strength,
      write: (value) => updateOceanTuning(controller, "refraction", { strength: value })
    })
  );

  controls.push(
    oceanBooleanControl({
      id: "ocean.surfaceFoam.enabled",
      label: "Surface foam",
      group: "Surface",
      read: () => controller.tuning.surfaceFoam.enabled,
      write: (value) => updateOceanTuning(controller, "surfaceFoam", { enabled: value })
    }),
    oceanColorControl({
      id: "ocean.surfaceFoam.color",
      label: "Surface foam color",
      group: "Surface",
      read: () => controller.tuning.surfaceFoam.color,
      write: (color) => updateOceanTuning(controller, "surfaceFoam", { color })
    }),
    oceanNumberControl({
      id: "ocean.surfaceFoam.opacity",
      label: "Surface foam opacity",
      group: "Surface",
      limit: Object.freeze({ minimum: 0, maximum: 1, step: 0.001 }),
      read: () => controller.tuning.surfaceFoam.color[3],
      write: (value) =>
        updateOceanTuning(controller, "surfaceFoam", {
          color: colorWithAlpha(controller.tuning.surfaceFoam.color, value)
        })
    })
  );
  const foamNumber = (
    key: Exclude<keyof OceanRuntimeTuning["surfaceFoam"], "enabled" | "color" | "tiling">,
    label: string,
    limit: OceanTuningRange
  ): void => {
    controls.push(
      oceanNumberControl({
        id: `ocean.surfaceFoam.${key}`,
        label,
        group: "Surface",
        limit,
        read: () => controller.tuning.surfaceFoam[key],
        write: (value) => updateOceanTuning(controller, "surfaceFoam", { [key]: value })
      })
    );
  };
  foamNumber("baseAmount", "Surface foam amount", limits.surfaceFoam.baseAmount);
  for (const [axis, label] of [
    [0, "Surface foam tiling X"],
    [1, "Surface foam tiling Y"]
  ] as const) {
    controls.push(
      oceanNumberControl({
        id: `ocean.surfaceFoam.tiling${axis === 0 ? "X" : "Y"}`,
        label,
        group: "Surface",
        limit: limits.surfaceFoam.tiling,
        read: () => controller.tuning.surfaceFoam.tiling[axis],
        write: (value) => {
          const current = controller.tuning.surfaceFoam.tiling;
          updateOceanTuning(controller, "surfaceFoam", {
            tiling: Object.freeze(axis === 0 ? [value, current[1]] : [current[0], value]) as readonly [number, number]
          });
        }
      })
    );
  }
  foamNumber("subTiling", "Surface foam sub-tiling", limits.surfaceFoam.subTiling);
  foamNumber("speed", "Surface foam speed", limits.surfaceFoam.speed);
  foamNumber("subSpeed", "Surface foam sub-speed", limits.surfaceFoam.subSpeed);
  foamNumber("distortion", "Surface foam distortion", limits.surfaceFoam.distortion);

  controls.push(
    oceanBooleanControl({
      id: "ocean.intersection.enabled",
      label: "Shore intersection",
      group: "Surface",
      read: () => controller.tuning.intersection.enabled,
      write: (value) => updateOceanTuning(controller, "intersection", { enabled: value })
    }),
    oceanColorControl({
      id: "ocean.intersection.color",
      label: "Shore intersection color",
      group: "Surface",
      read: () => controller.tuning.intersection.color,
      write: (color) => updateOceanTuning(controller, "intersection", { color })
    })
  );
  const intersectionNumber = (
    key: Exclude<keyof OceanRuntimeTuning["intersection"], "enabled" | "color">,
    label: string,
    limit: OceanTuningRange
  ): void => {
    controls.push(
      oceanNumberControl({
        id: `ocean.intersection.${key}`,
        label,
        group: "Surface",
        limit,
        read: () => controller.tuning.intersection[key],
        write: (value) => updateOceanTuning(controller, "intersection", { [key]: value })
      })
    );
  };
  intersectionNumber("lengthMetres", "Shore intersection length", limits.intersection.lengthMetres);
  intersectionNumber("falloff", "Shore intersection falloff", limits.intersection.falloff);
  intersectionNumber("tiling", "Shore intersection tiling", limits.intersection.tiling);
  intersectionNumber("speed", "Shore intersection speed", limits.intersection.speed);
  intersectionNumber("clipping", "Shore intersection clipping", limits.intersection.clipping);
  intersectionNumber("distortion", "Shore intersection distortion", limits.intersection.distortion);
  intersectionNumber("rippleDistance", "Shore ripple distance", limits.intersection.rippleDistance);
  intersectionNumber("rippleStrength", "Shore ripple strength", limits.intersection.rippleStrength);

  controls.push(
    oceanBooleanControl({
      id: "ocean.caustics.enabled",
      label: "Caustics",
      group: "Surface",
      read: () => controller.tuning.caustics.enabled,
      write: (value) => updateOceanTuning(controller, "caustics", { enabled: value })
    })
  );
  const causticsNumber = (
    key: Exclude<keyof OceanRuntimeTuning["caustics"], "enabled">,
    label: string,
    limit: OceanTuningRange
  ): void => {
    controls.push(
      oceanNumberControl({
        id: `ocean.caustics.${key}`,
        label,
        group: "Surface",
        limit,
        read: () => controller.tuning.caustics[key],
        write: (value) => updateOceanTuning(controller, "caustics", { [key]: value })
      })
    );
  };
  causticsNumber("brightness", "Caustics brightness", limits.caustics.brightness);
  causticsNumber("chromance", "Caustics chromance", limits.caustics.chromance);
  causticsNumber("distortion", "Caustics distortion", limits.caustics.distortion);
  causticsNumber("speed", "Caustics speed", limits.caustics.speed);
  causticsNumber("tiling", "Caustics tiling", limits.caustics.tiling);

  controls.push(
    oceanBooleanControl({
      id: "ocean.translucency.enabled",
      label: "Translucency",
      group: "Optics",
      read: () => controller.tuning.translucency.enabled,
      write: (value) => updateOceanTuning(controller, "translucency", { enabled: value })
    })
  );
  const translucencyNumber = (
    key: Exclude<keyof OceanRuntimeTuning["translucency"], "enabled">,
    label: string,
    limit: OceanTuningRange
  ): void => {
    controls.push(
      oceanNumberControl({
        id: `ocean.translucency.${key}`,
        label,
        group: "Optics",
        limit,
        read: () => controller.tuning.translucency[key],
        write: (value) => updateOceanTuning(controller, "translucency", { [key]: value })
      })
    );
  };
  translucencyNumber("strength", "Translucency strength", limits.translucency.strength);
  translucencyNumber("directStrength", "Direct translucency", limits.translucency.directStrength);
  translucencyNumber("exponent", "Translucency exponent", limits.translucency.exponent);
  translucencyNumber("curvatureMask", "Translucency curvature", limits.translucency.curvatureMask);
  return controls;
}

function createOceanControls(
  target: WaterDevelopmentTarget,
  controller: OceanWaterRuntimeController
): WaterControlDescriptor[] {
  const controls = createCommonControls(
    target,
    "The Ocean backend does not support buoyancy or wake. / Ocean 后端不支持浮力或尾迹路由。"
  );
  const oceanWaterLevelRuntime =
    target.bodyKind === "ocean" && isOceanWaterLevelRuntimeDevelopmentPort(target.development?.runtime)
      ? target.development.runtime
      : undefined;
  if (oceanWaterLevelRuntime) {
    const limits = oceanWaterLevelRuntime.readback;
    controls.push(
      numberControl({
        id: "ocean.runtimeWaterLevelMetres",
        label: "Ocean water level",
        group: "Body",
        owner: "ocean-water-level",
        effect: "state",
        updateMode: "frame",
        sessionScope: "transient",
        minimum: limits.minimumWaterLevelMetres,
        maximum: limits.maximumWaterLevelMetres,
        step: 0.01,
        description:
          "Runtime-only world-space Y. The generated Ocean datum remains the default while the rendered surface may move both above and below it.",
        read: () => oceanWaterLevelRuntime.readback.effectiveWaterLevelMetres,
        readEffective: () => oceanWaterLevelRuntime.readback.effectiveWaterLevelMetres,
        write: (value) => {
          oceanWaterLevelRuntime.setWaterLevelMetres(value);
        }
      })
    );
  }
  controls.push(...createOceanRuntimeTuningControls(controller));
  controls.push(
    readonlyControl({
      id: "ocean.responseModel",
      label: "Response model",
      group: "Authoring (read-only)",
      read: () => controller.metrics.responseModel
    }),
    readonlyControl({
      id: "ocean.lookId",
      label: "Fixed Look",
      group: "Authoring (read-only)",
      read: () => controller.metrics.lookId
    }),
    readonlyControl({
      id: "ocean.parameterHash",
      label: "Parameter hash",
      group: "Authoring (read-only)",
      read: () => controller.metrics.parameterHash
    }),
    readonlyControl({
      id: "ocean.waterLevel",
      label: "Water level",
      group: "Authoring (read-only)",
      read: () => controller.config.waterLevel
    }),
    readonlyControl({
      id: "ocean.topology",
      label: "Topology",
      group: "Authoring (read-only)",
      read: () => controller.metrics.surfaceTopology
    }),
    readonlyControl({
      id: "ocean.reflection",
      label: "Reflection",
      group: "Authoring (read-only)",
      read: () => controller.metrics.reflectionSource
    }),
    readonlyControl({
      id: "ocean.refraction",
      label: "Refraction",
      group: "Authoring (read-only)",
      read: () =>
        `${controller.metrics.refractionEnabled ? "enabled" : "disabled"} / camera-fields=${controller.metrics.cameraFeaturesAvailable ? "ready" : "unavailable"}`
    }),
    readonlyControl({
      id: "ocean.foam",
      label: "Foam model",
      group: "Authoring (read-only)",
      read: () =>
        `surface=${controller.tuning.surfaceFoam.enabled}; intersection=${controller.tuning.intersection.enabled}`
    }),
    readonlyControl({
      id: "ocean.capabilities",
      label: "Runtime capabilities",
      group: "Authoring (read-only)",
      read: () =>
        Object.entries(target.handle.body.capabilities)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key)
          .join(" · ") || "none"
    }),
    booleanControl({
      id: "ocean.lodDebug",
      label: "LOD debug",
      group: "Backend",
      owner: "runtime-diagnostics",
      effect: "diagnostic",
      updateMode: "live",
      sessionScope: "transient",
      read: () => controller.lodDebugEnabled,
      write: (value) => controller.setLodDebug(value)
    }),
    booleanControl({
      id: "ocean.animate",
      label: "Use scene time",
      group: "Backend",
      owner: "runtime-diagnostics",
      effect: "state",
      updateMode: "live",
      sessionScope: "transient",
      read: () => controller.surfaceTimeOverride === undefined,
      write: (value) => controller.setSurfaceTimeOverride(value ? undefined : 0)
    }),
    numberControl({
      id: "ocean.surfaceTime",
      label: "Surface time",
      group: "Backend",
      owner: "runtime-diagnostics",
      effect: "state",
      updateMode: "frame",
      sessionScope: "transient",
      minimum: 0,
      maximum: 120,
      step: 0.01,
      read: () => controller.surfaceTimeOverride ?? 0,
      write: (value) => controller.setSurfaceTimeOverride(value)
    }),
    enumControl({
      id: "ocean.debugView",
      label: "Debug view",
      group: "Backend",
      owner: "runtime-diagnostics",
      effect: "diagnostic",
      updateMode: "live",
      sessionScope: "transient",
      options: Object.freeze({
        Final: OceanDebugView.Final,
        "Macro normal": OceanDebugView.MacroNormal,
        "Detail normal": OceanDebugView.DetailNormal,
        "Depth density": OceanDebugView.DepthDensity,
        "Shore distance": OceanDebugView.ShoreDistance,
        Refraction: OceanDebugView.Refraction,
        "Environment reflection": OceanDebugView.EnvironmentReflection,
        Foam: OceanDebugView.Foam,
        Caustics: OceanDebugView.Caustics,
        Lighting: OceanDebugView.Lighting,
        Coverage: OceanDebugView.Coverage
      }),
      read: () => controller.debugView,
      write: (value) => controller.setDebugView(Number(value) as OceanDebugView)
    }),
    readonlyControl({
      id: "ocean.draws",
      label: "Resident batches / triangles",
      description: RESIDENT_BATCHES_DESCRIPTION,
      group: "Backend",
      read: () => `${controller.metrics.drawCount} / ${controller.metrics.triangleCount}`
    }),
    readonlyControl({
      id: "ocean.geometryCells",
      label: "Near cells / far quads",
      group: "Backend",
      read: () => `${controller.metrics.nearFieldCellCount} / ${controller.metrics.farFieldQuadCount}`
    }),
    readonlyControl({
      id: "ocean.rings",
      label: "Far rings / edge segments / meshes",
      group: "Backend",
      read: () =>
        `${controller.metrics.farFieldRingCount} / ${controller.metrics.farFieldSegmentsPerEdge} / ${controller.metrics.activeMeshCount}`
    }),
    readonlyControl({
      id: "ocean.resources",
      label: "KTX2 textures (compressed/fallback) / texture / atlas / total GPU bytes",
      group: "Backend",
      read: () =>
        `${controller.metrics.textureCount} (${controller.metrics.compressedTextureCount}/${controller.metrics.uncompressedTextureFallbackCount}) / ${controller.metrics.textureResourceBytes} / ${controller.metrics.nearshoreResourceBytes} / ${controller.metrics.ownedGpuBytes}`
    }),
    readonlyControl({
      id: "ocean.frameUploads",
      label: "Per-frame mesh upload",
      group: "Backend",
      read: () => controller.metrics.perFrameMeshUpload
    })
  );
  return controls;
}

class HeightfieldWaterTuningAdapter implements WaterTuningAdapter {
  readonly id = HEIGHTFIELD_WATER_BACKEND_ID;

  supports(target: WaterDevelopmentTarget): boolean {
    const adapter = target.development?.adapter;
    return (
      target.development?.backendId === this.id &&
      typeof adapter === "object" &&
      adapter !== null &&
      "surfaceAppearanceBinding" in adapter &&
      "activeData" in adapter
    );
  }

  createSession(target: WaterDevelopmentTarget): WaterTuningSession {
    const controller = target.development?.adapter as HeightfieldWaterRuntimeController | undefined;
    if (!controller || typeof controller !== "object")
      throw new Error("Heightfield Water DevTools target is missing its adapter DTO.");
    return Object.freeze({ target, controls: Object.freeze(createHeightfieldControls(target, controller)) });
  }
}

class RiverWaterTuningAdapter implements WaterTuningAdapter {
  readonly id = RIVER_WATER_BACKEND_ID;

  supports(target: WaterDevelopmentTarget): boolean {
    const adapter = target.development?.adapter;
    return (
      target.development?.backendId === this.id &&
      typeof adapter === "object" &&
      adapter !== null &&
      "reachSummary" in adapter
    );
  }

  createSession(target: WaterDevelopmentTarget): WaterTuningSession {
    const controller = target.development?.adapter as RiverRuntimeController | undefined;
    if (!controller || typeof controller !== "object")
      throw new Error("River Water DevTools target is missing its adapter DTO.");
    return Object.freeze({ target, controls: Object.freeze(createRiverControls(target, controller)) });
  }
}

class OceanWaterTuningAdapter implements WaterTuningAdapter {
  readonly id = OCEAN_WATER_BACKEND_ID;

  supports(target: WaterDevelopmentTarget): boolean {
    const adapter = target.development?.adapter;
    return (
      target.development?.backendId === this.id &&
      typeof adapter === "object" &&
      adapter !== null &&
      "config" in adapter &&
      "metrics" in adapter
    );
  }

  createSession(target: WaterDevelopmentTarget): WaterTuningSession {
    const controller = target.development?.adapter as OceanWaterRuntimeController | undefined;
    if (!controller || typeof controller !== "object")
      throw new Error("Ocean Water DevTools target is missing its adapter DTO.");
    return Object.freeze({
      target,
      controls: Object.freeze(createOceanControls(target, controller)),
      exportDraft: () =>
        Object.freeze({
          schemaVersion: 2,
          responseModel: controller.metrics.responseModel,
          lookId: controller.metrics.lookId,
          parameterHash: controller.metrics.parameterHash,
          waterLevel: controller.config.waterLevel,
          nearshoreSourceHash: controller.metrics.nearshoreSourceHash,
          tuning: controller.tuning
        })
    });
  }
}

class GenericWaterTuningAdapter implements WaterTuningAdapter {
  readonly id = "generic";

  supports(): boolean {
    return true;
  }

  createSession(target: WaterDevelopmentTarget): WaterTuningSession {
    return Object.freeze({ target, controls: Object.freeze(createCommonControls(target)) });
  }
}

const WATER_TUNING_ADAPTERS: readonly WaterTuningAdapter[] = Object.freeze([
  new HeightfieldWaterTuningAdapter(),
  new RiverWaterTuningAdapter(),
  new OceanWaterTuningAdapter(),
  new GenericWaterTuningAdapter()
]);

function controlSection(control: WaterControlDescriptor): readonly string[] | undefined {
  if (control.section) return control.section;
  const id = control.id;
  if (id.includes(".appearanceV2.detail.")) return ["Detail layers / 细节法线", id.split(".detail.")[1].split(".")[0]];
  if (id.includes(".appearanceV2.depth.")) return ["Depth response / 水色与透明度"];
  if (id.includes(".appearanceV2.caustics.")) return ["Caustics / 焦散"];
  if (id.includes(".appearanceV2.highlight.")) return ["Highlight / 高光"];
  if (id.includes(".appearanceV2.boundary."))
    return ["Boundary effects / 边界效果", id.split(".boundary.")[1].split(".")[0]];
  if (id.includes(".appearanceV2.refraction.")) return ["Refraction / 折射"];
  if (id.startsWith("ocean.") && control.group === "Surface") {
    const section: Record<string, string> = {
      wave: "Waves / 波浪",
      normal: "Detail normals / 细节法线",
      color: "Color / 水色",
      depth: "Depth response / 深度响应",
      surfaceFoam: "Surface foam / 水面泡沫",
      intersection: "Shore intersection / 岸边交界",
      caustics: "Caustics / 焦散"
    };
    if (section[id.split(".")[1]]) return [section[id.split(".")[1]]];
  }
  return undefined;
}

export function createWaterTuningSession(
  target: WaterDevelopmentTarget,
  mode: "full" | "presentation" = "full"
): WaterTuningSession {
  const adapter = WATER_TUNING_ADAPTERS.find((candidate) => candidate.supports(target));
  if (!adapter) throw new Error(`No Water tuning adapter supports '${target.backendId}'.`);
  const created = adapter.createSession(target);
  const session = Object.freeze({
    ...created,
    controls: Object.freeze(
      created.controls
        .filter(
          (control) =>
            control.availability !== "unavailable" &&
            !(control.id === "body.wake" && !target.handle.body.interactionSink) &&
            !(
              control.id === "body.query" &&
              !target.handle.body.capabilities.finalSurfaceQuery &&
              !target.handle.body.capabilities.spatialField
            )
        )
        .map((control) => {
          const prerequisites =
            target.bodyKind === "river"
              ? control.prerequisites?.filter(
                  (value) =>
                    ![
                      "Detail layers enabled",
                      "Depth response enabled",
                      "Boundary alpha enabled",
                      "Boundary material enabled"
                    ].includes(value)
                )
              : control.prerequisites;
          return Object.freeze({
            ...control,
            prerequisites,
            section: controlSection(control),
            availability:
              control.availability === "conditional" && prerequisites?.length === 0 ? "active" : control.availability
          });
        })
    )
  });
  return mode === "presentation" ? createPresentationWaterTuningSession(session) : session;
}
