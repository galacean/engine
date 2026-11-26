import {
  Camera,
  Engine,
  Material,
  Matrix,
  RenderTarget,
  Script,
  Shader,
  ShaderMacroCollection,
  Sprite,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";
import {
  SEED_WORLD_VOICE_ORB_BAKE_SHADER_NAME,
  SEED_WORLD_VOICE_ORB_DISPLAY_SHADER_NAME,
  seedWorldVoiceOrbBakeShaderSource,
  seedWorldVoiceOrbDisplayShaderSource
} from "./SeedWorldVoiceHudShaders.ts";

/** Offscreen cache resolution: soft aurora ribbons (FWHM ~4.7 texels) upsample cleanly to 1.72x pressed scale (-44% pixels vs 128px). */
export const VOICE_ORB_CACHE_RESOLUTION = 96;
/** Refractive index shared by the glass backdrop and the colored ribbons inside it. */
export const VOICE_ORB_GLASS_IOR = 1.52;
/** 1D cyclic aurora palette LUT width (power-of-two for hardware Repeat wrapping). */
export const VOICE_ORB_SPECTRUM_LUT_WIDTH = 64;
/** Idle breathing cadence (~30Hz, with 2ms margin so 60Hz/120Hz displays hit steady 2-frame/4-frame cadence). */
export const VOICE_ORB_IDLE_BAKE_INTERVAL_SEC = 1 / 30 - 0.002;
/** Active listening/pressed cadence (~60Hz, with 2ms margin). */
export const VOICE_ORB_ACTIVE_BAKE_INTERVAL_SEC = 1 / 60 - 0.002;

const DEFAULT_VIEWPORT = new Vector4(0, 0, 1, 1);

const DEFAULT_ORB_CYAN: readonly [number, number, number] = [0.0, 0.96, 1.0];
const DEFAULT_ORB_AZURE: readonly [number, number, number] = [0.14, 0.44, 1.0];
const DEFAULT_ORB_VIOLET: readonly [number, number, number] = [0.52, 0.16, 1.0];
const DEFAULT_ORB_ORCHID: readonly [number, number, number] = [0.94, 0.16, 0.86];
const DEFAULT_ORB_ROSE: readonly [number, number, number] = [1.0, 0.24, 0.68];
const DEFAULT_ORB_CORE: readonly [number, number, number] = [1.0, 1.0, 1.0];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Builds the 64x1 RGBA8 cyclic pastel aurora palette LUT matching `evalAuroraSpectrum`. */
export function buildVoiceOrbSpectrumLutPixels(width = VOICE_ORB_SPECTRUM_LUT_WIDTH): Uint8Array {
  const cCyanAzure = mixRgb(DEFAULT_ORB_CYAN, DEFAULT_ORB_AZURE, 0.55);
  const cAqua = mixRgb(DEFAULT_ORB_CYAN, DEFAULT_ORB_CORE, 0.18);
  const pixels = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const u = (i + 0.5) / width;
    let col = mixRgb(DEFAULT_ORB_CYAN, cCyanAzure, smoothstep(0.0, 0.38, u));
    col = mixRgb(col, DEFAULT_ORB_VIOLET, smoothstep(0.38, 0.54, u));
    col = mixRgb(col, DEFAULT_ORB_ORCHID, smoothstep(0.54, 0.68, u));
    col = mixRgb(col, DEFAULT_ORB_ROSE, smoothstep(0.68, 0.82, u));
    col = mixRgb(col, cAqua, smoothstep(0.82, 0.91, u));
    col = mixRgb(col, DEFAULT_ORB_CYAN, smoothstep(0.91, 1.0, u));
    const offset = i * 4;
    pixels[offset] = Math.round(Math.max(0, Math.min(1, col[0])) * 255);
    pixels[offset + 1] = Math.round(Math.max(0, Math.min(1, col[1])) * 255);
    pixels[offset + 2] = Math.round(Math.max(0, Math.min(1, col[2])) * 255);
    pixels[offset + 3] = 255;
  }
  return pixels;
}

/**
 * Writes the column-major 3x3 rotation matrix matching GLSL `orbRotZ(rz) * orbRotX(rx) * orbRotY(ry)`
 * (where each GLSL constructor was written in row-major visual order, i.e., rotating by -angle)
 * into the upper-left 3x3 of a Galacean column-major 4x4 `Matrix`.
 */
