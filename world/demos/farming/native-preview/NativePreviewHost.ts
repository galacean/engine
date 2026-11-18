import { planeSurfaceTriangles } from "@galacean/engine-farming/farming/geometry/SurfaceTriangles";
import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  type Engine,
  Entity,
  MeshRenderer,
  PBRMaterial,
  PrefabResource,
  PrimitiveMesh,
  Scene,
  Script,
  Vector3
} from "@galacean/engine";
import {
  FarmingAPI,
  FarmingAreaComponent,
  FarmingSystem,
  createFarmingAgentPackage,
  createFarmingResources,
  farmingAreaComponentData,
  registerNativeFarming,
  serializeFarmingResource,
  type FarmingAreaConfiguration,
  farmingCatalog
} from "@galacean/engine-farming/farming/native/index";
import {
  ManualFarmClock,
  type FarmingDefinitionSet,
  type FarmingGroundProvider,
  type FarmSnapshot
} from "@galacean/engine-farming/farming/api/index";
import { plantingCatalog } from "@galacean/engine-farming/farming/content/DefaultPlantingCatalog";
import { FARMING_SIMULATION_CONFIG } from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";
import { PlantPresenter } from "@galacean/engine-farming/farming/presentation/PlantPresenter";
import { cropRenderState } from "@galacean/engine-farming/farming/presentation/PlantRenderState";
import { FarmItemPresentation } from "@galacean/engine-farming/farming/presentation/FarmItemPresentation";
import { FarmingItemInteraction } from "@galacean/engine-farming/farming/application/FarmingItemInteraction";

