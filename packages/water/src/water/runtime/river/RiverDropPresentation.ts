import { registerWaterMeshContentRestorer } from "../resources/WaterMeshContentRestorer";
import { RIVER_SURFACE_NOISE_PERIOD } from "../../compiler/river/constants";
import {
  Material,
  VertexAttribute,
  MeshRenderer,
  ModelMesh,
  Shader,
  type Engine,
  type Entity,
  type Texture2D
} from "@galacean/engine-core";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { RiverDrop } from "../../authoring/river/RiverDrop";
import type { RiverDropLook } from "../../authoring/river/RiverDropLook";
import type { WaterRuntimeResourceLease } from "../resources/WaterRuntimeResourceRegistry";
import { destroyWaterOwnedMesh } from "../resources/destroyWaterOwnedMesh";
import {
  WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS,
  WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS
} from "../surface/WaterSurfaceAmbientLightingShader";
import { createRiverDropBatchGeometry } from "./RiverDropGeometry";
import { RiverDropParticles } from "./RiverDropParticles";
import shaderSource from "../../shaders/river/RiverDropPresentation.shader?raw";

export function riverDropPresentationShaderSource(): string {
  return shaderSource
    .replace("{{TIME_PERIOD}}", `${RIVER_SURFACE_NOISE_PERIOD}.0`)
    .replace("{{AMBIENT_UNIFORMS}}", WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS)
    .replace("{{AMBIENT_FUNCTIONS}}", WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS);
}

const textureNames = {
  directional: "Directional",
  cloud: "Cloud",
  lines: "LinesTexture",
  edge: "Edge",
  voronoi: "Voronoi",
  foam: "Foam"
} as const;
const layerNames = { ...textureNames, lines: "Lines" } as const;

