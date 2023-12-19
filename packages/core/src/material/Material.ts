import { IClone } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";
import { CloneManager } from "../clone/CloneManager";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";
import { RenderState } from "../shader/state/RenderState";

/**
 * Material.
 */
export class Material extends ReferResource implements IClone {
  /** Name. */
  name: string;

  /** @internal */
  _shader: Shader;
  /** @internal */
  _renderStates: RenderState[] = []; // todo: later will as a part of shaderData when shader effect frame is OK, that is more powerful and flexible.
  /** @internal */
  _priority: number = 0; // todo: temporary resolution of submesh rendering order issue.

  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Material);

  /**
   *  Shader data.
   */
  get shaderData(): ShaderData {
    return this._shaderData;
  }

  /**
   * Shader used by the material.
   */
  get shader(): Shader {
    return this._shader;
  }

  set shader(value: Shader) {
    this._shader = value;

    const renderStates = this._renderStates;
    const lastStatesCount = renderStates.length;

    let maxPassCount = 0;
    const subShaders = value.subShaders;
    for (let i = 0; i < subShaders.length; i++) {
      maxPassCount = Math.max(subShaders[i].passes.length, maxPassCount);
    }

    if (lastStatesCount < maxPassCount) {
      for (let i = lastStatesCount; i < maxPassCount; i++) {
        renderStates.push(new RenderState());
      }
    } else {
      renderStates.length = maxPassCount;
    }
  }

  /**
   * First Render state.
   */
  get renderState(): RenderState {
    return this._renderStates[0];
  }

  /**
   * Render states.
   */
  get renderStates(): Readonly<RenderState[]> {
    return this._renderStates;
  }

  /**
   * Create a material instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   */
  constructor(engine: Engine, shader: Shader) {
    super(engine);
    this.shader = shader;
  }

  /**
   * Clone and return the instance.
   */
  clone(): Material {
    const dest = new Material(this._engine, this.shader);
    this.cloneTo(dest);
    return dest;
  }

  /**
   * Clone to the target material.
   * @param target - target material
   */
  cloneTo(target: Material): void {
    target.shader = this.shader;
    this.shaderData.cloneTo(target.shaderData);
    CloneManager.deepCloneObject(this.renderStates, target.renderStates);
  }

  override _addReferCount(value: number): void {
    if (this._destroyed) return;
    super._addReferCount(value);
    this.shaderData._addReferCount(value);
  }

  /**
   * @override
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._shader = null;
    this._shaderData = null;
    this._renderStates.length = 0;
    this._renderStates = null;
  }
}
