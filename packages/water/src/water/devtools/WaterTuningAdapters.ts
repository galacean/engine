import type { WaterBodyRuntimeVariant } from "../authoring/body/WaterBodyAuthoringTypes";
import { createWaterReflectionPresentationPolicy } from "../authoring/optics/WaterReflectionPolicy";
import type { RiverDropLook } from "../authoring/river/RiverDropLook";
import {
  WaterSurfaceAppearanceSchemaVersion,
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
import { isLakeWaterLevelRuntimeDevelopmentPort } from "../runtime/body/LakeWaterLevelRuntimeDevelopmentPort";
import { isOceanWaterLevelRuntimeDevelopmentPort } from "../runtime/body/OceanWaterLevelRuntimeDevelopmentPort";
import type { WaterDevelopmentTarget } from "../runtime/body/WaterBodyLoader";
import { HEIGHTFIELD_WATER_BACKEND_ID } from "../runtime/heightfield/HeightfieldWaterBackend";
import type { HeightfieldWaterRuntimeController } from "../runtime/heightfield/HeightfieldWaterRuntimeController";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "../runtime/heightfield/types";
import {
  OCEAN_TUNING_LIMITS,
  type OceanRuntimeTuning,
  type OceanTuningRange
} from "../runtime/ocean/OceanRuntimeTuning";
import { OCEAN_WATER_BACKEND_ID } from "../runtime/ocean/OceanWaterBackend";
import type { OceanWaterRuntimeController } from "../runtime/ocean/OceanWaterRuntimeController";
import type { RiverRuntimeController } from "../runtime/river/RiverRuntimeController";
import { RIVER_WATER_BACKEND_ID } from "../runtime/river/RiverWaterBackend";
import type { WaterLookAuthoringPort } from "../runtime/state/WaterLookAuthoringPort";
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
import { createPresentationWaterTuningSession } from "./WaterPresentationSession";

const MINIMUM_DEPTH_RESPONSE_SLIDER_MAXIMUM_METRES = 32;

function depthResponseSliderMaximum(distanceMeters: number): number {
  return Math.min(100_000, Math.max(MINIMUM_DEPTH_RESPONSE_SLIDER_MAXIMUM_METRES, Math.ceil(distanceMeters * 4)));
}

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
    description: control.description ?? "Read-only authoring value; no runtime write contract is exposed.",
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
    })
  );
  return controls;
}

function requireLookAuthoringPort(target: WaterDevelopmentTarget): WaterLookAuthoringPort {
  const port = target.lookAuthoring;
  if (!port) throw new Error(`Water body '${target.bodyId}' has no shared Water Look authoring port.`);
  return port;
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
  const appearanceV2 = requireAppearanceBindingV2(controller);

  controls.push(...createSharedSurfaceControls(target, appearanceV2));
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
      "surfaceAppearanceBinding" in adapter
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
      "tuning" in adapter
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
      "tuning" in adapter
    );
  }

  createSession(target: WaterDevelopmentTarget): WaterTuningSession {
    const controller = target.development?.adapter as OceanWaterRuntimeController | undefined;
    if (!controller || typeof controller !== "object")
      throw new Error("Ocean Water DevTools target is missing its adapter DTO.");
    return Object.freeze({
      target,
      controls: Object.freeze(createOceanControls(target, controller))
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
