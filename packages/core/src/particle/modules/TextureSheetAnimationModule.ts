import { Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone, shallowClone } from "../../clone/CloneManager";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { CurveKey, ParticleCurve } from "./ParticleCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Texture sheet animation module.
 */
export class TextureSheetAnimationModule extends ParticleGeneratorModule {
  private static readonly _frameCurveMacro = ShaderMacro.getByName("RENDERER_TSA_FRAME_CURVE");
  private static readonly _frameRandomCurvesMacro = ShaderMacro.getByName("RENDERER_TSA_FRAME_RANDOM_CURVES");

  private static readonly _frameMinCurveProperty = ShaderProperty.getByName("renderer_TSAFrameMinCurve");
  private static readonly _frameMaxCurveProperty = ShaderProperty.getByName("renderer_TSAFrameMaxCurve");

  private static readonly _cycleCountProperty = ShaderProperty.getByName("renderer_TSACycles");
  private static readonly _tillingParamsProperty = ShaderProperty.getByName("renderer_TSATillingParams");

  /** Start frame of the texture sheet. */
  @deepClone
  readonly startFrame = new ParticleCompositeCurve(0);
  /** Frame over time curve of the texture sheet. */
  @deepClone
  readonly frameOverTime = new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1)));
  /** Texture sheet animation type. */
  type = TextureSheetAnimationType.WholeSheet;
  /** Cycle count. */
  cycleCount = 1;

  /** @internal */
  @shallowClone
  _tillingInfo = new Vector3(1, 1, 1); // x:subU, y:subV, z:tileCount
  /** @internal */
  @ignoreClone
  _frameOverTimeRand = new Rand(0, ParticleRandomSubSeeds.TextureSheetAnimation);
  /** @internal */
  @ignoreClone
  _startFrameRand = new Rand(0, ParticleRandomSubSeeds.StartFrame);

  @deepClone
  private _tiling = new Vector2(1, 1);
  @ignoreClone
  private _frameCurveMacro: ShaderMacro;

  /**
   * Tiling of the texture sheet.
   * */
  get tiling(): Vector2 {
    return this._tiling;
  }

  set tiling(value: Vector2) {
    this._tiling = value;
    this._tillingInfo.set(1.0 / value.x, 1.0 / value.y, value.x * value.y);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let frameMacro = <ShaderMacro>null;
    if (this.enabled) {
      const mode = this.frameOverTime.mode;
      if (mode === ParticleCurveMode.Curve || mode === ParticleCurveMode.TwoCurves) {
        const frame = this.frameOverTime;
        shaderData.setFloatArray(TextureSheetAnimationModule._frameMaxCurveProperty, frame.curveMax._getTypeArray());
        if (mode === ParticleCurveMode.Curve) {
          frameMacro = TextureSheetAnimationModule._frameCurveMacro;
        } else {
          shaderData.setFloatArray(TextureSheetAnimationModule._frameMinCurveProperty, frame.curveMin._getTypeArray());
          frameMacro = TextureSheetAnimationModule._frameRandomCurvesMacro;
        }

        shaderData.setFloat(TextureSheetAnimationModule._cycleCountProperty, this.cycleCount);
        shaderData.setVector3(TextureSheetAnimationModule._tillingParamsProperty, this._tillingInfo);
      }
    }

    this._frameCurveMacro = this._enableMacro(shaderData, this._frameCurveMacro, frameMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(randomSeed: number): void {
    this._frameOverTimeRand.reset(randomSeed, ParticleRandomSubSeeds.TextureSheetAnimation);
    this._startFrameRand.reset(randomSeed, ParticleRandomSubSeeds.StartFrame);
  }
}

/**
 * Texture sheet animation type.
 */
export enum TextureSheetAnimationType {
  /** Animate over the whole texture sheet from left to right, top to bottom. */
  WholeSheet,
  /** Animate a single row in the sheet from left to right. */
  SingleRow
}
