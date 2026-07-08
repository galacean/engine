import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { CullMode } from "../shader/enums/CullMode";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { getGaussianSplatShader } from "./GaussianSplatShader";

/**
 * Material for {@link GaussianSplatRenderer}. The render state is invariant — always transparent, premultiplied
 * "over" blending with depth-write off and culling disabled — so it is baked here rather than exposed as knobs.
 */
export class GaussianSplatMaterial extends Material {
  private static _kernelSizeProp = ShaderProperty.getByName("material_KernelSize");
  private static _magicStartTimeProp = ShaderProperty.getByName("material_MagicStartTime");
  private static _magicCenterProp = ShaderProperty.getByName("material_MagicCenter");
  private static _magicRadiusProp = ShaderProperty.getByName("material_MagicRadius");
  private static _magicMacro = ShaderMacro.getByName("RENDERER_GS_MAGIC");

  private _isMagicPlaying = false;

  /**
   * Low-pass dilation added to the projected covariance (anti-aliasing, in pixels). Default 0.3.
   */
  get kernelSize(): number {
    return this.shaderData.getFloat(GaussianSplatMaterial._kernelSizeProp);
  }

  set kernelSize(value: number) {
    this.shaderData.setFloat(GaussianSplatMaterial._kernelSizeProp, value);
  }

  /**
   * Splat-space point the Magic reveal ring emanates from. Automatically wired to the asset's bounds
   * midpoint by {@link GaussianSplatRenderer} so demos never have to compute this.
   */
  get magicCenter(): Vector3 {
    return this.shaderData.getVector3(GaussianSplatMaterial._magicCenterProp);
  }

  set magicCenter(value: Vector3) {
    this.shaderData.setVector3(GaussianSplatMaterial._magicCenterProp, value);
  }

  /**
   * World-unit radius the Magic ring should sweep across. Automatically wired to the asset's bounds radius
   * by {@link GaussianSplatRenderer}.
   */
  get magicRadius(): number {
    return this.shaderData.getFloat(GaussianSplatMaterial._magicRadiusProp);
  }

  set magicRadius(value: number) {
    this.shaderData.setFloat(GaussianSplatMaterial._magicRadiusProp, value);
  }

  /** Whether the Magic reveal animation is currently playing. */
  get isMagicPlaying(): boolean {
    return this._isMagicPlaying;
  }

  constructor(engine: Engine) {
    super(engine, getGaussianSplatShader(engine));

    const shaderData = this.shaderData;
    shaderData.setInt("blendEnabled", 1);
    shaderData.setInt("depthWriteEnabled", 0);
    shaderData.setInt("renderQueueType", RenderQueueType.Transparent);
    // Premultiplied alpha: the fragment shader multiplies rgb by alpha before writing, so both channels
    // use SRC=ONE. Matches the industry-standard 3DGS blend and stops per-splat noise from summing up in
    // dense overlaps the way straight-alpha (SRC=SRC_ALPHA) does.
    shaderData.setInt("sourceColorBlendFactor", BlendFactor.One);
    shaderData.setInt("destinationColorBlendFactor", BlendFactor.OneMinusSourceAlpha);
    shaderData.setInt("sourceAlphaBlendFactor", BlendFactor.One);
    shaderData.setInt("destinationAlphaBlendFactor", BlendFactor.OneMinusSourceAlpha);
    shaderData.setInt("rasterStateCullMode", CullMode.Off);

    this.kernelSize = 0.3;
    this.magicCenter = new Vector3();
    this.magicRadius = 1;
  }

  /**
   * Start the Magic radial-reveal animation from now. The shader reads the engine's `scene_ElapsedTime`
   * uniform each frame, so no per-frame CPU tick is needed — the effect runs for a fixed duration then
   * settles on the fully-revealed model until {@link stopMagic} is called.
   */
  playMagic(): void {
    this._isMagicPlaying = true;
    this.shaderData.setFloat(GaussianSplatMaterial._magicStartTimeProp, this.engine.time.elapsedTime);
    this.shaderData.enableMacro(GaussianSplatMaterial._magicMacro);
  }

  /** Halt the Magic reveal and return to the plain splat render. */
  stopMagic(): void {
    this._isMagicPlaying = false;
    this.shaderData.disableMacro(GaussianSplatMaterial._magicMacro);
  }
}
