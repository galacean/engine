import { createHarvestProduceMesh } from "./HarvestProduceMesh";
import { destroyOwnedMesh } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
export { HARVEST_PRODUCE_IDS } from "./HarvestProduceShape";
import { Color, Entity, MeshRenderer, ModelMesh, PBRMaterial, Shader, Vector3 } from "@galacean/engine";
import { PLANT_HARVEST_SHADER } from "../PlantHarvestShader";
import type { BasketBatch } from "./HarvestBasketState";
import { DEFAULT_HARVEST_SECONDS } from "../PlantHarvestEffect";

const localShader = PLANT_HARVEST_SHADER.replace('Shader "Farming/HarvestDissolve"', 'Shader "Farming/BasketReveal"')
  .replaceAll("float harvest_Visibility;", "float basket_Elapsed; float basket_Duration;")
  .replaceAll(
    "float harvestDissolve(vec3 positionWS) {",
    `float harvestDissolve(vec3 positionWS, float delay) {
    float harvest_Visibility = clamp((basket_Elapsed - delay) / max(basket_Duration - delay, 0.001), 0.0, 1.0);`
  )
  .replaceAll(
    "texture2D(harvest_NoiseTexture, positionWS.xy * 1.5 + positionWS.z * 0.37).r",
    "(positionWS.y + 0.5 + 0.16 * fract(sin(dot(floor(positionWS * 240.0), vec3(12.9898,78.233,37.719))) * 43758.5453)) / 1.16"
  )
  .replaceAll("vec2 uv; vec3 positionWS;", "vec2 uv; vec2 uv1; vec3 positionWS;")
  .replaceAll("v.uv = getUV0(attr);", "v.uv = getUV0(attr); v.uv1 = attr.TEXCOORD_1;")
  .replaceAll("harvestDissolve(v.positionWS)", "harvestDissolve(vec3(v.uv1.x, v.uv.x - 0.5, v.uv1.y), v.uv.y)")
  .replaceAll(
    "harvestDissolve(varyings.positionWS)",
    "harvestDissolve(vec3(varyings.uv1.x, varyings.uv.x - 0.5, varyings.uv1.y), varyings.uv.y)"
  )
  .replace("varyings.vertexColor = vec4(1.0);", "varyings.vertexColor = attributes.COLOR_0;");
const slots = [
  [-0.09, 0.09, 0.08],
  [0.085, -0.01, 0.135],
  [-0.07, -0.015, 0.09],
  [0.085, 0.07, 0.13],
  [0, 0.025, 0.16],
  [-0.08, 0, 0.195],
  [0.095, 0, 0.21],
  [0, 0.035, 0.22]
];
/** Procedural harvested products: only the rigid basket is an imported prop. */
export class HarvestProduce {
  readonly root: Entity;
  private readonly mesh: ModelMesh;
  private readonly material: PBRMaterial;
  private readonly renderer: MeshRenderer;
  private disposed = false;
  private previousElapsed = NaN;
  constructor(
    parent: Entity,
    readonly batch: BasketBatch
  ) {
    this.root = parent.createChild(`harvest-${batch.cropId}-${batch.eventId}`);
    const base = batch.cropId === "pumpkin" ? [0.07, -0.035, 0.245] : slots[batch.slot % slots.length];
    this.root.transform.setPosition(...(base as [number, number, number]));
    this.root.transform.setRotation(0, 0, batch.slot * 37);
    try {
      this.mesh = createHarvestProduceMesh(
        parent.engine,
        batch.cropId,
        Math.min(3, Math.max(1, Math.round(batch.quantity)))
      ).mesh;
      this.material = new PBRMaterial(parent.engine);
      this.material.shader = Shader.find("Farming/BasketReveal") ?? Shader.create(localShader);
      this.material.baseColor = new Color(1, 1, 1, 1);
      this.material.roughness = 0.8;
      this.material.shaderData.setFloat("basket_Elapsed", 0);
      this.material.shaderData.setFloat("basket_Duration", DEFAULT_HARVEST_SECONDS);
      this.material.shaderData.setFloat("harvest_EdgeWidth", 0.035);
      this.material.shaderData.setVector3("harvest_EdgeColor", new Vector3(1.8, 0.8, 0.2));
      this.renderer = this.root.addComponent(MeshRenderer);
      this.renderer.mesh = this.mesh;
      this.renderer.setMaterial(this.material);
      this.renderer.enableVertexColor = true;
      this.renderer.castShadows = false;
      this.renderer.receiveShadows = true;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  update(time: number): void {
    if (this.disposed) return;
    const elapsed = Math.max(0, Math.min(DEFAULT_HARVEST_SECONDS, time - this.batch.revealAt));
    this.root.isActive = time > this.batch.revealAt;
    if (elapsed !== this.previousElapsed) {
      this.material.shaderData.setFloat("basket_Elapsed", elapsed);
      this.previousElapsed = elapsed;
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.renderer && !this.renderer.destroyed) {
      this.renderer.mesh = null!;
      this.renderer.setMaterials([]);
    }
    this.root.destroy();
    destroyOwnedMesh(this.mesh);
    this.material?.destroy(true);
  }
}
