import {
  Engine,
  Entity,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PBRMaterial
} from "@galacean/engine-core";
import { Color, Vector2, Vector3 } from "@galacean/engine-math";
import type { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";

export interface OceanBeachTerrainGeometry {
  readonly width: number;
  readonly height: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array;
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export interface OceanBeachTerrainMetrics {
  readonly sourceHash: string;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly meshUploadCount: 1;
}

function resolveHeight(
  resource: OceanNearshoreFieldResource,
  x: number,
  z: number,
  width: number,
  height: number
): number {
  const clampedX = Math.min(width - 1, Math.max(0, x));
  const clampedZ = Math.min(height - 1, Math.max(0, z));
  return resource.bedHeightAt(clampedZ * width + clampedX);
}

/**
 * Builds the visible sand/sea-bed geometry directly from the compiled field.
 * No evaluator or duplicate height array is accepted at this consumer boundary.
 */
export function buildOceanBeachTerrainGeometry(
  resource: OceanNearshoreFieldResource
): OceanBeachTerrainGeometry {
  const { grid } = resource.data;
  const { width, height, originXZ, cellSizeXZ } = grid;
  const vertexCount = width * height;
  if (vertexCount > 65535) {
    throw new Error(
      `Ocean beach terrain has ${vertexCount} vertices; Uint16 limit is 65535.`
    );
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let z = 0; z < height; z++) {
    const worldZ = originXZ[1] + z * cellSizeXZ[1];
    for (let x = 0; x < width; x++) {
      const worldX = originXZ[0] + x * cellSizeXZ[0];
      const vertexIndex = z * width + x;
      const positionOffset = vertexIndex * 3;
      const uvOffset = vertexIndex * 2;
      const heightValue = resource.bedHeightAt(vertexIndex);
      const heightNegativeX = resolveHeight(
        resource,
        x - 1,
        z,
        width,
        height
      );
      const heightPositiveX = resolveHeight(
        resource,
        x + 1,
        z,
        width,
        height
      );
      const heightNegativeZ = resolveHeight(
        resource,
        x,
        z - 1,
        width,
        height
      );
      const heightPositiveZ = resolveHeight(
        resource,
        x,
        z + 1,
        width,
        height
      );
      const derivativeX =
        (heightPositiveX - heightNegativeX) /
        (x === 0 || x === width - 1
          ? cellSizeXZ[0]
          : cellSizeXZ[0] * 2);
      const derivativeZ =
        (heightPositiveZ - heightNegativeZ) /
        (z === 0 || z === height - 1
          ? cellSizeXZ[1]
          : cellSizeXZ[1] * 2);
      const inverseNormalLength =
        1 / Math.hypot(derivativeX, 1, derivativeZ);

      positions[positionOffset] = worldX;
      positions[positionOffset + 1] = heightValue;
      positions[positionOffset + 2] = worldZ;
      normals[positionOffset] = -derivativeX * inverseNormalLength;
      normals[positionOffset + 1] = inverseNormalLength;
      normals[positionOffset + 2] = -derivativeZ * inverseNormalLength;
      uvs[uvOffset] = width > 1 ? x / (width - 1) : 0;
      uvs[uvOffset + 1] = height > 1 ? z / (height - 1) : 0;
      minimumY = Math.min(minimumY, heightValue);
      maximumY = Math.max(maximumY, heightValue);
    }
  }

  const indices = new Uint16Array((width - 1) * (height - 1) * 6);
  let indexOffset = 0;
  for (let z = 0; z < height - 1; z++) {
    for (let x = 0; x < width - 1; x++) {
      const negativeXNegativeZ = z * width + x;
      const positiveXNegativeZ = negativeXNegativeZ + 1;
      const negativeXPositiveZ = negativeXNegativeZ + width;
      const positiveXPositiveZ = negativeXPositiveZ + 1;
      indices[indexOffset++] = negativeXNegativeZ;
      indices[indexOffset++] = negativeXPositiveZ;
      indices[indexOffset++] = positiveXNegativeZ;
      indices[indexOffset++] = positiveXNegativeZ;
      indices[indexOffset++] = negativeXPositiveZ;
      indices[indexOffset++] = positiveXPositiveZ;
    }
  }

  return {
    width,
    height,
    positions,
    normals,
    uvs,
    indices,
    bounds: {
      min: [originXZ[0], minimumY, originXZ[1]],
      max: [
        originXZ[0] + (width - 1) * cellSizeXZ[0],
        maximumY,
        originXZ[1] + (height - 1) * cellSizeXZ[1]
      ]
    }
  };
}

export class OceanBeachTerrainBuilder {
  readonly root: Entity;
  readonly metrics: Readonly<OceanBeachTerrainMetrics>;
  private readonly _mesh: ModelMesh;
  private readonly _material: PBRMaterial;
  private readonly _wetFilmMaterial: PBRMaterial;
  private _destroyed = false;

  constructor(
    engine: Engine,
    parent: Entity,
    resource: OceanNearshoreFieldResource
  ) {
    const geometry = buildOceanBeachTerrainGeometry(resource);
    this.root = parent.createChild("ocean-beach-terrain");
    this._mesh = new ModelMesh(engine, "OceanBeachTerrain");
    this._mesh.bounds.min.set(...geometry.bounds.min);
    this._mesh.bounds.max.set(...geometry.bounds.max);
    const vertexCount = geometry.width * geometry.height;
    this._mesh.setPositions(
      Array.from({ length: vertexCount }, (_, index) => {
        const offset = index * 3;
        return new Vector3(
          geometry.positions[offset],
          geometry.positions[offset + 1],
          geometry.positions[offset + 2]
        );
      })
    );
    this._mesh.setNormals(
      Array.from({ length: vertexCount }, (_, index) => {
        const offset = index * 3;
        return new Vector3(
          geometry.normals[offset],
          geometry.normals[offset + 1],
          geometry.normals[offset + 2]
        );
      })
    );
    this._mesh.setUVs(
      Array.from({ length: vertexCount }, (_, index) => {
        const offset = index * 2;
        return new Vector2(geometry.uvs[offset], geometry.uvs[offset + 1]);
      })
    );
    this._mesh.setIndices(geometry.indices);
    // PBR normal textures require a valid tangent basis. Without tangents the
    // terrain falls back to a triangle-dependent basis, which turns the
    // grazing-angle sand response into large dark wedges.
    this._mesh.calculateTangents();
    this._mesh.addSubMesh(0, geometry.indices.length, MeshTopology.Triangles);
    this._mesh.uploadData(true);

    this._material = new PBRMaterial(engine);
    this._material.name = "OceanBeachSand";
    this._material.baseColor = new Color(0.82, 0.77, 0.68, 1);
    this._material.metallic = 0;
    this._material.roughness = 0.86;
    const renderer = this.root.addComponent(MeshRenderer);
    renderer.mesh = this._mesh;
    renderer.setMaterial(this._material);

    const wetFilm = this.root.createChild("ocean-beach-wet-film");
    wetFilm.transform.setPosition(0, 0.012, 0);
    this._wetFilmMaterial = new PBRMaterial(engine);
    this._wetFilmMaterial.name = "OceanBeachWetFilm";
    this._wetFilmMaterial.baseColor = new Color(1, 1, 1, 1);
    this._wetFilmMaterial.metallic = 0;
    this._wetFilmMaterial.roughness = 1;
    this._wetFilmMaterial.isTransparent = true;
    const wetFilmRenderer = wetFilm.addComponent(MeshRenderer);
    wetFilmRenderer.mesh = this._mesh;
    wetFilmRenderer.setMaterial(this._wetFilmMaterial);
    wetFilmRenderer.castShadows = false;
    // Draw the receded wet-sand film after the transparent Ocean. The Ocean
    // scene-color input contains opaque geometry only, so drawing this film
    // first would make the Ocean composite erase it even on exposed sand.
    wetFilmRenderer.priority = 10;
    this.metrics = Object.freeze({
      sourceHash: resource.metadata.compiledHash,
      vertexCount,
      indexCount: geometry.indices.length,
      meshUploadCount: 1
    });
  }

  setVisible(visible: boolean): void {
    if (!this._destroyed) this.root.isActive = visible;
  }

  get material(): PBRMaterial {
    return this._material;
  }

  get wetFilmMaterial(): PBRMaterial {
    return this._wetFilmMaterial;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    this._mesh.destroy(true);
    this._material.destroy(true);
    this._wetFilmMaterial.destroy(true);
  }
}
