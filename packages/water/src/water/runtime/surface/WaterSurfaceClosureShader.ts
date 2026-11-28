/** Shared optical-volume, composition, and final-output primitives for every Water backend. */
import { WaterSurfacePrimaryColorClosure } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import waterSurfaceBoundedTranslucency from "../../shaders/library/surface/WaterSurfaceBoundedTranslucency.glsl?raw";
import waterSurfaceClosureShaderTemplate from "../../shaders/library/surface/WaterSurfaceClosure.glsl?raw";
import {
  renderWaterShaderFunctionAssignment,
  renderWaterShaderTemplate,
  renderWaterShaderValueAssignment
} from "../material/WaterShaderTemplate";

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
    renderWaterShaderTemplate(waterSurfaceClosureShaderTemplate, {
      ADDITIONAL_TRANSMISSION_ENABLED: policy.additionalTransmissionRadiance ? 1 : 0,
      ROUGH_TRANSMISSION_ENABLED: policy.integratedRoughTransmission ? 1 : 0,
      TRANSMISSION_FRESNEL: policy.integratedRoughTransmission ? "transmissionFresnel" : "fresnel",
      DIRECTIONAL_HIGHLIGHT_ENABLED: directionalHighlightEnabled ? 1 : 0,
      SCENE_COLOR_COMPOSITE_DEPTH_RAMP_ENABLED: sceneColorCompositeDepthRampEnabled ? 1 : 0
    })
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
