import { Color } from "@oasis-engine/math";
import { Engine } from "./Engine";
import { BackgroundMode } from "./enums/BackgroundMode";
import { BackgroundTextureMode } from "./enums/BackgroundTextureMode";
import { Sky } from "./sky/Sky";
import { Texture2D } from "./texture";

/**
 * Background of scene.
 */
export class Background {
  /**
   * Background mode.
   * @defaultValue `BackgroundMode.SolidColor`
   * @remarks If using `BackgroundMode.Sky` mode and material or mesh of the `sky` is not defined, it will downgrade to `BackgroundMode.SolidColor`.
   */
  mode: BackgroundMode = BackgroundMode.SolidColor;

  /**
   * Background solid color.
   * @defaultValue `new Color(0.25, 0.25, 0.25, 1.0)`
   * @remarks When `mode` is `BackgroundMode.SolidColor`, the property will take effects.
   */
  solidColor: Color = new Color(0.25, 0.25, 0.25, 1.0);

  /**
   * Background sky.
   * @remarks When `mode` is `BackgroundMode.Sky`, the property will take effects.
   */
  readonly sky: Sky = new Sky();

  /** @internal */
  _texture: Texture2D = null;

  /** @internal */
  _textureFillMode: BackgroundTextureMode = BackgroundTextureMode.FitHeight;

  /**
   * Background texture.
   * @remarks When `mode` is `BackgroundMode.Texture`, the property will take effects.
   */
  public get texture(): Texture2D {
    return this._texture;
  }

  public set texture(value: Texture2D) {
    if (this._texture !== value) {
      this._texture = value;
      this._engine._backgroundTextureMaterial.shaderData.setTexture("u_baseTexture", value);
    }
  }

  /**
   * @internal
   * Background texture fill mode.
   * @remarks When `mode` is `BackgroundMode.Texture`, the property will take effects.
   * @defaultValue `BackgroundTextureFillMode.FitHeight`
   */
  public get textureFillMode(): BackgroundTextureMode {
    return this._textureFillMode;
  }

  public set textureFillMode(value: BackgroundTextureMode) {
    if (value !== this._textureFillMode) {
      this._textureFillMode = value;
      this._resizeBackgroundTexture();
    }
  }

  /**
   * Constructor of Background.
   * @param _engine Engine Which the background belongs to.
   */
  constructor(private _engine: Engine) {}

  /**
   * @internal
   */
  _resizeBackgroundTexture(): void {
    if (!this._texture) {
      return;
    }
    const { canvas } = this._engine;
    const { width, height } = canvas;
    const { width: textureWidth } = this._texture;
    const { _backgroundTextureMesh } = this._engine;
    const positions = _backgroundTextureMesh.getPositions();

    switch (this._textureFillMode) {
      case BackgroundTextureMode.ScaleToFill:
        positions[0].setValue(-1, -1, -1);
        positions[1].setValue(1, -1, -1);
        positions[2].setValue(-1, 1, -1);
        positions[3].setValue(1, 1, -1);
        break;
      case BackgroundTextureMode.FitWidth:
        {
          const scaleValue = 1 / ((textureWidth * (height / width)) / height);
          positions[0].setValue(-1, -scaleValue, -1);
          positions[1].setValue(1, -scaleValue, -1);
          positions[2].setValue(-1, scaleValue, -1);
          positions[3].setValue(1, scaleValue, -1);
        }
        break;
      case BackgroundTextureMode.FitHeight:
        {
          const scaleValue = (textureWidth * (height / width)) / height;
          positions[0].setValue(-scaleValue, -1, -1);
          positions[1].setValue(scaleValue, -1, -1);
          positions[2].setValue(-scaleValue, 1, -1);
          positions[3].setValue(scaleValue, 1, -1);
        }
        break;
    }
    _backgroundTextureMesh.setPositions(positions);
    _backgroundTextureMesh.uploadData(false);
  }
}
