import {
  AssetType,
  BlendMode,
  BoundingBox,
  BoxShape,
  Color,
  GradientAlphaKey,
  GradientColorKey,
  MeshShape,
  MeshRenderer,
  ModelMesh,
  ParticleCompositeCurve,
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
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import { compositionSubjectTerraceBox } from "../SpatialCompositionGeometry";
import { spatialCompositionParameters } from "../SpatialCompositionParameters";
import { templateBaseSeed, templateLinearColor, worldTemplate, type WorldTemplate } from "../WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART, type WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { worldTemplateStreet } from "../WorldTemplateStreet";
import { resolveWorldTemplateScene, type ResolvedWorldTemplateScene } from "../WorldTemplateView";
import { fitTemplateAsset, stretchTemplateAsset, type TemplateNode } from "../WorldTemplateGeometry";
import { mountOilPaintGround, oilPaintMaterial } from "./OilPaintMesh";
import { StreetFacadeRuntime } from "./StreetFacadeRuntime";
import translucentShader from "./TemplateTranslucent.shader?raw";
import fireflyShader from "./TemplateFirefly.shader?raw";
import petalShader from "./TemplatePetal.shader?raw";

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
  readonly geometry?: ResolvedWorldTemplateScene["geometry"];
  private facades?: StreetFacadeRuntime;
  private mesh?: ModelMesh;
  private material?: UnlitMaterial;
  private readonly models: { id: string; url: string; entity: Entity }[] = [];
  private readonly groundedNodes = new Map<string, Entity>();
  private readonly leafMaterials = new Map<string, Material>();
  private readonly assetMaterials = new Map<string, PBRMaterial | UnlitMaterial>();
  private sporeRenderer?: ParticleRenderer;
  private sporeEmissionMesh?: ModelMesh;
  private sporeMaterial?: ParticleMaterial;
  private sporeTexture?: Texture2D;
  private petalRenderer?: ParticleRenderer;
  private petalMaterial?: ParticleMaterial;
  private groundPaintMaterial?: Material;
  private groundPaintMeshes: ModelMesh[] = [];
  private destroyed = false;
  private readonly anchor: { x: number; y: number; z: number };
  private focusBounds?: ResolvedWorldTemplateScene["focusBounds"];

  static async create(
    parent: Entity,
    plan: IslandPlan,
    ground: (x: number, z: number) => number | undefined,
    prepared = resolveWorldTemplateScene(plan, ground),
    signal?: AbortSignal,
    viewer?: Entity
  ): Promise<WorldTemplateRuntime | undefined> {
    const template = worldTemplate(plan.parameters.worldTemplate?.id);
    if (!template) return undefined;
    const signs = WORLD_TEMPLATE_ART[template.id].streetSigns;
    const street = worldTemplateStreet(plan);
    const spine = street?.construction?.spine;
    if (!prepared && !spine?.length) return undefined;
    signal?.throwIfAborted();
    const assets = new Map<string, GLTFResource>();
    const nodes = prepared?.nodes ?? [];
    const urls = new Set(nodes.flatMap(({ node }) => (node.assetUrl ? [node.assetUrl] : [])));
    const needsLeafMaterial = nodes.some(({ node }) => node.assetLeafMaterials?.length);
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
    const petalTextureUrl = WORLD_TEMPLATE_ART[template.id].petals?.textureUrl;
    const petalTextureTask = petalTextureUrl
      ? parent.engine.resourceManager.load<Texture2D>({
          type: AssetType.Texture,
          url: petalTextureUrl,
          params: {
            isSRGBColorSpace: true,
            mipmap: true,
            wrapModeU: TextureWrapMode.Clamp,
            wrapModeV: TextureWrapMode.Clamp
          }
        })
      : Promise.resolve(undefined);
    const atlasTask =
      signs && spine?.length
        ? parent.engine.resourceManager.load<Texture2D>({ type: AssetType.Texture, url: signs.atlasUrl })
        : Promise.resolve(undefined);
    const [leafTemplate, atlas, petalTexture] = await Promise.all([
      leafTemplateTask,
      atlasTask,
      petalTextureTask,
      ...[...urls].map(async (url) => {
        assets.set(url, await parent.engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url }));
      })
    ]);
    signal?.throwIfAborted();
    if (parent.destroyed) throw new Error("World template parent was destroyed while loading models");
    return new WorldTemplateRuntime(
      parent,
      plan,
      template,
      prepared,
      assets,
      ground,
      leafTemplate,
      petalTexture,
      atlas,
      spine,
      viewer
    );
  }
  private constructor(
    parent: Entity,
    plan: IslandPlan,
    template: WorldTemplate,
    scene: ResolvedWorldTemplateScene | undefined,
    assets: ReadonlyMap<string, GLTFResource>,
    ground: (x: number, z: number) => number | undefined,
    leafTemplate?: Material,
    petalTexture?: Texture2D,
    atlas?: Texture2D,
    spine?: readonly PlanPoint[],
    viewer?: Entity
  ) {
    this.template = template;
    this.geometry = scene?.geometry;
    this.focusBounds = scene?.focusBounds;
    this.root = parent.createChild(`World template: ${template.id}`);
    try {
      const [x, y, z] = scene?.anchor ?? [0, 0, 0];
      this.anchor = { x, y, z };
      this.root.transform.setPosition(x, y, z);
      const oilPaint = WORLD_TEMPLATE_ART[template.id].oilPaint;
      if (oilPaint && scene) {
        this.groundPaintMaterial = oilPaintMaterial(parent.engine, [
          ...oilPaint.groundPigments,
          ...oilPaint.trailPigments,
          ...oilPaint.growthPigments
        ]);
        this.groundPaintMeshes = mountOilPaintGround(
          this.root,
          plan,
          scene.anchor,
          ground,
          oilPaint,
          this.groundPaintMaterial
        );
      }
      const shareVertexColorMaterial = WORLD_TEMPLATE_ART[template.id].sharedVertexColorMaterial;
      let vertexColorMaterial: Material | null = null;
      for (const { node, position } of scene?.nodes ?? []) {
        const entity = this.root.createChild(node.id);
        entity.transform.setPosition(position[0] - x, position[1] - y, position[2] - z);
        entity.transform.setScale(...node.scale);
        entity.transform.setRotation(...node.rotation);
        if (node.grounded) this.groundedNodes.set(node.id, entity);
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
          if (shareVertexColorMaterial) {
            for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) {
              if (!renderer.enableVertexColor) continue;
              renderer.getMaterials().forEach((material, index) => {
                if (material?.name !== shareVertexColorMaterial) return;
                vertexColorMaterial ??= material;
                renderer.setMaterial(index, vertexColorMaterial);
              });
            }
          }
          // Measure the detached instance so imported node transforms are included,
          // before the template's placement, rotation and metre dimensions apply.
          const bounds = modelBounds(model);
          model.transform.rotate(0, node.assetYawDegrees ?? 0, 0);
          const normalized = entity.createChild("Model fit");
          normalized.addChild(model);
          if (node.assetLeafMaterials?.length)
            this.bindLeafMaterials(model, node.assetLeafMaterials, leafTemplate!, node);
          if (node.assetMaterials) this.bindAssetMaterials(model, node.assetMaterials);
          const meshBounds = {
            min: [bounds.min.x, bounds.min.y, bounds.min.z] as [number, number, number],
            max: [bounds.max.x, bounds.max.y, bounds.max.z] as [number, number, number]
          };
          const fit = node.stretchToEnvelope
            ? stretchTemplateAsset(node.scale, meshBounds, node.assetGroundY)
            : fitTemplateAsset(node.scale, meshBounds, node.assetGroundY);
          const scale = typeof fit.scale === "number" ? [fit.scale, fit.scale, fit.scale] : fit.scale;
          // The parent carries the envelope scale, while the mesh is fitted in source units.
          normalized.transform.setScale(scale[0] / node.scale[0], scale[1] / node.scale[1], scale[2] / node.scale[2]);
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
      const petals = WORLD_TEMPLATE_ART[template.id].petals;
      if (petals) {
        if (!petalTexture) throw new Error("Missing template petal texture");
        this.createPetalParticles(petals, ground, petalTexture);
      }
      const signs = WORLD_TEMPLATE_ART[template.id].streetSigns;
      if (signs && atlas && spine)
        this.facades = new StreetFacadeRuntime(this.root, atlas, signs, ground, spine, viewer);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Resolve new vertical supports before the corresponding rock meshes become visible. */
  prepareRockGrounding(
    plan: IslandPlan,
    ground: (x: number, z: number) => number | undefined,
    formations: readonly RockFormationMesh[]
  ): (() => void) | undefined {
    if (!compositionSubjectTerraceBox(spatialCompositionParameters(plan.parameters.spatialComposition))) return;
    const scene = resolveWorldTemplateScene(plan, ground, formations)!;
    return () => {
      for (const { node, position } of scene.nodes) {
        const entity = this.groundedNodes.get(node.id);
        if (entity) entity.transform.position.y = position[1] - this.anchor.y;
      }
      this.focusBounds = scene.focusBounds;
    };
  }

  private createPetalParticles(
    petals: NonNullable<WorldTemplateArtDirection["petals"]>,
    ground: (x: number, z: number) => number | undefined,
    texture: Texture2D
  ): void {
    const positiveRange = (range: readonly number[]) =>
      range.length === 2 && range.every((value) => Number.isFinite(value) && value > 0) && range[0] <= range[1];
    if (
      !Number.isSafeInteger(petals.count) ||
      petals.count <= 0 ||
      ![...petals.center, ...petals.windMps, ...petals.spinDegreesPerSecond].every(Number.isFinite) ||
      !petals.extent.every((value) => Number.isFinite(value) && value > 0) ||
      !positiveRange(petals.sizeM) ||
      !positiveRange(petals.fallSpeedMps) ||
      ![petals.lifetimeSeconds, petals.flutterWavelengthM].every((value) => Number.isFinite(value) && value > 0) ||
      ![petals.flutterMps, petals.intensity].every((value) => Number.isFinite(value) && value >= 0) ||
      !Number.isFinite(petals.renderPriority) ||
      typeof petals.depthTest !== "boolean" ||
      (petals.emission !== undefined &&
        (!Number.isFinite(petals.emission.intensity) || petals.emission.intensity < 0)) ||
      petals.spinDegreesPerSecond[0] > petals.spinDegreesPerSecond[1]
    )
      throw new Error("Invalid template petal parameters");

    const { engine } = this.root,
      { x, y, z } = this.anchor;
    const floor = ground(x - petals.center[0], z + petals.center[2]);
    if (floor === undefined) return;
    const shape = new BoxShape();
    shape.size.set(...petals.extent);
    const shader = Shader.find("Planning/PetalParticle") ?? Shader.create(petalShader);
    const material = (this.petalMaterial = new ParticleMaterial(engine, shader));
    material.name = "Sakura petal pigment";
    material.shaderData.setInt("depthTestEnabled", petals.depthTest ? 1 : 0);
    material.baseTexture = texture;
    const [r, g, b] = templateLinearColor(petals.color).map((channel) => channel * petals.intensity);
    material.baseColor = new Color(r, g, b, 1);
    if (petals.emission) {
      const { color, intensity } = petals.emission;
      const [r, g, b] = templateLinearColor(color).map((channel) => channel * intensity);
      material.emissiveColor = new Color(r, g, b, 1);
      material.emissiveTexture = texture;
    }
    const renderer = (this.petalRenderer = this.root.createChild("Drifting petals").addComponent(ParticleRenderer));
    renderer.entity.transform.setPosition(-petals.center[0], floor - y + petals.center[1], petals.center[2]);
    renderer.renderMode = ParticleRenderMode.Billboard;
    renderer.priority = petals.renderPriority;
    renderer.setMaterial(material);
    renderer.castShadows = renderer.receiveShadows = false;
    const generator = renderer.generator,
      main = generator.main;
    generator.randomSeed = templateBaseSeed(this.template.id);
    main.playOnEnabled = false;
    main.isLoop = true;
    main.duration = petals.lifetimeSeconds;
    main.maxParticles = petals.count;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startSpeed.constant = 0;
    main.startSize = new ParticleCompositeCurve(...petals.sizeM);
    main.startLifetime = new ParticleCompositeCurve(petals.lifetimeSeconds * 0.75, petals.lifetimeSeconds * 1.25);
    main.gravityModifier.constant = 0;
    main.startRotation3D = false;
    main.startRotationZ = new ParticleCompositeCurve(0, 360);
    generator.emission.shape = shape;
    generator.emission.rateOverTime.constant = petals.count / petals.lifetimeSeconds;
    generator.velocityOverLifetime.enabled = true;
    generator.velocityOverLifetime.space = ParticleSimulationSpace.World;
    generator.velocityOverLifetime.velocityX = new ParticleCompositeCurve(0, 0);
    generator.velocityOverLifetime.velocityY = new ParticleCompositeCurve(
      -petals.fallSpeedMps[1],
      -petals.fallSpeedMps[0]
    );
    generator.velocityOverLifetime.velocityZ = new ParticleCompositeCurve(0, 0);
    generator.windOverLifetime.enabled = true;
    generator.windOverLifetime.targetVelocity.set(...petals.windMps);
    generator.windOverLifetime.influence.set(1, 0, 1);
    generator.noise.enabled = true;
    generator.noise.strengthX.constant = petals.flutterMps;
    generator.noise.frequency = 1 / petals.flutterWavelengthM;
    generator.noise.scrollSpeed = Math.hypot(...petals.windMps) / petals.flutterWavelengthM;
    generator.rotationOverLifetime.enabled = true;
    generator.rotationOverLifetime.separateAxes = false;
    generator.rotationOverLifetime.rotationZ = new ParticleCompositeCurve(...petals.spinDegreesPerSecond);
    generator.colorOverLifetime.enabled = true;
    const white = new Color(1, 1, 1, 1);
    generator.colorOverLifetime.color = new ParticleCompositeGradient(
      new ParticleGradient(
        [new GradientColorKey(0, white), new GradientColorKey(1, white)],
        [
          new GradientAlphaKey(0, 0),
          new GradientAlphaKey(0.1, 1),
          new GradientAlphaKey(0.85, 1),
          new GradientAlphaKey(1, 0)
        ]
      )
    );
    generator.play(false);
    generator.emit(Math.ceil(petals.count / 2));
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
  private bindLeafMaterials(model: Entity, slots: readonly string[], template: Material, node: TemplateNode): void {
    if (template.shader.name !== "Terrain/Vegetation") throw new Error("Template foliage requires Terrain/Vegetation");
    const intensity = node.assetLeafIntensity ?? 1;
    const textureBlend = node.assetLeafTextureBlend ?? 1;
    if (
      !Number.isFinite(intensity) ||
      intensity < 0 ||
      !Number.isFinite(textureBlend) ||
      textureBlend < 0 ||
      textureBlend > 1
    )
      throw new Error("Invalid template foliage pigment");
    const requested = new Set(slots);
    const found = new Set<string>();
    for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) {
      renderer.getMaterials().forEach((source, index) => {
        if (!source || !requested.has(source.name)) return;
        if (!(source instanceof PBRMaterial)) throw new Error(`Template foliage slot requires PBR: ${source.name}`);
        found.add(source.name);
        const color = node.assetLeafColor
          ? new Color(...templateLinearColor(node.assetLeafColor), source.baseColor.a)
          : source.baseColor;
        const key = JSON.stringify([source.instanceId, color.r, color.g, color.b, color.a, intensity, textureBlend]);
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
          // The low overlay branch has gain 1 + blend for a white atlas. Coverage-only
          // uses the unmodified HDR pigment, outside that branch's [0, 1] clamp.
          const gain = intensity / (texture ? 1 + textureBlend : 1);
          data.setColor("material_BaseColor", new Color(color.r * gain, color.g * gain, color.b * gain, color.a));
          data.setColor("material_TranslucencyColor", new Color(1, 1, 1, 1));
          data.setFloat("material_LeafAlbedoTextureBlend", texture ? textureBlend : 0);
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
      oilPaint: this.groundPaintMaterial && {
        shader: this.groundPaintMaterial.shader.name,
        tiles: this.groundPaintMeshes.length,
        triangles: this.groundPaintMeshes.reduce((count, mesh) => count + mesh.subMesh!.count / 3, 0)
      },
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
      petals: this.petalRenderer
        ? {
            renderer: "ParticleRenderer",
            renderMode: "Billboard",
            renderPriority: this.petalRenderer.priority,
            depthTest: Boolean(this.petalMaterial!.shaderData.getInt("depthTestEnabled")),
            depthWrite: Boolean(this.petalMaterial!.shaderData.getInt("depthWriteEnabled")),
            shader: this.petalMaterial!.shader.name,
            emission: [
              this.petalMaterial!.emissiveColor.r,
              this.petalMaterial!.emissiveColor.g,
              this.petalMaterial!.emissiveColor.b
            ],
            emissiveTexture: Boolean(this.petalMaterial!.emissiveTexture),
            capacity: this.petalRenderer.generator.main.maxParticles,
            active: this.petalRenderer.generator.isAlive,
            texture: {
              name: this.petalMaterial!.baseTexture.name,
              width: this.petalMaterial!.baseTexture.width,
              height: this.petalMaterial!.baseTexture.height
            },
            emissionRate: this.petalRenderer.generator.emission.rateOverTime.constant,
            sizeM: [
              this.petalRenderer.generator.main.startSize.constantMin,
              this.petalRenderer.generator.main.startSize.constantMax
            ],
            fallSpeedMps: [
              -this.petalRenderer.generator.velocityOverLifetime.velocityY.constantMax,
              -this.petalRenderer.generator.velocityOverLifetime.velocityY.constantMin
            ],
            windMps: this.petalRenderer.generator.windOverLifetime.targetVelocity,
            spin: this.petalRenderer.generator.rotationOverLifetime.enabled,
            gpuSimulation: this.petalRenderer.shaderData
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
        flipBackfaceNormals: material.shaderData.getFloat("material_LeafFlipBackfaceNormals"),
        pigment: material.shaderData.getColor("material_BaseColor"),
        textureBlend: material.shaderData.getFloat("material_LeafAlbedoTextureBlend"),
        alphaCutoff: material.shaderData.getFloat("material_AlphaCutoff")
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
      placeholders: (this.geometry?.nodes ?? []).filter((node) => !node.assetUrl).map((node) => node.id),
      models: this.models.map(({ id, url, entity }) => {
        const { min, max } = modelBounds(entity);
        const renderer = WORLD_TEMPLATE_ART[this.template.id].sharedVertexColorMaterial
          ? entity.getComponentsIncludeChildren(MeshRenderer, [])[0]
          : undefined;
        return {
          id,
          url,
          bounds: { min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] },
          ...(renderer && { meshId: renderer.mesh?.instanceId, materialId: renderer.getMaterial()?.instanceId })
        };
      })
    });
  }
  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.facades?.dispose();
    this.root.destroy();
    this.leafMaterials.forEach((material) => material.destroy());
    this.leafMaterials.clear();
    this.assetMaterials.forEach((material) => material.destroy());
    this.assetMaterials.clear();
    this.sporeMaterial?.destroy();
    this.sporeTexture?.destroy();
    this.sporeEmissionMesh?.destroy();
    this.petalMaterial?.destroy();
    this.groundPaintMaterial?.destroy();
    for (const mesh of this.groundPaintMeshes) mesh.destroy();
    this.material?.destroy();
    this.mesh?.destroy();
  }
}
