/** Backend-independent symbols available to the shared Surface Appearance V2 fragment modules. */
import { createWaterShaderSymbol, type WaterShaderSymbol } from "./WaterSurfaceGeometryAdapter";

export interface ResolvedWaterSurfaceFieldsV2 {
  readonly coverage: WaterShaderSymbol<"float">;
  readonly surfaceHeight: WaterShaderSymbol<"float">;
  readonly verticalDepth: WaterShaderSymbol<"float">;
  readonly sceneEyeDepth: WaterShaderSymbol<"float">;
  readonly sceneRayDepth: WaterShaderSymbol<"float">;
  readonly surfaceNormalDepth: WaterShaderSymbol<"float">;
  readonly horizontalShoreDistance: WaterShaderSymbol<"float">;
  readonly opticalPath: WaterShaderSymbol<"float">;
  readonly obstacleContact: WaterShaderSymbol<"float">;
  readonly flow: WaterShaderSymbol<"vec2">;
  readonly sceneColor: WaterShaderSymbol<"vec3">;
}
export type ResolvedWaterSurfaceFieldExpressionsV2 = {
  readonly [TKey in keyof ResolvedWaterSurfaceFieldsV2]: ResolvedWaterSurfaceFieldsV2[TKey]["expression"];
};

export function createResolvedWaterSurfaceFieldsV2(
  source: Readonly<ResolvedWaterSurfaceFieldExpressionsV2>
): Readonly<ResolvedWaterSurfaceFieldsV2> {
  return Object.freeze({
    coverage: createWaterShaderSymbol("float", source.coverage),
    surfaceHeight: createWaterShaderSymbol("float", source.surfaceHeight),
    verticalDepth: createWaterShaderSymbol("float", source.verticalDepth),
    sceneEyeDepth: createWaterShaderSymbol("float", source.sceneEyeDepth),
    sceneRayDepth: createWaterShaderSymbol("float", source.sceneRayDepth),
    surfaceNormalDepth: createWaterShaderSymbol("float", source.surfaceNormalDepth),
    horizontalShoreDistance: createWaterShaderSymbol("float", source.horizontalShoreDistance),
    opticalPath: createWaterShaderSymbol("float", source.opticalPath),
    obstacleContact: createWaterShaderSymbol("float", source.obstacleContact),
    flow: createWaterShaderSymbol("vec2", source.flow),
    sceneColor: createWaterShaderSymbol("vec3", source.sceneColor)
  });
}
