import seedWorldLiquidGlassShaderSourceAsset from "./shaders/SeedWorldLiquidGlass.shader?raw";
import {
  Blitter,
  type Camera,
  Material,
  RenderTarget,
  Script,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";

const CAMERA_POST_PROCESS_TEXTURE = "camera_PostProcessTexture";
const MATERIAL_SCENE_TEXTURE = "material_SeedWorldSceneTexture";
const MATERIAL_FROST_TEXTURE = "material_SeedWorldFrostTexture";

/** Shared liquid-glass UI shader used by both the voice HUD and movement joystick. */
export const SEED_WORLD_LIQUID_GLASS_SHADER_NAME = "SeedWorld/LiquidGlassUiV6";

/** Liquid-glass shader that shades only the Galacean UI image carrying the material. */
export const seedWorldLiquidGlassShaderSource = seedWorldLiquidGlassShaderSourceAsset;

class SeedWorldLiquidGlassTextureBinder extends Script {
  private readonly _materials = new Set<Material>();
  private readonly _mipmapMaterials = new Set<Material>();
  private _texture: Texture2D | null = null;
  private _frostRenderTarget: RenderTarget | null = null;
  private _frostTexture: Texture2D | null = null;
  private readonly _screenSize = new Vector2(1, 1);
  private readonly _texelSize = new Vector2(1, 1);

  addMaterial(material: Material): void {
    this._materials.add(material);
    if (this._texture) this._bindTexture(material, this._texture);
    if (this._frostTexture) this._bindFrostTexture(material, this._frostTexture);
  }

  setMaterialNeedsMipmaps(material: Material, needsMipmaps: boolean): void {
    if (needsMipmaps) {
      this._mipmapMaterials.add(material);
      if (this._frostTexture) this._bindFrostTexture(material, this._frostTexture);
    } else {
      this._mipmapMaterials.delete(material);
    }
  }

  removeMaterial(material: Material): void {
    this._materials.delete(material);
    this._mipmapMaterials.delete(material);
    material.shaderData.setTexture(MATERIAL_SCENE_TEXTURE, null!);
    material.shaderData.setTexture(MATERIAL_FROST_TEXTURE, null!);
    if (this._mipmapMaterials.size === 0) {
      this._releaseFrostTarget();
    }
  }

  override onEndRender(camera: Camera): void {
    const texture = (camera.shaderData.getTexture(CAMERA_POST_PROCESS_TEXTURE) as Texture2D | null) ?? null;
    if (texture !== this._texture) {
      this._texture = texture;
      for (const material of this._materials) {
        if (texture) {
          this._bindTexture(material, texture);
        } else {
          material.shaderData.setTexture(MATERIAL_SCENE_TEXTURE, null!);
        }
      }
    }

    if (!texture || this._mipmapMaterials.size === 0) {
      if (this._frostRenderTarget) this._releaseFrostTarget();
      return;
    }

    // Build a tiny quarter-resolution linear mipmap pyramid from the post-process output.
    // WebGL 2.0 forbids gl.generateMipmap() on SRGB8_ALPHA8 (camera_PostProcessTexture),
    // whereas linear R11G11B10_UFloat / RGBA8 supports hardware mipmapping on all GPUs.
    const frostTexture = this._ensureFrostTarget(camera, texture);
    if (!frostTexture || !this._frostRenderTarget) return;
    const engine = camera.engine;
    const context = engine._renderContext;
    const previousCamera = context.camera;
    const previousFlip = context.flipProjection;
    try {
      context.camera = camera;
      Blitter.blitTexture(engine, texture, this._frostRenderTarget);
      frostTexture.generateMipmaps();
      context.setRenderTarget(camera.renderTarget, camera.viewport);
    } finally {
      context.flipProjection = previousFlip;
      context.camera = previousCamera;
    }
  }

  override onDestroy(): void {
    this._releaseFrostTarget();
  }

  private _ensureFrostTarget(camera: Camera, source: Texture2D): Texture2D | null {
    const targetWidth = Math.max(1, source.width >> 2);
    const targetHeight = Math.max(1, source.height >> 2);
    const existing = this._frostTexture;
    if (existing && existing.width === targetWidth && existing.height === targetHeight) {
      return existing;
    }

    this._releaseFrostTarget();
    const engine = camera.engine;
    const rhi = engine._hardwareRenderer;
    const format = rhi.supportsGenerateMipmaps(TextureFormat.R11G11B10_UFloat, false)
      ? TextureFormat.R11G11B10_UFloat
      : rhi.supportsGenerateMipmaps(TextureFormat.R8G8B8A8_UNorm, false)
        ? TextureFormat.R8G8B8A8_UNorm
        : null;
    if (format === null) return null;

    const frostTexture = new Texture2D(engine, targetWidth, targetHeight, format, true, false);
    frostTexture.isGCIgnored = true;
    frostTexture.wrapModeU = TextureWrapMode.Clamp;
    frostTexture.wrapModeV = TextureWrapMode.Clamp;
    frostTexture.filterMode = TextureFilterMode.Trilinear;
    const renderTarget = new RenderTarget(engine, targetWidth, targetHeight, frostTexture, null, 1);
    renderTarget.isGCIgnored = true;
    renderTarget.autoGenerateMipmaps = false;

    this._frostTexture = frostTexture;
    this._frostRenderTarget = renderTarget;
    for (const material of this._materials) {
      this._bindFrostTexture(material, frostTexture);
    }
    return frostTexture;
  }

  private _releaseFrostTarget(): void {
    for (const material of this._materials) {
      material.shaderData.setTexture(MATERIAL_FROST_TEXTURE, null!);
      material.shaderData.setFloat("material_SeedWorldFrostMaxMip", 0);
    }
    this._frostRenderTarget?.destroy(true);
    this._frostRenderTarget = null;
    this._frostTexture = null;
  }

  private _bindTexture(material: Material, texture: Texture2D): void {
    this._screenSize.set(texture.width, texture.height);
    this._texelSize.set(1 / texture.width, 1 / texture.height);
    const shaderData = material.shaderData;
    shaderData.setTexture(MATERIAL_SCENE_TEXTURE, texture);
    shaderData.setVector2("material_SeedWorldScreenSize", this._screenSize);
    shaderData.setVector2("material_SeedWorldSourceTexelSize", this._texelSize);
  }

  private _bindFrostTexture(material: Material, frostTexture: Texture2D): void {
    const shaderData = material.shaderData;
    shaderData.setTexture(MATERIAL_FROST_TEXTURE, frostTexture);
    shaderData.setFloat("material_SeedWorldFrostMaxMip", Math.max(frostTexture.mipmapCount - 1, 0));
  }
}

/** Material controller for one fragment-bounded liquid-glass Galacean UI image. */
export class SeedWorldLiquidGlassUiMaterial {
  private readonly _binder: SeedWorldLiquidGlassTextureBinder;
  private readonly _material: Material;
  private readonly _panelPixelSize = new Vector2(1, 1);
  private readonly _quadExpandPixels = new Vector2(0, 0);
  private _destroyed = false;
  private _roughness = 0;
  private _fullLensRefraction = 0;

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
    material.shaderData.setFloat("material_SeedWorldFullLensRefraction", 0);
    material.shaderData.setFloat("material_SeedWorldChromaticAberration", 0);
    material.shaderData.setFloat("material_SeedWorldFrostMaxMip", 0);
    material.shaderData.setFloat("material_SeedWorldLensIor", 1.52);
    material.shaderData.setFloat("material_SeedWorldLensThickness", 1.75);
    material.shaderData.setFloat("material_SeedWorldFrostScale", 0.22);
    material.shaderData.setFloat("material_SeedWorldLensFresnel", 1);
    material.shaderData.setVector2("material_SeedWorldQuadExpandPixels", this._quadExpandPixels);
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
   * Expands or contracts an axis-aligned screen-space UI quad around its center in canvas pixels on the GPU,
   * avoiding per-frame CPU transform/VBO rebuilds for continuous animations such as orb breathing.
   * @param deltaWidthPixels - Width delta in canvas pixels (`baseWidth * (scale - 1)`).
   * @param deltaHeightPixels - Height delta in canvas pixels (`baseHeight * (scale - 1)`).
   */
  setQuadExpandPixels(deltaWidthPixels: number, deltaHeightPixels: number): void {
    this._quadExpandPixels.set(deltaWidthPixels, deltaHeightPixels);
    this._material.shaderData.setVector2("material_SeedWorldQuadExpandPixels", this._quadExpandPixels);
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
    this._roughness = Math.max(0, Math.min(value, 1));
    this._material.shaderData.setFloat("material_SeedWorldGlassRoughness", this._roughness);
    this._binder.setMaterialNeedsMipmaps(this._material, this._fullLensRefraction > 0.001 && this._roughness > 0.001);
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

  /**
   * Blends from the default edge-bezel glass into a continuous full-sphere dome lens
   * so refraction spans the entire interior rather than only an outer ring.
   * @param value - Blend factor in the 0-1 range.
   */
  setFullLensRefraction(value: number): void {
    this._fullLensRefraction = Math.max(0, Math.min(value, 1));
    this._material.shaderData.setFloat("material_SeedWorldFullLensRefraction", this._fullLensRefraction);
    this._binder.setMaterialNeedsMipmaps(this._material, this._fullLensRefraction > 0.001 && this._roughness > 0.001);
  }

  /**
   * Sets RGB chromatic dispersion offset strength when full-lens refraction is enabled.
   * @param value - Dispersion multiplier in the 0-3 range.
   */
  setChromaticAberration(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldChromaticAberration", Math.max(0, Math.min(value, 3)));
  }

  /** Full-lens index of refraction for the green channel (1 = no bending). */
  setLensIor(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldLensIor", Math.max(1, Math.min(value, 3)));
  }

  /** Full-lens refraction depth; larger values displace the background further. */
  setLensThickness(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldLensThickness", Math.max(0, Math.min(value, 5)));
  }

  /** Frost blur radius as a fraction of the glass size, multiplied by roughness. */
  setFrostScale(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldFrostScale", Math.max(0, Math.min(value, 1)));
  }

  /** Full-lens Fresnel edge sheen strength. */
  setLensFresnel(value: number): void {
    this._material.shaderData.setFloat("material_SeedWorldLensFresnel", Math.max(0, Math.min(value, 4)));
  }

  /** Releases the material and its camera-source binding. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._binder.removeMaterial(this._material);
    this._material.destroy();
  }
}
