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
  _texture: Texture2D = null;

  /** @internal */
  _textureFillMode: BackgroundTextureFillMode = BackgroundTextureFillMode.FitHeight;

  /**
   * Background texture.
   * @remarks When `mode` is `BackgroundMode.Texture`, the property will take effects.
   */
  public get texture(): Texture2D {
    return this._texture;
  }

  public set texture(v: Texture2D) {
    if (this._texture === v) {
      return;
    }
    this._engine._backgroundTextureMaterial.shaderData.setTexture("u_baseTexture", v);
  }

  /**
   * Background texture fill mode.
   * @remarks When `mode` is `BackgroundMode.Texture`, the property will take effects.
   * @defaultValue `BackgroundTextureFillMode.FitHeight`
   */
  public get textureFillMode(): BackgroundTextureFillMode {
    return this._textureFillMode;
  }

  public set textureFillMode(textureFillMode: BackgroundTextureFillMode) {
    if (textureFillMode === this._textureFillMode) {
      return;
    }

    this._textureFillMode = textureFillMode;
    this._resizeBackground();
  }

  /**
   * Constructor of Background.
   * @param _engine Engine Which the background belongs to.
   */
  constructor(private _engine: Engine) {}

  /** @internal */
  _resizeBackground(): void {
    const { canvas } = this._engine;
    const { width, height } = canvas;
    const ratio = height / width;
    const { _backgroundTextureMesh } = this._engine;
    const postions = _backgroundTextureMesh.getPositions();

    switch (this.textureFillMode) {
      case BackgroundTextureFillMode.Scale:
        postions[0].setValue(-1, -1, 0);
        postions[1].setValue(1, -1, 0);
        postions[2].setValue(-1, 1, 0);
        postions[3].setValue(1, 1, 0);
        break;
      case BackgroundTextureFillMode.FitWidth:
        postions[0].setValue(-1, -1 * ratio, 0);
        postions[1].setValue(1, -1 * ratio, 0);
        postions[2].setValue(-1, 1 * ratio, 0);
        postions[3].setValue(1, 1 * ratio, 0);
        break;
      case BackgroundTextureFillMode.FitHeight:
        postions[0].setValue(-1 / ratio, -1, 0);
        postions[1].setValue(1 / ratio, -1, 0);
        postions[2].setValue(-1 / ratio, 1, 0);
        postions[3].setValue(1 / ratio, 1, 0);
        break;
    }
    _backgroundTextureMesh.setPositions(postions);
    _backgroundTextureMesh.uploadData(false);
  }
}