export function writeOrbRotationMatrixZXY(rz: number, rx: number, ry: number, out: Matrix): void {
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);

  const a00 = cz;
  const a01 = sz * cx;
  const a02 = sz * sx;
  const a10 = -sz;
  const a11 = cz * cx;
  const a12 = cz * sx;
  const a20 = 0;
  const a21 = -sx;
  const a22 = cx;

  const e = out.elements;
  e[0] = a00 * cy + a02 * sy;
  e[1] = a10 * cy + a12 * sy;
  e[2] = a20 * cy + a22 * sy;
  e[3] = 0;
  e[4] = a01;
  e[5] = a11;
  e[6] = a21;
  e[7] = 0;
  e[8] = -a00 * sy + a02 * cy;
  e[9] = -a10 * sy + a12 * cy;
  e[10] = -a20 * sy + a22 * cy;
  e[11] = 0;
  e[12] = 0;
  e[13] = 0;
  e[14] = 0;
  e[15] = 1;
}

/**
 * Pure pacing helper for VoiceOrb offscreen baking:
 * - Always bakes immediately before the first draw or after context restore.
 * - Idle (`listeningBlend <= 0.01`): bakes at 30Hz.
 * - Listening / pressed (`listeningBlend > 0.01`): bakes at 60Hz (and immediately on idle -> active transition).
 */
export function shouldBakeVoiceOrbFrame(
  elapsedSinceLastBakeSec: number,
  listeningBlend: number,
  wasListening: boolean,
  hasBakedOnce: boolean
): boolean {
  if (!hasBakedOnce) return true;
  const isListening = listeningBlend > 0.01;
  if (isListening && !wasListening) return true;
  const interval = isListening ? VOICE_ORB_ACTIVE_BAKE_INTERVAL_SEC : VOICE_ORB_IDLE_BAKE_INTERVAL_SEC;
  return elapsedSinceLastBakeSec >= interval;
}

class SeedWorldVoiceOrbBakeDriver extends Script {
  owner: SeedWorldVoiceOrbCache | null = null;

  override onEndRender(camera: Camera): void {
    this.owner?._renderIfNeeded(camera);
  }
}

/**
 * Renders the 3D volumetric Voice Orb aurora (`SeedWorld/VoiceOrbBakeV1`) into a fixed
 * 96x96 RGBA8 premultiplied offscreen RenderTarget at 30Hz idle / 60Hz listening using
 * a 64x1 spectrum LUT, linear ray increments, and merged Gaussian exp2, and exposes a
 * 1-tap display material + sprite for the UI Image.
 */
export class SeedWorldVoiceOrbCache {
  readonly bakeMaterial: Material;
  readonly displayMaterial: Material;
  readonly texture: Texture2D;
  readonly sprite: Sprite;

  private readonly _engine: Engine;
  private readonly _renderTarget: RenderTarget;
  private readonly _lutPixels: Uint8Array;
  private readonly _lutTexture: Texture2D;
  private readonly _driver: SeedWorldVoiceOrbBakeDriver;
  private readonly _compileMacros = new ShaderMacroCollection();

  private readonly _rotBase = new Matrix();
  private readonly _rotInner = new Matrix();
  private readonly _rotMid = new Matrix();
  private readonly _rotOuter = new Matrix();
  private readonly _framePhase = new Vector4();
  private readonly _frameTrig0 = new Vector4();
  private readonly _frameTrig1 = new Vector4();

  private readonly _onContextRestored = () => {
    if (this._destroyed) return;
    this._lutTexture.setPixelBuffer(this._lutPixels);
    this._hasBakedOnce = false;
    this._dirty = true;
  };
  private _webCanvas: HTMLCanvasElement | undefined;

  private _phase = 0;
  private _listeningBlend = 0;
  private _wasListening = false;
  private _elapsedSinceBake = 0;
  private _hasBakedOnce = false;
  private _dirty = false;
  private _destroyed = false;
  private _bakeCount = 0;
  /** Optional visibility predicate; skips offscreen bake while the orb UI entity is inactive. */
  isVisible: (() => boolean) | undefined;

  /** Total number of offscreen VoiceOrb GPU bakes performed so far. */
  get bakeCount(): number {
    return this._bakeCount;
  }

