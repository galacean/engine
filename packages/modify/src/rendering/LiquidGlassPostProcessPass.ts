import seedWorldLiquidGlassShaderSourceAsset from "./shaders/SeedWorldLiquidGlass.shader?raw";
import { type Camera, Material, Script, Shader, type Texture2D } from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";

const CAMERA_POST_PROCESS_TEXTURE = "camera_PostProcessTexture";
const MATERIAL_SCENE_TEXTURE = "material_SeedWorldSceneTexture";

/** Shared liquid-glass UI shader used by both the voice HUD and movement joystick. */
export const SEED_WORLD_LIQUID_GLASS_SHADER_NAME = "SeedWorld/LiquidGlassUiV6";

/** Liquid-glass shader that shades only the Galacean UI image carrying the material. */
export const seedWorldLiquidGlassShaderSource = seedWorldLiquidGlassShaderSourceAsset;

class SeedWorldLiquidGlassTextureBinder extends Script {
  private readonly _materials = new Set<Material>();
  private _texture: Texture2D | null = null;
  private readonly _screenSize = new Vector2(1, 1);
  private readonly _texelSize = new Vector2(1, 1);

  addMaterial(material: Material): void {
    this._materials.add(material);
    if (this._texture) this._bindTexture(material, this._texture);
  }

  removeMaterial(material: Material): void {
    this._materials.delete(material);
    material.shaderData.setTexture(MATERIAL_SCENE_TEXTURE, null!);
  }

  override onEndRender(camera: Camera): void {
    const texture = (camera.shaderData.getTexture(CAMERA_POST_PROCESS_TEXTURE) as Texture2D | null) ?? null;
    if (texture === this._texture) return;
    this._texture = texture;
    for (const material of this._materials) {
      if (texture) {
        this._bindTexture(material, texture);
      } else {
        material.shaderData.setTexture(MATERIAL_SCENE_TEXTURE, null!);
      }
    }
  }

  private _bindTexture(material: Material, texture: Texture2D): void {
    this._screenSize.set(texture.width, texture.height);
    this._texelSize.set(1 / texture.width, 1 / texture.height);
    const shaderData = material.shaderData;
    shaderData.setTexture(MATERIAL_SCENE_TEXTURE, texture);
    shaderData.setVector2("material_SeedWorldScreenSize", this._screenSize);
    shaderData.setVector2("material_SeedWorldSourceTexelSize", this._texelSize);
  }
}

/** Material controller for one fragment-bounded liquid-glass Galacean UI image. */
export class SeedWorldLiquidGlassUiMaterial {
  private readonly _binder: SeedWorldLiquidGlassTextureBinder;
  private readonly _material: Material;
  private readonly _panelPixelSize = new Vector2(1, 1);
  private _destroyed = false;

  /**
   * Creates one local liquid-glass material and binds it to the camera's existing post-process output.
   * @param camera - World camera that owns the post-process source texture.
   */
  constructor(camera: Camera) {
    const shader = Shader.find(SEED_WORLD_LIQUID_GLASS_SHADER_NAME) ?? Shader.create(seedWorldLiquidGlassShaderSource);
    const material = (this._material = new Material(camera.engine, shader));
    material.isGCIgnored = true;
    material.shaderData.setVector2("material_SeedWorldPanelPixelSize", this._panelPixelSize);
    material.shaderData.setFloat("material_SeedWorldCornerRadiusPixels", 0.5);
    material.shaderData.setFloat("material_SeedWorldGlassOpacity", 1);
    material.shaderData.setFloat("material_SeedWorldGlassRoughness", 0);
    material.shaderData.setFloat("material_SeedWorldRimHighlight", 0);
    material.shaderData.setFloat("material_SeedWorldInteriorRefractionStrength", 1);
    material.shaderData.setFloat("material_SeedWorldWhiteTint", 0);
    const binder = (this._binder =
      camera.entity.getComponent(SeedWorldLiquidGlassTextureBinder) ??
      camera.entity.addComponent(SeedWorldLiquidGlassTextureBinder));
    binder.addMaterial(material);
  }

  /** @returns Galacean material assigned to the target UI Image. */
  get material(): Material {
    return this._material;
  }

  /**
   * Sets the fragment-bounded UI rectangle dimensions.
   * @param widthPixels - Rendered rectangle width in source-texture pixels.
   * @param heightPixels - Rendered rectangle height in source-texture pixels.
   * @param cornerRadiusPixels - Rounded corner radius in source-texture pixels.
   */
  setLayout(widthPixels: number, heightPixels: number, cornerRadiusPixels: number): void {
    this._panelPixelSize.set(Math.max(widthPixels, 1), Math.max(heightPixels, 1));
    const shaderData = this._material.shaderData;
    shaderData.setVector2("material_SeedWorldPanelPixelSize", this._panelPixelSize);
    shaderData.setFloat("material_SeedWorldCornerRadiusPixels", Math.max(cornerRadiusPixels, 0.5));
  }

  /**
   * Sets glass compositing opacity.
   * @param value - Opacity in the 0-1 range.
   */
  setOpacity(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldGlassOpacity", Math.max(0, Math.min(value, 1)));
  }

  /**
   * Sets the screen-space transmission roughness.
   * @param value - Roughness in the 0-1 range.
   */
  setRoughness(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldGlassRoughness", Math.max(0, Math.min(value, 1)));
  }

  /** Optional silhouette coverage for non-rectangular glass icons. */
  setCoverageTexture(texture: Texture2D): void {
    this._material.shaderData.setTexture("material_SeedWorldGlassMask", texture);
    this._material.shaderData.enableMacro("SEED_WORLD_GLASS_MASK");
  }

  /** White frosting independent of opacity; zero keeps the original glass. */
  setWhiteTint(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldWhiteTint", Math.max(0, Math.min(value, 1)));
  }

  /**
   * Sets displaced transmission strength inside the rounded shape.
   * @param value - Interior refraction strength in the 0-1 range.
   */
  setInteriorRefractionStrength(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldInteriorRefractionStrength", Math.max(0, Math.min(value, 1)));
  }

  /** Optional interaction highlight; zero preserves the resting glass appearance. */
  setRimHighlight(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldRimHighlight", Math.max(0, Math.min(value, 1)));
  }

  /** Releases the material and its camera-source binding. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._binder.removeMaterial(this._material);
    this._material.destroy();
  }
}
