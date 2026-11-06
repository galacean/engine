import { WaterContactEffects } from "@galacean/engine-water/water/runtime/effects/renderer";
import type { WaterSurfaceProvider } from "@galacean/engine-water/water/runtime/index";
import { createRiverValleyContactSources } from "./RiverValleyContactEffects.ts";
import { RIVER_VALLEY_POINTS } from "./RiverValleyScene.ts";
import {
  type Engine,
  type Entity,
  MeshRenderer,
  ModelMesh,
  Vector2,
  Vector3,
  Quaternion,
  Script
} from "@galacean/engine";
import type { WaterTerrainSnapshot } from "@galacean/engine-water/water/index";
import { destroyWaterOwnedMesh } from "@galacean/engine-water/water/runtime/resources/index";
import { RIVER_VALLEY_MANIFEST } from "./RiverValleyScene.ts";
import { RiverValleyAssets } from "./RiverValleyAssets.ts";
import { createRiverValleyTerrainTopology } from "./RiverValleyTerrainTopology.ts";

/** Imported static arrangement; water and visible bed use the same immutable height samples. */
export class RiverValleySceneView {
  readonly root: Entity;
  readonly scenery: Entity;
  readonly placements = RIVER_VALLEY_MANIFEST.instances.filter((i) => i.lod === 0);
  private mesh?: ModelMesh;
  effects?: WaterContactEffects;
  private destroyed = false;
  private time?: number;
  constructor(
    engine: Engine,
    parent: Entity,
    readonly terrain: WaterTerrainSnapshot,
    private readonly assets: RiverValleyAssets,
    provider: WaterSurfaceProvider
  ) {
    this.root = parent.createChild("river-valley");
    this.root.isActive = false;
    this.scenery = this.root.createChild("river-valley-scenery");
    try {
      const t = assets.terrain;
      const { sampleIndices, indices, boundaryEdges } = createRiverValleyTerrainTopology(
        t,
        RIVER_VALLEY_MANIFEST.terrain.cellIndices
      );
      const positions: Vector3[] = [],
        normals: Vector3[] = [],
        uvs: Vector2[] = [];
      for (const sample of sampleIndices) {
        const x = sample % t.columns,
          z = Math.floor(sample / t.columns);
        positions.push(
          new Vector3(t.origin[0] + x * t.spacing, t.heights[sample], t.origin[1] + z * (t.spacingZ ?? t.spacing))
        );
        normals.push(new Vector3());
        uvs.push(new Vector2(x, -z));
      }
      const a = new Vector3(),
        b = new Vector3(),
        n = new Vector3();
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i],
          ib = indices[i + 1],
          ic = indices[i + 2];
        Vector3.subtract(positions[ib], positions[ia], a);
        Vector3.subtract(positions[ic], positions[ia], b);
        Vector3.cross(a, b, n);
        normals[ia].add(n);
        normals[ib].add(n);
        normals[ic].add(n);
      }
      normals.forEach((n) => n.normalize());
      // Close the cropped terrain as a shallow section, without changing its queryable top surface.
      const topIndexCount = indices.length;
      const topVertexCount = positions.length;
      const thickness = 3;
      for (let i = 0; i < topVertexCount; i++) {
        const p = positions[i];
        positions.push(new Vector3(p.x, p.y - thickness, p.z));
        normals.push(normals[i].clone().scale(-1));
        uvs.push(uvs[i].clone());
      }
      for (let i = 0; i < topIndexCount; i += 3) {
        indices.push(indices[i] + topVertexCount, indices[i + 2] + topVertexCount, indices[i + 1] + topVertexCount);
      }
      for (const [from, to] of boundaryEdges) {
        const p = positions[from],
          q = positions[to],
          start = positions.length;
        const normal = new Vector3(p.z - q.z, 0, q.x - p.x).normalize();
        positions.push(
          p.clone(),
          q.clone(),
          new Vector3(p.x, p.y - thickness, p.z),
          new Vector3(q.x, q.y - thickness, q.z)
        );
        normals.push(normal.clone(), normal.clone(), normal.clone(), normal.clone());
        uvs.push(new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1));
        indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
      }
      const mesh = (this.mesh = new ModelMesh(engine));
      mesh.setPositions(positions);
      mesh.setNormals(normals);
      mesh.setUVs(uvs);
      mesh.setIndices(new Uint32Array(indices));
      mesh.addSubMesh(0, topIndexCount);
      mesh.addSubMesh(topIndexCount, indices.length - topIndexCount);
      mesh.bounds.min.set(Infinity, Infinity, Infinity);
      mesh.bounds.max.set(-Infinity, -Infinity, -Infinity);
      for (const position of positions) {
        Vector3.min(mesh.bounds.min, position, mesh.bounds.min);
        Vector3.max(mesh.bounds.max, position, mesh.bounds.max);
      }
      mesh.uploadData(true);
      const ground = this.root.addComponent(MeshRenderer);
      ground.mesh = mesh;
      ground.setMaterials([assets.groundMaterial, assets.groundCutMaterial]);
      ground.castShadows = ground.receiveShadows = true;
      const imported = assets.scenery.instantiateSceneRoot();
      this.scenery.addChild(imported);
      const lookup = new Map(RIVER_VALLEY_MANIFEST.instances.map((i) => [i.id, i]));
      const swaying: { entity: Entity; rotation: Quaternion; phase: number }[] = [];
      const visit = (entity: Entity) => {
        if (entity.name.startsWith("terrain-grass-")) {
          for (const renderer of entity.getComponents(MeshRenderer, [])) renderer.enableVertexColor = true;
        }
        const source = lookup.get(entity.name);
        if (source) {
          entity.isActive = source.lod === 0;
          for (const renderer of entity.getComponents(MeshRenderer, [])) {
            renderer.castShadows = renderer.receiveShadows = true;
            renderer.enableVertexColor = true;
          }
          if (source.name.includes("Palm") || source.name.includes("Shrub"))
            swaying.push({
              entity,
              rotation: entity.transform.rotationQuaternion.clone(),
              phase: source.position[0] * 0.13 + source.position[2] * 0.11
            });
        }
        entity.children.forEach(visit);
      };
      visit(imported);
      const view = this;
      let elapsed = 0;
      const offset = new Quaternion(),
        rotation = new Quaternion(),
        windAxis = new Vector3(0, 0, 1);
      class ValleyVegetationMotion extends Script {
        override onUpdate(dt: number) {
          elapsed += dt;
          const time = view.time ?? elapsed;
          for (const item of swaying) {
            Quaternion.rotationAxisAngle(windAxis, Math.sin(time * 0.65 + item.phase) * 0.002, offset);
            Quaternion.multiply(item.rotation, offset, rotation);
            item.entity.transform.rotationQuaternion = rotation;
          }
        }
      }
      this.scenery.addComponent(ValleyVegetationMotion);
      this.effects = new WaterContactEffects(
        engine,
        this.root,
        createRiverValleyContactSources(RIVER_VALLEY_POINTS),
        provider,
        assets.contactEffectTextures
      );
      assets.activeInstances++;
    } catch (error) {
      this.root.destroy();
      if (this.mesh) destroyWaterOwnedMesh(this.mesh);
      throw error;
    }
  }
  setSurfaceTime(time?: number) {
    this.time = time;
    this.effects?.setTime(time);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.effects?.destroy();
    this.root.destroy();
    if (this.mesh) destroyWaterOwnedMesh(this.mesh);
    this.assets.activeInstances--;
  }
}
