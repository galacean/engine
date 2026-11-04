import candidateUrl from "./generated/procedural-trees/highlands-fir-3-candidate.json?url";
import plantSpeciesUrl from "./generated/procedural-trees/plant-species.json?url";
import { decodePlantParameters } from "./PlantParameterEncoding";
import {
  Camera,
  Color,
  DirectLight,
  type Entity,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  RenderFace,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { createPlantGeometryExample, type PlantExampleKind } from "./ProceduralPlantExamples";
import { createProceduralPlantMeshes, type ProceduralPlantMeshes } from "./ProceduralPlantMeshes";
import { type ProceduralPlantStructure } from "./ProceduralPlantGeometry";
import {
  proceduralPlantAssetLod,
  validateProceduralPlantAsset,
  validatePlantGeometryInstances,
  type ProceduralPlantAsset,
  type ProceduralPlantLibraryEntry
} from "./ProceduralPlantAsset";

declare global {
  interface Window {
    proceduralPlantPreview?: {
      getStructure(): ProceduralPlantStructure;
      setStructure(structure: ProceduralPlantStructure, lod?: number): void;
      getDiagnostics(): { partCount: number; triangleCount: number; lod: number };
      getAsset?(): ProceduralPlantAsset | undefined;
      setAsset?(id: string, lod?: number): Promise<void>;
    };
  }
}

/** Geometry acceptance view within the existing Asset Assembly lab. No production species are replaced. */
export async function bootProceduralPlantPreview(): Promise<void> {
  const library = new URLSearchParams(location.search).get("library");
  for (const child of Array.from(document.body.children)) {
    if (
      child instanceof HTMLElement &&
      child.id !== "canvas" &&
      !child.classList.contains("loading") &&
      child.tagName !== "SCRIPT"
    )
      child.hidden = true;
  }
  const panel = document.createElement("aside");
  panel.className = "plant-geometry-panel";
  panel.innerHTML = `<h1>程序化植被</h1><p>基础几何验证 · 合成示例</p>
    <label>植物 <select aria-label="植物"><option value="tree">树木</option><option value="shrub">灌木</option><option value="grass">草丛</option><option value="flower">花卉</option></select></label>
    <label>细节 <select aria-label="细节"><option value="0">高</option><option value="1">低</option></select></label>
    <label>叶片折角 <input aria-label="叶片折角" type="range" min="-60" max="60" value="0" step="1"></label>
    <output></output><p>拖动旋转，滚轮缩放。示例用于验证共用生成能力，尚未替换现有物种。</p>
    <a href="?">返回资产预览</a>`;
  document.body.append(panel);
  const engine = await WebGLEngine.create({ canvas: "canvas", graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 } });
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene!;
  scene.background.solidColor.set(0.055, 0.07, 0.08, 1);
  scene.ambientLight.diffuseSolidColor.set(0.65, 0.7, 0.8, 1);
  scene.ambientLight.diffuseIntensity = 0.7;
  const root = scene.createRootEntity("Procedural plant geometry lab");
  const sun = root.createChild("Sun");
  sun.transform.setRotation(-35, -30, 0);
  sun.addComponent(DirectLight).color = new Color(1.2, 1.2, 1.2, 1);
  const cameraEntity = root.createChild("Camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 40;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.enableDamping = false;
  const materials = new Map<string, PBRMaterial>();
  for (const [id, color] of [
    ["bark", [0.25, 0.13, 0.055]],
    ["foliage", [0.16, 0.46, 0.1]],
    ["petal", [0.9, 0.25, 0.42]],
    ["pollen", [0.95, 0.65, 0.08]]
  ] as const) {
    const material = new PBRMaterial(engine);
    material.baseColor = new Color(...color, 1);
    material.metallic = 0;
    material.roughness = 0.8;
    material.renderFace = RenderFace.Double;
    materials.set(id, material);
  }
  let current = createPlantGeometryExample("tree");
  let currentLod = 0;
  let currentAsset: ProceduralPlantAsset | undefined;
  let assetLod = 0;
  let currentEntry: ProceduralPlantLibraryEntry | undefined;
  let currentRoot: Entity | undefined;
  let resources: ProceduralPlantMeshes | undefined;
  let renderedTriangles = 0;
  const publish = (structure: ProceduralPlantStructure, lod: number, frameCamera: boolean) => {
    // Validate and allocate the replacement before releasing the visible plant.
    const next = createProceduralPlantMeshes(engine, structure, lod, library !== null, {
      instanceScale: currentEntry?.instanceScale
    });
    const nextRoot = root.createChild("Plant");
    nextRoot.transform.setScale(...(currentEntry?.instanceScale ?? [1, 1, 1]));
    const renderers: MeshRenderer[] = [];
    try {
      for (const part of next.parts) {
        const material = materials.get(part.materialId);
        if (!material) throw new Error(`Preview has no material ${part.materialId}`);
        const instances = currentEntry?.geometryInstances?.filter(
          (instance) => instance.materialId === part.materialId && (!instance.lods || instance.lods.includes(assetLod))
        ) ?? [undefined];
        for (const instance of instances) {
          const entity = nextRoot.createChild(part.partId);
          if (instance) entity.transform.localMatrix = new Matrix().copyFromArray(instance.transform);
          const renderer = entity.addComponent(MeshRenderer);
          renderer.mesh = part.mesh;
          renderer.setMaterial(material);
          renderers.push(renderer);
        }
      }
    } catch (error) {
      nextRoot.destroy();
      next.destroy();
      throw error;
    }
    currentRoot?.destroy();
    resources?.destroy();
    currentRoot = nextRoot;
    resources = next;
    renderedTriangles = renderers.reduce((sum, renderer) => sum + renderer.mesh!.subMesh!.count / 3, 0);
    current = structure;
    currentLod = lod;
    if (frameCamera && next.parts.length) {
      const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
      for (const renderer of renderers) {
        const bounds = renderer.bounds;
        const lo = [bounds.min.x, bounds.min.y, bounds.min.z];
        const hi = [bounds.max.x, bounds.max.y, bounds.max.z];
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], lo[axis]);
          max[axis] = Math.max(max[axis], hi[axis]);
        }
      }
      const target = new Vector3(...(min.map((value, axis) => (value + max[axis]) / 2) as [number, number, number]));
      const radius = Math.hypot(...max.map((value, axis) => value - min[axis])) / 2;
      const distance = radius / Math.sin((camera.fieldOfView * Math.PI) / 360);
      const direction = new Vector3(1, 0.5, 1.5).normalize();
      cameraEntity.transform.setPosition(
        target.x + direction.x * distance,
        target.y + direction.y * distance,
        target.z + direction.z * distance
      );
      cameraEntity.transform.lookAt(target);
      orbit.target.copyFrom(target);
      camera.nearClipPlane = distance / 1000;
      camera.farClipPlane = distance * 10;
      orbit.minDistance = radius;
      orbit.maxDistance = distance * 5;
    }
    panel.querySelector("output")!.textContent =
      `${diagnostics().partCount} 个部件 · ${diagnostics().triangleCount} 个三角形`;
  };
  const diagnostics = () => ({
    partCount:
      currentEntry?.geometryInstances?.filter((instance) => !instance.lods || instance.lods.includes(assetLod))
        .length ?? current.lods[currentLod].partIds.length,
    lod: currentAsset ? assetLod : currentLod,
    ...(currentAsset
      ? {
          assetId: currentAsset.id,
          category: currentAsset.category,
          geometryAccepted: currentEntry?.geometryAccepted,
          materialSlots: currentAsset.materialSlots
        }
      : {}),
    triangleCount: renderedTriangles
  });
  const selects = panel.querySelectorAll("select");
  const fold = panel.querySelector("input")!;
  const resetExample = (frameCamera: boolean) => {
    const example = createPlantGeometryExample(selects[0].value as PlantExampleKind);
    const radians = (Number(fold.value) * Math.PI) / 180;
    const next: ProceduralPlantStructure = {
      ...example,
      shapes: Object.fromEntries(
        Object.entries(example.shapes).map(([id, shape]) => [
          id,
          shape.kind === "surface"
            ? {
                ...shape,
                sections: shape.sections.map((s) => ({
                  ...s,
                  leftFold: s.leftFold + radians,
                  rightFold: s.rightFold + radians
                }))
              }
            : shape
        ])
      )
    };
    publish(next, Number(selects[1].value), frameCamera);
  };
  selects[0].addEventListener("change", () => resetExample(true));
  selects[1].addEventListener("change", () => resetExample(false));
  fold.addEventListener("input", () => resetExample(false));
  window.proceduralPlantPreview = {
    getStructure: () => JSON.parse(JSON.stringify(current)),
    setStructure: (structure, lod = 0) => {
      currentAsset = undefined;
      currentEntry = undefined;
      publish(JSON.parse(JSON.stringify(structure)), lod, true);
    },
    getDiagnostics: diagnostics
  };
  publish(current, 0, true);
  if (new URLSearchParams(location.search).get("candidate") === "highlands-fir-3") {
    const response = await fetch(candidateUrl);
    if (!response.ok) throw new Error(`Candidate parameters unavailable: ${response.status}`);
    const candidate = decodePlantParameters<ProceduralPlantStructure>(await response.json());
    panel.querySelector("p")!.textContent = "锥形针叶乔木参数拟合候选 · 未通过还原验收";
    selects[0].disabled = true;
    selects[0].replaceChildren(new Option("锥形针叶乔木拟合候选", "candidate"));
    fold.disabled = true;
    const lodSelect = selects[1].cloneNode(false) as HTMLSelectElement;
    candidate.lods.forEach((_, index) => lodSelect.add(new Option(`LOD${index}`, String(index))));
    selects[1].replaceWith(lodSelect);
    lodSelect.addEventListener("change", () => publish(candidate, Number(lodSelect.value), false));
    publish(candidate, 0, true);
  }
  if (library !== null) {
    if (library !== "meadow") throw new Error(`Unknown plant data library: ${library}`);
    const base = new URL("./", new URL(plantSpeciesUrl, import.meta.url)).href;
    const response = await fetch(`${base}plant-species.json`);
    if (!response.ok) throw new Error(`Plant data library unavailable: ${response.status}`);
    const catalog: { assets: ProceduralPlantLibraryEntry[]; prototypes?: ProceduralPlantLibraryEntry[] } =
      await response.json();
    const entries = catalog.assets;
    const available = entries.filter((entry) => entry.parameterFile);
    if (!available.length) throw new Error("The plant data library has no fitted parameters");
    const plantSelect = selects[0].cloneNode(false) as HTMLSelectElement;
    const lodSelect = selects[1].cloneNode(false) as HTMLSelectElement;
    for (const category of new Set(entries.map((entry) => entry.category))) {
      const group = document.createElement("optgroup");
      group.label =
        (
          {
            Trees: "乔木与灌木",
            Grass: "草丛",
            Flowers: "花卉",
            Plants: "草本植物",
            CoverPlants: "地被",
            Leaves: "落叶",
            Mushrooms: "蘑菇"
          } as Record<string, string>
        )[category] ?? category;
      for (const entry of entries.filter((entry) => entry.category === category)) {
        const option = new Option(
          `${entry.displayName ?? entry.id}${entry.geometryEdited ? " · 已调整" : entry.geometryAccepted ? "" : " · 形状待修正"}`,
          entry.id
        );
        option.disabled = !entry.parameterFile;
        group.append(option);
      }
      plantSelect.append(group);
    }
    selects[0].replaceWith(plantSelect);
    selects[1].replaceWith(lodSelect);
    fold.closest("label")!.hidden = true;
    panel.querySelectorAll("p")[1].textContent =
      "拖动旋转，滚轮缩放。当前使用现有 PBR 材质查看形状；暂不迁移原贴图和 shader。";
    const download = document.createElement("a");
    download.textContent = "下载当前植被参数 JSON";
    panel.insertBefore(download, panel.lastElementChild);
    let request = 0;
    const selectAsset = async (id: string, lod = 0) => {
      const entry = entries.find((entry) => entry.id === id);
      if (!entry?.parameterFile) throw new Error(`Plant data is unavailable: ${id}`);
      const generation = ++request;
      const source = entry.prototypeId
        ? [...entries, ...(catalog.prototypes ?? [])].find((item) => item.id === entry.prototypeId)
        : entry;
      if (!source?.parameterFile) throw new Error(`Plant prototype is unavailable: ${id}`);
      const response = await fetch(base + source.parameterFile);
      if (!response.ok) throw new Error(`Plant parameters unavailable: ${response.status}`);
      const asset = decodePlantParameters<ProceduralPlantAsset>(await response.json());
      validateProceduralPlantAsset(asset);
      validatePlantGeometryInstances(entry, asset);
      if (generation !== request) return;
      // Slot binding is independent of the shared geometry compiler. These are the lab's existing materials.
      for (const [slot, name] of Object.entries(asset.materialSlots))
        materials.set(slot, materials.get(/bark|wood/i.test(name) ? "bark" : "foliage")!);
      const structure = proceduralPlantAssetLod(asset, lod);
      currentAsset = asset;
      currentEntry = entry;
      assetLod = lod;
      publish(structure, 0, true);
      plantSelect.value = id;
      lodSelect.replaceChildren(...asset.geometryLods.map((_, index) => new Option(`LOD${index}`, String(index))));
      lodSelect.value = String(lod);
      download.href = base + source.parameterFile;
      download.download = source.parameterFile;
      download.textContent = entry.prototypeId ? "下载共用植被参数 JSON" : "下载当前植被参数 JSON";
      panel.querySelector("p")!.textContent =
        `${entry.displayName ?? "植被"} · ${available.length} 个参数资产，${entries.filter((item) => item.geometryAccepted).length} 个通过。当前模型：${entry.geometryEdited ? "结构已调整" : entry.geometryAccepted ? "形状误差检查通过" : "拟合候选，形状仍需修正"}`;
    };
    plantSelect.addEventListener("change", () => {
      void selectAsset(plantSelect.value);
    });
    lodSelect.addEventListener("change", () => {
      assetLod = Number(lodSelect.value);
      publish(proceduralPlantAssetLod(currentAsset!, assetLod), 0, false);
    });
    window.proceduralPlantPreview.getAsset = () => currentAsset && JSON.parse(JSON.stringify(currentAsset));
    window.proceduralPlantPreview.setAsset = selectAsset;
    await selectAsset(available.find((entry) => entry.geometryAccepted)?.id ?? available[0].id);
  }
  document.body.dataset.state = "ready";
  engine.run();
  window.addEventListener(
    "pagehide",
    () => {
      currentRoot?.destroy();
      resources?.destroy();
      for (const material of new Set(materials.values())) material.destroy();
      engine.destroy();
      delete window.proceduralPlantPreview;
    },
    { once: true }
  );
}
