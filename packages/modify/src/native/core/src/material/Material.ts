import { IClone } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { ReferResource } from "../asset/ReferResource";
import { ScreenSpaceReflectionReceiverMode } from "../lighting/screenSpaceReflection/enums/ScreenSpaceReflectionReceiverMode";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ShaderDataGroup } from "../shader/enums/ShaderDataGroup";

/**
 * Material.
 */
export class Material extends ReferResource implements IClone {
  private static readonly _screenSpaceReflectionModeProperty = ShaderProperty.getByName(
    "material_ScreenSpaceReflectionMode"
  );
  private static readonly _screenSpaceReflectionIntensityProperty = ShaderProperty.getByName(
    "material_ScreenSpaceReflectionIntensity"
  );

  /** Name. */
  name: string;

  /** @internal */
  _shader: Shader;

  /** @internal Whether this material is explicitly registered for the current SSR receiver contract. */
  _screenSpaceReflectionReceiverRegistered = false;

  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Material);

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

    // Standard PBR owns the built-in Auto receiver contract. Initialize the
    // uniforms once so a shared WebGL program cannot retain another material's
    // values. Custom shaders remain fail-closed unless explicitly registered.
    if (value.name === "PBR" && this._shaderData.getFloat(Material._screenSpaceReflectionModeProperty) === undefined) {
      this._shaderData.setFloat(Material._screenSpaceReflectionModeProperty, ScreenSpaceReflectionReceiverMode.Auto);
      this._shaderData.setFloat(Material._screenSpaceReflectionIntensityProperty, 1);
    }
  }

  /**
   * Create a material instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   */
  constructor(engine: Engine, shader: Shader) {
    super(engine);
    this.shader = shader;
    this.name = shader.name;

    if (this._shaderData.getFloat(Material._screenSpaceReflectionModeProperty) === undefined) {
      this._shaderData.setFloat(
        Material._screenSpaceReflectionModeProperty,
        ScreenSpaceReflectionReceiverMode.Disabled
      );
      this._shaderData.setFloat(Material._screenSpaceReflectionIntensityProperty, 0);
    }
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
    target._screenSpaceReflectionReceiverRegistered = this._screenSpaceReflectionReceiverRegistered;
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
    this._screenSpaceReflectionReceiverRegistered = false;
    this._shader = null!;
    this._shaderData = null!;
  }
}
