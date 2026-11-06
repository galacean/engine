import { Color, type Engine, Entity, MeshRenderer, type ModelMesh, PBRMaterial } from "@galacean/engine";
import { createHarvestProduceMesh } from "../harvest/HarvestProduceMesh";
import { destroyOwnedMeshSet } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";

interface ProduceMesh {
  mesh: ModelMesh;
  size: readonly [number, number, number];
}
/** One mesh/draw per species and one independently visible entity per inventory unit. */
export class StorageProduceLibrary {
  private readonly material: PBRMaterial;
  private readonly products = new Map<string, ProduceMesh>();
  constructor(private readonly engine: Engine) {
    this.material = new PBRMaterial(engine);
    this.material.baseColor = new Color(1, 1, 1, 1);
    this.material.roughness = 0.8;
  }
  dimensions(cropId: string): readonly [number, number, number] {
    return this.product(cropId).size;
  }
  create(parent: Entity, cropId: string, name: string): Entity {
    const product = this.product(cropId),
      unit = parent.createChild(name),
      renderer = unit.addComponent(MeshRenderer);
    renderer.mesh = product.mesh;
    renderer.setMaterial(this.material);
    renderer.enableVertexColor = true;
    renderer.castShadows = false;
    renderer.receiveShadows = true;
    return unit;
  }
  private product(cropId: string): ProduceMesh {
    let product = this.products.get(cropId);
    if (!product) {
      product = createHarvestProduceMesh(this.engine, cropId, 1, true);
      this.products.set(cropId, product);
    }
    return product;
  }
  /** Detach all borrowers, including entities already pending frame-end destruction. Imported props are borrowed. */
  detach(root: Entity): void {
    const meshes = new Set([...this.products.values()].map((p) => p.mesh));
    for (const renderer of root.getComponentsIncludeChildren(MeshRenderer, [])) {
      if (renderer.mesh && meshes.has(renderer.mesh as ModelMesh)) {
        renderer.mesh = null!;
        renderer.setMaterials([]);
      }
    }
  }
  /** The owner detaches cargo renderers before releasing this shared library. */
  dispose(): void {
    this.material.destroy(true);
    destroyOwnedMeshSet([...this.products.values()].map((p) => p.mesh));
    this.products.clear();
  }
}
