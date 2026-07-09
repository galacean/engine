import { BoundingBox, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { Shader } from "../shader/Shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";

/**
 * Material for {@link GaussianSplatRenderer}. Render state and covariance math are baked into the shader,
 * so no user-facing knobs are exposed beyond the Magic reveal trigger.
 */
export class GaussianSplatMaterial extends Material {
  private static _magicStartTimeProp = ShaderProperty.getByName("material_MagicStartTime");
  private static _magicCenterProp = ShaderProperty.getByName("material_MagicCenter");
  private static _magicRadiusProp = ShaderProperty.getByName("material_MagicRadius");
  private static _kernelSizeProp = ShaderProperty.getByName("material_KernelSize");
  private static _magicMacro = ShaderMacro.getByName("RENDERER_GS_MAGIC");

  private _magicCenter = new Vector3();
  private _isMagicPlaying = false;

  /** Whether the Magic reveal animation is currently playing. */
  get isMagicPlaying(): boolean {
    return this._isMagicPlaying;
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("GaussianSplat"));
    // Mip-Splatting kernel dilation (Yu et al. 2024): 0.3 is the paper's recommended low-pass sigma.
    this.shaderData.setFloat(GaussianSplatMaterial._kernelSizeProp, 0.3);
  }

  /**
   * Start the Magic radial-reveal animation from now. The shader reads `scene_ElapsedTime` every frame, so
   * this only needs to snapshot the start time; no per-frame CPU tick is required.
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

  /** @internal wired by {@link GaussianSplatRenderer} from the asset bounds. */
  _setMagicBounds(bounds: BoundingBox): void {
    const { min, max } = bounds;
    this._magicCenter.set((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);
    this.shaderData.setVector3(GaussianSplatMaterial._magicCenterProp, this._magicCenter);
    this.shaderData.setFloat(
      GaussianSplatMaterial._magicRadiusProp,
      Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) * 0.5
    );
  }
}
