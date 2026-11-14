/** Structural contract between backend geometry shaders and the shared Water fragment closure. */
import waterSurfaceGeometryBridgeTemplate from "../../shaders/library/surface/WaterSurfaceGeometryBridge.glsl?raw";
import { hashStableValue } from "../../compiler/shared/determinism";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";

export type WaterShaderValueType = "float" | "vec2" | "vec3" | "vec4";

export interface WaterShaderSymbol<TType extends WaterShaderValueType> {
  readonly type: TType;
  /** GLSL expression available at the shared fragment-closure call site. */
  readonly expression: string;
}

export interface WaterSurfaceGeometryInputs {
  readonly positionWS: WaterShaderSymbol<"vec3">;
  readonly macroNormalWS: WaterShaderSymbol<"vec3">;
  readonly tangentWS: WaterShaderSymbol<"vec3">;
  readonly bitangentWS: WaterShaderSymbol<"vec3">;
  readonly meshUv: WaterShaderSymbol<"vec2">;
  readonly flowWS: WaterShaderSymbol<"vec2">;
  readonly coverage: WaterShaderSymbol<"float">;
  readonly verticalDepth: WaterShaderSymbol<"float">;
  readonly horizontalShoreDistance: WaterShaderSymbol<"float">;
  readonly obstacleContact: WaterShaderSymbol<"float">;
  readonly waveCrest: WaterShaderSymbol<"float">;
}

export interface WaterSurfaceGeometryAdapter {
  readonly id: string;
  readonly variantKey: `water-geometry-adapter:${string}`;
  readonly inputs: WaterSurfaceGeometryInputs;
  readonly requiredBindings: readonly string[];
}

export interface WaterSurfaceGeometryAdapterSource {
  readonly id: string;
  readonly inputs: WaterSurfaceGeometryInputs;
  readonly requiredBindings?: readonly string[];
}

const EXPECTED_TYPES = Object.freeze({
  positionWS: "vec3",
  macroNormalWS: "vec3",
  tangentWS: "vec3",
  bitangentWS: "vec3",
  meshUv: "vec2",
  flowWS: "vec2",
  coverage: "float",
  verticalDepth: "float",
  horizontalShoreDistance: "float",
  obstacleContact: "float",
  waveCrest: "float"
} as const satisfies { readonly [TKey in keyof WaterSurfaceGeometryInputs]: WaterShaderValueType });

function validateSymbol(key: keyof WaterSurfaceGeometryInputs, symbol: WaterShaderSymbol<WaterShaderValueType>): void {
  if (symbol.type !== EXPECTED_TYPES[key]) {
    throw new TypeError(`Water geometry input '${key}' must be '${EXPECTED_TYPES[key]}', not '${symbol.type}'.`);
  }
  if (symbol.expression.trim().length === 0) {
    throw new TypeError(`Water geometry input '${key}' must provide a GLSL expression.`);
  }
}

export function createWaterShaderSymbol<TType extends WaterShaderValueType>(
  type: TType,
  expression: string
): Readonly<WaterShaderSymbol<TType>> {
  if (expression.trim().length === 0) throw new TypeError("Water shader symbol expression must be non-empty.");
  return Object.freeze({ type, expression });
}

export function createWaterSurfaceGeometryAdapter(
  source: Readonly<WaterSurfaceGeometryAdapterSource>
): Readonly<WaterSurfaceGeometryAdapter> {
  if (source.id.trim().length === 0) throw new TypeError("Water geometry adapter id must be non-empty.");
  for (const key of Object.keys(EXPECTED_TYPES) as (keyof WaterSurfaceGeometryInputs)[]) {
    validateSymbol(key, source.inputs[key]);
  }
  const inputs = Object.freeze({ ...source.inputs });
  const requiredBindings = Object.freeze([...(source.requiredBindings ?? [])].sort());
  const structuralHash = hashStableValue({
    id: source.id,
    inputs: Object.fromEntries(
      (Object.keys(EXPECTED_TYPES) as (keyof WaterSurfaceGeometryInputs)[]).map((key) => [
        key,
        { type: inputs[key].type, expression: inputs[key].expression }
      ])
    ),
    requiredBindings
  });
  return Object.freeze({
    id: source.id,
    variantKey: `water-geometry-adapter:${structuralHash}` as const,
    inputs,
    requiredBindings
  });
}

/** GLSL declarations used by the shared closure after an adapter has populated its facts. */
export function createWaterSurfaceGeometryAdapterBridge(adapter: Readonly<WaterSurfaceGeometryAdapter>): string {
  return renderWaterShaderTemplate(waterSurfaceGeometryBridgeTemplate, {
    POSITION_WS: adapter.inputs.positionWS.expression,
    MACRO_NORMAL_WS: adapter.inputs.macroNormalWS.expression,
    TANGENT_WS: adapter.inputs.tangentWS.expression,
    BITANGENT_WS: adapter.inputs.bitangentWS.expression,
    MESH_UV: adapter.inputs.meshUv.expression,
    FLOW_WS: adapter.inputs.flowWS.expression,
    COVERAGE: adapter.inputs.coverage.expression,
    VERTICAL_DEPTH: adapter.inputs.verticalDepth.expression,
    HORIZONTAL_SHORE_DISTANCE: adapter.inputs.horizontalShoreDistance.expression,
    OBSTACLE_CONTACT: adapter.inputs.obstacleContact.expression,
    WAVE_CREST: adapter.inputs.waveCrest.expression
  });
}
