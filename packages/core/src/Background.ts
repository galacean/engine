import { Color, Vector2, Vector3 } from "@galacean/engine-math";
import { CompareFunction, ContentRestorer, Material, ModelMesh, Shader } from ".";
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
   * Background sky.
   * @remarks When `mode` is `BackgroundMode.Sky`, the property will take effects.
   */
  readonly sky: Sky = new Sky();

  /** @internal */
  _textureFillMode: BackgroundTextureFillMode = BackgroundTextureFillMode.AspectFitHeight;

  /** @internal */
  _mesh: ModelMesh;
  /** @internal */
  _material: Material;

  /** @internal */
  _linearSolidColor = new Color();

  private _solidColor = new Color(0.25, 0.25, 0.25, 1.0);
  private _texture: Texture2D = null;

  /**
   * Background solid color.
   * @defaultValue `new Color(0.25, 0.25, 0.25, 1.0)`
   * @remarks When `mode` is `BackgroundMode.SolidColor`, the property will take effects.
   */
  get solidColor(): Color {
    return this._solidColor;
  }

  set solidColor(value: Color) {
    if (value !== this._solidColor) {
      this._solidColor.copyFrom(value);
    }
  }

  /**
   * Background texture.
   * @remarks When `mode` is `BackgroundMode.Texture`, the property will take effects.
   */
  get texture(): Texture2D {
    return this._texture;
  }

  set texture(value: Texture2D) {
    if (this._texture !== value) {
      value?._addReferCount(1);
      this._texture?._addReferCount(-1);
      this._texture = value;
      this._material.shaderData.setTexture("material_BaseTexture", value);
      this._resizeBackgroundTexture();
    }
  }

  /**
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
   * @internal
   */
  destroy(): void {
    this.texture = null;
    this._mesh._addReferCount(-1);
    this._mesh = null;
    this._material._addReferCount(-1);
    this._material = null;
    this.sky.destroy();
  }

  /**
   * Constructor of Background.
   * @param _engine Engine Which the background belongs to.
   */
  constructor(private _engine: Engine) {
    this._initMesh(_engine);
    this._initMaterial(_engine);

    this._solidColor.toLinear(this._linearSolidColor);
    // @ts-ignore
    this.solidColor._onValueChanged = () => {
      this.solidColor.toLinear(this._linearSolidColor);
    };
  }

  /**
   * @internal
   */
  _resizeBackgroundTexture(): void {
    const { _texture: texture, _mesh: mesh } = this;
    if (!this._texture) {
      return;
    }
    const { width, height } = this._engine.canvas;
    const positions = mesh.getPositions();

    switch (this._textureFillMode) {
      case BackgroundTextureFillMode.Fill:
        positions[0].set(-1, -1, 1);
        positions[1].set(1, -1, 1);
        positions[2].set(-1, 1, 1);
        positions[3].set(1, 1, 1);
        break;
      case BackgroundTextureFillMode.AspectFitWidth:
        const fitWidthScale = (texture.height * width) / texture.width / height;
        positions[0].set(-1, -fitWidthScale, 1);
        positions[1].set(1, -fitWidthScale, 1);
        positions[2].set(-1, fitWidthScale, 1);
        positions[3].set(1, fitWidthScale, 1);
        break;
      case BackgroundTextureFillMode.AspectFitHeight:
        const fitHeightScale = (texture.width * height) / texture.height / width;
        positions[0].set(-fitHeightScale, -1, 1);
        positions[1].set(fitHeightScale, -1, 1);
        positions[2].set(-fitHeightScale, 1, 1);
        positions[3].set(fitHeightScale, 1, 1);
        break;
    }
    mesh.setPositions(positions);
    mesh.uploadData(false);
  }

  private _initMesh(engine: Engine): void {
    const mesh = (this._mesh = this._createPlane(engine));
    engine.resourceManager.addContentRestorer(
      new (class extends ContentRestorer<ModelMesh> {
        constructor() {
          super(mesh);
        }
        restoreContent() {
          mesh.setPositions(mesh.getPositions());
          mesh.setUVs(mesh.getUVs());
          mesh.setIndices(mesh.getIndices());
          mesh.uploadData(false);
        }
      })()
    );
    this._mesh._addReferCount(1);
  }

  private _initMaterial(engine: Engine): void {
    const material = (this._material = new Material(engine, Shader.find("background-texture")));
    material.renderState.depthState.compareFunction = CompareFunction.LessEqual;
    material._addReferCount(1);
  }

  private _createPlane(engine: Engine): ModelMesh {
    const mesh = new ModelMesh(engine);
    const indices = new Uint8Array([1, 2, 0, 1, 3, 2]);

    const positions: Vector3[] = new Array(4);
    const uvs: Vector2[] = new Array(4);

    for (let i = 0; i < 4; ++i) {
      positions[i] = new Vector3();
      uvs[i] = new Vector2(i % 2, 1 - ((i * 0.5) | 0));
    }

    mesh.setPositions(positions);
    mesh.setUVs(uvs);
    mesh.setIndices(indices);

    mesh.uploadData(false);
    mesh.addSubMesh(0, indices.length);
    return mesh;
  }
}
