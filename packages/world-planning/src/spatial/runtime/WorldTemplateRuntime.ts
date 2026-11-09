import {
  AssetType,
  BlendMode,
  BoundingBox,
  Color,
  GradientAlphaKey,
  GradientColorKey,
  MeshShape,
  MeshRenderer,
  ModelMesh,
  ParticleCompositeGradient,
  ParticleCurveMode,
  ParticleGradient,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  PBRMaterial,
  PointLight,
  Shader,
  UnlitMaterial,
  PrimitiveMesh,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector3,
  type Entity,
  type GLTFResource,
  type Material
} from "@galacean/engine";
import { usesProjectPlantResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { templateBaseSeed, templateLinearColor, worldTemplate, type WorldTemplate } from "../WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART, type WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { resolveWorldTemplateScene, type ResolvedWorldTemplateScene } from "../WorldTemplateView";
import { fitTemplateAsset, type TemplateNode } from "../WorldTemplateGeometry";
import translucentShader from "./TemplateTranslucent.shader?raw";
import fireflyShader from "./TemplateFirefly.shader?raw";

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
  private readonly leafMaterials = new Map<string, Material>();
  private readonly assetMaterials = new Map<string, PBRMaterial | UnlitMaterial>();
  private sporeRenderer?: ParticleRenderer;
  private sporeEmissionMesh?: ModelMesh;
  private sporeMaterial?: ParticleMaterial;
  private sporeTexture?: Texture2D;
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
    return new WorldTemplateRuntime(parent, template, prepared, assets, ground, leafTemplate);
  }
  private constructor(
    parent: Entity,
    template: WorldTemplate,
    scene: ResolvedWorldTemplateScene,
    assets: ReadonlyMap<string, GLTFResource>,
    ground: (x: number, z: number) => number | undefined,
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
        if (node.light) {
          const { offset, color, intensity, rangeM } = node.light;
          if (
            !offset.every(Number.isFinite) ||
            !Number.isFinite(intensity) ||
            intensity < 0 ||
            !Number.isFinite(rangeM) ||
            rangeM <= 0
          )
            throw new Error("Invalid template emission light");
          const lamp = entity.createChild("Emissive tissue light");
          lamp.transform.setPosition(...offset);
          const light = lamp.addComponent(PointLight);
          const [r, g, b] = templateLinearColor(color);
          light.color = new Color(r * intensity, g * intensity, b * intensity, 1);
          light.distance = rangeM;
        }
        if (node.assetUrl) {
          const model = assets.get(node.assetUrl)!.instantiateSceneRoot();
          // Measure the detached instance so imported node transforms are included,
          // before the template's placement, rotation and metre dimensions apply.
          const bounds = modelBounds(model);
          model.transform.rotate(0, node.assetYawDegrees ?? 0, 0);
          const normalized = entity.createChild("Model fit");
          normalized.addChild(model);
          if (node.assetLeafMaterials?.length)
            this.bindLeafMaterials(model, node.assetLeafMaterials, leafTemplate!, node.assetLeafColor);
          if (node.assetMaterials) this.bindAssetMaterials(model, node.assetMaterials);
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
      const spores = WORLD_TEMPLATE_ART[template.id].spores;
      if (spores) this.createSporeParticles(spores, ground);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private createSporeParticles(
    spores: NonNullable<WorldTemplateArtDirection["spores"]>,
    ground: (x: number, z: number) => number | undefined
  ): void {
    const { engine } = this.root;
    const { x, y, z } = this.anchor;
    const seed = templateBaseSeed(this.template.id);
    const positions: Vector3[] = [];
    for (let i = 0; i < spores.count; i++) {
      const sample = (field: string) => settlementRandom(seed, `spore:${i}:${field}`);
      const sx = spores.center[0] + (sample("x") - 0.5) * spores.extent[0];
      const sz = spores.center[2] + (sample("z") - 0.5) * spores.extent[2];
      const floor = ground(x - sx, z + sz);
      if (floor === undefined) continue;
      positions.push(new Vector3(-sx, floor - y + spores.center[1] + (sample("height") - 0.5) * spores.extent[1], sz));
    }
    if (!positions.length) return;

    // Native mesh emission samples the authored, terrain-relative points.
    // This mesh only defines emission positions; it is never rendered.
    const mesh = (this.sporeEmissionMesh = new ModelMesh(engine, "Forest firefly emission points"));
    mesh.setPositions(positions);
    mesh.setNormals(positions.map(() => new Vector3(0, 1, 0)));
    BoundingBox.fromPoints(positions, mesh.bounds);
    mesh.uploadData(false);
    const shape = new MeshShape();
    shape.mesh = mesh;

    // A compact radial alpha profile gives billboards a soft, round light core.
    // Generate the carrier in memory; no external image or per-particle geometry.
    const resolution = 32;
    const pixels = new Uint8Array(resolution * resolution * 4);
    for (let row = 0; row < resolution; row++) {
      for (let column = 0; column < resolution; column++) {
        const u = ((column + 0.5) / resolution) * 2 - 1;
        const v = ((row + 0.5) / resolution) * 2 - 1;
        const t = Math.max(0, 1 - u * u - v * v);
        const index = (row * resolution + column) * 4;
        pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
        pixels[index + 3] = Math.round(255 * t * t * (3 - 2 * t));
      }
    }
    const texture = (this.sporeTexture = new Texture2D(
      engine,
      resolution,
      resolution,
      TextureFormat.R8G8B8A8,
      false,
      false
    ));
    texture.setPixelBuffer(pixels);
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;

    const shader = Shader.find("Planning/FireflyParticle") ?? Shader.create(fireflyShader);
    const material = (this.sporeMaterial = new ParticleMaterial(engine, shader));
    material.name = "Forest firefly glow";
    material.baseTexture = texture;
    const [r, g, b] = templateLinearColor(spores.color);
    material.baseColor = new Color(r * spores.intensity, g * spores.intensity, b * spores.intensity, 1);
    material.blendMode = BlendMode.Additive;
    material.shaderData.setFloat("material_MinScreenFraction", spores.minScreenFraction);

    const renderer = (this.sporeRenderer = this.root
      .createChild("Forest firefly particles")
      .addComponent(ParticleRenderer));
    renderer.renderMode = ParticleRenderMode.Billboard;
    renderer.setMaterial(material);
    renderer.castShadows = renderer.receiveShadows = false;
    const generator = renderer.generator;
    generator.randomSeed = seed;
    const main = generator.main;
    main.playOnEnabled = false;
    main.isLoop = true;
    main.duration = spores.periodSeconds;
    main.maxParticles = spores.count;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startSpeed.constant = 0;
    main.gravityModifier.constant = 0;
    main.startLifetime.mode = ParticleCurveMode.TwoConstants;
    main.startLifetime.constantMin = spores.periodSeconds * 0.75;
    main.startLifetime.constantMax = spores.periodSeconds * 1.25;
    main.startSize.mode = ParticleCurveMode.TwoConstants;
    main.startSize.constantMin = spores.radiusM * 2;
    main.startSize.constantMax = spores.radiusM * 4;
    generator.emission.shape = shape;
    // Little's law: emission rate × mean lifetime gives the authored population.
    generator.emission.rateOverTime.constant = spores.count / spores.periodSeconds;
    generator.noise.enabled = true;
    generator.noise.strengthX.constant = spores.driftM / spores.periodSeconds;
    generator.noise.frequency = 1 / (spores.driftM * 2);
    generator.noise.scrollSpeed = 1 / spores.periodSeconds;
    generator.colorOverLifetime.enabled = true;
    const white = new Color(1, 1, 1, 1);
    const pulse = (peak: number, shoulder: number) =>
      new ParticleGradient(
        [new GradientColorKey(0, white), new GradientColorKey(1, white)],
        [
          new GradientAlphaKey(0, 0),
          new GradientAlphaKey(peak, 1),
          new GradientAlphaKey(shoulder, 0.25),
          new GradientAlphaKey(1, 0)
        ]
      );
    generator.colorOverLifetime.color = new ParticleCompositeGradient(pulse(0.2, 0.6), pulse(0.4, 0.8));
    generator.play(false);
  }
  private bindAssetMaterials(model: Entity, overrides: NonNullable<TemplateNode["assetMaterials"]>): void {
    const found = new Set<string>();
    for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) {
      renderer.getMaterials().forEach((source, index) => {
        const values = source && overrides[source.name];
        if (!source || !values) return;
        if (!(source instanceof PBRMaterial || source instanceof UnlitMaterial))
          throw new Error(`Unsupported template material: ${source.name}`);
        found.add(source.name);
        const key = JSON.stringify([source.instanceId, values]);
        let material = this.assetMaterials.get(key);
        if (!material) {
          material = source.clone();
          if (values.color) material.baseColor = new Color(...templateLinearColor(values.color), source.baseColor.a);
          if (values.intensity !== undefined) {
            if (!Number.isFinite(values.intensity) || values.intensity < 0)
              throw new Error("Invalid template color intensity");
            const { r, g, b, a } = material.baseColor;
            material.baseColor = new Color(r * values.intensity, g * values.intensity, b * values.intensity, a);
          }
          if (values.emission) {
            if (!(material instanceof PBRMaterial)) throw new Error(`Template emission requires PBR: ${source.name}`);
            const { color, intensity } = values.emission;
            if (!Number.isFinite(intensity) || intensity < 0) throw new Error("Invalid template emission intensity");
            const [r, g, b] = templateLinearColor(color);
            material.emissiveColor = new Color(r * intensity, g * intensity, b * intensity, 1);
          }
          if (values.translucent) {
            if (!(material instanceof PBRMaterial))
              throw new Error(`Template translucency requires PBR: ${source.name}`);
            const surface = values.translucent;
            if (
              !Number.isFinite(surface.textureExposure) ||
              [surface.transmission, surface.roughness, surface.clearCoat, surface.clearCoatRoughness].some(
                (value) => !Number.isFinite(value) || value < 0 || value > 1
              )
            )
              throw new Error("Invalid template translucent surface");
            material.shader = Shader.find("Planning/TemplateTranslucent") ?? Shader.create(translucentShader);
            material.shaderData.setColor("material_PigmentShade", new Color(...templateLinearColor(surface.shade), 1));
            material.shaderData.setColor(
              "material_PigmentHighlight",
              new Color(...templateLinearColor(surface.highlight), 1)
            );
            material.shaderData.setFloat("material_PigmentExposure", surface.textureExposure);
            material.shaderData.setFloat("material_DiffuseTransmission", surface.transmission);
            material.roughness = surface.roughness;
            material.clearCoat = surface.clearCoat;
            material.clearCoatRoughness = surface.clearCoatRoughness;
            material.specularIntensity = 1;
          }
          this.assetMaterials.set(key, material);
        }
        renderer.setMaterial(index, material);
      });
    }
    for (const slot of Object.keys(overrides))
      if (!found.has(slot)) throw new Error(`Missing template material slot: ${slot}`);
  }
  private bindLeafMaterials(model: Entity, slots: readonly string[], template: Material, leafColor?: string): void {
    if (template.shader.name !== "Terrain/Vegetation") throw new Error("Template foliage requires Terrain/Vegetation");
    const requested = new Set(slots);
    const found = new Set<string>();
    for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) {
      renderer.getMaterials().forEach((source, index) => {
        if (!source || !requested.has(source.name)) return;
        if (!(source instanceof PBRMaterial)) throw new Error(`Template foliage slot requires PBR: ${source.name}`);
        found.add(source.name);
        const color = leafColor ? new Color(...templateLinearColor(leafColor), source.baseColor.a) : source.baseColor;
        const key = JSON.stringify([source.instanceId, color.r, color.g, color.b, color.a]);
        let material = this.leafMaterials.get(key);
        if (!material) {
          material = template.clone();
          this.leafMaterials.set(key, material);
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
          data.setColor("material_BaseColor", new Color(color.r * gain, color.g * gain, color.b * gain, color.a));
          data.setColor("material_TranslucencyColor", new Color(1, 1, 1, 1));
          data.setFloat("material_LeafAlbedoTextureBlend", texture ? 1 : 0);
          data.setFloat("material_LeafAlbedoBrightness", 1);
          data.setFloat("material_LeafAlbedoDesaturation", 0);
          data.setFloat("material_LeafFlipBackfaceNormals", 0);
          data.setFloat("material_LightingFlatness", 0);
          data.setFloat("material_Tiling", 1);
          data.setFloat("material_UVBaseLock", 0);
          // BLEND sources have no cutout threshold. This shared leaf pass is
          // alpha-tested, so use its authored coverage rule for blended foliage.
          const cutoff = source.alphaCutoff;
          data.setFloat(
            "material_AlphaCutoff",
            source.isTransparent && cutoff === 0 ? template.shaderData.getFloat("material_AlphaCutoff") : cutoff
          );
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
      particles: this.sporeRenderer
        ? {
            renderer: "ParticleRenderer",
            shader: this.sporeMaterial!.shader.name,
            capacity: this.sporeRenderer.generator.main.maxParticles,
            sizeM: [
              this.sporeRenderer.generator.main.startSize.constantMin,
              this.sporeRenderer.generator.main.startSize.constantMax
            ],
            minScreenFraction: this.sporeMaterial!.shaderData.getFloat("material_MinScreenFraction"),
            color: this.sporeMaterial!.baseColor,
            emissionRate: this.sporeRenderer.generator.emission.rateOverTime.constant,
            emissionShape: this.sporeRenderer.generator.emission.shape?.constructor.name,
            noise: this.sporeRenderer.generator.noise.enabled,
            colorOverLifetime: this.sporeRenderer.generator.colorOverLifetime.enabled,
            gpuSimulation: this.sporeRenderer.shaderData
              .getMacros()
              .some((macro) => macro.name === "RENDERER_TRANSFORM_FEEDBACK")
          }
        : undefined,
      lights: this.root.getComponentsIncludeChildren(PointLight, []).map((light) => ({
        name: light.entity.name,
        color: [light.color.r, light.color.g, light.color.b],
        rangeM: light.distance,
        position: [light.position.x, light.position.y, light.position.z]
      })),
      leafMaterials: [...this.leafMaterials.values()].map((material) => ({
        name: material.name,
        shader: material.shader.name,
        flipBackfaceNormals: material.shaderData.getFloat("material_LeafFlipBackfaceNormals")
      })),
      assetMaterials: [...this.assetMaterials.values()].map((material) => ({
        name: material.name,
        shader: material.shader.name,
        albedo: [material.baseColor.r, material.baseColor.g, material.baseColor.b],
        albedoTextureSrgb: material.baseTexture?.isSRGBColorSpace,
        ormTextureSrgb:
          material instanceof PBRMaterial ? material.roughnessMetallicTexture?.isSRGBColorSpace : undefined,
        emission:
          material instanceof PBRMaterial
            ? [material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b]
            : undefined,
        emissiveTexture: material instanceof PBRMaterial && Boolean(material.emissiveTexture),
        translucent:
          material instanceof PBRMaterial && material.shader.name === "Planning/TemplateTranslucent"
            ? {
                shade: material.shaderData.getColor("material_PigmentShade"),
                highlight: material.shaderData.getColor("material_PigmentHighlight"),
                textureExposure: material.shaderData.getFloat("material_PigmentExposure"),
                diffuseTransmission: material.shaderData.getFloat("material_DiffuseTransmission"),
                roughness: material.roughness,
                clearCoat: material.clearCoat,
                clearCoatRoughness: material.clearCoatRoughness
              }
            : undefined
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
    this.assetMaterials.forEach((material) => material.destroy());
    this.assetMaterials.clear();
    this.sporeMaterial?.destroy();
    this.sporeTexture?.destroy();
    this.sporeEmissionMesh?.destroy();
    this.material?.destroy();
    this.mesh?.destroy();
  }
}
