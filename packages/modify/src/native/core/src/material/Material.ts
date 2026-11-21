import { IClone } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";

/**
 * Material.
 */
export class Material extends ReferResource implements IClone {
  /** @internal */
  static _ssrIntensityProperty = ShaderProperty.getByName("material_ScreenSpaceReflectionIntensity");

  /** Name. */
  name: string;

  /**
   * Allow this transparent material to contribute nearest nonzero-alpha depth to SSR Hi-Z occlusion.
   * @defaultValue `false`
   */
  contributeScreenSpaceReflectionDepth: boolean = false;

  /**
   * Allow opaque and alpha-test geometry using this material to render into SSR's fallback DepthOnly pass.
   * Opt out for grass cards, small ground foliage, and micro-details that add draw-call cost without meaningful SSR occlusion.
   * @defaultValue `true`
   */
  screenSpaceReflectionOccluder: boolean = true;

  /**
   * Allow bilateral 2x2 normal+depth SSR sampling on this material under High quality (`false` falls back to 2-tap depth-verified sampling).
   * @defaultValue `true`
   */
  screenSpaceReflectionBilateral: boolean = true;

  /** @internal */
  _shader: Shader;

  private _ssrIntensity: number = 0;
  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Material);

  /**
   * Screen-space reflection intensity multiplier on this material (`0` opts out; `PBRMaterial` defaults to `1`).
   */
  get screenSpaceReflectionIntensity(): number {
    return this._ssrIntensity;
  }

  set screenSpaceReflectionIntensity(value: number) {
    const clamped = Number.isFinite(value) ? Math.max(0, value) : 0;
    if (this._ssrIntensity !== clamped) {
      this._ssrIntensity = clamped;
      this._shaderData.setFloat(Material._ssrIntensityProperty, clamped);
    }
  }

  /**
   * Shader data.
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
    this._shaderData.setFloat(Material._ssrIntensityProperty, 0);
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
    target._ssrIntensity = this._ssrIntensity;
    target.contributeScreenSpaceReflectionDepth = this.contributeScreenSpaceReflectionDepth;
    target.screenSpaceReflectionBilateral = this.screenSpaceReflectionBilateral;
    target.screenSpaceReflectionOccluder = this.screenSpaceReflectionOccluder;
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
