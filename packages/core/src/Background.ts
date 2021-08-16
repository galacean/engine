import { Color } from "@oasis-engine/math";
import { Engine } from "./Engine";
import { BackgroundMode } from "./enums/BackgroundMode";
import { BackgroundTextureFillMode } from "./enums/BackgroundTextureFillMode";
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
  _textureFillMode: BackgroundTextureFillMode = BackgroundTextureFillMode.AspectFitHeight;

  private _texture: Texture2D = null;

  /**
   * Background texture.
   * @remarks When `mode` is `BackgroundMode.Texture`, the property will take effects.
   */
  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
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
  get textureFillMode(): BackgroundTextureFillMode {
    return this._textureFillMode;
  }

  set textureFillMode(value: BackgroundTextureFillMode) {
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
    const { _backgroundTextureMesh } = this._engine;
    const positions = _backgroundTextureMesh.getPositions();

    switch (this._textureFillMode) {
      case BackgroundTextureFillMode.Fill:
        positions[0].setValue(-1, -1, -1);
        positions[1].setValue(1, -1, -1);
        positions[2].setValue(-1, 1, -1);
        positions[3].setValue(1, 1, -1);
        break;
      case BackgroundTextureFillMode.AspectFitWidth:
        const fitWidthScale = 1 / ((this._texture.width * (height / width)) / height);
        positions[0].setValue(-1, -fitWidthScale, -1);
        positions[1].setValue(1, -fitWidthScale, -1);
        positions[2].setValue(-1, fitWidthScale, -1);
        positions[3].setValue(1, fitWidthScale, -1);
        break;
      case BackgroundTextureFillMode.AspectFitHeight:
        const fitHeightScale = (this._texture.width * (height / width)) / height;
        positions[0].setValue(-fitHeightScale, -1, -1);
        positions[1].setValue(fitHeightScale, -1, -1);
        positions[2].setValue(-fitHeightScale, 1, -1);
        positions[3].setValue(fitHeightScale, 1, -1);
        break;
    }
    _backgroundTextureMesh.setPositions(positions);
    _backgroundTextureMesh.uploadData(false);
  }
}
