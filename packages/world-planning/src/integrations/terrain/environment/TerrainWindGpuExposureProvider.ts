import terrainWindGpuExposureShaderSource from "@galacean/engine-environment/terrain/environment/shaders/TerrainWindGpuExposure.shader?raw";
import {
  Blitter,
  ContentRestorer,
  Engine,
  Material,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector4,
  type WindGpuExposureProvider,
  type WindGpuExposureRenderRequest
} from "@galacean/engine";
import { TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS } from "@galacean/engine-terrain/terrain/clipmap/TerrainHeightAtlas";
import type { TerrainHeightGpuSamplingSource } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapMaterial";

const SHADER_NAME = "Terrain/WindGpuExposure";
const MAXIMUM_UPWIND_DISTANCE = 24;

/** Registers the pass so startup warmup can compile it before a terrain atlas exists. */
export function registerTerrainWindGpuExposureShader(): Shader {
  return Shader.find(SHADER_NAME) ?? Shader.create(TERRAIN_WIND_GPU_EXPOSURE_SHADER_SOURCE);
}

/** Terrain-owned GPU shelter producer backed by the exact active Clipmap height atlas. */
export class TerrainWindGpuExposureProvider implements WindGpuExposureProvider {
  private readonly _material: Material;
  private readonly _fieldBounds = new Vector4();
  private readonly _windDirection = new Vector4();
  private readonly _activeWorldBounds = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 4);
  private readonly _activeAtlasRects = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 4);
  private readonly _activeHeightDecode = new Float32Array(TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS * 2);
  private _currentTarget: RenderTarget | null = null;
  private _previousTarget: RenderTarget | null = null;
  private _targetResolution = 0;
  private _observedSource: TerrainHeightGpuSamplingSource | null = null;
  private _observedSourceRevision = -1;
  private _observedTerrainRevision = -1;
  private _revision = 0;
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    private readonly _getSource: () => TerrainHeightGpuSamplingSource,
    private readonly _getTerrainRevision: () => number
  ) {
    const shader = registerTerrainWindGpuExposureShader();
    this._material = new Material(_engine, shader);
    this._material.name = "Terrain GPU wind exposure";
    this._refreshRevision();
  }

  getRevision(): number {
    this._assertAlive();
    this._refreshRevision();
    return this._revision;
  }

  render(request: Readonly<WindGpuExposureRenderRequest>): Texture2D {
    this._assertAlive();
    validateRequest(request);
    this._ensureTarget(request.resolution);
    const completed = this._currentTarget!;
    this._currentTarget = this._previousTarget!;
    this._previousTarget = completed;
    const source = this._getSource();
    const activeRegionCount = this._selectActiveRegions(source, request);
    const data = this._material.shaderData;
    this._fieldBounds.set(request.minimumX, request.minimumZ, request.maximumX, request.maximumZ);
    this._windDirection.set(request.directionX, request.directionZ, 0, 0);
    data.setVector4("material_FieldBounds", this._fieldBounds);
    data.setVector4("material_WindDirection", this._windDirection);
    data.setVector2("material_TerrainHeightAtlasInvSize", source.atlasInvSize);
    data.setFloatArray("material_TerrainRegionWorldBounds", this._activeWorldBounds);
    data.setFloatArray("material_TerrainRegionAtlasRects", this._activeAtlasRects);
    data.setFloatArray("material_TerrainRegionHeightDecode", this._activeHeightDecode);
    data.setInt("material_TerrainRegionCount", activeRegionCount);
    Blitter.blitTexture(this._engine, source.texture, this._currentTarget!, 0, undefined, this._material, 0);
    this._observedSource = source;
    this._observedSourceRevision = source.revision;
    this._observedTerrainRevision = this._getTerrainRevision();
    return this._currentTarget!.getColorTexture(0) as Texture2D;
  }

  getPreviousTexture(): Texture2D {
    this._assertAlive();
    if (!this._previousTarget) throw new Error("Terrain GPU wind exposure has not rendered yet");
    return this._previousTarget.getColorTexture(0) as Texture2D;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._currentTarget) destroyTarget(this._currentTarget);
    if (this._previousTarget) destroyTarget(this._previousTarget);
    this._currentTarget = null;
    this._previousTarget = null;
    this._material.destroy();
  }

  private _refreshRevision(): void {
    const source = this._getSource();
    const terrainRevision = this._getTerrainRevision();
    if (!Number.isSafeInteger(terrainRevision) || terrainRevision < 0) {
      throw new RangeError("Terrain GPU exposure revision must be a non-negative safe integer");
    }
    if (
      source !== this._observedSource ||
      source.revision !== this._observedSourceRevision ||
      terrainRevision !== this._observedTerrainRevision
    ) {
      this._observedSource = source;
      this._observedSourceRevision = source.revision;
      this._observedTerrainRevision = terrainRevision;
      this._revision++;
    }
  }

  private _ensureTarget(resolution: number): void {
    if (this._currentTarget && this._previousTarget && this._targetResolution === resolution) return;
    if (this._currentTarget) destroyTarget(this._currentTarget);
    if (this._previousTarget) destroyTarget(this._previousTarget);
    this._currentTarget = createExposureTarget(this._engine, resolution, "terrain_wind_gpu_exposure_current");
    this._previousTarget = createExposureTarget(this._engine, resolution, "terrain_wind_gpu_exposure_previous");
    this._targetResolution = resolution;
    for (const target of [this._currentTarget, this._previousTarget]) {
      const texture = target.getColorTexture(0) as Texture2D;
      this._engine.resourceManager.addContentRestorer(
        new TerrainWindGpuExposureContentRestorer(texture, () => this._revision++)
      );
    }
  }

  private _selectActiveRegions(
    source: TerrainHeightGpuSamplingSource,
    request: Readonly<WindGpuExposureRenderRequest>
  ): number {
    let activeCount = 0;
    const minimumX = request.minimumX - MAXIMUM_UPWIND_DISTANCE;
    const minimumZ = request.minimumZ - MAXIMUM_UPWIND_DISTANCE;
    const maximumX = request.maximumX + MAXIMUM_UPWIND_DISTANCE;
    const maximumZ = request.maximumZ + MAXIMUM_UPWIND_DISTANCE;
    for (let sourceIndex = 0; sourceIndex < source.regionCount; sourceIndex++) {
      const sourceOffset4 = sourceIndex * 4;
      const regionMinimumX = source.regionWorldBounds[sourceOffset4];
      const regionMinimumZ = source.regionWorldBounds[sourceOffset4 + 1];
      const regionMaximumX = regionMinimumX + source.regionWorldBounds[sourceOffset4 + 2];
      const regionMaximumZ = regionMinimumZ + source.regionWorldBounds[sourceOffset4 + 3];
      if (
        regionMinimumX > maximumX ||
        regionMinimumZ > maximumZ ||
        regionMaximumX < minimumX ||
        regionMaximumZ < minimumZ
      ) {
        continue;
      }
      const targetOffset4 = activeCount * 4;
      const sourceOffset2 = sourceIndex * 2;
      const targetOffset2 = activeCount * 2;
      for (let component = 0; component < 4; component++) {
        this._activeWorldBounds[targetOffset4 + component] = source.regionWorldBounds[sourceOffset4 + component];
        this._activeAtlasRects[targetOffset4 + component] = source.regionAtlasRects[sourceOffset4 + component];
      }
      this._activeHeightDecode[targetOffset2] = source.regionHeightDecode[sourceOffset2];
      this._activeHeightDecode[targetOffset2 + 1] = source.regionHeightDecode[sourceOffset2 + 1];
      activeCount++;
    }
    return activeCount;
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Terrain GPU wind exposure provider has been destroyed");
  }
}