  constructor(engine: Engine, camera: Camera) {
    this._engine = engine;

    const bakeShader =
      Shader.find(SEED_WORLD_VOICE_ORB_BAKE_SHADER_NAME) ?? Shader.create(seedWorldVoiceOrbBakeShaderSource);
    const displayShader =
      Shader.find(SEED_WORLD_VOICE_ORB_DISPLAY_SHADER_NAME) ?? Shader.create(seedWorldVoiceOrbDisplayShaderSource);

    this.bakeMaterial = new Material(engine, bakeShader);
    this.bakeMaterial.isGCIgnored = true;
    this.displayMaterial = new Material(engine, displayShader);
    this.displayMaterial.isGCIgnored = true;
    this.displayMaterial.shaderData.setFloat("material_OrbScaleExpandPixels", 0);

    const lutPixels = buildVoiceOrbSpectrumLutPixels(VOICE_ORB_SPECTRUM_LUT_WIDTH);
    this._lutPixels = lutPixels;
    const lutTexture = new Texture2D(
      engine,
      VOICE_ORB_SPECTRUM_LUT_WIDTH,
      1,
      TextureFormat.R8G8B8A8_UNorm,
      false,
      false
    );
    lutTexture.isGCIgnored = true;
    lutTexture.wrapModeU = TextureWrapMode.Repeat;
    lutTexture.wrapModeV = TextureWrapMode.Clamp;
    lutTexture.filterMode = TextureFilterMode.Bilinear;
    lutTexture.setPixelBuffer(lutPixels);
    this._lutTexture = lutTexture;

    const texture = new Texture2D(
      engine,
      VOICE_ORB_CACHE_RESOLUTION,
      VOICE_ORB_CACHE_RESOLUTION,
      TextureFormat.R8G8B8A8_UNorm,
      false,
      false
    );
    texture.isGCIgnored = true;
    texture.wrapModeU = TextureWrapMode.Clamp;
    texture.wrapModeV = TextureWrapMode.Clamp;
    texture.filterMode = TextureFilterMode.Bilinear;
    this.texture = texture;

    const renderTarget = new RenderTarget(
      engine,
      VOICE_ORB_CACHE_RESOLUTION,
      VOICE_ORB_CACHE_RESOLUTION,
      texture,
      null,
      1
    );
    renderTarget.isGCIgnored = true;
    renderTarget.autoGenerateMipmaps = false;
    this._renderTarget = renderTarget;

    this.sprite = new Sprite(engine, texture);

    const d = this.bakeMaterial.shaderData;
    d.setFloat("material_Listening", 0);
    d.setTexture("material_OrbSpectrumLut", lutTexture);
    d.setVector4("material_OrbCyan", new Vector4(DEFAULT_ORB_CYAN[0], DEFAULT_ORB_CYAN[1], DEFAULT_ORB_CYAN[2], 1));
    d.setVector4("material_OrbAzure", new Vector4(DEFAULT_ORB_AZURE[0], DEFAULT_ORB_AZURE[1], DEFAULT_ORB_AZURE[2], 1));
    d.setVector4("material_OrbViolet", new Vector4(DEFAULT_ORB_VIOLET[0], DEFAULT_ORB_VIOLET[1], DEFAULT_ORB_VIOLET[2], 1));
    d.setVector4("material_OrbMotion", new Vector4(0.9, 1.62, VOICE_ORB_GLASS_IOR, 0.96));
    d.setVector4("material_OrbRibbon", new Vector4(0.74, 0.28, 1.72, 1.42));
    d.setVector4("material_OrbDisp", new Vector4(0.036, 0.045, 0.42, 0));
    d.setVector4("material_OrbTone", new Vector4(1.16, 1.48, 0.92, 0.62));
    d.setVector4("material_OrbRim", new Vector4(0.2, 0.05, 0.22, 0.45));
    d.setFloat("material_OrbShellThickness", 0.11);

    this._syncBakeUniforms(0, 0);

    const driver = camera.entity.addComponent(SeedWorldVoiceOrbBakeDriver);
    driver.owner = this;
    this._driver = driver;

    const webCanvas = (engine.canvas as { _webCanvas?: HTMLCanvasElement })._webCanvas;
    if (webCanvas) {
      this._webCanvas = webCanvas;
      webCanvas.addEventListener("webglcontextrestored", this._onContextRestored, false);
    }
  }

  /** Called once per frame from VoiceHudLayout.onUpdate; schedules a GPU bake only on paced ticks. */
  scheduleUpdate(phase: number, listeningBlend: number, deltaTime: number): void {
    if (this._destroyed) return;
    this._phase = phase;
    this._listeningBlend = listeningBlend;
    this._elapsedSinceBake += deltaTime;
    if (shouldBakeVoiceOrbFrame(this._elapsedSinceBake, listeningBlend, this._wasListening, this._hasBakedOnce)) {
      this._dirty = true;
    }
    this._wasListening = listeningBlend > 0.01;
  }

