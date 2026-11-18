import { IClone } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";

/**
 * Material.
 */
export class Material extends ReferResource implements IClone {
  /** Name. */
  name: string;

  /** @internal */
  _shader: Shader;

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
    const refCount = this._getReferCount();
    if (refCount > 0) {
      this._shader?._addReferCount(-refCount);
      value._addReferCount(refCount);
    }

    this._shader = value;
  }

  /**
   * Create a material instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   * @throws When the shader has been destroyed.
   */
  constructor(engine: Engine, shader: Shader) {
    if (shader.destroyed) {
      throw new Error("Cannot create a material with a destroyed shader.");
    }
    super(engine);
    this.shader = shader;
    this.name = shader.name;
  }

  /**
   * Clone and return the instance.
   */
  clone(): Material {
    const dest = new Material(this._engine, this.shader);
    this._cloneToAndModifyName(dest);
    return dest;
  }

  /**
   * Clone to the target material.
   * @param target - target material
   */
  cloneTo(target: Material): void {
    target.shader = this.shader;
    this.shaderData.cloneTo(target.shaderData);
  }

  /**
   * @internal
   */
  override _addReferCount(value: number): void {
    if (this._destroyed) return;
    super._addReferCount(value);
    this.shaderData._addReferCount(value);
    this._shader._addReferCount(value);
  }

  protected _cloneToAndModifyName(target: Material): void {
    this.cloneTo(target);
    target.name = this.name + "(Clone)";
  }

  /**
   * @override
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._shader = null!;
    this._shaderData = null!;
  }
}
