import { Vector2, Vector3 } from "@galacean/engine-math";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { Key, ParticleCurve } from "./ParticleCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Texture sheet animation module.
 */
export class TextureSheetAnimationModule extends ParticleGeneratorModule {
  private static readonly _frameCurveMacro = ShaderMacro.getByName("RENDERER_TSA_FRAME_CURVE");
  private static readonly _frameRandomCurvesMacro = ShaderMacro.getByName("RENDERER_TSA_FRAME_RANDOM_CURVES");

  private static readonly _cycleCountProperty = ShaderProperty.getByName("renderer_TSACycles");
  private static readonly _tillingParamsProperty = ShaderProperty.getByName("renderer_TSATillingParams");
  private static readonly _frameMinCurveProperty = ShaderProperty.getByName("renderer_TSAFrameMinCurve");
  private static readonly _frameMaxCurveProperty = ShaderProperty.getByName("renderer_TSAFrameMaxCurve");

  /** Start frame of the texture sheet. */
  readonly startFrame = new ParticleCompositeCurve(0);
  /** Frame over time curve of the texture sheet. */
  readonly frameOverTime = new ParticleCompositeCurve(new ParticleCurve(new Key(0, 0), new Key(1, 1)));
  /** Texture sheet animation type. */
  type = TextureSheetAnimationType.WholeSheet;
  /** Cycle count. */
  cycleCount = 1;

  /** @internal */
  _tillingInfo = new Vector3(1, 1, 1); // x:subU, y:subV, z:tileCount

  private _tiling = new Vector2(1, 1);

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
    let frameMacro = <ShaderMacro>null;
    if (this.enabled) {
      const mode = this.frameOverTime.mode;
      if (mode === ParticleCurveMode.Curve || mode === ParticleCurveMode.TwoCurves) {
        const frameOverTime = this.frameOverTime;
        shaderData.setFloatArray(
          TextureSheetAnimationModule._frameMaxCurveProperty,
          frameOverTime.curveMax._getTypeArray()
        );
        if (mode === ParticleCurveMode.Curve) {
          frameMacro = TextureSheetAnimationModule._frameCurveMacro;
        } else {
          shaderData.setFloatArray(
            TextureSheetAnimationModule._frameMinCurveProperty,
            frameOverTime.curveMin._getTypeArray()
          );
          frameMacro = TextureSheetAnimationModule._frameRandomCurvesMacro;
        }

        shaderData.setFloat(TextureSheetAnimationModule._cycleCountProperty, this.cycleCount);
        shaderData.setVector3(TextureSheetAnimationModule._tillingParamsProperty, this._tillingInfo);
      }
    }

    this._enableModuleMacro(shaderData, frameMacro);
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
