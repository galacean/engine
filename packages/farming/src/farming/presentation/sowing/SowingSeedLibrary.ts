import { Color, Entity, MeshRenderer, ModelMesh, PBRMaterial, Vector3 } from "@galacean/engine";
import small from "../../assets/sowing/small.json";
import grain from "../../assets/sowing/grain.json";
import pumpkin from "../../assets/sowing/pumpkin.json";
import { sowingSeedVariant } from "./SowingMotion";

const seeds = { small, grain, pumpkin };
// Keep seeds legible, without the source animation's 13–16 cm pumpkin seeds.
// Calibrate only cached vertices: trajectories and landing offsets stay in metres.
const seedScales = { small: 0.5, grain: 0.45, pumpkin: 0.28 };

/** Runtime ModelMeshes from original seed islands; no crop GLB or growth prefab is loaded. */
export class SowingSeedLibrary {
  private readonly meshes = new Map<string, ModelMesh>();
  private readonly material: PBRMaterial;
  constructor(parent: Entity) {
    this.material = new PBRMaterial(parent.engine);
    this.material.baseColor = new Color(1, 1, 1, 1);
    this.material.roughness = 0.86;
  }
  parts(cropId: string) {
    return seeds[sowingSeedVariant(cropId)].parts;
  }
  create(parent: Entity, cropId: string, index: number): Entity {
    const variant = sowingSeedVariant(cropId),
      part = seeds[variant].parts[index],
      key = `${variant}/${index}`;
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = new ModelMesh(parent.engine, `Sowing/${key}`);
      const positions: Vector3[] = [],
        normals: Vector3[] = [],
        colors: Color[] = [];
      for (let i = 0; i < part.positions.length; i += 3) {
        positions.push(
          new Vector3(
            part.positions[i] * seedScales[variant],
            part.positions[i + 1] * seedScales[variant],
            part.positions[i + 2] * seedScales[variant]
          )
        );
        normals.push(new Vector3(...(part.normals.slice(i, i + 3) as [number, number, number])));
        colors.push(new Color(...(part.colors.slice(i, i + 3) as [number, number, number]), 1));
      }
      mesh.setPositions(positions);
      mesh.setNormals(normals);
      mesh.setColors(colors);
      mesh.setIndices(Uint16Array.from(positions, (_, i) => i));
      mesh.addSubMesh(0, positions.length);
      // Bounds are necessary for seeds arriving from above the plot to survive frustum culling.
      for (const p of positions) {
        Vector3.min(mesh.bounds.min, p, mesh.bounds.min);
        Vector3.max(mesh.bounds.max, p, mesh.bounds.max);
      }
      mesh.uploadData(false);
      this.meshes.set(key, mesh);
    }
    const entity = parent.createChild(`sowing-seed-${index}`),
      renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.enableVertexColor = true;
    renderer.setMaterial(this.material);
    renderer.castShadows = false;
    renderer.receiveShadows = true;
    return entity;
  }
  dispose(): void {
    for (const mesh of this.meshes.values()) {
      const buffers = mesh.vertexBufferBindings
        .map((binding) => binding?.buffer)
        .filter((value): value is NonNullable<typeof value> => value != null);
      mesh.setIndices(null!);
      mesh.uploadData(false);
      mesh.destroy();
      for (const buffer of buffers) buffer.destroy();
    }
    this.meshes.clear();
    this.material.destroy();
  }
}
