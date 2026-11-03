import { destroyWaterOwnedMesh } from "@galacean/engine-water/water/runtime/resources/index";
import {
  BlinnPhongMaterial,
  Color,
  Engine,
  Entity,
  MeshRenderer,
  ModelMesh,
  Material,
  Vector2,
  PrimitiveMesh,
  Vector3
} from "@galacean/engine";
import {
  WaterLandscapeAssets,
  type LakeLandscapeInstance,
  type LakeRockInstance
} from "../shared/WaterLandscapeAssets.ts";
import type { LakeLandscapePlacement } from "../grasslands/landscape/LakeLandscapeLayout.ts";
import type { RiverPathControlPoint } from "@galacean/engine-water/water/index";
import { createRiverLandscapeGround, createRiverLandscapeLayout } from "./RiverLandscapeLayout.ts";
import type { RiverDemoObject, RiverDemoScenario } from "./RiverDemoSceneSource.ts";
import { sampleWaterTerrainHeight, type WaterTerrainSnapshot } from "@galacean/engine-water/water/index";

/** Demo-owned river valley. Shared Lake assets are borrowed; staged scenery and bed publish together. */
export class RiverDemoSceneView {
  readonly root: Entity;
  readonly scenery: Entity;
  private readonly _meshes: ModelMesh[] = [];
  private readonly _materials: Material[] = [];
  private readonly _instances: (LakeLandscapeInstance | LakeRockInstance)[] = [];
  private _destroyed = false;
  readonly placements: readonly LakeLandscapePlacement[];

  constructor(
    engine: Engine,
    parent: Entity,
    readonly terrain: WaterTerrainSnapshot,
    objects: readonly RiverDemoObject[] = [],
    scenario: RiverDemoScenario,
    assets: WaterLandscapeAssets,
    points: readonly RiverPathControlPoint[]
  ) {
    this.placements = scenario === "calibration" ? [] : createRiverLandscapeLayout(terrain, points, objects);
    this.root = parent.createChild("river-mock-terrain");
    this.root.isActive = false;
    this.scenery = this.root.createChild("river-scenery");
    try {
      const positions: Vector3[] = [];
      const colors: Color[] = [];
      const normals: Vector3[] = [];
      const indices: number[] = [];
      const uvs: Vector2[] = [];
      const ground = createRiverLandscapeGround(terrain);
      const xs =
        scenario === "calibration"
          ? Array.from({ length: terrain.columns }, (_, i) => terrain.origin[0] + i * terrain.spacing)
          : ground.x;
      const zs =
        scenario === "calibration"
          ? Array.from(
              { length: terrain.rows },
              (_, i) => terrain.origin[1] + i * (terrain.spacingZ ?? terrain.spacing)
            )
          : ground.z;
      let minHeight = Infinity,
        maxHeight = -Infinity;
      for (let row = 0; row < zs.length; row++) {
        for (let column = 0; column < xs.length; column++) {
          const x = xs[column];
          const z = zs[row];
          const height = ground.height(x, z);
          minHeight = Math.min(minHeight, height);
          maxHeight = Math.max(maxHeight, height);
          uvs.push(new Vector2(x * 0.17, z * 0.17));
          positions.push(new Vector3(x, height, z));
          normals.push(new Vector3());
          if (scenario === "calibration") {
            const checker = (Math.floor(x / 2) + Math.floor(z / 2)) % 2 === 0 ? 0.95 : 0.04;
            colors.push(new Color(checker, checker, checker, 1));
          }
          if (column < xs.length - 1 && row < zs.length - 1) {
            const a = row * xs.length + column;
            indices.push(a, a + xs.length, a + 1, a + 1, a + xs.length, a + xs.length + 1);
          }
        }
      }
      const edgeA = new Vector3();
      const edgeB = new Vector3();
      const normal = new Vector3();
      for (let index = 0; index < indices.length; index += 3) {
        const a = indices[index];
        const b = indices[index + 1];
        const c = indices[index + 2];
        Vector3.subtract(positions[b], positions[a], edgeA);
        Vector3.subtract(positions[c], positions[a], edgeB);
        Vector3.cross(edgeA, edgeB, normal);
        normals[a].add(normal);
        normals[b].add(normal);
        normals[c].add(normal);
      }
      normals.forEach((value) => value.normalize());
      const mesh = new ModelMesh(engine);
      this._meshes.push(mesh);
      mesh.setPositions(positions);
      mesh.setNormals(normals);
      if (colors.length) mesh.setColors(colors);
      mesh.setUVs(uvs);
      mesh.setIndices(positions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
      mesh.calculateTangents();
      mesh.addSubMesh(0, indices.length);
      mesh.bounds.min.set(xs[0], minHeight, zs[0]);
      mesh.bounds.max.set(xs[xs.length - 1], maxHeight, zs[zs.length - 1]);
      mesh.uploadData(true);
      const material =
        scenario === "calibration"
          ? this._material(engine, new Color(0.55, 0.55, 0.55, 1))
          : assets.terrainMaterial.clone();
      if (scenario !== "calibration") {
        this._materials.push(material);
        material.shaderData.setFloat(
          "material_LakeWaterLevel",
          points.reduce((sum, point) => sum + point.position[1], 0) / points.length
        );
      }
      const renderer = this.root.addComponent(MeshRenderer);
      renderer.castShadows = true;
      renderer.receiveShadows = true;
      renderer.mesh = mesh;
      renderer.enableVertexColor = scenario === "calibration";
      renderer.setMaterial(material);

      for (const placement of this.placements)
        this._instances.push(assets.instantiateLandscape(this.scenery, placement));
      for (const object of objects) {
        if (object.id === "partly-submerged-rock") {
          this._instances.push(
            assets.instantiateLargeRock(
              this.root,
              object.id,
              0,
              object.position,
              object.size.map((v) => v / 2) as [number, number, number]
            )
          );
          continue;
        }
        this._box(
          engine,
          object.id,
          object.position,
          object.size,
          this._material(engine, new Color(...object.color, 1))
        );
      }
      for (const z of scenario === "calibration" ? [-16, 0, 16] : []) {
        for (let channel = 0; channel < 3; channel++) {
          const x = (channel - 1) * 1.4;
          const rgb: [number, number, number] = [0.015, 0.015, 0.015];
          rgb[channel] = 0.95;
          this._box(
            engine,
            `submerged-marker-${z}-${channel}`,
            [x, sampleWaterTerrainHeight(terrain, x, z)! + 0.035, z],
            [0.9, 0.04, 1.4],
            this._material(engine, new Color(...rgb, 1))
          );
        }
      }
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    this._instances.forEach((instance) => instance.releaseAfterEntityDestroy());
    this._meshes.forEach(destroyWaterOwnedMesh);
    this._materials.forEach((material) => material.destroy());
  }

  private _material(engine: Engine, color: Color): BlinnPhongMaterial {
    const material = new BlinnPhongMaterial(engine);
    this._materials.push(material);
    material.baseColor = color;
    material.specularColor = new Color(0.02, 0.02, 0.02, 1);
    return material;
  }

  private _box(
    engine: Engine,
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    material: BlinnPhongMaterial
  ): void {
    const entity = this.root.createChild(name);
    entity.transform.setPosition(...position);
    const mesh = PrimitiveMesh.createCuboid(engine, ...size);
    this._meshes.push(mesh);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.castShadows = true;
    renderer.receiveShadows = true;
    renderer.mesh = mesh;
    renderer.setMaterial(material);
  }
}