/** All presentation is owned by the River instance and prepared hidden with its native transaction. */
export class RiverDropPresentation {
  private readonly root: Entity;
  private readonly meshes: ModelMesh[] = [];
  private readonly renderers: MeshRenderer[] = [];
  private material?: Material;
  private particles?: RiverDropParticles;
  readonly drawCount: number;
  private disposed = false;
  readonly triangleCount: number;
  constructor(
    engine: Engine,
    parent: Entity,
    drops: readonly RiverDrop[],
    look: Readonly<RiverDropLook>,
    leases: readonly WaterRuntimeResourceLease[],
    timeOverride = -1
  ) {
    this.root = parent.createChild("Textured river drops");
    this.drawCount = (drops.length > 0 ? 1 : 0) + drops.length * 3;
    let triangles = 0;
    try {
      const material = (this.material = new Material(
        engine,
        Shader.find("Water/RiverDropPresentation") ?? Shader.create(riverDropPresentationShaderSource())
      ));
      for (const slot of Object.keys(textureNames) as (keyof typeof textureNames)[]) {
        const ref = look.textures[slot];
        const lease = leases.find(
          (lease) =>
            lease.active && lease.descriptor.id === ref.assetId && lease.descriptor.contentHash === ref.contentHash
        );
        const texture = (lease?.resource as { texture?: Texture2D } | undefined)?.texture;
        if (!texture) throw new Error(`MISSING_DEPENDENCY: River drop texture '${ref.assetId}' has no active lease.`);
        material.shaderData.setTexture(`material_Drop${textureNames[slot]}`, texture);
      }
      material.shaderData.setFloat("material_DropTime", timeOverride);
      this.setLook(look);
      if (drops.length > 0) {
        const geometry = createRiverDropBatchGeometry(drops);
        const mesh = new ModelMesh(engine);
        this.meshes.push(mesh);
        mesh.name = "River drop batch";
        mesh.setPositions(geometry.positions.map((p) => new Vector3(p[0], p[1], p[2])));
        mesh.setNormals(geometry.normals.map((p) => new Vector3(p[0], p[1], p[2])));
        mesh.setUVs(geometry.uvs.map((p) => new Vector2(p[0], p[1])));
        mesh.setUVs(
          geometry.parts.map((p) => new Vector2(p[0], p[1])),
          1
        );
        mesh.setUVs(
          geometry.directions.map((direction) => new Vector2(direction[0], direction[1])),
          2
        );
        mesh.setIndices(
          geometry.positions.length > 65535 ? new Uint32Array(geometry.indices) : new Uint16Array(geometry.indices)
        );
        mesh.addSubMesh(0, geometry.indices.length);
        mesh.bounds.min.set(geometry.bounds.min[0], geometry.bounds.min[1], geometry.bounds.min[2]);
        mesh.bounds.max.set(geometry.bounds.max[0], geometry.bounds.max[1], geometry.bounds.max[2]);
        mesh.uploadData(true);
        registerWaterMeshContentRestorer(engine, mesh, () => {
          const restored = createRiverDropBatchGeometry(drops);
          const attributes: Readonly<Record<string, readonly (readonly number[])[]>> = {
            [VertexAttribute.Position]: restored.positions,
            [VertexAttribute.Normal]: restored.normals,
            [VertexAttribute.UV]: restored.uvs,
            [VertexAttribute.UV1]: restored.parts,
            [VertexAttribute.UV2]: restored.directions
          };
          return {
            vertexCount: restored.positions.length,
            indices:
              restored.positions.length > 65535 ? new Uint32Array(restored.indices) : new Uint16Array(restored.indices),
            read: (attribute, vertex, component) => attributes[attribute][vertex][component]
          };
        });
        const renderer = this.root.createChild("Drop mesh batch").addComponent(MeshRenderer);
        this.renderers.push(renderer);
        renderer.mesh = mesh;
        renderer.setMaterial(material);
        renderer.castShadows = renderer.receiveShadows = false;
        triangles += geometry.indices.length / 3;
      }
      this.particles = new RiverDropParticles(engine, this.root, drops, look, leases);
      this.triangleCount = triangles;
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  setLook(look: Readonly<RiverDropLook>): void {
    if (this.disposed) throw new Error("River drop presentation is destroyed.");
    this.particles?.setLook(look);
    const data = this.material!.shaderData;
    for (const [i, color] of look.colors.entries()) data.setVector4(`material_DropColor${i}`, new Vector4(...color, 1));
    for (const slot of Object.keys(layerNames) as (keyof typeof layerNames)[]) {
      const layer = look.layers[slot];
      data.setVector4(`material_DropLayer${layerNames[slot]}`, new Vector4(...layer.scale, ...layer.velocity));
    }
    data.setVector4(
      "material_DropResponse",
      new Vector4(look.opacity, look.normalStrength, look.colorContrast, look.parallaxDepth)
    );
    data.setVector4("material_DropEffects", new Vector4(look.speed, look.foamOpacity, look.sprayOpacity, 0));
    const c = look.curtain,
      impact = look.impact;
    data.setVector4(
      "material_DropLines",
      new Vector4(c.lineDistortion, c.lineOpacity, c.lineReveal, c.bottomFoamStart)
    );
    data.setVector4(
      "material_DropMasks",
      new Vector4(c.bottomFoamThreshold, c.edgeCutout, c.edgeFoamThreshold, c.edgeFoamOpacity)
    );
    data.setVector4("material_DropEntry", new Vector4(c.entryFade, c.dotsThreshold, c.dotsOpacity, 0));
    data.setVector4(
      "material_DropImpact",
      new Vector4(impact.distortion, impact.lengthMultiplier, impact.lengthPower, impact.widthPower)
    );
    data.setVector4("material_DropImpactFlow", new Vector4(...impact.scale, impact.velocity, impact.threshold));
  }

  setSurfacePriority(priority: number): void {
    this.particles?.setSurfacePriority(priority);
    // Surface composition can replace background color: draw attached foam after its River surface.
    for (const renderer of this.renderers) renderer.priority = priority + 1;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles?.destroy();
    this.particles = undefined;
    this.root.destroy();
    for (const mesh of this.meshes) destroyWaterOwnedMesh(mesh);
    this.meshes.length = 0;
    this.renderers.length = 0;
    this.material?.destroy();
    this.material = undefined;
  }
}
