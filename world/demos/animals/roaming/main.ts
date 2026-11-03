import {
  AssetType,
  BoundingBox,
  Camera,
  CollisionUtil,
  Color,
  DiffuseMode,
  DirectLight,
  GLTFResource,
  MeshRenderer,
  ModelMesh,
  MeshTopology,
  UnlitMaterial,
  PrimitiveMesh,
  Ray,
  Script,
  ShadowType,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { GroundAnimalCrowd } from "@galacean/engine-animals/gameplay/animal/GroundAnimalCrowd";
import type { AnimalPreviewLighting } from "../application/AnimalPreviewLighting.ts";
import { animalCollisionRadius } from "../application/AnimalAssetCatalog.ts";
import { AnimalSystem } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import { ProceduralAnimalAssets } from "@galacean/engine-animals/gameplay/animal/ProceduralAnimalPresenter";
import { ConfiguredAnimal } from "../application/ConfiguredAnimal.ts";
import { AnimalActivity } from "@galacean/engine-animals/gameplay/animal/AnimalRegistration";
import { registerAnimalCatalog } from "../application/RegisteredAnimalCatalog.ts";
import { AnimalDemoHabitats } from "../application/AnimalDemoHabitats.ts";
import { AnimalDemoWorld } from "../application/AnimalDemoWorld.ts";
import type { AnimalTaskRequest } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import { buildCatalog, type AssetAudit, type AnimalAsset } from "./catalog.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const status = $("status");
const select = $<HTMLSelectElement>("asset");
const clips = $<HTMLSelectElement>("clip");
const timeline = $<HTMLInputElement>("timeline");

class PreviewScene extends Script {
  readonly system = new AnimalSystem();
  readonly crowd = new GroundAnimalCrowd();
  private readonly stopCrowd = this.system.addMotionStep((dt) => this.crowd.advance(dt));
  readonly animals: ConfiguredAnimal[] = [];
  paused = true;
  timeScale = 1;
  refresh = () => {};
  afterMotion = () => {};
  readonly frameTimes: number[] = [];
  systemMilliseconds = 0;
  private sampleIndex = 0;
  private refreshTime = 0;
  override onUpdate(seconds: number): void {
    this.frameTimes[this.sampleIndex++ % 300] = seconds * 1000;
    const begin = performance.now();
    this.system.update(this.paused ? 0 : Math.min(seconds, 0.1) * this.timeScale);
    this.afterMotion();
    this.systemMilliseconds = this.systemMilliseconds * 0.95 + (performance.now() - begin) * 0.05;
    this.refreshTime += seconds;
    if (this.refreshTime > 0.1) {
      this.refreshTime = 0;
      this.refresh();
    }
  }
  override onDestroy(): void {
    for (const animal of this.animals) animal.dispose();
    this.stopCrowd();
    this.system.dispose();
  }
}

void boot().catch((error: unknown) => {
  status.textContent = `初始化失败：${error instanceof Error ? error.message : String(error)}`;
  console.error("[animal-preview]", error);
});

async function boot(): Promise<void> {
  const packBase = new URL(document.body.dataset.assetBase ?? ".", location.href);
  const packFile = (name: string) => new URL(`./${name}.json`, packBase);
  const [audit, configuration, registrationSource] = await Promise.all([
    fetch(packFile("audit")).then((r) => {
      if (!r.ok) throw Error("素材检查数据加载失败");
      return r.json() as Promise<{ assets: AssetAudit[] }>;
    }),
    fetch(packFile("animals")).then((r) => {
      if (!r.ok) throw Error("动物配置加载失败");
      return r.json() as Promise<unknown>;
    }),
    fetch(packFile("registrations")).then((r) => {
      if (!r.ok) throw Error("动物枚举注册配置加载失败");
      return r.json() as Promise<unknown>;
    })
  ]);
  const catalog = buildCatalog(audit.assets, configuration);
  const registered = registerAnimalCatalog(registrationSource, catalog.map((entry) => entry.config!));
  const behaviorCatalog = registered.behaviors;
  const habitats = registered ? new AnimalDemoHabitats() : undefined;
  const spawnPositions =
    habitats && registered
      ? habitats.spawnAll(
          catalog.map((entry) => {
            const model = registered.registrations.models.find((m) => m.assetId === entry.id)!;
            return {
              id: entry.id,
              species: registered.registrations.species[model.species],
              radius: animalCollisionRadius(entry.config!)
            };
          })
        )
      : undefined;
  const world = new AnimalDemoWorld(Math.random, { minX: -34, maxX: 34, minZ: -31, maxZ: 34 }, habitats);
  $<HTMLInputElement>("food-enabled").disabled = !habitats;
  const modelRegistrations = new Map(registered?.registrations.models.map((m) => [m.assetId, m]));
  select.replaceChildren(...catalog.map((entry) => new Option(entry.name, entry.id)));
  const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  engine.canvas.setAutoResolution(Math.min(1, 1.5 / window.devicePixelRatio));
  const scene = engine.sceneManager.activeScene!;
  scene.background.solidColor.set(0.83, 0.88, 0.81, 1);
  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor.set(0.9, 0.92, 0.88, 1);
  scene.ambientLight.diffuseIntensity = 0.65;
  const root = scene.createRootEntity("Configured animated animals preview");
  const assets = new ProceduralAnimalAssets(engine);
  const ground = root.createChild("Inspection meadow");
  ground.transform.setPosition(0, -0.025, 0);
  const groundRenderer = ground.addComponent(MeshRenderer);
  groundRenderer.mesh = PrimitiveMesh.createCuboid(engine, 80, 0.05, 80);
  groundRenderer.setMaterial(assets.material("#94ad82"));
  groundRenderer.receiveShadows = false;
  const foodEntities: (typeof ground)[] = [];
  const regionLabels: { element: HTMLDivElement; point: Vector3; food?: boolean }[] = [];
  for (const region of habitats?.regions ?? []) {
    const entity = root.createChild(`Test habitat: ${region.habitat}`);
    entity.transform.setPosition((region.min[0] + region.max[0]) / 2, 0.001, (region.min[1] + region.max[1]) / 2);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(
      engine,
      region.max[0] - region.min[0],
      0.002,
      region.max[1] - region.min[1]
    );
    renderer.setMaterial(assets.material(region.color));
    const element = document.createElement("div");
    element.className = "habitat-label";
    element.textContent = `${region.name} · 测试标签`;
    $("habitat-labels").append(element);
    regionLabels.push({ element, point: new Vector3((region.min[0] + region.max[0]) / 2, 0.05, region.min[1] + 0.8) });
  }
  for (const patch of habitats?.foodPatches ?? []) {
    const entity = root.createChild("Test food");
    entity.transform.setPosition(patch.center[0], 0.004, patch.center[1]);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, patch.radius * 2, 0.003, patch.radius * 2);
    renderer.setMaterial(assets.material(patch.color));
    foodEntities.push(entity);
    const element = document.createElement("div");
    element.className = "habitat-label food-label";
    element.textContent = "可进食区域 · 测试资源";
    $("habitat-labels").append(element);
    regionLabels.push({ element, point: new Vector3(patch.center[0], 0.06, patch.center[1]), food: true });
  }
  const grid = root.createChild("One metre grid");
  const gridMesh = new ModelMesh(engine);
  const gridPoints: Vector3[] = [];
  for (let metre = -40; metre <= 40; metre++) {
    gridPoints.push(new Vector3(metre, 0.004, -40), new Vector3(metre, 0.004, 40));
    gridPoints.push(new Vector3(-40, 0.004, metre), new Vector3(40, 0.004, metre));
  }
  gridMesh.setPositions(gridPoints);
  gridMesh.addSubMesh(0, gridPoints.length, MeshTopology.Lines);
  gridMesh.uploadData(true);
  const gridMaterial = new UnlitMaterial(engine);
  gridMaterial.baseColor.set(0.48, 0.59, 0.42, 1);
  const gridRenderer = grid.addComponent(MeshRenderer);
  gridRenderer.mesh = gridMesh;
  gridRenderer.setMaterial(gridMaterial);
  const river = root.createChild("River — dry banks only");
  river.transform.setPosition(0, 0.006, -33.2);
  const riverRenderer = river.addComponent(MeshRenderer);
  riverRenderer.mesh = PrimitiveMesh.createCuboid(engine, 76, 0.018, 3.8);
  riverRenderer.setMaterial(assets.material("#79b9c1"));
  const bank = root.createChild("Dry riverbank");
  bank.transform.setPosition(0, 0.002, -31.0);
  const bankRenderer = bank.addComponent(MeshRenderer);
  bankRenderer.mesh = PrimitiveMesh.createCuboid(engine, 76, 0.01, 0.6);
  bankRenderer.setMaterial(assets.material("#ddd3ac"));
  const sun = root.createChild("Sun");
  sun.transform.setRotation(-55, -30, 0);
  const light = sun.addComponent(DirectLight);
  light.color = new Color(0.8, 0.78, 0.72, 1);
  light.shadowType = ShadowType.None;
  const cameraEntity = root.createChild("Camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 43;
  camera.nearClipPlane = 0.02;
  camera.farClipPlane = 250;
  camera.enableFrustumCulling = false;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.minDistance = 0.5;
  orbit.maxDistance = 150;
  orbit.maxPolarAngle = Math.PI * 0.48;
  let seedLighting: AnimalPreviewLighting | undefined;
  const lightingPanel = document.getElementById("seed-lighting-panel");
  if (lightingPanel) {
    const { AnimalPreviewLighting } = await import("../application/AnimalPreviewLighting.ts");
    seedLighting = new AnimalPreviewLighting(root, scene, light, camera, lightingPanel);
    seedLighting.setShadows($<HTMLInputElement>("shadows").checked);
    groundRenderer.receiveShadows = $<HTMLInputElement>("shadows").checked;
  }
  const runtime = root.addComponent(PreviewScene);
  const instances: { entry: AnimalAsset; animal: ConfiguredAnimal; label: HTMLButtonElement }[] = [];
  const resources = new Map<string, GLTFResource>();
  const appearanceSelect = document.getElementById("appearance") as HTMLSelectElement | null;
  let appearanceLoading = false;
  let selected: (typeof instances)[number] | undefined;
  let disposed = false;
  let loading = true;
  const screen = new Vector3();
  const labelPoint = new Vector3();
  const ray = new Ray();
  const box = new BoundingBox();
  const point = new Vector2();
  const failures: string[] = [];
  let following = false;
  let followedX = 0;
  let followedZ = 0;
  const canvas = $<HTMLCanvasElement>("canvas");

  runtime.afterMotion = () => {
    // Preserve depth precision for millimetre-separated inspection overlays in the distant overview.
    camera.nearClipPlane = Math.max(0.02, Vector3.distance(cameraEntity.transform.worldPosition, orbit.target) * 0.02);
    if (!following || !selected) return;
    const p = selected.animal.position;
    const dx = p.x - followedX,
      dz = p.z - followedZ;
    const cameraPosition = cameraEntity.transform.position;
    cameraEntity.transform.setPosition(cameraPosition.x + dx, cameraPosition.y, cameraPosition.z + dz);
    orbit.target.set(orbit.target.x + dx, orbit.target.y, orbit.target.z + dz);
    followedX = p.x;
    followedZ = p.z;
  };
  const frame = (focused = false): void => {
    following = focused && !!selected;
    if (selected) {
      followedX = selected.animal.position.x;
      followedZ = selected.animal.position.z;
    }
    const targets = focused && selected ? [selected] : instances;
    const envelopes = targets.map((item) => item.animal.bounds);
    if (!focused)
      envelopes.push([
        [-29, 0, -29],
        [29, 0.1, -24]
      ]);
    const min = [0, 1, 2].map((i) => (envelopes.length ? Math.min(...envelopes.map((b) => b[0][i])) : -6));
    const max = [0, 1, 2].map((i) => (envelopes.length ? Math.max(...envelopes.map((b) => b[1][i])) : 6));
    const center = new Vector3(...(min.map((v, i) => (v + max[i]) / 2) as [number, number, number]));
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.8) + (focused ? 0.6 : 3);
    const distance =
      (size /
        Math.tan((camera.fieldOfView * Math.PI) / 360) /
        Math.min(1, engine.canvas.width / engine.canvas.height)) *
      (focused ? 0.7 : 0.48);
    orbit.target.copyFrom(center);
    cameraEntity.transform.setPosition(
      center.x + distance * 0.25,
      center.y + distance * 0.68,
      center.z + distance * 0.85
    );
    cameraEntity.transform.lookAt(center);
  };
  const updateEnabled = (): void => {
    select.disabled = loading || !instances.length;
    for (const id of ["clip", "timeline", "focus", "behavior", "command-idle", "command-river"])
      $(id).toggleAttribute("disabled", !selected);
    $("view").toggleAttribute("disabled", !instances.length);
    for (const id of ["command-idle", "command-river"]) $(id).toggleAttribute("disabled", loading || !selected);
    $("thunder").toggleAttribute("disabled", loading || !instances.length);
  };
  const clipScope = document.getElementById("clip-scope") as HTMLSelectElement | null;
  const fillClips = (item: (typeof instances)[number]): void => {
    const profile = behaviorCatalog.profiles[item.entry.config!.behaviorProfile];
    const included = new Set(
      Object.values(profile.animationSlots)
        .flat()
        .map((choice) => choice.clip)
    );
    clips.replaceChildren(
      ...item.entry.config!.animations.flatMap((binding, index) => {
        if (clipScope?.value === "behavior" && !included.has(binding.id)) return [];
        const clip = item.animal.resource.animations!.find((clip) => clip.name === binding.clip)!;
        const duration = binding.range ? binding.range[1] - binding.range[0] : clip.length;
        return [
          new Option(
            `${binding.label && binding.label !== binding.clip ? binding.label + " · " : ""}${binding.clip} · ${duration.toFixed(2)} s`,
            String(index)
          )
        ];
      })
    );
    clips.value = String(item.animal.animationIndex);
    const summary = document.getElementById("semantic-summary");
    if (summary) {
      const model = modelRegistrations.get(item.entry.id)!;
      const species = registered!.registrations.species[model.species];
      const reviewed = Object.values(model.animations).filter((s) => s.evidence === "reviewed").length;
      summary.textContent = `行为候选 ${included.size} / 素材 ${item.entry.config!.animations.length} 段；人工确认 ${reviewed} 段。当前基础语义来自作者命名，其他片段仅供预览。`;
      const rules = document.getElementById("semantic-weights")!;
      rules.textContent =
        "自主行为相对权重（条件满足后参与抽选）：\n" +
        species.autonomy
          .map((r) => `${r.activity}${r.gait ? "/" + r.gait : ""}${r.posture ? "/" + r.posture : ""}: ${r.weight}`)
          .join("\n") +
        "\n同一槽内片段目前等权 1；这些是演示参数，尚未逐物种调优。明确指令直接进入对应任务，不参与这次抽签。";
    }
  };
  clipScope?.addEventListener("change", () => {
    if (selected) fillClips(selected);
  });
  const inspect = (item: (typeof instances)[number]): void => {
    selected = item;
    const { entry, animal } = item;
    const a = entry.audit!;
    select.value = entry.id;
    $("active-name").textContent = entry.name;
    if (appearanceSelect) {
      appearanceSelect.replaceChildren(...(entry.config!.appearances ?? []).map((a) => new Option(a.label, a.id)));
      appearanceSelect.value = entry.config!.appearances?.find((a) => a.modelUrl === entry.config!.modelUrl)?.id ?? "";
      appearanceSelect.disabled = appearanceLoading || !entry.config!.appearances?.length;
    }
    $("source-name").textContent = a.source;
    $("file-size").textContent = `${(a.bytes / 1048576).toFixed(2)} MiB`;
    $("triangles").textContent = a.triangles.toLocaleString();
    $("vertices").textContent = a.vertices.toLocaleString();
    $("bones").textContent = a.joints.join(" / ");
    $("dimensions").textContent = a.dimensions!.map((v) => v.toFixed(2)).join(" × ") + " m";
    $<HTMLInputElement>("animal-scale").value = String(animal.scale);
    $<HTMLInputElement>("move-speed").value = String(animal.movementMultiplier);
    $("animation-count").textContent = `${entry.config!.animations.length} 段独立动画`;
    $("textures").textContent = `${a.textures.length} 张 · ${a.textures.map((t) => t.size?.join(" × ")).join(" / ")}`;
    $("lod").textContent = "源模型 LOD0 · 本预览单档";
    $("asset-note").textContent = entry.note;
    fillClips(item);
    for (const other of instances) {
      other.label.classList.toggle("selected", other === item);
      other.label.setAttribute("aria-pressed", String(other === item));
    }
    const profile = behaviorCatalog.profiles[entry.config!.behaviorProfile];
    $("profile").textContent = JSON.stringify(
      {
        family: entry.family,
        registration: modelRegistrations.get(entry.id),
        species: registered?.registrations.species[modelRegistrations.get(entry.id)?.species ?? ""],
        animationSlots: profile.animationSlots,
        autonomous: profile.skills.idle.tree,
        reactions: profile.reactions
      },
      null,
      2
    );
    updateEnabled();
    if (following) frame(true);
    runtime.refresh();
  };
  appearanceSelect?.addEventListener("change", async () => {
    if (!selected || appearanceLoading) return;
    const item = selected;
    const choice = item.entry.config!.appearances?.find((a) => a.id === appearanceSelect.value);
    if (!choice || choice.modelUrl === item.entry.config!.modelUrl) return;
    appearanceLoading = true;
    appearanceSelect.disabled = true;
    status.textContent = `正在切换 ${choice.label}…`;
    let replacement: GLTFResource | undefined;
    const oldResource = resources.get(item.entry.id)!;
    try {
      replacement = await engine.resourceManager.load<GLTFResource>({
        url: new URL(choice.modelUrl, packBase).href,
        type: AssetType.GLTF
      });
      if (disposed) {
        replacement.destroy();
        return;
      }
      const old = item.animal,
        oldConfig = item.entry.config!;
      const position: [number, number] = [old.position.x, old.position.z];
      const heading = old.direction,
        multiplier = old.movementMultiplier,
        index = runtime.animals.indexOf(old);
      const nextConfig = { ...oldConfig, scale: old.scale, modelUrl: choice.modelUrl };
      const create = (config: typeof oldConfig, resource: GLTFResource): ConfiguredAnimal => {
        let animal: ConfiguredAnimal;
        animal = new ConfiguredAnimal(
          root,
          config,
          resource,
          runtime.system,
          position,
          behaviorCatalog.profiles[config.behaviorProfile],
          (query, event) =>
            world.resolve(
              query,
              {
                id: item.entry.id,
                index,
                origin: position,
                position: animal ? [animal.position.x, animal.position.z] : position,
                heading: animal?.direction,
                radius: animal?.traffic.radius
              },
              event
            ),
          runtime.crowd,
          heading
        );
        animal.setMovementMultiplier(multiplier);
        animal.setShadows($<HTMLInputElement>("shadows").checked);
        return animal;
      };
      // The group uses a shared conservative envelope, so replacing the occupied footprint is safe.
      old.dispose();
      try {
        item.animal = create(nextConfig, replacement);
      } catch (error) {
        item.animal = create(oldConfig, oldResource);
        runtime.animals[index] = item.animal;
        throw error;
      }
      runtime.animals[index] = item.animal;
      item.entry.config = nextConfig;
      item.entry.audit = {
        ...item.entry.audit!,
        url: choice.modelUrl,
        source: choice.source,
        bytes: choice.bytes,
        triangles: choice.triangles,
        vertices: choice.vertices,
        dimensions: choice.dimensions
      };
      resources.set(item.entry.id, replacement);
      oldResource.destroy();
      status.textContent = `${choice.label} 已切换 · 保留位置、朝向与比例 · 恢复自主闲逛`;
    } catch (error) {
      if (replacement && replacement !== resources.get(item.entry.id)) replacement.destroy();
      status.textContent = `外观切换失败：${error instanceof Error ? error.message : String(error)}`;
      console.error("[animal-appearance]", error);
    } finally {
      appearanceLoading = false;
      if (!disposed && selected) inspect(selected);
    }
  });
  runtime.refresh = (): void => {
    seedLighting?.refresh();
    const rect = canvas.getBoundingClientRect();
    if (!$("labels").hidden)
      for (const item of instances) {
        const p = item.animal.position;
        item.label.dataset.actorId = item.entry.id;
        item.label.dataset.position = JSON.stringify([p.x, p.z]);
        item.label.dataset.animation = item.animal.config.animations[item.animal.animationIndex].id;
        labelPoint.set(p.x, 0.02, p.z + 0.85);
        camera.worldToScreenPoint(labelPoint, screen);
        const x = (screen.x / engine.canvas.width) * rect.width;
        const y = (screen.y / engine.canvas.height) * rect.height;
        item.label.hidden = screen.z <= 0 || x < 0 || y < 0 || x > rect.width || y > rect.height;
        item.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`;
      }
    if (selected) {
      const animal = selected.animal;
      clips.value = String(animal.animationIndex);
      timeline.max = String(animal.duration);
      timeline.value = String(animal.time);
      $("clip-time").textContent = `${animal.time.toFixed(2)} / ${animal.duration.toFixed(2)} s`;
      const state = animal.behavior.inspect();
      const branches: Record<string, string> = { default: "默认闲置", command: "明确指令", reaction: "受惊反应" };
      const [kind, skillId] = state.branch.split(":");
      const label = behaviorCatalog.profiles[animal.config.behaviorProfile].skills[skillId]?.label ?? "手动预览";
      $("readout").textContent =
        `${animal.action} · ${animal.automatic ? `${branches[kind] ?? kind} / ${label}` : "手动预览"}`;
      const taskStatuses: Record<string, string> = {
        accepted: "已接收",
        running: "执行中",
        completed: "已完成",
        failed: "失败",
        cancelled: "已取消"
      };
      $("task-state").textContent = state.task
        ? `${behaviorCatalog.profiles[animal.config.behaviorProfile].skills[state.task.skillId].label} · ${taskStatuses[state.task.status] ?? state.task.status}`
        : "无待完成任务";
      $("reaction-state").textContent =
        state.task?.skillId === "startle"
          ? "受惊指令执行中；新指令可立即打断"
          : state.reaction
            ? "环境受惊；明确指令可立即打断"
            : "无环境反应";
      $("fallback").textContent =
        state.fallback || behaviorCatalog.profiles[animal.config.behaviorProfile].reactions.thunder.note!;
      $("trace").textContent = state.history.slice(-6).join("\n");
      const registration = modelRegistrations.get(animal.config.id);
      $("animal-definition").textContent = registration
        ? `${registration.species} · ${habitats?.region(animal.config.id)?.name} · 碰撞半径 ${animal.traffic.radius?.toFixed(2)} m${animal.traffic.blocked ? " · 等待让行" : ""}`
        : "旧素材包注册";
      $("semantic-state").textContent = registration
        ? JSON.stringify(registration.animations[animal.config.animations[animal.animationIndex].id])
        : "";
      $("clip-source").textContent = animal.config.animations[animal.animationIndex].clip;
      $("scale-value").textContent = `${animal.scale.toFixed(2)}×`;
      $("move-speed-value").textContent = `${animal.movementMultiplier.toFixed(2)}×`;
      $("move-meters").textContent =
        `${animal.movementSpeed.toFixed(2)} m/s · 转向 ${((Math.abs(animal.angularSpeed) * 180) / Math.PI).toFixed(0)}°/s · 步态 ${animal.animationRate.toFixed(2)}×`;
      $("scene-dimensions").textContent =
        aDimensions(animal)
          .map((v) => v.toFixed(2))
          .join(" × ") + " m";
    }
    $("residency").textContent =
      `GLB ${resources.size} · 实例 ${instances.length} · 系统登记 ${runtime.system.stats.animals} · 待唤醒 ${runtime.system.stats.pendingWakes}`;
    for (const { element, point, food } of regionLabels) {
      camera.worldToScreenPoint(point, screen);
      element.hidden = screen.z <= 0 || (!!food && !habitats?.foodEnabled);
      element.style.transform = `translate(${(screen.x / engine.canvas.width) * rect.width}px, ${(screen.y / engine.canvas.height) * rect.height}px) translate(-50%, -50%)`;
    }
    let feedingCount = 0;
    for (const { entry, animal } of instances)
      if (
        animal.automatic &&
        modelRegistrations.get(entry.id)?.animations[animal.config.animations[animal.animationIndex].id].activity ===
          AnimalActivity.Eat
      )
        feedingCount++;
    const feedingText = `自主进食：${feedingCount} / ${instances.length}`;
    if ($("food-activity").textContent !== feedingText) $("food-activity").textContent = feedingText;
    const samples = [...runtime.frameTimes].sort((a, b) => a - b);
    const mean = samples.reduce((sum, ms) => sum + ms, 0) / Math.max(1, samples.length);
    $("performance").textContent =
      `${(1000 / mean).toFixed(1)} FPS · p95 ${(samples[Math.floor(samples.length * 0.95)] ?? 0).toFixed(1)} ms · 模拟 ${runtime.systemMilliseconds.toFixed(2)} ms`;
    const traffic = runtime.crowd.metrics;
    $("traffic-status").textContent =
      `动态避让 ${traffic.bodies} 只 · 等待 ${traffic.blocked} · 避让 ${traffic.smoothedMilliseconds.toFixed(2)} ms/步 · 历史最小间距 ${Number.isFinite(traffic.worstClearance) ? traffic.worstClearance.toFixed(3) : "—"} m`;
    const riverPoint = new Vector3(0, 0.1, -33.2);
    camera.worldToScreenPoint(riverPoint, screen);
    $("river-label").style.transform =
      `translate(${(screen.x / engine.canvas.width) * rect.width}px, ${(screen.y / engine.canvas.height) * rect.height}px) translate(-50%, -50%)`;
  };
  const aDimensions = (animal: ConfiguredAnimal) =>
    animal.config.bounds.max.map((v, i) => (v - animal.config.bounds.min[i]) * animal.scale);
  $("animal-scale").addEventListener("input", (event) => {
    try {
      selected?.animal.setScale(Number((event.target as HTMLInputElement).value));
    } catch (error) {
      (event.target as HTMLInputElement).value = String(selected?.animal.scale ?? 1);
      $("command-result").textContent = error instanceof Error ? error.message : String(error);
    }
    runtime.refresh();
  });
  $("move-speed").addEventListener("input", (event) => {
    selected?.animal.setMovementMultiplier(Number((event.target as HTMLInputElement).value));
    runtime.refresh();
  });
  $("food-enabled").addEventListener("change", (event) => {
    if (!habitats) return;
    habitats.foodEnabled = (event.target as HTMLInputElement).checked;
    for (const entity of foodEntities) entity.isActive = habitats.foodEnabled;
    for (const { animal } of instances) animal.behavior.worldChanged();
    runtime.refresh();
  });
  $("shadows").addEventListener("change", (event) => {
    const enabled = (event.target as HTMLInputElement).checked;
    light.shadowType = enabled ? ShadowType.SoftLow : ShadowType.None;
    seedLighting?.setShadows(enabled);
    groundRenderer.receiveShadows = enabled;
    for (const { animal } of instances) animal.setShadows(enabled);
  });
  $("show-names").addEventListener("change", (event) => {
    $("labels").hidden = !(event.target as HTMLInputElement).checked;
    runtime.refresh();
  });
  select.addEventListener("change", () => {
    const item = instances.find((item) => item.entry.id === select.value);
    if (item) inspect(item);
  });
  clips.addEventListener("change", () => {
    selected?.animal.play(Number(clips.value));
    runtime.refresh();
  });
  timeline.addEventListener("input", () => {
    if (!selected) return;
    if (selected.animal.automatic) selected.animal.play(selected.animal.animationIndex);
    selected.animal.seek(Number(timeline.value));
    runtime.refresh();
  });
  $("behavior").addEventListener("click", () => {
    selected?.animal.resumeBehavior();
    runtime.refresh();
  });
  let requestSequence = 0;
  const issue = (skillId: string, target?: AnimalTaskRequest["target"]): void => {
    const targets = $<HTMLSelectElement>("command-scope").value === "all" ? instances : selected ? [selected] : [];
    const requestId = `ui-${++requestSequence}`;
    const receipts = targets.map((item) => item.animal.execute({ requestId, skillId, target }));
    $("command-result").textContent =
      `${skillId} → ${targets.length} 个角色 · ${receipts.filter((r) => r.status !== "rejected").length} 已接收`;
    runtime.refresh();
  };
  $("command-idle").addEventListener("click", () => issue("idle"));
  $("command-river").addEventListener("click", () => issue("moveTo", { query: "riverbank" }));
  $("thunder").addEventListener("click", () => {
    const event = { id: `thunder-${++requestSequence}`, type: "thunder", source: [0, 4] as [number, number] };
    const count = instances.filter(
      (item) => item.animal.execute({ requestId: event.id, skillId: "startle" }).status !== "rejected"
    ).length;
    $("command-result").textContent = `打雷 → ${count} 个角色执行受惊指令；再次点击立即重播`;
    $("viewport").classList.add("storm");
    runtime.system.schedule(0.35, () => $("viewport").classList.remove("storm"));
    runtime.refresh();
  });
  // Tool-facing boundary: no original clip ids or tree nodes are accepted by execute().
  const taskApi = {
    describe: (actorId = selected?.entry.id) => ({
      actorId,
      tasks: instances.find((item) => item.entry.id === actorId)?.animal.behavior.describe() ?? [],
      requestSchema: instances.find((item) => item.entry.id === actorId)?.animal.behavior.requestSchema(),
      targets: [{ query: "riverbank", description: "平坦测试场景中的可达干燥河岸" }],
      actors: instances.map((item) => ({ id: item.entry.id, name: item.entry.name }))
    }),
    execute: (actorId: string, request: AnimalTaskRequest) => {
      const item = instances.find((item) => item.entry.id === actorId);
      return item ? item.animal.execute(request) : { ...request, status: "rejected", reason: "unknown_actor" };
    },
    receipt: (actorId: string, requestId: string) =>
      instances.find((item) => item.entry.id === actorId)?.animal.behavior.receipt(requestId),
    inspect: () => ({
      loaded: instances.length,
      failures: [...failures],
      stats: runtime.system.stats,
      presentation: seedLighting?.inspect(),
      registration: {
        models: modelRegistrations.size,
        species: Object.keys(registered?.registrations.species ?? {}).length,
        foodEnabled: habitats?.foodEnabled,
        dynamicAvoidance: true,
        resourceConsumption: false
      },
      crowd: runtime.crowd.inspect(),
      performance: {
        frameTimesMilliseconds: [...runtime.frameTimes],
        smoothedSystemMilliseconds: runtime.systemMilliseconds,
        resolution: [engine.canvas.width, engine.canvas.height],
        shadows: light.shadowType !== ShadowType.None,
        uniqueTextures: new Set([...resources.values()].flatMap((r) => r.textures ?? [])).size
      },
      geometry: {
        triangles: instances.reduce((sum, item) => sum + item.entry.audit!.triangles, 0),
        joints: instances.reduce((sum, item) => sum + item.entry.audit!.joints.reduce((sum, n) => sum + n, 0), 0)
      },
      actors: instances.map((item) => ({
        id: item.entry.id,
        position: [item.animal.position.x, item.animal.position.z],
        animation: item.animal.config.animations[item.animal.animationIndex].id,
        semantic: modelRegistrations.get(item.entry.id)?.animations[
          item.animal.config.animations[item.animal.animationIndex].id
        ],
        habitat: habitats?.region(item.entry.id)?.habitat,
        animationTime: item.animal.time,
        animationDuration: item.animal.duration,
        scale: item.animal.scale,
        speed: item.animal.movementSpeed,
        heading: item.animal.direction,
        angularSpeed: item.animal.angularSpeed,
        animationRate: item.animal.animationRate,
        motionSync: item.animal.motionSync,
        traffic: item.animal.traffic,
        ...item.animal.behavior.inspect()
      }))
    })
  };
  Object.assign(window, { animalTasks: taskApi });
  $("capture-state").addEventListener("click", () => {
    $("runtime-snapshot").textContent = JSON.stringify(taskApi.inspect(), null, 2);
  });
  $("focus").addEventListener("click", () => frame(true));
  $("view").addEventListener("click", () => frame());
  $("pause").addEventListener("click", () => {
    runtime.paused = !runtime.paused;
    $("pause").textContent = runtime.paused ? "继续播放" : "暂停播放";
  });
  $("speed").addEventListener("input", (event) => {
    runtime.timeScale = Number((event.target as HTMLInputElement).value);
    $("speed-value").textContent = `${runtime.timeScale}×`;
  });
  // Only a short left click selects; orbit drags keep their existing camera interaction.
  let pointerStart: { x: number; y: number; id: number } | undefined;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 0) pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  canvas.addEventListener("pointercancel", () => {
    pointerStart = undefined;
  });
  canvas.addEventListener("pointerup", (event) => {
    const start = pointerStart;
    pointerStart = undefined;
    if (
      !start ||
      event.button !== 0 ||
      start.id !== event.pointerId ||
      Math.hypot(start.x - event.clientX, start.y - event.clientY) > 5
    )
      return;
    const rect = canvas.getBoundingClientRect();
    point.set(
      ((event.clientX - rect.left) * engine.canvas.width) / rect.width,
      ((event.clientY - rect.top) * engine.canvas.height) / rect.height
    );
    camera.screenPointToRay(point, ray);
    let hit: (typeof instances)[number] | undefined;
    let nearest = Infinity;
    for (const item of instances) {
      const [min, max] = item.animal.bounds;
      box.min.set(min[0], min[1], min[2]);
      box.max.set(max[0], max[1], max[2]);
      const distance = CollisionUtil.intersectsRayAndBox(ray, box);
      if (distance >= 0 && distance < nearest) {
        nearest = distance;
        hit = item;
      }
    }
    if (hit) inspect(hit);
  });
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      seedLighting?.dispose();
      root.destroy();
      for (const resource of resources.values()) resource.destroy();
      assets.dispose();
      gridMesh.destroy();
      gridMaterial.destroy();
      engine.destroy();
    },
    { once: true }
  );
  frame();
  updateEnabled();
  engine.run();
  const columns = Math.ceil(Math.sqrt(catalog.length));
  const rows = Math.ceil(catalog.length / columns);
  // Large footprints go first so later small animals can use the remaining space.
  const loadOrder = [...catalog.entries()].sort(
    ([, a], [, b]) => animalCollisionRadius(b.config!) - animalCollisionRadius(a.config!)
  );
  let loadedCount = 0;
  for (const [index, entry] of loadOrder) {
    loadedCount++;
    status.textContent = `正在加载 ${loadedCount} / ${catalog.length}：${entry.name}`;
    $("live").textContent = `${loadedCount} / ${catalog.length}`;
    try {
      const resource = await engine.resourceManager.load<GLTFResource>({
        url: new URL(entry.config!.modelUrl, packBase).href,
        type: AssetType.GLTF
      });
      if (disposed) {
        resource.destroy();
        return;
      }
      const registration = modelRegistrations.get(entry.id);
      const position: readonly [number, number] =
        registration && registered && habitats
          ? spawnPositions!.get(entry.id)!
          : [((index % columns) - (columns - 1) / 2) * 5, (Math.floor(index / columns) - (rows - 1) / 2) * 5];
      let animal: ConfiguredAnimal;
      try {
        animal = new ConfiguredAnimal(
          root,
          entry.config!,
          resource,
          runtime.system,
          position,
          behaviorCatalog.profiles[entry.config!.behaviorProfile],
          (query, event) =>
            world.resolve(
              query,
              {
                id: entry.id,
                index,
                origin: position,
                position: animal ? [animal.position.x, animal.position.z] : position,
                heading: animal?.direction,
                radius: animal?.traffic.radius
              },
              event
            ),
          runtime.crowd
        );
      } catch (error) {
        resource.destroy();
        throw error;
      }
      animal.setShadows($<HTMLInputElement>("shadows").checked);
      resources.set(entry.id, resource);
      runtime.animals.push(animal);
      const label = document.createElement("button");
      label.type = "button";
      label.className = "animal-label";
      label.textContent = entry.name;
      label.setAttribute("aria-label", `选择${entry.name}`);
      const item = { entry, animal, label };
      label.addEventListener("click", () => inspect(item));
      instances.push(item);
      $("labels").append(label);
      if (!selected) inspect(item);
    } catch (error) {
      if (disposed) return;
      failures.push(entry.name);
      console.error(`[animal-preview] ${entry.id}`, error);
    }
  }
  runtime.paused = false;
  loading = false;
  updateEnabled();
  frame();
  runtime.refresh();
  $("live").textContent = failures.length ? "部分载入失败" : "全部已入场";
  const appearanceCount = catalog.reduce((sum, entry) => sum + (entry.config?.appearances?.length ?? 0), 0);
  $("pack-count").textContent = appearanceCount
    ? `${instances.length} / ${catalog.length} 组代表 · ${appearanceCount} 个可选外观`
    : `${instances.length} / ${catalog.length} 个模型变体`;
  status.textContent = failures.length
    ? `已加载 ${instances.length} 个，失败：${failures.join("、")}`
    : `${instances.length} 个角色已加载 · 默认自主闲逛 · 枚举配置注册 · 按区域偏好入场 · 食物条件控制进食表现 · 动态避让与碰撞约束已开启 · 无资源消耗`;
}
