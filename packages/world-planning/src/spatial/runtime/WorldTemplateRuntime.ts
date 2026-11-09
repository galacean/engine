import {
  AssetType,
  BoundingBox,
  Color,
  MeshRenderer,
  PBRMaterial,
  UnlitMaterial,
  PrimitiveMesh,
  Vector3,
  type Entity,
  type GLTFResource,
  type Material,
  type ModelMesh
} from "@galacean/engine";
import { usesProjectPlantResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { worldTemplate, type WorldTemplate } from "../WorldTemplateCatalog";
import { resolveWorldTemplateScene, type ResolvedWorldTemplateScene } from "../WorldTemplateView";
import { fitTemplateAsset } from "../WorldTemplateGeometry";

function modelBounds(entity: Entity): BoundingBox {
  const bounds = new BoundingBox(
    new Vector3(Infinity, Infinity, Infinity),
    new Vector3(-Infinity, -Infinity, -Infinity)
  );
  for (const renderer of entity.getComponentsIncludeChildren(MeshRenderer, []))
    BoundingBox.merge(bounds, renderer.bounds, bounds);
  return bounds;
}

/** Supplied models fill their authored envelopes; missing assets retain whiteboxes. */
export class WorldTemplateRuntime {
  readonly root: Entity;
  readonly template: WorldTemplate;
  readonly geometry: ResolvedWorldTemplateScene["geometry"];
  private mesh?: ModelMesh;
  private material?: UnlitMaterial;
  private readonly models: { id: string; url: string; entity: Entity }[] = [];
  private readonly leafMaterials = new Map<PBRMaterial, Material>();
  private destroyed = false;
  private readonly anchor: { x: number; y: number; z: number };
  private readonly focusBounds: ResolvedWorldTemplateScene["focusBounds"];

  static async create(
    parent: Entity,
    plan: IslandPlan,
    ground: (x: number, z: number) => number | undefined,
    prepared = resolveWorldTemplateScene(plan, ground),
    signal?: AbortSignal
  ): Promise<WorldTemplateRuntime | undefined> {
    const template = worldTemplate(plan.parameters.worldTemplate?.id);
    if (!template || !prepared) return undefined;
    signal?.throwIfAborted();
    const assets = new Map<string, GLTFResource>();
    const urls = new Set(prepared.nodes.flatMap(({ node }) => (node.assetUrl ? [node.assetUrl] : [])));
    const needsLeafMaterial = prepared.nodes.some(({ node }) => node.assetLeafMaterials?.length);
    const leafTemplateTask = needsLeafMaterial
      ? parent.engine.resourceManager.load<Material>({
          type: AssetType.Material,
          url: usesProjectPlantResources(parent.engine)
            ? "Material/Vegetation/birch-leaves.mat"
            : new URL(
                "../../../../terrain/src/data/seed-world/public/Material/Vegetation/birch-leaves.mat",
                import.meta.url
              ).href
        })
      : Promise.resolve(undefined);
    await Promise.all([
      ...[...urls].map(async (url) => {
        assets.set(url, await parent.engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url }));
      }),
      leafTemplateTask
    ]);
    const leafTemplate = await leafTemplateTask;
    signal?.throwIfAborted();
    if (parent.destroyed) throw new Error("World template parent was destroyed while loading models");
    return new WorldTemplateRuntime(parent, template, prepared, assets, leafTemplate);
  }
  private constructor(
    parent: Entity,
    template: WorldTemplate,
    scene: ResolvedWorldTemplateScene,
    assets: ReadonlyMap<string, GLTFResource>,
    leafTemplate?: Material
  ) {
    this.template = template;
    this.geometry = scene.geometry;
    this.focusBounds = scene.focusBounds;
    this.root = parent.createChild(`World template: ${template.id}`);
    try {
      const [x, y, z] = scene.anchor;
      this.anchor = { x, y, z };
      this.root.transform.setPosition(x, y, z);
      for (const { node, position } of scene.nodes) {
        const entity = this.root.createChild(node.id);
        entity.transform.setPosition(position[0] - x, position[1] - y, position[2] - z);
        entity.transform.setScale(...node.scale);
        entity.transform.setRotation(...node.rotation);
        if (node.assetUrl) {
          const model = assets.get(node.assetUrl)!.instantiateSceneRoot();
          // Measure the detached instance so imported node transforms are included,
          // before the template's placement, rotation and metre dimensions apply.
          const bounds = modelBounds(model);
          model.transform.rotate(0, node.assetYawDegrees ?? 0, 0);
          const normalized = entity.createChild("Model fit");
          normalized.addChild(model);
          if (node.assetLeafMaterials?.length) this.bindLeafMaterials(model, node.assetLeafMaterials, leafTemplate!);
          const fit = fitTemplateAsset(
            node.scale,
            {
              min: [bounds.min.x, bounds.min.y, bounds.min.z],
              max: [bounds.max.x, bounds.max.y, bounds.max.z]
            },
            node.assetGroundY
          );
          // Cancel the envelope's per-axis scale before applying one uniform
          // model scale. Keep the authored root origin at the planned ground.
          normalized.transform.setScale(
            fit.scale / node.scale[0],
            fit.scale / node.scale[1],
            fit.scale / node.scale[2]
          );
          normalized.transform.setPosition(
            fit.offset[0] / node.scale[0],
            fit.offset[1] / node.scale[1],
            fit.offset[2] / node.scale[2]
          );
          this.models.push({ id: node.id, url: node.assetUrl, entity });
          continue;
        }
        this.mesh ??= PrimitiveMesh.createCuboid(parent.engine, 1, 1, 1);
        if (!this.material) {
          this.material = new UnlitMaterial(parent.engine);
          this.material.baseColor = new Color(1, 1, 1, 1);
        }
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
  private bindLeafMaterials(model: Entity, slots: readonly string[], template: Material): void {
    if (template.shader.name !== "Terrain/Vegetation") throw new Error("Template foliage requires Terrain/Vegetation");
    const requested = new Set(slots);
    const found = new Set<string>();
    for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) {
      renderer.getMaterials().forEach((source, index) => {
        if (!source || !requested.has(source.name)) return;
        if (!(source instanceof PBRMaterial)) throw new Error(`Template foliage slot requires PBR: ${source.name}`);
        found.add(source.name);
        let material = this.leafMaterials.get(source);
        if (!material) {
          material = template.clone();
          this.leafMaterials.set(source, material);
          material.name = `${source.name} · shared foliage lighting`;
          const data = material.shaderData;
          // The GLB carries static source geometry, without the generated tree's wind or canopy payload.
          for (const macro of data.getMacros()) {
            if (
              macro.name.startsWith("MATERIAL_WIND_") ||
              macro.name.startsWith("MATERIAL_SECOND_COLOR_") ||
              [
                "MATERIAL_ENABLE_WIND",
                "MATERIAL_ENABLE_SECOND_COLOR",
                "MATERIAL_HAS_SMOOTHNESS_TEXTURE",
                "MATERIAL_HAS_NORMALTEXTURE",
                "MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION"
              ].includes(macro.name)
            )
              data.disableMacro(macro);
          }
          const texture = source.baseTexture;
          data.setTexture("material_BaseTexture", texture);
          if (texture) data.enableMacro("MATERIAL_HAS_BASETEXTURE");
          else data.disableMacro("MATERIAL_HAS_BASETEXTURE");
          // The leaf shader's lower overlay branch evaluates 2 * tint * texture.
          // Halving the linear source tint preserves the original PBR colour multiplication.
          const gain = texture ? 0.5 : 1;
          const color = source.baseColor;
          data.setColor("material_BaseColor", new Color(color.r * gain, color.g * gain, color.b * gain, color.a));
          data.setColor("material_TranslucencyColor", new Color(1, 1, 1, 1));
          data.setFloat("material_LeafAlbedoTextureBlend", texture ? 1 : 0);
          data.setFloat("material_LeafAlbedoBrightness", 1);
          data.setFloat("material_LeafAlbedoDesaturation", 0);
          data.setFloat("material_LeafFlipBackfaceNormals", 0);
          data.setFloat("material_LightingFlatness", 0);
          data.setFloat("material_Tiling", 1);
          data.setFloat("material_UVBaseLock", 0);
          data.setFloat("material_AlphaCutoff", source.alphaCutoff);
          data.setFloat("material_Smoothness", 1 - source.roughness);
        }
        renderer.setMaterial(index, material);
      });
    }
    for (const slot of requested)
      if (!found.has(slot)) throw new Error(`Missing template foliage material slot: ${slot}`);
  }
  activate(canvas: HTMLCanvasElement): void {
    canvas.dataset.worldTemplate = JSON.stringify({
      id: this.template.id,
      anchor: this.anchor,
      focusBounds: this.focusBounds,
      leafMaterials: [...this.leafMaterials.values()].map((material) => ({
        name: material.name,
        shader: material.shader.name,
        flipBackfaceNormals: material.shaderData.getFloat("material_LeafFlipBackfaceNormals")
      })),
      placeholders: this.geometry.nodes.filter((node) => !node.assetUrl).map((node) => node.id),
      models: this.models.map(({ id, url, entity }) => {
        const { min, max } = modelBounds(entity);
        return { id, url, bounds: { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] } };
      })
    });
  }
  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.destroy();
    this.leafMaterials.forEach((material) => material.destroy());
    this.leafMaterials.clear();
    this.material?.destroy();
    this.mesh?.destroy();
  }
}
