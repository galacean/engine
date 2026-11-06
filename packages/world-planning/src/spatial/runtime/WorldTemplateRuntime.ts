import { Color, MeshRenderer, UnlitMaterial, PrimitiveMesh, type Entity, type ModelMesh } from "@galacean/engine";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { worldTemplate, type WorldTemplate } from "../WorldTemplateCatalog";
import { resolveWorldTemplateScene, type ResolvedWorldTemplateScene } from "../WorldTemplateView";

/** Missing template models use silent whitebox envelopes. No substitute models,
 * floating decorations, effects, interaction HUD or audio are synthesized. */
export class WorldTemplateRuntime {
  readonly root: Entity;
  readonly template: WorldTemplate;
  readonly geometry: ResolvedWorldTemplateScene["geometry"];
  private mesh?: ModelMesh;
  private material?: UnlitMaterial;
  private destroyed = false;
  private readonly anchor: { x: number; y: number; z: number };
  private readonly focusBounds: ResolvedWorldTemplateScene["focusBounds"];

  static create(
    parent: Entity,
    plan: IslandPlan,
    ground: (x: number, z: number) => number | undefined,
    prepared = resolveWorldTemplateScene(plan, ground)
  ) {
    const template = worldTemplate(plan.parameters.worldTemplate?.id);
    return template && prepared ? new WorldTemplateRuntime(parent, template, prepared) : undefined;
  }
  private constructor(parent: Entity, template: WorldTemplate, scene: ResolvedWorldTemplateScene) {
    this.template = template;
    this.geometry = scene.geometry;
    this.focusBounds = scene.focusBounds;
    this.root = parent.createChild(`World template: ${template.id}`);
    try {
      const [x, y, z] = scene.anchor;
      this.anchor = { x, y, z };
      this.root.transform.setPosition(x, y, z);
      this.mesh = PrimitiveMesh.createCuboid(parent.engine, 1, 1, 1);
      this.material = new UnlitMaterial(parent.engine);
      this.material.baseColor = new Color(1, 1, 1, 1);
      for (const { node, position } of scene.nodes) {
        const entity = this.root.createChild(node.id);
        entity.transform.setPosition(position[0] - x, position[1] - y, position[2] - z);
        entity.transform.setScale(...node.scale);
        entity.transform.setRotation(...node.rotation);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = this.mesh;
        renderer.setMaterial(this.material);
        renderer.castShadows = true;
        renderer.receiveShadows = false;
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  activate(canvas: HTMLCanvasElement): void {
    canvas.dataset.worldTemplate = JSON.stringify({
      id: this.template.id,
      anchor: this.anchor,
      focusBounds: this.focusBounds,
      placeholders: this.geometry.nodes.map((node) => node.id)
    });
  }
  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.destroy();
    this.material?.destroy();
    this.mesh?.destroy();
  }
}
