import { Vector2, Vector3 } from "@galacean/engine-math";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { ShaderData } from "../../shader/ShaderData";
import { Key, ParticleCurve } from "./ParticleCurve";

/**
 * Texture sheet animation module.
 */
export class TextureSheetAnimationModule extends ParticleGeneratorModule {
  private static _frameOverTimeCurveMacro: ShaderMacro = ShaderMacro.getByName("TEXTURE_SHEET_ANIMATION_CURVE");
  private static _frameOverTimeRandomCurveMacro: ShaderMacro = ShaderMacro.getByName("TEXTURE_SHEET_ANIMATION_CURVE");

  private static _cycleCount: ShaderProperty = ShaderProperty.getByName("u_TSACycles");
  private static _tillingInfo: ShaderProperty = ShaderProperty.getByName("u_TSATillingInfo");
  private static _frameOverTimeMinCurve: ShaderProperty = ShaderProperty.getByName("u_TSAMinCurve");
  private static _frameOverTimeMaxCurve: ShaderProperty = ShaderProperty.getByName("u_TSAMaxCurve");

  /** Texture sheet animation type. */
  type: TextureSheetAnimationType = TextureSheetAnimationType.WholeSheet;
  /** Cycle count. */
  cycleCount: number = 1;

  /** Start frame of the texture sheet. */
  readonly startFrame: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Frame over time curve of the texture sheet. */
  readonly frameOverTime: ParticleCompositeCurve = new ParticleCompositeCurve(
    new ParticleCurve(new Key(0, 0), new Key(1, 1))
  );

  /** @internal */
  _tillingInfo: Vector3 = new Vector3(1, 1, 1); // x:subU, y:subV, z:tileCount

  private _tiling: Vector2 = new Vector2(1, 1);
  private _lastFrameOverTimeMacro: ShaderMacro;

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
   * @inheritDoc
   */
  cloneTo(dest: TextureSheetAnimationModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    const frameOverTime = this.frameOverTime;
    const mode = frameOverTime.mode;
    const isCurveMode = mode === ParticleCurveMode.Curve;

    const textureSheetAnimationMacro = this.enabled
      ? isCurveMode || mode === ParticleCurveMode.TwoCurves
        ? isCurveMode
          ? TextureSheetAnimationModule._frameOverTimeCurveMacro
          : TextureSheetAnimationModule._frameOverTimeRandomCurveMacro
        : null
      : null;

    if (this._lastFrameOverTimeMacro !== textureSheetAnimationMacro) {
      this._lastFrameOverTimeMacro && shaderData.disableMacro(this._lastFrameOverTimeMacro);
      this._lastFrameOverTimeMacro = textureSheetAnimationMacro;
    }

    if (textureSheetAnimationMacro) {
      shaderData.enableMacro(textureSheetAnimationMacro);

      shaderData.setFloat(TextureSheetAnimationModule._cycleCount, this.cycleCount);
      shaderData.setVector3(TextureSheetAnimationModule._tillingInfo, this._tillingInfo);
      shaderData.setFloatArray(
        TextureSheetAnimationModule._frameOverTimeMaxCurve,
        frameOverTime.curveMax._getTypeArray()
      );

      if (!isCurveMode) {
        shaderData.setFloatArray(
          TextureSheetAnimationModule._frameOverTimeMinCurve,
          frameOverTime.curveMin._getTypeArray()
        );
      }
    }
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