  /** @internal Invoked by SeedWorldVoiceOrbBakeDriver.onEndRender right before UIUtils.renderOverlay. */
  _renderIfNeeded(camera: Camera): void {
    if (this._destroyed || !this._dirty) return;
    if (this.isVisible && !this.isVisible()) return;
    const engine = this._engine;
    const rhi = engine._hardwareRenderer;
    if (!rhi?.supportsRendering || rhi.isContextLost?.()) return;

    this._syncBakeUniforms(this._phase, this._listeningBlend);

    const context = engine._renderContext;
    const previousCamera = context.camera;
    const previousFlip = context.flipProjection;
    let baked = false;
    try {
      context.camera = camera;
      context.flipProjection = true;
      context.setRenderTarget(this._renderTarget, DEFAULT_VIEWPORT, 0);

      const pass = this.bakeMaterial.shader.subShaders[0].passes[0];
      const compileMacros = this._compileMacros;
      // Intentionally omit camera._globalShaderMacro so weather/SSR macro flips never recompile the orb shader.
      ShaderMacroCollection.unionCollection(
        this.bakeMaterial.shaderData._macroCollection,
        engine._macroCollection,
        compileMacros
      );
      const program = pass._getShaderProgram(engine, compileMacros);
      if (!program.isValid) return;

      program.bind();
      program.regroupUniformBlocks();
      program.uploadAll(program.materialUniformBlock, this.bakeMaterial.shaderData);
      program.uploadUnGroupTextures();
      pass._renderState._applyStates(engine, false, pass._renderStateDataMap, this.bakeMaterial.shaderData);

      const blitMesh = engine._basicResources.flipYBlitMesh;
      rhi.drawPrimitive(blitMesh._primitive, blitMesh.subMesh, program);
      baked = true;
    } finally {
      context.flipProjection = previousFlip;
      if (!rhi.isContextLost?.()) {
        context.setRenderTarget(camera.renderTarget, camera.viewport, 0);
      }
      context.camera = previousCamera;
    }

    if (baked) {
      this._dirty = false;
      this._elapsedSinceBake = 0;
      this._hasBakedOnce = true;
      this._bakeCount += 1;
    }
  }

  private _syncBakeUniforms(phase: number, listeningBlend: number): void {
    const d = this.bakeMaterial.shaderData;
    const motion = d.getVector4("material_OrbMotion");
    const flowSpeed = motion ? motion.x : 0.9;
    const sway = motion ? motion.y : 1.62;
    const t = phase * flowSpeed;

    writeOrbRotationMatrixZXY(
      -t * 0.48,
      0.22 + 0.14 * sway * Math.sin(t * 0.38),
      0.18 * sway * Math.cos(t * 0.33),
      this._rotBase
    );
    writeOrbRotationMatrixZXY(
      t * 0.45 + 0.5,
      0.58 + 0.24 * sway * Math.sin(t * 0.52 + 0.7),
      -0.38 * sway * Math.cos(t * 0.44),
      this._rotInner
    );
    writeOrbRotationMatrixZXY(
      -t * 0.56 + 1.8,
      -0.42 + 0.22 * sway * Math.cos(t * 0.46 + 1.5),
      0.32 * sway * Math.sin(t * 0.39 + 0.4),
      this._rotMid
    );
    writeOrbRotationMatrixZXY(
      -t * 0.38 - 0.9,
      0.34 + 0.2 * sway * Math.sin(t * 0.41 + 2.4),
      -0.26 * sway * Math.cos(t * 0.35 + 1.1),
      this._rotOuter
    );

    const tIn = t * 0.85;
    const tMid = -t * 0.75;
    const tOut = t * 0.68;
    const zIn = tIn * 0.7;
    const zMid = tMid * 0.7;
    const zOut = tOut * 0.7;
    const auroraPhase = 1.85 + 0.45 * Math.sin(t * 0.35);

    this._framePhase.set(tIn, tMid, tOut, 0);
    this._frameTrig0.set(Math.sin(zIn), Math.cos(zIn), Math.sin(zMid), Math.cos(zMid));
    this._frameTrig1.set(Math.sin(zOut), Math.cos(zOut), Math.cos(auroraPhase), -Math.sin(auroraPhase));

    d.setFloat("material_Listening", listeningBlend);
    d.setMatrix("material_OrbRotBase", this._rotBase);
    d.setMatrix("material_OrbRotInner", this._rotInner);
    d.setMatrix("material_OrbRotMid", this._rotMid);
    d.setMatrix("material_OrbRotOuter", this._rotOuter);
    d.setVector4("material_OrbFramePhase", this._framePhase);
    d.setVector4("material_OrbFrameTrig0", this._frameTrig0);
    d.setVector4("material_OrbFrameTrig1", this._frameTrig1);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._webCanvas?.removeEventListener("webglcontextrestored", this._onContextRestored, false);
    this._webCanvas = undefined;
    this._driver.owner = null;
    if (!this._driver.destroyed) this._driver.destroy();
    this.sprite.destroy(true);
    this._renderTarget.destroy(true);
    this.bakeMaterial.destroy(true);
    this.displayMaterial.destroy(true);
    this.texture.destroy(true);
    this._lutTexture.destroy(true);
  }
}
