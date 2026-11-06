import { Color, ModelMesh, Vector3, type Engine } from "@galacean/engine";
import { HARVEST_BASKET_CAPACITY, type BasketContent } from "../../domain/FarmItems";
import { farmBasketProduceSlot } from "../../domain/FarmItemDimensions";
import { createHarvestProduceMesh } from "./HarvestProduceMesh";
import { destroyOwnedMesh } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";

/** Real units, deterministic slots, one low-poly mixed batch. Inventory never comes from this mesh. */
export function createBasketContentsMesh(engine: Engine, contents: readonly BasketContent[]): ModelMesh {
  const positions: Vector3[] = [],
    normals: Vector3[] = [],
    colors: Color[] = [],
    indices: number[] = [];
  let slot = 0;
  for (const entry of contents) {
    const source = createHarvestProduceMesh(engine, entry.cropId, 1, true);
    try {
      const vertices = source.mesh.getPositions()!,
        sourceNormals = source.mesh.getNormals()!,
        sourceColors = source.mesh.getColors()!,
        sourceIndices = source.mesh.getIndices();
      const scale = 0.068 / Math.max(...source.size, 0.001);
      for (let unit = 0; unit < entry.quantity && slot < HARVEST_BASKET_CAPACITY; unit++, slot++) {
        const offset = positions.length;
        const [x, y, z] = farmBasketProduceSlot(slot);
        for (let i = 0; i < vertices.length; i++) {
          const p = vertices[i];
          positions.push(new Vector3(p.x * scale + x, p.y * scale + y, p.z * scale + z));
          normals.push(sourceNormals[i].clone());
          colors.push(sourceColors[i].clone());
        }
        for (const index of sourceIndices!) indices.push(offset + index);
      }
    } finally {
      destroyOwnedMesh(source.mesh);
    }
  }
  const mesh = new ModelMesh(engine, "Persistent basket contents");
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors(colors);
  mesh.setIndices(new Uint16Array(indices));
  mesh.bounds.min.set(-0.19, 0.1, -0.19);
  mesh.bounds.max.set(0.19, 0.32, 0.19);
  mesh.addSubMesh(0, indices.length);
  mesh.uploadData(true);
  return mesh;
}
