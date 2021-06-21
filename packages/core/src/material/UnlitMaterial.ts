import { Color, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { BaseMaterial } from "./BaseMaterial";

/**
 * Unlit Material.
 */
export class UnlitMaterial extends BaseMaterial {
  private _baseColor: Color = new Color(1, 1, 1, 1);
  private _baseTexture: Texture2D;
  private _tilingOffset: Vector4 = new Vector4(1, 1, 0, 0);

  /**
   * Tiling and offset of main textures.
   */
  get tilingOffset(): Vector4 {
    return this._tilingOffset;
  }

  set tilingOffset(value: Vector4) {
    this._tilingOffset = value;
    this.shaderData.setVector4("u_tilingOffset", value);
  }

  /**
   * Base color.
   */
  get baseColor(): Color {
    return this._baseColor;
  }

  set baseColor(value: Color) {
    if (value !== this._baseColor) {
      value.cloneTo(this._baseColor);
    }
  }

  /**
   * Base texture.
   */
  get baseTexture(): Texture2D {
    return this._baseTexture;
  }

  set baseTexture(value: Texture2D) {
    this._baseTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_BASE_TEXTURE");
      this.shaderData.setTexture("u_baseTexture", value);
    } else {
      this.shaderData.disableMacro("O3_BASE_TEXTURE");
    }
  }

  /**
   * Create a unlit material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("unlit"));

    const shaderData = this.shaderData;

    shaderData.enableMacro("OMIT_NORMAL");
    shaderData.enableMacro("O3_NEED_TILINGOFFSET");

    shaderData.setColor("u_baseColor", this._baseColor);
    shaderData.setVector4("u_tilingOffset", this._tilingOffset);
  }

  /**
   * @override
   */
  clone(): UnlitMaterial {
    var dest = new UnlitMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