// This host owns geometry and time. Neither the native API nor its resources import a demo class.
const water = FARMING_SIMULATION_CONFIG.water;
const definitions: FarmingDefinitionSet = {
  version: 1,
  catalog: plantingCatalog,
  soilProfile: {
    id: "native-loam",
    version: 2,
    maximumMoistureUnits: water.capacity,
    minimumMoistureUnits: water.minimumMoisture,
    wiltingPointUnits: water.wiltingPoint,
    evaporationSlowdownThresholdUnits: water.evaporationSlowdownThreshold,
    fieldCapacityUnits: water.fieldCapacity,
    initialMoistureUnits: water.initialMoisture,
    wateringUnitsPerAction: water.wateringAmount,
    evaporationUnitsPerMinute: water.evaporationPerMinute,
    initialPhTenths: 65
  },
  environmentProfile: { initialAirTemperatureTenths: 240, initialLightUnits: 75 },
  actionPolicy: { allowIrrigateEmptyPlot: true },
  seeds: plantingCatalog.crops.map((crop) => ({
    id: `${crop.id}-seed`,
    cropId: crop.id,
    name: `${crop.name}种子`,
    description: `播种 ${crop.name}`
  }))
};
export const previewGround: FarmingGroundProvider = {
  capture: () => ({
    revision: 1,
    surfaceTriangles: (_id, bounds) => planeSurfaceTriangles(bounds),
    sample: (groundId, x, z) =>
      groundId === "native-ground" ? { position: [x, 0, z], normal: [0, 1, 0], surface: "soil" } : null,
    inspectBounds: (groundId) => ({
      covered: groundId === "native-ground",
      maximumSlopeDegrees: 0,
      surfaces: ["soil"],
      blocked: false,
      underwater: false
    }),
    raycast: () => null
  }),
  subscribe: () => () => {}
};
class PreviewFrame extends Script {
  tick?: () => void;
  onUpdate(): void {
    this.tick?.();
  }
}
export class NativePreviewHost {
  readonly clock = new ManualFarmClock(1_000_000);
  scene!: Scene;
  system!: FarmingSystem;
  area!: FarmingAreaComponent;
  api!: FarmingAPI;
  items!: FarmItemPresentation;
  presenter!: PlantPresenter;
  selectedPlotId = "native-ground/x0z0";
  onChange?: () => void;
  private releases: (() => void)[] = [];
  private urls: string[] = [];
  private fileId = 0;
  private readonly lifetime = new AbortController();
  private ownedResources?: ReturnType<typeof createFarmingResources>;
  private restoreTask?: Promise<void>;
  private pendingSystem?: FarmingSystem;
  private disposeTask?: Promise<void>;
  constructor(readonly engine: Engine) {}
  async initialize(): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    if (this.system) throw new Error("Native preview is already initialized");
    registerNativeFarming();
    this.scene = this.engine.sceneManager.activeScene ?? new Scene(this.engine);
    this.engine.sceneManager.activeScene = this.scene;
    this.system = this.scene.createRootEntity("Farming System").addComponent(FarmingSystem);
    this.system.configureRuntime(() => ({
      groundProvider: previewGround,
      clock: this.clock
    }));
    const resources = (this.ownedResources = createFarmingResources(this.engine, definitions));
    this.area = this.scene.createRootEntity("Native Farming Area").addComponent(FarmingAreaComponent);
    await this.area.configure({
      farmId: "native-preview",
      layoutId: "native-grid",
      layoutVersion: 1,
      ...resources,
      plots: [0, 1, 2].map((cellX) => ({
        id: `native-ground/x${cellX}z0`,
        label: `耕地 ${cellX + 1}`,
        target: { groundId: "native-ground", cellX, cellZ: 0 }
      }))
    });
    this.lifetime.signal.throwIfAborted();
    this.api = new FarmingAPI(this.system);
    this.bindVisuals();
  }
  private bindVisuals(): void {
    const root = this.scene.createRootEntity("Preview Host");
    const camera = root.createChild("Camera").addComponent(Camera);
    camera.entity.transform.setPosition(5, 4, 6);
    camera.entity.transform.lookAt(new Vector3(1.9, 0.7, 0.6));
    camera.fieldOfView = 48;
    const light = root.createChild("Sun").addComponent(DirectLight);
    light.entity.transform.setRotation(-45, -30, 0);
    light.color.set(1.2, 1.2, 1.2, 1);
    this.scene.ambientLight.diffuseSolidColor.set(0.6, 0.65, 0.55, 1);
    this.scene.background.solidColor.set(0.16, 0.23, 0.2, 1);
    const material = new PBRMaterial(this.engine);
    material.baseColor = new Color(0.31, 0.22, 0.13, 1);
    material.roughness = 1;
    const mesh = PrimitiveMesh.createCuboid(this.engine, 1.12, 0.08, 1.12);
    const mounts = new Map<string, Entity>();
    for (const plot of this.area.service.queryPlots()) {
      const mount = root.createChild(plot.plotId);
      mount.transform.setPosition(...plot.position!);
      mounts.set(plot.plotId, mount);
      const soil = mount.createChild("Soil");
      soil.transform.setPosition(0, -0.045, 0);
      const renderer = soil.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
    }
    this.presenter = new PlantPresenter(
      this.engine,
      farmingCatalog(this.area.configuration!.catalog).catalog,
      (state) => mounts.get(this.area.service.getSnapshot().crops[state.instanceId]?.anchorPlotId ?? "")
    );
    this.items = new FarmItemPresentation(root, camera, this.area.service);
    this.area.coordinator.presentation = {
      prepare: (input, signal) => this.items.prepareUse(input.type === "irrigate" ? 1.1 : 0.4, signal),
      itemCommitted: async (input, _receipt, signal) => {
        if (input.type === "pickup-item" || input.type === "place-item") await this.items.waitForMotion(signal);
      },
      finish: () => this.items.setUsing(false),
      cancel: () => this.items.setUsing(false),
      getTarget: () => ({ plotId: this.selectedPlotId, ground: null })
    };
    const sync = (snapshot: FarmSnapshot) => {
      this.presenter.sync(
        Object.values(snapshot.crops).map((crop) =>
          cropRenderState(farmingCatalog(this.area.configuration!.catalog).catalog, crop)
        )
      );
      this.onChange?.();
    };
    sync(this.area.service.getSnapshot());
    const input = new FarmingItemInteraction({
      canvas: document.getElementById("canvas") as HTMLCanvasElement,
      camera,
      service: this.area.service,
      coordinator: this.area.coordinator,
      isStorageContainerVisible: (id) => this.area.storagePresenter?.isContainerVisible(id) ?? false,
      ground: previewGround,
      definitions,
      presentation: {
        items: this.items,
        setTarget: (target) => {
          this.selectedPlotId = target.plotId ?? "";
        }
      },
      isEnabled: () => true
    });
    this.releases.push(() => input.dispose());
    this.releases.push(
      this.area.service.subscribe(({ snapshot, changes }) => {
        for (const change of changes)
          if (change.kind === "crop-harvested" || change.kind === "crop-removed")
            this.presenter.harvest(change.cropInstanceId);
        sync(snapshot);
      })
    );
    const frame = root.addComponent(PreviewFrame);
    frame.tick = () => {
      this.items.update(this.engine.time.deltaTime);
      this.presenter.update(performance.now(), () => 0);
    };
    this.releases.push(() => {
      this.items.dispose();
      this.presenter.dispose();
      root.destroy();
      mesh.destroy();
      material.destroy();
    });
  }
  async advance(elapsedMs: number): Promise<void> {
    this.clock.advanceBy(elapsedMs);
    await this.area.service.checkpoint();
  }
  async sceneFile() {
    const resources: import("@galacean/engine-core").JSONAsset[] = [];
    const component = await farmingAreaComponentData(this.area, (resource) => {
      let index = resources.indexOf(resource);
      if (index < 0) {
        index = resources.length;
        resources.push(resource);
      }
      return index;
    });
    const refs = resources.map((resource, i) => {
      const virtualPath = `Farming/NativePreview/${this.fileId}/${i}.json`;
      this.engine.resourceManager.registerVirtualResources([
        {
          virtualPath,
          path: this.blob(serializeFarmingResource(resource)),
          type: "JSON"
        }
      ]);
      return { url: virtualPath };
    });
    this.fileId++;
    return {
      version: "2.0",
      refs,
      entities: [
        { name: "Farming System", components: [0] },
        { name: "Native Farming Area", components: [1] }
      ],
      components: [{ type: "FarmingSystem", props: { cropGrowthMultiplier: this.system.cropGrowthMultiplier } }, component],
      scene: {
        rootEntities: [0, 1],
        background: { mode: 0, color: [0.16, 0.23, 0.2, 1] }
      }
    };
  }
  private async loadScene(file: Awaited<ReturnType<NativePreviewHost["sceneFile"]>>): Promise<{
    scene: Scene;
    system: FarmingSystem;
    area: FarmingAreaComponent;
    api: FarmingAPI;
  }> {
    const scene = await this.engine.resourceManager.load<Scene>({
      type: AssetType.Scene,
      url: this.blob(JSON.stringify(file))
    });
    const system = scene.getRootEntity(0)?.getComponent(FarmingSystem);
    try {
      this.lifetime.signal.throwIfAborted();
      if (!system) throw new Error("Native preview Scene requires a FarmingSystem root");
      this.pendingSystem = system;
      system.configureRuntime(() => ({
        groundProvider: previewGround,
        clock: this.clock
      }));
      const area = scene.getRootEntity(1)?.getComponent(FarmingAreaComponent);
      if (!area) throw new Error("Native preview Scene requires a FarmingAreaComponent root");
      area.start();
      await area.ready;
      this.lifetime.signal.throwIfAborted();
      return { scene, system, area, api: new FarmingAPI(system) };
    } catch (error) {
      try {
        await system?.dispose();
      } finally {
        scene.destroy();
      }
      throw error;
    } finally {
      this.pendingSystem = undefined;
    }
  }
  async restore(file: Awaited<ReturnType<NativePreviewHost["sceneFile"]>>): Promise<void> {
    this.lifetime.signal.throwIfAborted();
    if (this.restoreTask) throw new Error("Native preview restore already in progress");
    const task = (this.restoreTask = this.restoreScene(file));
    try {
      await task;
    } finally {
      this.restoreTask = undefined;
    }
  }
  private async restoreScene(file: Awaited<ReturnType<NativePreviewHost["sceneFile"]>>): Promise<void> {
    const loaded = await this.loadScene(file);
    try {
      await this.system.dispose();
      this.lifetime.signal.throwIfAborted();
      this.releaseVisuals();
      this.releaseOwnedResources();
      const old = this.scene;
      this.engine.sceneManager.activeScene = loaded.scene;
      this.scene = loaded.scene;
      this.system = loaded.system;
      this.area = loaded.area;
      this.api = loaded.api;
      old.destroy();
      this.bindVisuals();
    } finally {
      if (this.scene !== loaded.scene) {
        try {
          await loaded.system.dispose();
        } finally {
          loaded.scene.destroy();
        }
      }
    }
  }
  async loadPrefab(file: Awaited<ReturnType<NativePreviewHost["sceneFile"]>>): Promise<PrefabResource> {
    return this.engine.resourceManager.load<PrefabResource>({
      type: AssetType.Prefab,
      url: this.blob(
        JSON.stringify({
          version: "2.0",
          refs: file.refs,
          entities: [{ name: "Native Farming Prefab", components: [0] }],
          components: [file.components[1]],
          root: 0
        })
      )
    });
  }
  get agentPackage() {
    return createFarmingAgentPackage(this.api);
  }
  private blob(text: string): string {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    this.urls.push(url);
    return url;
  }
  private releaseVisuals(): void {
    for (const release of this.releases.splice(0)) release();
  }
  private releaseOwnedResources(): void {
    this.ownedResources?.catalog.destroy();
    this.ownedResources?.rules.destroy();
    this.ownedResources = undefined;
  }
  dispose(): Promise<void> {
    if (this.disposeTask) return this.disposeTask;
    this.lifetime.abort();
    const runningSystem = this.system;
    const loadingSystem = this.pendingSystem;
    return (this.disposeTask = (async () => {
      const [system, pending] = await Promise.allSettled([
        Promise.resolve().then(() => runningSystem?.dispose()),
        Promise.resolve().then(() => loadingSystem?.dispose()),
        this.restoreTask
      ]);
      try {
        this.releaseVisuals();
      } finally {
        this.releaseOwnedResources();
        for (const url of this.urls.splice(0)) URL.revokeObjectURL(url);
      }
      if (system.status === "rejected") throw system.reason;
      if (pending.status === "rejected") throw pending.reason;
    })());
  }
}
