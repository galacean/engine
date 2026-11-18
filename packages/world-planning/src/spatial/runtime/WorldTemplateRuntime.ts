import {
  AssetType,
  BlendFactor,
  BlendMode,
  BoundingBox,
  BoxShape,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Color,
  GradientAlphaKey,
  GradientColorKey,
  type IndexBufferBinding,
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
  RenderFace,
  Script,
  Shader,
  UnlitMaterial,
  PrimitiveMesh,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat,
  type Camera,
  type Entity,
  type GLTFResource,
  type Material
} from "@galacean/engine";
import { TerrainScreenRelativeHeightRuntime } from "@galacean/engine-terrain/terrain/lod/TerrainScreenRelativeHeightRuntime";
import { usesProjectPlantResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import {
  configureAssetAssemblyRendererInstance,
  configureProceduralPlantWindMaterial
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import { rockFormationGround } from "../../integrations/terrain/rock-formation/Placement";
import { compositionSubjectTerraceBox } from "../SpatialCompositionGeometry";
import { spatialCompositionParameters } from "../SpatialCompositionParameters";
import { templateBaseSeed, templateLinearColor, worldTemplate, type WorldTemplate } from "../WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART, type WorldTemplateArtDirection } from "../WorldTemplateArtDirection";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { resolveWorldTemplateScene, type ResolvedWorldTemplateScene } from "../WorldTemplateView";
import { fitTemplateAsset, stretchTemplateAsset, type TemplateNode } from "../WorldTemplateGeometry";
import {
  mountTemplateProceduralPlants,
  preloadTemplateProceduralPlantResources,
  type TemplateProceduralPlantResources
} from "./TemplateProceduralPlants";
import translucentShader from "./TemplateTranslucent.shader?raw";
import fireflyShader from "./TemplateFirefly.shader?raw";
import petalShader from "./TemplatePetal.shader?raw";
import butterflyShader from "./TemplateButterfly.shader?raw";

function modelBounds(entity: Entity): BoundingBox {
  const bounds = new BoundingBox(
    new Vector3(Infinity, Infinity, Infinity),
    new Vector3(-Infinity, -Infinity, -Infinity)
  );
  for (const renderer of entity.getComponentsIncludeChildren(MeshRenderer, []))
    BoundingBox.merge(bounds, renderer.bounds, bounds);
  return bounds;
}

class TemplateModelLods extends Script {
  private readonly groups: {
    models: Entity[];
    projection: TerrainScreenRelativeHeightRuntime;
    thresholds: readonly [number, number];
    active: number;
  }[] = [];

  track(models: Entity[], bounds: BoundingBox, camera: Camera, thresholds: readonly [number, number]): void {
    const { min, max } = bounds;
    const projection = new TerrainScreenRelativeHeightRuntime(
      models[0],
      camera,
      [(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2],
      max.y - min.y
    );
    const group = { models, thresholds, projection, active: 0 };
    for (let i = 1; i < models.length; i++) models[i].isActive = false;
    this.groups.push(group);
    this.select(group);
  }

  override onLateUpdate(): void {
    for (const group of this.groups) this.select(group);
  }

  private select(group: (typeof this.groups)[number]): void {
    const height = group.projection.resolve();
    const next = height >= group.thresholds[0] ? 0 : height >= group.thresholds[1] ? 1 : 2;
    if (next === group.active) return;
    group.models[group.active].isActive = false;
    group.models[next].isActive = true;
    group.active = next;
  }
}

/** Supplied models fill their authored envelopes; missing assets retain whiteboxes. */
export class WorldTemplateRuntime {
  readonly root: Entity;
  readonly template: WorldTemplate;
  readonly geometry: ResolvedWorldTemplateScene["geometry"];
  private mesh?: ModelMesh;
  private material?: UnlitMaterial;
  private readonly models: { id: string; url: string; entity: Entity }[] = [];
  private readonly groundedNodes = new Map<string, Entity>();
  private readonly leafMaterials = new Map<string, Material>();
  private readonly assetMaterials = new Map<string, PBRMaterial | UnlitMaterial>();
  private readonly boughWindMeshes = new Map<string, BufferMesh | undefined>();
  private sporeRenderer?: ParticleRenderer;
  private sporeEmissionMesh?: ModelMesh;
  private sporeMaterial?: ParticleMaterial;
  private sporeTexture?: Texture2D;
  private petalRenderer?: ParticleRenderer;
  private petalMaterial?: ParticleMaterial;
  private butterflyRenderer?: ParticleRenderer;
  private butterflyMaterial?: ParticleMaterial;
  private butterflyWingMesh?: ModelMesh;
  private butterflyEmissionMesh?: ModelMesh;
  private readonly foliageWindDisposals: Array<() => void> = [];
  private disposeProceduralPlants?: () => void;
  private readonly leafTemplate?: Material;
  private readonly plantResources?: TemplateProceduralPlantResources;
  private destroyed = false;
  private readonly anchor: { x: number; y: number; z: number };
  private focusBounds: ResolvedWorldTemplateScene["focusBounds"];

  static async create(
    parent: Entity,
    plan: IslandPlan,
    ground: (x: number, z: number) => number | undefined,
    prepared = resolveWorldTemplateScene(plan, ground),
    signal?: AbortSignal,
    formations?: readonly RockFormationMesh[],
    camera?: Camera
  ): Promise<WorldTemplateRuntime | undefined> {
    const template = worldTemplate(plan.parameters.worldTemplate?.id);
    if (!template || !prepared) return undefined;
    signal?.throwIfAborted();
    const assets = new Map<string, GLTFResource>();
    const nodes = prepared.nodes;
    const urls = new Set<string>();
    const leafModelUrls = new Set<string>();
    for (const { node } of nodes) {
      for (const url of [node.assetUrl, camera && node.assetLod?.url]) {
        if (!url) continue;
        urls.add(url);
        if (node.assetLeafMaterials?.length) leafModelUrls.add(url);
      }
    }
    const art = WORLD_TEMPLATE_ART[template.id];
    const resolvedPlants = art.resolveProceduralPlants
      ? art.resolveProceduralPlants(plan.parameters.seed)
      : art.proceduralPlants;
    const hasProceduralPlants = Boolean(resolvedPlants?.length);
    const needsLeafMaterial = leafModelUrls.size > 0 || hasProceduralPlants;
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
    const plantResourcesTask = hasProceduralPlants
      ? preloadTemplateProceduralPlantResources(
          parent.engine,
          new Set(resolvedPlants!.map((plant) => plant.kind))
        )
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
    const butterflyTextureUrl = WORLD_TEMPLATE_ART[template.id].butterflies?.textureUrl;
    const butterflyTextureTask = butterflyTextureUrl
      ? parent.engine.resourceManager.load<Texture2D>({
          type: AssetType.Texture,
          url: butterflyTextureUrl,
          params: {
            isSRGBColorSpace: true,
            mipmap: true,
            filterMode: TextureFilterMode.Trilinear,
            wrapModeU: TextureWrapMode.Clamp,
            wrapModeV: TextureWrapMode.Clamp,
            anisoLevel: 4
          }
        })
      : Promise.resolve(undefined);
    const [leafTemplate, petalTexture, butterflyTexture, plantResources] = await Promise.all([
      leafTemplateTask,
      petalTextureTask,
      butterflyTextureTask,
      plantResourcesTask,
      ...[...urls].map(async (url) => {
        assets.set(
          url,
          await parent.engine.resourceManager.load<GLTFResource>({
            type: AssetType.GLTF,
            url,
            ...(leafModelUrls.has(url) ? { params: { keepMeshData: true } } : {})
          })
        );
      })
    ]);
    signal?.throwIfAborted();
    if (parent.destroyed) throw new Error("World template parent was destroyed while loading models");
    return new WorldTemplateRuntime(
      parent,
      camera,
      plan,
      template,
      prepared,
      assets,
      ground,
      leafTemplate,
      petalTexture,
      butterflyTexture,
      formations,
      plantResources
    );
  }
  private constructor(
    parent: Entity,
    camera: Camera | undefined,
    plan: IslandPlan,
    template: WorldTemplate,
    scene: ResolvedWorldTemplateScene,
    assets: ReadonlyMap<string, GLTFResource>,
    ground: (x: number, z: number) => number | undefined,
    leafTemplate?: Material,
    petalTexture?: Texture2D,
    butterflyTexture?: Texture2D,
    formations?: readonly RockFormationMesh[],
    plantResources?: TemplateProceduralPlantResources
  ) {
    this.template = template;
    this.geometry = scene.geometry;
    this.focusBounds = scene.focusBounds;
    this.leafTemplate = leafTemplate;
    this.plantResources = plantResources;
    this.root = parent.createChild(`World template: ${template.id}`);
    try {
      const [x, y, z] = scene.anchor;
      this.anchor = { x, y, z };
      this.root.transform.setPosition(x, y, z);
      const shareVertexColorMaterial = WORLD_TEMPLATE_ART[template.id].sharedVertexColorMaterial;
      let vertexColorMaterial: Material | null = null;
      let modelLods: TemplateModelLods | undefined;
      for (const { node, position } of scene.nodes) {
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
          const source = assets.get(node.assetUrl)!;
          const model = source.instantiateSceneRoot();
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
          const normalized = entity.createChild("Model fit");
          normalized.addChild(model);
          const levels = [model];
          if (camera && node.assetLod) {
            const lods = assets.get(node.assetLod.url)!;
            const sourceMaterials = new Map(source.materials?.map((material) => [material.name, material]));
            for (let sceneIndex = 0; sceneIndex < node.assetLod.screenRelativeHeights.length; sceneIndex++) {
              const level = lods.instantiateSceneRoot(sceneIndex);
              normalized.addChild(level);
              levels.push(level);
              for (const renderer of level.getComponentsIncludeChildren(MeshRenderer, [])) {
                renderer.getMaterials().forEach((slot, index) => {
                  const original = slot && sourceMaterials.get(slot.name);
                  if (!original) throw new Error(`Unknown LOD material on ${node.id}: ${slot?.name}`);
                  renderer.setMaterial(index, original);
                });
              }
            }
          }
          for (const level of levels) level.transform.rotate(0, node.assetYawDegrees ?? 0, 0);
          if (node.assetLeafMaterials?.length)
            this.bindLeafMaterials(normalized, node.assetLeafMaterials, leafTemplate!, node);
          if (node.assetMaterials) this.bindAssetMaterials(normalized, node.assetMaterials);
          if (node.castShadows !== undefined) {
            for (const renderer of normalized.getComponentsIncludeChildren(MeshRenderer, []))
              renderer.castShadows = node.castShadows;
          }
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
          if (camera && node.assetLod) {
            modelLods ??= this.root.addComponent(TemplateModelLods);
            modelLods.track(levels, bounds, camera, node.assetLod.screenRelativeHeights);
          }
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
        renderer.castShadows = node.castShadows ?? true;
        renderer.receiveShadows = false;
      }
      const spores = WORLD_TEMPLATE_ART[template.id].spores;
      if (spores) this.createSporeParticles(spores, ground);
      const petals = WORLD_TEMPLATE_ART[template.id].petals;
      if (petals) {
        if (!petalTexture) throw new Error("Missing template petal texture");
        this.createPetalParticles(petals, ground, petalTexture);
      }
      const butterflies = WORLD_TEMPLATE_ART[template.id].butterflies;
      if (butterflies) {
        if (!butterflyTexture) throw new Error("Missing template butterfly texture");
        this.createButterflyParticles(butterflies, ground, butterflyTexture);
      }
      const templateArt = WORLD_TEMPLATE_ART[template.id];
      const proceduralPlants = templateArt.resolveProceduralPlants
        ? templateArt.resolveProceduralPlants(plan.parameters.seed)
        : templateArt.proceduralPlants;
      if (proceduralPlants?.length) {
        const rockSurface = formations?.length ? rockFormationGround(plan, formations) : undefined;
        const rockGround = rockSurface
          ? (wx: number, wz: number) => {
              const floor = ground(wx, wz);
              return floor === undefined ? undefined : rockSurface(wx, wz, floor);
            }
          : undefined;
        this.disposeProceduralPlants = mountTemplateProceduralPlants(
          this.root,
          this.anchor,
          ground,
          proceduralPlants,
          plan.parameters.seed,
          leafTemplate,
          rockGround,
          plantResources
        );
      }
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
    const hasSubjectTerrace = Boolean(
      compositionSubjectTerraceBox(spatialCompositionParameters(plan.parameters.spatialComposition))
    );
    const templateArt = WORLD_TEMPLATE_ART[this.template.id];
    const proceduralPlants = templateArt.resolveProceduralPlants
      ? templateArt.resolveProceduralPlants(plan.parameters.seed)
      : templateArt.proceduralPlants;
    const hasRockPlants = Boolean(proceduralPlants?.some((plant) => plant.onRock));
    if (!hasSubjectTerrace && !hasRockPlants) return;
    const scene = hasSubjectTerrace ? resolveWorldTemplateScene(plan, ground, formations) : undefined;
    const rockSurface = hasRockPlants && formations.length ? rockFormationGround(plan, formations) : undefined;
    return () => {
      if (scene) {
        for (const { node, position } of scene.nodes) {
          const entity = this.groundedNodes.get(node.id);
          if (entity) entity.transform.position.y = position[1] - this.anchor.y;
        }
        this.focusBounds = scene.focusBounds;
      }
      if (hasRockPlants && proceduralPlants?.length && !this.destroyed) {
        this.disposeProceduralPlants?.();
        const rockGround = rockSurface
          ? (wx: number, wz: number) => {
              const floor = ground(wx, wz);
              return floor === undefined ? undefined : rockSurface(wx, wz, floor);
            }
          : undefined;
        this.disposeProceduralPlants = mountTemplateProceduralPlants(
          this.root,
          this.anchor,
          ground,
          proceduralPlants,
          plan.parameters.seed,
          this.leafTemplate,
          rockGround,
          this.plantResources
        );
      }
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
  private createButterflyParticles(
    butterflies: NonNullable<WorldTemplateArtDirection["butterflies"]>,
    ground: (x: number, z: number) => number | undefined,
    texture: Texture2D
  ): void {
    const { engine } = this.root;
    const { x, y, z } = this.anchor;
    const seed = templateBaseSeed(this.template.id);
    const sampleCount = Math.max(48, butterflies.count * 2);
    const positions: Vector3[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const sample = (field: string) => settlementRandom(seed, `butterfly:${i}:${field}`);
      const isCanopy = sample("tier") < butterflies.canopyRatio;
      const radialSpread = isCanopy ? 0.85 : 1.0;
      const angle = sample("angle") * Math.PI * 2;
      const radius = Math.sqrt(sample("radius")) * 0.5 * radialSpread;
      const bx = butterflies.center[0] + Math.cos(angle) * butterflies.extent[0] * radius;
      const bz = butterflies.center[2] + Math.sin(angle) * butterflies.extent[2] * radius;
      const floor = ground(x - bx, z + bz);
      if (floor === undefined) continue;
      const heightOffset = isCanopy
        ? butterflies.center[1] + butterflies.extent[1] * (0.34 + 0.66 * sample("height"))
        : 0.68 + butterflies.center[1] * 1.35 * sample("height");
      positions.push(new Vector3(-bx, floor - y + heightOffset, bz));
    }
    if (!positions.length) return;

    const emissionMesh = (this.butterflyEmissionMesh = new ModelMesh(engine, "Oasis butterfly emission points"));
    emissionMesh.setPositions(positions);
    emissionMesh.setNormals(positions.map(() => new Vector3(0, 1, 0)));
    BoundingBox.fromPoints(positions, emissionMesh.bounds);
    emissionMesh.uploadData(false);
    const shape = new MeshShape();
    shape.mesh = emissionMesh;

    // 6-quad hinged 2-wing butterfly plane in XZ (thorax along Z, left/right wings along +-X).
    const wingMesh = (this.butterflyWingMesh = new ModelMesh(engine, "Butterfly wing mesh"));
    const cols = [-0.5, -0.32, -0.14, 0.0, 0.14, 0.32, 0.5];
    const rows = [-0.5, 0.5];
    const meshPositions: Vector3[] = [];
    const meshUVs: Vector2[] = [];
    for (const rz of rows) {
      for (const cx of cols) {
        meshPositions.push(new Vector3(cx, 0, rz));
        meshUVs.push(new Vector2(cx + 0.5, 0.5 - rz));
      }
    }
    const indices = new Uint16Array((cols.length - 1) * 6);
    let write = 0;
    for (let c = 0; c < cols.length - 1; c++) {
      const i0 = c;
      const i1 = c + 1;
      const i2 = cols.length + c;
      const i3 = cols.length + c + 1;
      indices[write++] = i0;
      indices[write++] = i2;
      indices[write++] = i1;
      indices[write++] = i1;
      indices[write++] = i2;
      indices[write++] = i3;
    }
    wingMesh.setPositions(meshPositions);
    wingMesh.setUVs(meshUVs);
    wingMesh.setIndices(indices);
    wingMesh.addSubMesh(0, indices.length);
    wingMesh.bounds.min.set(-0.65, -0.65, -0.65);
    wingMesh.bounds.max.set(0.65, 0.65, 0.65);
    wingMesh.uploadData(false);

    const shader = Shader.find("Planning/ButterflyParticle") ?? Shader.create(butterflyShader);
    const material = (this.butterflyMaterial = new ParticleMaterial(engine, shader));
    material.name = "Oasis ambient butterflies";
    material.renderFace = RenderFace.Double;
    material.blendMode = BlendMode.Normal;
    material.shaderData.setInt("sourceColorBlendFactor", BlendFactor.One);
    material.shaderData.setInt("destinationColorBlendFactor", BlendFactor.OneMinusSourceAlpha);
    material.shaderData.setInt("depthTestEnabled", 1);
    material.shaderData.setInt("depthWriteEnabled", 0);
    material.shaderData.setFloat("material_FlapSpeed", butterflies.flapSpeed);
    material.shaderData.setFloat("material_FlapAngleMin", -0.62);
    material.shaderData.setFloat("material_FlapAngleMax", 1.12);
    material.shaderData.setFloat("material_HdrIntensity", butterflies.emissionIntensity);
    material.baseTexture = texture;
    const [r, g, b] = templateLinearColor(butterflies.color);
    material.baseColor = new Color(r * butterflies.intensity, g * butterflies.intensity, b * butterflies.intensity, 1);

    const renderer = (this.butterflyRenderer = this.root
      .createChild("Oasis butterflies")
      .addComponent(ParticleRenderer));
    renderer.renderMode = ParticleRenderMode.Mesh;
    renderer.mesh = wingMesh;
    renderer.setMaterial(material);
    renderer.castShadows = renderer.receiveShadows = false;

    const generator = renderer.generator;
    const main = generator.main;
    generator.randomSeed = seed ^ 0x5bf03635;
    main.playOnEnabled = false;
    main.isLoop = true;
    main.duration = butterflies.lifetimeSeconds;
    main.maxParticles = butterflies.count;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startSpeed = new ParticleCompositeCurve(0.18, 0.52);
    main.startSize = new ParticleCompositeCurve(...butterflies.sizeM);
    main.startLifetime = new ParticleCompositeCurve(
      butterflies.lifetimeSeconds * 0.8,
      butterflies.lifetimeSeconds * 1.2
    );
    main.gravityModifier.constant = 0;
    main.startRotation3D = true;
    main.startRotationX = new ParticleCompositeCurve(-26, 26);
    main.startRotationY = new ParticleCompositeCurve(0, 360);
    main.startRotationZ = new ParticleCompositeCurve(-16, 16);

    generator.emission.shape = shape;
    generator.emission.rateOverTime.constant = butterflies.count / butterflies.lifetimeSeconds;

    generator.velocityOverLifetime.enabled = true;
    generator.velocityOverLifetime.space = ParticleSimulationSpace.World;
    generator.velocityOverLifetime.velocityX = new ParticleCompositeCurve(-0.42, 0.42);
    generator.velocityOverLifetime.velocityY = new ParticleCompositeCurve(-0.16, 0.24);
    generator.velocityOverLifetime.velocityZ = new ParticleCompositeCurve(-0.42, 0.42);

    generator.noise.enabled = true;
    generator.noise.strengthX.constant = butterflies.flutterMps;
    generator.noise.frequency = 1 / butterflies.flutterWavelengthM;
    generator.noise.scrollSpeed = butterflies.flutterMps / butterflies.flutterWavelengthM;

    generator.rotationOverLifetime.enabled = true;
    generator.rotationOverLifetime.separateAxes = true;
    generator.rotationOverLifetime.rotationX = new ParticleCompositeCurve(-18, 18);
    generator.rotationOverLifetime.rotationY = new ParticleCompositeCurve(
      -butterflies.turnDegreesPerSecond,
      butterflies.turnDegreesPerSecond
    );
    generator.rotationOverLifetime.rotationZ = new ParticleCompositeCurve(-18, 18);

    generator.colorOverLifetime.enabled = true;
    const white = new Color(1, 1, 1, 1);
    generator.colorOverLifetime.color = new ParticleCompositeGradient(
      new ParticleGradient(
        [new GradientColorKey(0, white), new GradientColorKey(1, white)],
        [
          new GradientAlphaKey(0, 0),
          new GradientAlphaKey(0.12, 1),
          new GradientAlphaKey(0.86, 1),
          new GradientAlphaKey(1, 0)
        ]
      )
    );
    generator.play(false);
    generator.emit(Math.ceil(butterflies.count * 0.78));
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
  private attachFoliageBoughWindMesh(sourceMesh: ModelMesh, crownBounds: BoundingBox): BufferMesh | undefined {
    if (sourceMesh.blendShapeCount !== 0 || sourceMesh.subMeshes.length === 0) return undefined;
    const posElem = sourceMesh.vertexElements.find(
      (elem) => elem.semantic === "POSITION" && elem.format === VertexElementFormat.Vector3
    );
    if (!posElem) return undefined;
    const posBinding = sourceMesh.vertexBufferBindings[posElem.bindingIndex];
    const vertexCount = sourceMesh.vertexCount;
    if (!posBinding || vertexCount <= 0) return undefined;

    const cachedCpuData =
      (posBinding.buffer as unknown as { _data?: ArrayBufferView; data?: ArrayBufferView })._data ??
      (posBinding.buffer as unknown as { data?: ArrayBufferView }).data;
    let rawBytes: Uint8Array;
    if (cachedCpuData) {
      rawBytes = new Uint8Array(cachedCpuData.buffer, cachedCpuData.byteOffset, cachedCpuData.byteLength);
    } else {
      rawBytes = new Uint8Array(posBinding.buffer.byteLength);
      posBinding.buffer.getData(rawBytes);
    }
    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const stride = posBinding.stride;
    const positions = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      const byteOffset = posElem.offset + i * stride;
      positions[i * 3] = view.getFloat32(byteOffset, true);
      positions[i * 3 + 1] = view.getFloat32(byteOffset + 4, true);
      positions[i * 3 + 2] = view.getFloat32(byteOffset + 8, true);
    }

    const crownMin = crownBounds.min;
    const crownMax = crownBounds.max;
    const spanX = Math.max(1e-4, crownMax.x - crownMin.x);
    const spanY = Math.max(1e-4, crownMax.y - crownMin.y);
    const spanZ = Math.max(1e-4, crownMax.z - crownMin.z);
    const maxSpan = Math.max(spanX, spanY, spanZ);

    // Group vertices into connected leaf/flower cards so no triangle ever shears across bough cells.
    const parent = Int32Array.from({ length: vertexCount }, (_, idx) => idx);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    let indices: Uint8Array | Uint16Array | Uint32Array | null = null;
    try {
      indices = sourceMesh.getIndices();
    } catch {
      indices = null;
    }
    const weldScale = 1 / Math.max(1e-6, maxSpan * (indices ? 1e-4 : 0.015));
    const welded = new Map<string, number>();
    for (let i = 0; i < vertexCount; i++) {
      const key = `${Math.round(positions[i * 3] * weldScale)},${Math.round(positions[i * 3 + 1] * weldScale)},${Math.round(positions[i * 3 + 2] * weldScale)}`;
      const prev = welded.get(key);
      if (prev !== undefined) union(i, prev);
      else welded.set(key, i);
    }
    if (indices) {
      for (let t = 0; t + 2 < indices.length; t += 3) {
        union(indices[t], indices[t + 1]);
        union(indices[t + 1], indices[t + 2]);
      }
    }

    const cardSums = new Map<number, [number, number, number, number]>();
    for (let i = 0; i < vertexCount; i++) {
      const root = find(i);
      let acc = cardSums.get(root);
      if (!acc) {
        acc = [0, 0, 0, 0];
        cardSums.set(root, acc);
      }
      acc[0] += positions[i * 3];
      acc[1] += positions[i * 3 + 1];
      acc[2] += positions[i * 3 + 2];
      acc[3] += 1;
    }

    // Coarse 4x3x4 crown bough grid so all blossoms on one bough sway coherently together.
    const GX = 4;
    const GY = 3;
    const GZ = 4;
    const cellX = spanX / GX;
    const cellY = spanY / GY;
    const cellZ = spanZ / GZ;
    const trunkX = (crownMin.x + crownMax.x) * 0.5;
    const trunkZ = (crownMin.z + crownMax.z) * 0.5;
    const radialSpan = Math.max(spanX, spanZ) * 0.5;

    const cardBoughData = new Map<
      number,
      readonly [px: number, py: number, pz: number, hx: number, hy: number, hz: number, w: number]
    >();
    for (const [root, [sx, sy, sz, count]] of cardSums) {
      const cx = sx / count;
      const cy = sy / count;
      const cz = sz / count;
      const gx = Math.min(GX - 1, Math.max(0, Math.floor((cx - crownMin.x) / cellX)));
      const gy = Math.min(GY - 1, Math.max(0, Math.floor((cy - crownMin.y) / cellY)));
      const gz = Math.min(GZ - 1, Math.max(0, Math.floor((cz - crownMin.z) / cellZ)));
      const lx = crownMin.x + (gx + 0.5) * cellX;
      const lz = crownMin.z + (gz + 0.5) * cellZ;
      const rx = lx - trunkX;
      const rz = lz - trunkZ;
      const rLen = Math.hypot(rx, rz);
      const stepBack = rLen > 1e-5 ? Math.min(rLen, Math.hypot(cellX, cellZ) * 0.45) : 0;
      const pivotX = rLen > 1e-5 ? lx - (rx / rLen) * stepBack : lx;
      const pivotY = crownMin.y + (gy + 0.2) * cellY;
      const pivotZ = rLen > 1e-5 ? lz - (rz / rLen) * stepBack : lz;
      const hx = rLen > 1e-5 ? -rz / rLen : 1;
      const hz = rLen > 1e-5 ? rx / rLen : 0;
      const w = Math.min(1, rLen / Math.max(1e-4, radialSpan)) * 0.35;
      cardBoughData.set(root, [pivotX, pivotY, pivotZ, hx, 0, hz, w]);
    }

    const FLOATS_PER_VERTEX = 15;
    const windValues = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
    for (let i = 0; i < vertexCount; i++) {
      const [px, py, pz, hx, hy, hz, w] = cardBoughData.get(find(i))!;
      const offset = i * FLOATS_PER_VERTEX;
      windValues[offset] = px;
      windValues[offset + 1] = py;
      windValues[offset + 2] = pz;
      windValues[offset + 3] = px;
      windValues[offset + 4] = py;
      windValues[offset + 5] = pz;
      windValues[offset + 6] = 1;
      windValues[offset + 11] = hx;
      windValues[offset + 12] = hy;
      windValues[offset + 13] = hz;
      windValues[offset + 14] = w;
    }

    const engine = sourceMesh.engine;
    const windBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, windValues, BufferUsage.Static);
    const windMesh = new BufferMesh(engine, `${sourceMesh.name} · foliage wind`);
    try {
      sourceMesh.vertexBufferBindings.forEach((binding, index) => {
        if (binding) windMesh.setVertexBufferBinding(binding, index);
      });
      const windBindingIndex = sourceMesh.vertexBufferBindings.length;
      windMesh.setVertexBufferBinding(windBuffer, FLOATS_PER_VERTEX * 4, windBindingIndex);
      windMesh.setVertexElements([
        ...sourceMesh.vertexElements,
        new VertexElement("LEAF_PIVOT", 0, VertexElementFormat.Vector3, windBindingIndex),
        new VertexElement("TREE_VARIATION_ROOT", 12, VertexElementFormat.Vector4, windBindingIndex),
        new VertexElement("TREE_VARIATION_DATA", 28, VertexElementFormat.Vector4, windBindingIndex),
        new VertexElement("PLANT_WIND", 44, VertexElementFormat.Vector4, windBindingIndex)
      ]);
      const sourceIndexBinding = (sourceMesh as unknown as { _primitive: { indexBufferBinding?: IndexBufferBinding } })
        ._primitive.indexBufferBinding;
      if (sourceIndexBinding) windMesh.setIndexBufferBinding(sourceIndexBinding);
      for (const sub of sourceMesh.subMeshes) windMesh.addSubMesh(sub.start, sub.count, sub.topology);
      const pad = maxSpan * 0.12;
      windMesh.bounds.min.set(
        sourceMesh.bounds.min.x - pad,
        sourceMesh.bounds.min.y - pad,
        sourceMesh.bounds.min.z - pad
      );
      windMesh.bounds.max.set(
        sourceMesh.bounds.max.x + pad,
        sourceMesh.bounds.max.y + pad,
        sourceMesh.bounds.max.z + pad
      );
      this.foliageWindDisposals.push(() => {
        windMesh.destroy();
        windBuffer.destroy(true);
      });
      return windMesh;
    } catch (error) {
      windMesh.destroy();
      windBuffer.destroy(true);
      throw error;
    }
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
    const foliageRenderers = model
      .getComponentsIncludeChildren(MeshRenderer, [])
      .filter((renderer) => renderer.getMaterials().some((mat) => mat && requested.has(mat.name)));
    const crownBounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    for (const renderer of foliageRenderers) {
      if (renderer.mesh) BoundingBox.merge(crownBounds, renderer.mesh.bounds, crownBounds);
    }
    const crownHeight = Number.isFinite(crownBounds.max.y) ? Math.max(0.1, crownBounds.max.y) : 1;
    const crownKey = Number.isFinite(crownBounds.min.x)
      ? [
          crownBounds.min.x,
          crownBounds.min.y,
          crownBounds.min.z,
          crownBounds.max.x,
          crownBounds.max.y,
          crownBounds.max.z
        ]
          .map((v) => v.toFixed(5))
          .join(",")
      : "";

    for (const renderer of foliageRenderers) {
      let hasBoughWind = false;
      if (renderer.mesh instanceof ModelMesh && crownKey) {
        const cacheKey = `${renderer.mesh.instanceId}:${crownKey}`;
        let wrapped = this.boughWindMeshes.get(cacheKey);
        if (!this.boughWindMeshes.has(cacheKey)) {
          wrapped = this.attachFoliageBoughWindMesh(renderer.mesh, crownBounds);
          this.boughWindMeshes.set(cacheKey, wrapped);
        }
        if (wrapped) {
          renderer.mesh = wrapped;
          configureAssetAssemblyRendererInstance(renderer);
          hasBoughWind = true;
        }
      }
      renderer.getMaterials().forEach((source, index) => {
        if (!source || !requested.has(source.name)) return;
        if (!(source instanceof PBRMaterial)) throw new Error(`Template foliage slot requires PBR: ${source.name}`);
        found.add(source.name);
        const color = node.assetLeafColor
          ? new Color(...templateLinearColor(node.assetLeafColor), source.baseColor.a)
          : source.baseColor;
        const key = JSON.stringify([
          source.instanceId,
          color.r,
          color.g,
          color.b,
          color.a,
          intensity,
          textureBlend,
          hasBoughWind
        ]);
        let material = this.leafMaterials.get(key);
        if (!material) {
          material = template.clone();
          this.leafMaterials.set(key, material);
          material.name = `${source.name} · shared foliage lighting`;
          const data = material.shaderData;
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
          if (hasBoughWind) {
            configureProceduralPlantWindMaterial(material, true);
            data.setFloat("material_ProceduralTreeHeight", crownHeight);
            // Smooth bough-coherent sway (0.36 Hz ~ 2.8s period) matching the procedural flowers/grass.
            data.setVector4("material_ProceduralTreeWindParams", new Vector4(0.01, 0.26, 0.048, 0.36));
          }
          data.setFloat("material_GrassDistanceFadeEnable", 0);
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
      butterflies: this.butterflyRenderer
        ? {
            renderer: "ParticleRenderer",
            renderMode: "Mesh",
            shader: this.butterflyMaterial!.shader.name,
            capacity: this.butterflyRenderer.generator.main.maxParticles,
            active: this.butterflyRenderer.generator.isAlive,
            flapSpeed: this.butterflyMaterial!.shaderData.getFloat("material_FlapSpeed"),
            sizeM: [
              this.butterflyRenderer.generator.main.startSize.constantMin,
              this.butterflyRenderer.generator.main.startSize.constantMax
            ],
            gpuSimulation: this.butterflyRenderer.shaderData
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
      placeholders: this.geometry.nodes.filter((node) => !node.assetUrl).map((node) => node.id),
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
    this.root.destroy();
    this.leafMaterials.forEach((material) => material.destroy());
    this.leafMaterials.clear();
    this.assetMaterials.forEach((material) => material.destroy());
    this.assetMaterials.clear();
    this.sporeMaterial?.destroy();
    this.sporeTexture?.destroy();
    this.sporeEmissionMesh?.destroy();
    for (const destroy of this.foliageWindDisposals) destroy();
    this.foliageWindDisposals.length = 0;
    this.boughWindMeshes.clear();
    this.disposeProceduralPlants?.();
    this.petalMaterial?.destroy();
    this.butterflyMaterial?.destroy();
    this.butterflyWingMesh?.destroy();
    this.butterflyEmissionMesh?.destroy();
    this.material?.destroy();
    this.mesh?.destroy();
  }
}
