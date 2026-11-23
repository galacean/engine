import { ShaderPart } from "./ShaderPart";
import { ShaderPass } from "./ShaderPass";
import { ShaderTagKey } from "./ShaderTagKey";
import type { ShaderData } from "./ShaderData";
import { RenderQueueType } from "./enums/RenderQueueType";
import { RenderStateElementKey } from "./enums/RenderStateElementKey";

/**
 * Sub shader.
 */
export class SubShader extends ShaderPart {
  private static readonly _stageKey = ShaderTagKey.getByName("pipelineStage");
  private _passes: ShaderPass[];
  private readonly _stages = new Map<string, ShaderPass[]>();
  private _stageRevision = -1;
  private readonly _materialQueues = new WeakMap<
    ShaderData,
    { revision: number; queue: RenderQueueType | undefined }
  >();

  /** @internal A mesh needs only one queue entry when every pass selects the same queue from material data. */
  _getSharedMaterialQueue(data: ShaderData): RenderQueueType | undefined {
    const cached = this._materialQueues.get(data);
    if (cached?.revision === data._renderStateRevision) return cached.queue;
    let queue: RenderQueueType | undefined;
    for (const pass of this._passes) {
      const property = pass._renderStateDataMap[RenderStateElementKey.RenderQueueType];
      if (property) property._controlsRenderState = true;
      const value = property && data._propertyValueMap[property._uniqueId];
      if (
        (value !== RenderQueueType.Opaque &&
          value !== RenderQueueType.AlphaTest &&
          value !== RenderQueueType.Transparent) ||
        (queue !== undefined && queue !== value)
      ) {
        queue = undefined;
        break;
      }
      queue = value;
    }
    if (cached) {
      cached.revision = data._renderStateRevision;
      cached.queue = queue;
    } else {
      this._materialQueues.set(data, { revision: data._renderStateRevision, queue });
    }
    return queue;
  }

  /** @internal The render queue visits only passes belonging to the active pipeline stage. */
  _getPassesForStage(stage: string): readonly ShaderPass[] {
    const key = SubShader._stageKey;
    if (this._stageRevision !== key._revision) {
      this._stages.clear();
      this._stageRevision = key._revision;
    }
    let selected = this._stages.get(stage);
    if (!selected) {
      selected = this._passes.filter((pass) => pass.getTagValue(key) === stage);
      this._stages.set(stage, selected);
    }
    return selected;
  }

  /**
   * Sub shader passes.
   */
  get passes(): ReadonlyArray<ShaderPass> {
    return this._passes;
  }

  /**
   * Create a sub shader.
   * @param name - Name of the sub shader
   * @param passes - Sub shader passes
   */
  constructor(name: string, passes: ShaderPass[], tags?: Record<string, number | string | boolean>) {
    super();
    this._name = name;
    const passCount = passes.length;
    if (passCount < 1) {
      throw " count must large than 0.";
    }
    this._passes = passes.slice();

    for (const key in tags) {
      this.setTag(key, tags[key]);
    }
  }
}