function createExposureTarget(engine: Engine, resolution: number, name: string): RenderTarget {
  const texture = new Texture2D(engine, resolution, resolution, TextureFormat.R8, false, false);
  texture.name = name;
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  const target = new RenderTarget(engine, resolution, resolution, [texture], null, 1);
  target.isGCIgnored = true;
  target.autoGenerateMipmaps = false;
  return target;
}

function destroyTarget(target: RenderTarget): void {
  const textures = [...target.colorTextures];
  target.destroy(true);
  for (const texture of textures) texture.destroy(true);
}

function validateRequest(request: Readonly<WindGpuExposureRenderRequest>): void {
  if (
    !Number.isSafeInteger(request.resolution) ||
    request.resolution < 1 ||
    !Number.isFinite(request.minimumX) ||
    !Number.isFinite(request.minimumZ) ||
    !Number.isFinite(request.maximumX) ||
    !Number.isFinite(request.maximumZ) ||
    request.minimumX > request.maximumX ||
    request.minimumZ > request.maximumZ ||
    !Number.isFinite(request.directionX) ||
    !Number.isFinite(request.directionZ)
  ) {
    throw new RangeError("Terrain GPU wind exposure request is invalid");
  }
}

export const TERRAIN_WIND_GPU_EXPOSURE_SHADER_SOURCE = terrainWindGpuExposureShaderSource;

class TerrainWindGpuExposureContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    private readonly _invalidate: () => void
  ) {
    super(resource);
  }

  restoreContent(): void {
    this._invalidate();
  }
}
