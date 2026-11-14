import { Engine } from "../../Engine";
import type { CullingResults } from "../../RenderPipeline/CullingResults";
import { PipelinePass } from "../../RenderPipeline/PipelinePass";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import type { RenderQueue } from "../../RenderPipeline/RenderQueue";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import { ShaderMacro } from "../../shader/ShaderMacro";
import type { WindSceneBridge } from "./WindSceneBridge";

const MATERIAL_ENABLE_WIND = ShaderMacro.getByName("MATERIAL_ENABLE_WIND");
const MATERIAL_WIND_GROUND_VEGETATION = ShaderMacro.getByName("MATERIAL_WIND_GROUND_VEGETATION");
const MATERIAL_VEGETATION_CLIMATE_FLOWER = ShaderMacro.getByName("MATERIAL_VEGETATION_CLIMATE_FLOWER");
const MATERIAL_WIND_HERO_TREE_HIERARCHY = ShaderMacro.getByName("MATERIAL_WIND_HERO_TREE_HIERARCHY");
const MATERIAL_WIND_SLOD_FAR = ShaderMacro.getByName("MATERIAL_WIND_SLOD_FAR");

/** Wind texture families read by render elements that survived the current Camera culling. @internal */
export enum WindGpuConsumerDemand {
  None = 0,
  LocalField = 1 << 0,
  GroundResponse = 1 << 1,
  FlowerResponse = 1 << 2,
  TreeResponse = 1 << 3,
  All = LocalField | GroundResponse | FlowerResponse | TreeResponse
}

/** Optional post-cull Camera pass that resolves visible wind consumers and advances one GPU job. @internal */
export class WindGpuPass extends PipelinePass {
  constructor(
    engine: Engine,
    private readonly _bridge: WindSceneBridge
  ) {
    super(engine);
  }

  override onRender(context: RenderContext, cullingResults: CullingResults): void {
    this._bridge.renderGpuLocalField(context.camera, collectVisibleWindGpuConsumerDemand(cullingResults));
  }
}

function collectVisibleWindGpuConsumerDemand(cullingResults: CullingResults): WindGpuConsumerDemand {
  let demand = WindGpuConsumerDemand.None;
  demand |= collectQueueWindGpuConsumerDemand(cullingResults.opaqueQueue);
  demand |= collectQueueWindGpuConsumerDemand(cullingResults.alphaTestQueue);
  demand |= collectQueueWindGpuConsumerDemand(cullingResults.transparentQueue);
  return demand;
}

function collectQueueWindGpuConsumerDemand(queue: RenderQueue): WindGpuConsumerDemand {
  const elements = queue.batchedElements;
  let demand = WindGpuConsumerDemand.None;
  for (let i = 0, n = elements.length; i < n; i++) {
    const element = elements[i];
    const material = element.material;
    const macros = material.shaderData._macroCollection;
    if (!macros.isEnable(MATERIAL_ENABLE_WIND)) continue;

    let hasForwardPass = false;
    const passes = element.subShader.passes;
    for (let j = 0, m = passes.length; j < m; j++) {
      const pass = passes[j];
      if (pass.getTagValue(RenderContext.pipelineStageKey) !== PipelineStage.Forward) continue;
      if (
        pass._renderState._getRenderQueueByShaderData(pass._renderStateDataMap, material.shaderData) ===
        queue.renderQueueType
      ) {
        hasForwardPass = true;
        break;
      }
    }
    if (!hasForwardPass) continue;

    demand |= WindGpuConsumerDemand.LocalField;
    if (macros.isEnable(MATERIAL_WIND_GROUND_VEGETATION)) {
      demand |= macros.isEnable(MATERIAL_VEGETATION_CLIMATE_FLOWER)
        ? WindGpuConsumerDemand.FlowerResponse
        : WindGpuConsumerDemand.GroundResponse;
    }
    if (macros.isEnable(MATERIAL_WIND_HERO_TREE_HIERARCHY) || macros.isEnable(MATERIAL_WIND_SLOD_FAR)) {
      demand |= WindGpuConsumerDemand.TreeResponse;
    }
    if (demand === WindGpuConsumerDemand.All) break;
  }
  return demand;
}
