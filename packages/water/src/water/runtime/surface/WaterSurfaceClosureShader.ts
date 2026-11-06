/** Shared optical-volume, composition, and final-output primitives for every Water backend. */
import waterSurfaceBoundedTranslucency from "../../shaders/library/surface/WaterSurfaceBoundedTranslucency.glsl?raw";
import {
  WaterSurfaceCompositionV2,
  WaterSurfacePrimaryColorClosure
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import waterSingleScatteringShader from "../../shaders/library/surface/WaterSurfaceSingleScattering.glsl?raw";
import waterSurfaceClosureShaderTemplate from "../../shaders/library/surface/WaterSurfaceClosure.glsl?raw";
import {
  renderWaterShaderFunctionAssignment,
  renderWaterShaderTemplate,
  renderWaterShaderValueAssignment
} from "../material/WaterShaderTemplate";

import { evaluateWaterSingleScattering } from "../optics/WaterSurfaceOpticsMath";
import type { WaterSurfaceScattering } from "../../authoring/optics/WaterSurfaceScattering";

export interface WaterSurfaceClosureCpuInput {
  readonly roughTransmission?: boolean;
  readonly additionalTransmissionRadiance?: readonly [number, number, number];
  readonly surfaceScattering?: WaterSurfaceScattering;
  readonly sceneToSurfaceDistance?: number;
  readonly phaseCosine?: number;
  readonly sunRadiance?: readonly [number, number, number];
  readonly ambientRadiance?: readonly [number, number, number];
  readonly sceneColor: readonly [number, number, number];
  readonly surfaceColor: readonly [number, number, number];
  readonly depthColor?: readonly [number, number, number];
  readonly depthFactor?: number;
  /** Opacity of the interpolated depth color; separate from its color-ramp coordinate. */
  readonly depthOpacity?: number;
  readonly diffuseLighting?: number;
  readonly fresnel?: number;
  readonly transmissionFresnelWeight?: number;
  /** Single scattering consumes the selected background paired with opticalDepth. */
  readonly refractionColor?: readonly [number, number, number];
  /** Legacy color-closure blend; single scattering selects color and depth before integration. */
  readonly refractionWeight?: number;
  readonly reflectionRadiance?: readonly [number, number, number];
  readonly reflectionBrdfWeight?: readonly [number, number, number];
  readonly reflectionIntensity?: number;
  readonly directSpecularRadiance?: readonly [number, number, number];
  /** Boundary color after diffuse lighting, before foam and geometric coverage. */
  readonly boundaryContribution?: readonly [number, number, number];
  readonly foamColor?: readonly [number, number, number];
  readonly foamWeight?: number;
  /** Optional compatibility split: alpha still uses foamWeight while RGB uses this value. */
  readonly foamColorWeight?: number;
  readonly coverage?: number;
  readonly clarity?: number;
  readonly calibrationMode?: number;
  readonly coastalAlpha?: number;
  readonly coastalAlphaWeight?: number;
  readonly primaryColorClosure?: WaterSurfacePrimaryColorClosure;
  readonly absorptionCoefficient: readonly [number, number, number];
  readonly scatteringColor: readonly [number, number, number];
  readonly scatteringCoefficient: number;
  readonly opticalDepth: number;
  readonly alpha: number;
  readonly composition: WaterSurfaceCompositionV2;
}

export interface WaterSurfaceClosureCpuReadback {
  readonly primaryColor: readonly [number, number, number];
  readonly transmittance: readonly [number, number, number];
  readonly scattering: readonly [number, number, number];
  readonly volumeColor: readonly [number, number, number];
  readonly finalColor: readonly [number, number, number, number];
}

function mixChannel(first: number, second: number, weight: number): number {
  return first * (1 - weight) + second * weight;
}

function saturate(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function evaluateWaterSurfaceClosureCpu(
  input: Readonly<WaterSurfaceClosureCpuInput>
): Readonly<WaterSurfaceClosureCpuReadback> {
  const opticalDepth = Math.max(0, Number.isFinite(input.opticalDepth) ? input.opticalDepth : 0);
  const depthFactor = saturate(input.depthFactor ?? 0);
  const diffuseLighting = Math.max(0, Number.isFinite(input.diffuseLighting) ? input.diffuseLighting! : 1);
  const fresnel = saturate(input.fresnel ?? 0);
  const depthColor = input.depthColor ?? input.surfaceColor;
  if (input.surfaceScattering) {
    const medium = evaluateWaterSingleScattering({
      ...input,
      surfaceScattering: input.surfaceScattering,
      opticalDistance: opticalDepth
    });
    const primaryColor = input.surfaceColor.map((value, channel) =>
      mixChannel(value, depthColor[channel], depthFactor)
    ) as [number, number, number];
    const background = input.refractionColor ?? input.sceneColor;
    const volumeColor = primaryColor.map(
      (tint, channel) =>
        background[channel] * medium.transmittance[channel] * medium.lightTransmittance[channel] +
        medium.scattering[channel] * tint
    ) as [number, number, number];
    const finalRgb = volumeColor.map((value, channel) => {
      const lit =
        value * (1 - fresnel) +
        (input.reflectionRadiance?.[channel] ?? 0) *
          (input.reflectionBrdfWeight?.[channel] ?? 0) *
          (input.reflectionIntensity ?? 1) +
        (input.directSpecularRadiance?.[channel] ?? 0) +
        (input.boundaryContribution?.[channel] ?? 0);
      const foamed = mixChannel(
        lit,
        input.foamColor?.[channel] ?? lit,
        saturate(input.foamColorWeight ?? input.foamWeight ?? 0)
      );
      return mixChannel(input.sceneColor[channel], foamed, saturate(input.coverage ?? 1));
    });
    return Object.freeze({
      primaryColor: Object.freeze(primaryColor),
      transmittance: Object.freeze(medium.transmittance),
      scattering: Object.freeze(medium.scattering),
      volumeColor: Object.freeze(volumeColor),
      finalColor: Object.freeze([...finalRgb, 1] as [number, number, number, number])
    });
  }
  const primaryColor = input.surfaceColor.map((component, index) => {
    const litDepthColor = depthColor[index] * diffuseLighting;
    switch (input.primaryColorClosure ?? WaterSurfacePrimaryColorClosure.PhysicalVolume) {
      case WaterSurfacePrimaryColorClosure.RefractedAlbedoDepthRamp:
        return mixChannel(input.sceneColor[index], depthColor[index], depthFactor) * diffuseLighting;
      case WaterSurfacePrimaryColorClosure.PhysicalVolume:
        return component;
      case WaterSurfacePrimaryColorClosure.StylizedDepthRamp:
        return mixChannel(component, litDepthColor, depthFactor);
      case WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp:
        return mixChannel(saturate(input.sceneColor[index]), litDepthColor, depthFactor);
      case WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp:
        return mixChannel(component, depthColor[index], depthFactor) * diffuseLighting;
    }
  }) as [number, number, number];
  const transmittance = input.absorptionCoefficient.map((coefficient) =>
    Math.exp(-Math.max(0, coefficient) * opticalDepth)
  ) as [number, number, number];
  const scatteringWeight = 1 - Math.exp(-Math.max(0, input.scatteringCoefficient) * opticalDepth);
  const scattering = input.scatteringColor.map((component) => Math.max(0, component) * scatteringWeight) as [
    number,
    number,
    number
  ];
  const volumeColor = (
    (input.primaryColorClosure ?? WaterSurfacePrimaryColorClosure.PhysicalVolume) ===
    WaterSurfacePrimaryColorClosure.PhysicalVolume
      ? primaryColor.map((component, index) => component * transmittance[index] + scattering[index])
      : primaryColor
  ) as [number, number, number];
  const closureModel = input.primaryColorClosure ?? WaterSurfacePrimaryColorClosure.PhysicalVolume;
  const refractionWeight =
    closureModel === WaterSurfacePrimaryColorClosure.PhysicalVolume ? saturate(input.refractionWeight ?? 0) : 0;
  const rawRefractedColor = input.refractionColor ?? primaryColor;
  const refractedColor = (
    closureModel === WaterSurfacePrimaryColorClosure.PhysicalVolume
      ? rawRefractedColor.map((component, index) => component * transmittance[index] + scattering[index])
      : rawRefractedColor
  ) as [number, number, number];
  const reflectionRadiance = input.reflectionRadiance ?? [0, 0, 0];
  const reflectionBrdfWeight = input.reflectionBrdfWeight ?? [0, 0, 0];
  const reflectionIntensity = Math.max(0, input.reflectionIntensity ?? 0);
  const directSpecularRadiance = input.directSpecularRadiance ?? [0, 0, 0];
  const boundaryContribution = input.boundaryContribution ?? [0, 0, 0];
  const foamColor = input.foamColor ?? volumeColor;
  const foamWeight = saturate(input.foamWeight ?? 0);
  const foamColorWeight = saturate(input.foamColorWeight ?? foamWeight);
  const transmissionFresnelWeight = saturate(input.transmissionFresnelWeight ?? 0);
  const transmissionFresnel = input.roughTransmission ? saturate(reflectionBrdfWeight[0]) : fresnel;
  const transmissionWeight = mixChannel(1, 1 - transmissionFresnel, transmissionFresnelWeight);
  const resolvedColor = volumeColor.map((component, index) => {
    const sceneColorClosure =
      closureModel === WaterSurfacePrimaryColorClosure.RefractedAlbedoDepthRamp ||
      closureModel === WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp ||
      closureModel === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp;
    const boundaryBeforeFresnel = sceneColorClosure ? boundaryContribution[index] : 0;
    const boundaryAfterFresnel = sceneColorClosure ? 0 : boundaryContribution[index];
    const refracted =
      (mixChannel(component, refractedColor[index], refractionWeight) +
        boundaryBeforeFresnel +
        (input.additionalTransmissionRadiance?.[index] ?? 0)) *
      transmissionWeight;
    const reflected = reflectionRadiance[index] * reflectionBrdfWeight[index] * reflectionIntensity;
    const lit = refracted + reflected + directSpecularRadiance[index] + boundaryAfterFresnel;
    return mixChannel(lit, foamColor[index], foamColorWeight);
  }) as [number, number, number];
  const sceneCompositeWeight =
    closureModel === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp
      ? saturate(depthFactor * saturate(input.depthOpacity ?? 1) + foamColorWeight) * saturate(input.coverage ?? 1)
      : 1;
  const sceneCompositedColor = resolvedColor.map((component, index) =>
    mixChannel(saturate(input.sceneColor[index]), component, sceneCompositeWeight)
  ) as [number, number, number];
  const clarity = saturate(input.clarity ?? 1);
  const absorptionAlpha = 1 - Math.exp(-mixChannel(0.48, 0.13, clarity) * opticalDepth);
  let alpha = saturate(input.alpha) * mixChannel(0.18, 0.94, absorptionAlpha);
  alpha += fresnel * (1 - alpha) * 0.48;
  alpha += foamWeight * 0.3 * (1 - ((input.calibrationMode ?? 0) >= 0.5 ? 1 : 0));
  alpha = mixChannel(alpha, input.coastalAlpha ?? 0, saturate(input.coastalAlphaWeight ?? 0));
  alpha = saturate(alpha) * saturate(input.coverage ?? 1);
  const composedColor =
    input.composition === WaterSurfaceCompositionV2.PrecomposedReplace &&
    closureModel !== WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp
      ? (sceneCompositedColor.map((component, index) => mixChannel(input.sceneColor[index], component, alpha)) as [
          number,
          number,
          number
        ])
      : sceneCompositedColor;
  const finalColor =
    input.composition === WaterSurfaceCompositionV2.PrecomposedReplace
      ? ([...composedColor, 1] as [number, number, number, number])
      : ([...composedColor, alpha] as [number, number, number, number]);
  return Object.freeze({
    primaryColor: Object.freeze(primaryColor),
    transmittance: Object.freeze(transmittance),
    scattering: Object.freeze(scattering),
    volumeColor: Object.freeze(volumeColor),
    finalColor: Object.freeze(finalColor)
  });
}

export interface WaterSurfaceClosurePolicy {
  readonly additionalTransmissionRadiance?: boolean;
  readonly integratedRoughTransmission?: boolean;
}

export function createWaterSurfaceClosureShaderFunctions(
  directionalHighlightEnabled: boolean = false,
  sceneColorCompositeDepthRampEnabled: boolean = false,
  policy: Readonly<WaterSurfaceClosurePolicy> = {}
): string {
  return (
    (policy.additionalTransmissionRadiance ? waterSurfaceBoundedTranslucency + "\n" : "") +
    waterSingleScatteringShader +
    "\n" +
    renderWaterShaderTemplate(waterSurfaceClosureShaderTemplate, {
      ADDITIONAL_TRANSMISSION_ENABLED: policy.additionalTransmissionRadiance ? 1 : 0,
      ROUGH_TRANSMISSION_ENABLED: policy.integratedRoughTransmission ? 1 : 0,
      TRANSMISSION_FRESNEL: policy.integratedRoughTransmission ? "transmissionFresnel" : "fresnel",
      DIRECTIONAL_HIGHLIGHT_ENABLED: directionalHighlightEnabled ? 1 : 0,
      SCENE_COLOR_COMPOSITE_DEPTH_RAMP_ENABLED: sceneColorCompositeDepthRampEnabled ? 1 : 0
    })
  );
}

/** Emits the only normal V2 final-closure invocation used by backend shaders. */
export function createWaterSurfaceV2FinalOutputStatement(inputExpression: string): string {
  if (inputExpression.trim().length === 0) {
    throw new TypeError("Water V2 final closure input expression must be non-empty.");
  }
  return renderWaterShaderValueAssignment(
    "gl_FragColor",
    `waterSurfaceOutputWithPick(waterSurfaceEvaluateFinalClosureV2(${inputExpression}))`
  );
}

/** Emits a reusable V2 evaluation when a backend still needs debug/fog post-processing. */
export function createWaterSurfaceV2EvaluationStatement(
  outputExpression: string,
  inputExpression: string,
  foamColorWeightExpression?: string,
  depthOpacityExpression?: string
): string {
  if (
    outputExpression.trim().length === 0 ||
    inputExpression.trim().length === 0 ||
    foamColorWeightExpression?.trim().length === 0 ||
    depthOpacityExpression?.trim().length === 0
  ) {
    throw new TypeError("Water V2 closure output and input expressions must be non-empty.");
  }
  return renderWaterShaderFunctionAssignment(
    outputExpression,
    "waterSurfaceEvaluateFinalClosureV2",
    [
      inputExpression,
      ...(depthOpacityExpression
        ? [foamColorWeightExpression ?? `${inputExpression}.foamWeight`, depthOpacityExpression]
        : foamColorWeightExpression
          ? [foamColorWeightExpression]
          : [])
    ],
    "vec4"
  );
}

/** Writes an already evaluated V2 closure after optional debug/fog presentation. */
export function createWaterSurfaceV2ResolvedOutputStatement(resolvedExpression: string): string {
  if (resolvedExpression.trim().length === 0) {
    throw new TypeError("Water V2 resolved output expression must be non-empty.");
  }
  return renderWaterShaderValueAssignment("gl_FragColor", `waterSurfaceOutputWithPick(${resolvedExpression})`);
}

/** Stable shader discriminator for the shared primary/depth response. */
export function getWaterSurfacePrimaryColorClosureModelValue(model: WaterSurfacePrimaryColorClosure): number {
  switch (model) {
    case WaterSurfacePrimaryColorClosure.RefractedAlbedoDepthRamp:
      return 4;
    case WaterSurfacePrimaryColorClosure.PhysicalVolume:
      return 0;
    case WaterSurfacePrimaryColorClosure.StylizedDepthRamp:
      return 1;
    case WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp:
      return 2;
    case WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp:
      return 3;
  }
}

/** The only normal-rendering declaration of the Water fragment output. */
export function createWaterSurfaceFinalOutputStatement(
  colorExpression: string,
  alphaExpression: string,
  precomposedReplaceExpression = "0.0"
): string {
  for (const [label, expression] of [
    ["color", colorExpression],
    ["alpha", alphaExpression],
    ["composition", precomposedReplaceExpression]
  ] as const) {
    if (expression.trim().length === 0) throw new TypeError(`Water final ${label} expression must be non-empty.`);
  }
  return renderWaterShaderValueAssignment(
    "gl_FragColor",
    `waterSurfaceOutputWithPick(waterSurfaceComposeFinal(${colorExpression}, ${alphaExpression}, ${precomposedReplaceExpression}))`
  );
}
