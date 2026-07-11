/** Isolated CPU-wave experiment. This is not the formal Ocean architecture. */
import { Engine, Entity, MeshRenderer, ModelMesh, UnlitMaterial } from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";
import { createWaterPreviewMaterial, updateWaterPreviewMaterial } from "../../WaterPreviewMaterial";
import type { OceanPreviewConfig } from "./types";

export class OceanPreviewController {
  readonly root: Entity;
  private readonly _renderer: MeshRenderer;
  private readonly _material: UnlitMaterial;
  private _mesh: ModelMesh;
  private _meshResolution: number;
  private _time = 0;

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    private _config: OceanPreviewConfig
  ) {
    this.root = parent.createChild("ocean-preview");
    this._renderer = this.root.createChild("ocean-surface").addComponent(MeshRenderer);
    this._material = createWaterPreviewMaterial(_engine, _config.oceanColor, _config.alpha);
    this._mesh = this._createGridMesh();
    this._meshResolution = _config.resolution;
    this._renderer.mesh = this._mesh;
    this._renderer.setMaterial(this._material);
  }

  setConfig(config: OceanPreviewConfig): void {
    this._config = config;
    this._time = 0;
    this.rebuildMesh();
    this.updateMaterial();
  }

  rebuildMesh(): void {
    if (this._meshResolution === this._config.resolution) {
      this._updatePositions();
      return;
    }
    this._updateTopology();
    this._meshResolution = this._config.resolution;
  }

  updateMaterial(): void {
    updateWaterPreviewMaterial(
      this._material,
      this._config.oceanColor,
      Math.min(1, this._config.alpha + this._config.foamIntensity * 0.02)
    );
  }

  update(deltaTime: number): void {
    if (!this.root.isActive) return;
    this._time += deltaTime;
    this._updatePositions();
  }

  destroy(): void {
    this.root.destroy();
    this._mesh.destroy(true);
    this._material.destroy(true);
  }

  private _calculateWaveHeight(x: number, z: number): number {
    const frequency = (Math.PI * 2) / Math.max(this._config.waveLength, 0.001);
    const waveTime = this._time * this._config.waveSpeed;
    const waveA = Math.sin((x + z) * frequency + waveTime);
    const waveB = Math.sin((x * 0.45 - z * 0.8) * frequency * 1.7 + waveTime * 1.35);
    return this._config.waterLevel + (waveA * 0.65 + waveB * 0.35) * this._config.waveAmplitude;
  }

  private _createPositions(): Vector3[] {
    const segmentCount = Math.max(1, Math.floor(this._config.resolution));
    const halfSize = this._config.size * 0.5;
    const positions: Vector3[] = [];
    for (let z = 0; z <= segmentCount; z++) {
      for (let x = 0; x <= segmentCount; x++) {
        const localX = (x / segmentCount) * this._config.size - halfSize;
        const localZ = (z / segmentCount) * this._config.size - halfSize;
        positions.push(new Vector3(localX, this._calculateWaveHeight(localX, localZ), localZ));
      }
    }
    return positions;
  }

  private _createTopology(): { uvs: Vector2[]; indices: Uint16Array | Uint32Array } {
    const segmentCount = Math.max(1, Math.floor(this._config.resolution));
    const vertexSide = segmentCount + 1;
    const uvs: Vector2[] = [];
    const values: number[] = [];
    for (let z = 0; z <= segmentCount; z++) {
      for (let x = 0; x <= segmentCount; x++) uvs.push(new Vector2(x / segmentCount, z / segmentCount));
    }
    for (let z = 0; z < segmentCount; z++) {
      for (let x = 0; x < segmentCount; x++) {
        const a = z * vertexSide + x;
        const b = a + 1;
        const c = a + vertexSide;
        const d = c + 1;
        values.push(a, c, b, b, c, d);
      }
    }
    const vertexCount = vertexSide * vertexSide;
    return { uvs, indices: vertexCount > 65535 ? new Uint32Array(values) : new Uint16Array(values) };
  }

  private _createGridMesh(): ModelMesh {
    const mesh = new ModelMesh(this._engine);
    const positions = this._createPositions();
    const topology = this._createTopology();
    this._setBounds(mesh, positions);
    mesh.setPositions(positions);
    mesh.setUVs(topology.uvs);
    mesh.setIndices(topology.indices);
    mesh.addSubMesh(0, topology.indices.length);
    mesh.uploadData(false);
    return mesh;
  }

  private _updatePositions(): void {
    const positions = this._createPositions();
    this._setBounds(this._mesh, positions);
    this._mesh.setPositions(positions);
    this._mesh.uploadData(false);
  }

  private _updateTopology(): void {
    const positions = this._createPositions();
    const topology = this._createTopology();
    this._setBounds(this._mesh, positions);
    this._mesh.setPositions(positions);
    this._mesh.setUVs(topology.uvs);
    this._mesh.setIndices(topology.indices);
    this._mesh.clearSubMesh();
    this._mesh.addSubMesh(0, topology.indices.length);
    this._mesh.uploadData(false);
  }

  private _setBounds(mesh: ModelMesh, positions: readonly Vector3[]): void {
    const { min, max } = mesh.bounds;
    min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (const position of positions) {
      min.x = Math.min(min.x, position.x);
      min.y = Math.min(min.y, position.y - 3);
      min.z = Math.min(min.z, position.z);
      max.x = Math.max(max.x, position.x);
      max.y = Math.max(max.y, position.y + 3);
      max.z = Math.max(max.z, position.z);
    }
  }
}
