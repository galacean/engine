/** Static-grid Ocean preview displaced by a fixed-count Gerstner vertex shader. */
import { Engine, Entity, MeshRenderer, ModelMesh } from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";
import { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import type { WaterWaveAssetV1 } from "../../../authoring/wave/WaterWaveTypes";
import { compileWaterWaveAsset } from "../../../compiler/wave/WaterWaveCompiler";
import type { CompiledWaterWaveSet } from "../../../compiler/wave/CompiledWaterWaveTypes";
import {
  createWaterWaveMaterial,
  setWaterWaveSurfaceTimeOverride,
  updateWaterWaveMaterial
} from "../../../runtime/wave/WaterWaveMaterialFactory";
import type { WaterWaveMaterialConfig, WaterWaveMaterialState } from "../../../runtime/wave/WaterWaveRuntimeTypes";
import { OceanWaterSurfaceProvider } from "../../../runtime/ocean/OceanWaterSurfaceProvider";
import {
  OCEAN_PREVIEW_DEFAULT_STRESS_ITERATIONS,
  OCEAN_PREVIEW_MIN_AMPLITUDE_SCALE,
  OCEAN_PREVIEW_MIN_SEGMENT_COUNT,
  OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE
} from "./constants";
import type { OceanPreviewConfig, OceanPreviewMetrics, OceanPreviewStressResult } from "./types";

interface OceanGridTopology {
  readonly positions: Vector3[];
  readonly uvs: Vector2[];
  readonly indices: Uint16Array | Uint32Array;
}

function createScaledWaveAsset(config: OceanPreviewConfig): WaterWaveAssetV1 {
  const asset = config.waveAsset;
  if (asset.model === WaterWaveModel.None) return asset;
  const amplitudeScale = Math.max(OCEAN_PREVIEW_MIN_AMPLITUDE_SCALE, config.amplitudeScale);
  return {
    ...asset,
    generator: {
      ...asset.generator,
      minAmplitude: asset.generator.minAmplitude * amplitudeScale,
      maxAmplitude: asset.generator.maxAmplitude * amplitudeScale
    }
  };
}

export class OceanPreviewController {
  readonly root: Entity;
  readonly surfaceProvider: OceanWaterSurfaceProvider;
  private readonly _renderer: MeshRenderer;
  private _mesh: ModelMesh;
  private _materialState: WaterWaveMaterialState;
  private _waveSet: CompiledWaterWaveSet;
  private _meshResolution: number;
  private _meshSize: number;
  private _surfaceTimeOverride?: number;
  private _meshUploadCount = 0;
  private _meshCreateCount = 0;
  private _meshDestroyCount = 0;
  private _materialCreateCount = 0;
  private _materialDestroyCount = 0;
  private _vertexCount = 0;
  private _frameCount = 0;
  private _destroyed = false;

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    private _config: OceanPreviewConfig
  ) {
    this.root = parent.createChild("ocean-preview");
    this._renderer = this.root.createChild("ocean-surface").addComponent(MeshRenderer);
    this._waveSet = this._compileWaveSet();
    this.surfaceProvider = new OceanWaterSurfaceProvider({
      waterBodyId: "ocean-preview",
      waveSet: this._waveSet,
      size: _config.size,
      waterLevel: _config.waterLevel,
      timeScale: _config.timeScale,
      getElapsedTime: () => this._surfaceTimeOverride ?? this._engine.time.elapsedTime
    });
    this._mesh = this._createGridMesh();
    this._meshResolution = _config.resolution;
    this._meshSize = _config.size;
    this._materialState = this._createMaterialState();
    this._renderer.mesh = this._mesh;
    this._renderer.setMaterial(this._materialState.material);
  }

  get metrics(): OceanPreviewMetrics {
    return Object.freeze({
      waveModel: this._waveSet.model,
      quality: this._waveSet.quality,
      shaderWaveCount: Number(this._materialState.variant),
      activeWaveCount: this._waveSet.activeWaveCount,
      sourceHash: this._waveSet.sourceHash,
      meshUploadCount: this._meshUploadCount,
      meshCreateCount: this._meshCreateCount,
      meshDestroyCount: this._meshDestroyCount,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      activeMeshCount: this._meshCreateCount - this._meshDestroyCount,
      activeMaterialCount: this._materialCreateCount - this._materialDestroyCount,
      vertexCount: this._vertexCount,
      frameCount: this._frameCount,
      perFrameMeshUpload: false
    });
  }

  setConfig(config: OceanPreviewConfig): void {
    this._config = config;
    this._waveSet = this._compileWaveSet();
    this._updateSurfaceProvider();
    this.rebuildMesh();
    this._applyMaterialState();
  }

  rebuildMesh(): void {
    const topologyChanged = this._meshResolution !== this._config.resolution || this._meshSize !== this._config.size;
    if (!topologyChanged) {
      this._setConservativeBounds(this._mesh);
      return;
    }
    const previousMesh = this._mesh;
    this._mesh = this._createGridMesh();
    this._meshResolution = this._config.resolution;
    this._meshSize = this._config.size;
    this._renderer.mesh = this._mesh;
    previousMesh.destroy(true);
    this._meshDestroyCount++;
  }

  updateMaterial(): void {
    this._waveSet = this._compileWaveSet();
    this._updateSurfaceProvider();
    this._setConservativeBounds(this._mesh);
    this._applyMaterialState();
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
    setWaterWaveSurfaceTimeOverride(this._materialState, elapsedTime);
  }

  update(_deltaTime: number): void {
    if (!this.root.isActive || this._destroyed) return;
    this._frameCount++;
  }

  stressReconfigure(iterations = OCEAN_PREVIEW_DEFAULT_STRESS_ITERATIONS): OceanPreviewStressResult {
    const requestedIterations = Math.max(0, Math.floor(iterations));
    const originalConfig = this._config;
    const initialMeshUploadCount = this._meshUploadCount;
    for (let index = 0; index < requestedIterations; index++) {
      const quality = OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE[index % OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE.length];
      this.setConfig({ ...originalConfig, quality });
    }
    this.setConfig(originalConfig);
    return Object.freeze({
      requestedIterations,
      completedIterations: requestedIterations,
      initialMeshUploadCount,
      finalMeshUploadCount: this._meshUploadCount,
      activeMeshCount: this._meshCreateCount - this._meshDestroyCount,
      activeMaterialCount: this._materialCreateCount - this._materialDestroyCount,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      sourceHash: this._waveSet.sourceHash
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    this._mesh.destroy(true);
    this._meshDestroyCount++;
    this._materialState.material.destroy(true);
    this._materialDestroyCount++;
  }

  private _compileWaveSet(): CompiledWaterWaveSet {
    return compileWaterWaveAsset(createScaledWaveAsset(this._config), this._config.quality);
  }

  private _updateSurfaceProvider(): void {
    this.surfaceProvider.setConfig({
      waterBodyId: "ocean-preview",
      waveSet: this._waveSet,
      size: this._config.size,
      waterLevel: this._config.waterLevel,
      timeScale: this._config.timeScale
    });
  }

  private _createMaterialConfig(): WaterWaveMaterialConfig {
    return {
      baseColor: this._config.oceanColor,
      alpha: this._config.alpha,
      waterLevel: this._config.waterLevel,
      timeScale: this._config.timeScale,
      crestIntensity: this._config.foamIntensity,
      surfaceTimeOverride: this._surfaceTimeOverride
    };
  }

  private _createMaterialState(): WaterWaveMaterialState {
    const state = createWaterWaveMaterial(this._engine, this._waveSet, this._createMaterialConfig());
    this._materialCreateCount++;
    return state;
  }

  private _applyMaterialState(): void {
    if (Number(this._materialState.variant) === this._waveSet.shaderWaveCount) {
      this._materialState = updateWaterWaveMaterial(this._materialState, this._waveSet, this._createMaterialConfig());
      return;
    }
    const previousMaterial = this._materialState.material;
    this._materialState = this._createMaterialState();
    this._renderer.setMaterial(this._materialState.material);
    previousMaterial.destroy(true);
    this._materialDestroyCount++;
  }

  private _createGridTopology(): OceanGridTopology {
    const segmentCount = Math.max(OCEAN_PREVIEW_MIN_SEGMENT_COUNT, Math.floor(this._config.resolution));
    const vertexSide = segmentCount + 1;
    const halfSize = this._config.size * 0.5;
    const positions: Vector3[] = [];
    const uvs: Vector2[] = [];
    const indexValues: number[] = [];
    for (let z = 0; z <= segmentCount; z++) {
      for (let x = 0; x <= segmentCount; x++) {
        positions.push(
          new Vector3(
            (x / segmentCount) * this._config.size - halfSize,
            0,
            (z / segmentCount) * this._config.size - halfSize
          )
        );
        uvs.push(new Vector2(x / segmentCount, z / segmentCount));
      }
    }
    for (let z = 0; z < segmentCount; z++) {
      for (let x = 0; x < segmentCount; x++) {
        const a = z * vertexSide + x;
        const b = a + 1;
        const c = a + vertexSide;
        const d = c + 1;
        indexValues.push(a, c, b, b, c, d);
      }
    }
    const indices = positions.length > 65535 ? new Uint32Array(indexValues) : new Uint16Array(indexValues);
    return { positions, uvs, indices };
  }

  private _createGridMesh(): ModelMesh {
    const topology = this._createGridTopology();
    const mesh = new ModelMesh(this._engine);
    mesh.setPositions(topology.positions);
    mesh.setUVs(topology.uvs);
    mesh.setIndices(topology.indices);
    mesh.addSubMesh(0, topology.indices.length);
    this._setConservativeBounds(mesh);
    mesh.uploadData(true);
    this._vertexCount = topology.positions.length;
    this._meshCreateCount++;
    this._meshUploadCount++;
    return mesh;
  }

  private _setConservativeBounds(mesh: ModelMesh): void {
    const horizontalExtent = this._config.size * 0.5 + this._waveSet.maxHorizontalDisplacement;
    mesh.bounds.min.set(
      -horizontalExtent,
      this._config.waterLevel - this._waveSet.maxVerticalDisplacement,
      -horizontalExtent
    );
    mesh.bounds.max.set(
      horizontalExtent,
      this._config.waterLevel + this._waveSet.maxVerticalDisplacement,
      horizontalExtent
    );
  }
}
