import { useLocalBasis } from "./useLocalBasis";
import { expect, it, vi } from "vitest";
import {
  AssetType,
  BoundingBox,
  BufferMesh,
  Camera,
  Color,
  DirectLight,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  Texture2D,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { configureAssetAssemblyRendererInstance } from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyRuntime";
import {
  createTreeAssemblyInstancedMesh,
  createTreeAssemblyInstanceStorage,
  TREE_ASSEMBLY_LOD_FADE_FLOAT_OFFSET,
  uploadTreeAssemblyInstanceRange,
  uploadTreeAssemblyInstances
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh";
import {
  encodePlantPigment,
  patchVegetationColor,
  VegetationColors
} from "@galacean/engine-world-planning/spatial/VegetationColors";
import { useProjectPlantResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { WorldTemplateRuntime } from "@galacean/engine-world-planning/spatial/runtime/WorldTemplateRuntime";
import { resolveWorldTemplateScene } from "@galacean/engine-world-planning/spatial/WorldTemplateView";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import surface from "../../../packages/terrain/src/data/seed-world/public/Shader/Surface.shaderc?url";
import vegetation from "../../../packages/terrain/src/data/seed-world/public/Shader/Vegetation.shaderc?url";
import template from "../../../packages/world-planning/src/spatial/runtime/TemplateTranslucent.shader?raw";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";
import { decodeViewIdentity } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import type { SeedWorldPickBatch } from "@galacean/engine-project/rendering/SeedWorldPickBatch";
import project from "../../../packages/terrain/src/data/seed-world/project.json";

it.each(["renderer", "instanced"])(
  "renders independent pigments in %s mode with the shipped leaf and bark shaders",
  async (mode) => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 48;
    const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    try {
      const scene = engine.sceneManager.activeScene;
      const root = scene.createRootEntity();
      const eye = root.createChild();
      eye.transform.setPosition(0, 0, 4);
      eye.transform.lookAt(new Vector3());
      const camera = eye.addComponent(Camera);
      camera.isOrthographic = true;
      camera.orthographicSize = 1;
      const texture = new Texture2D(engine, 96, 48);
      camera.renderTarget = new RenderTarget(engine, 96, 48, texture);
      root.createChild().addComponent(DirectLight).intensity = 1;
      const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 0.25);
      const renderers: MeshRenderer[] = [];
      const gl = canvas.getContext("webgl2")!;
      const draws = vi.spyOn(gl, "drawElementsInstanced");
      let tint: (value: number) => void;
      if (mode === "instanced") {
        const storage = createTreeAssemblyInstanceStorage(engine, 2);
        const bounds = new BoundingBox(new Vector3(-2, -1, -1), new Vector3(2, 1, 1));
        const view = createTreeAssemblyInstancedMesh(engine, mesh, 2, bounds, "neighboring plants", storage);
        [-1, 1].forEach((x, index) => {
          storage.staging.set([x, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1], storage.recordFloats * index);
        });
        uploadTreeAssemblyInstances(view, 2);
        const renderer = root.createChild().addComponent(MeshRenderer);
        renderer.shaderData.enableMacro("RENDERER_ASSET_ASSEMBLY_INSTANCE");
        renderer.mesh = view.mesh;
        renderers.push(renderer);
        tint = (code) => {
          storage.staging[TREE_ASSEMBLY_LOD_FADE_FLOAT_OFFSET] = code;
          uploadTreeAssemblyInstanceRange(storage, 0, 1);
        };
      } else {
        for (const x of [-1, 1]) {
          const entity = root.createChild();
          entity.transform.setPosition(x, 0, 0);
          const renderer = entity.addComponent(MeshRenderer);
          configureAssetAssemblyRendererInstance(renderer);
          renderer.mesh = mesh;
          renderers.push(renderer);
        }
        tint = (code) => renderers[0].shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(1, 1, 1, code));
      }
      const frame = (code: number) => {
        tint(code);
        draws.mockClear();
        engine.update();
        if (mode === "instanced") {
          expect(draws).toHaveBeenCalledTimes(1);
          expect(draws.mock.calls[0][4]).toBe(2);
        }
      };
      const pixel = (x: number) => {
        const p = new Uint8Array(4);
        texture.getPixelBuffer(x, 24, 1, 1, p);
        return Array.from(p);
      };
      for (const source of [surface, vegetation]) {
        const shader = await engine.resourceManager.load<Shader>({ type: AssetType.Shader, url: source });
        const material = new Material(engine, shader);
        material.shaderData.setColor("material_BaseColor", new Color(0.15, 0.6, 0.15, 1));
        material.shaderData.setFloat("material_Tiling", 1);
        material.shaderData.setFloat("material_LeafAlbedoBrightness", 1);
        material.shaderData.enableMacro("SCENE_SURFACE_CLIMATE_DRY");
        for (const r of renderers) r.setMaterial(material);
        frame(1);
        const before = pixel(24),
          neighbor = pixel(72);
        expect(before[1]).toBeGreaterThan(before[0]);
        frame(encodePlantPigment([24, 48, 240], 1)!);
        const blue = pixel(24);
        expect(blue[2]).toBeGreaterThan(blue[1]);
        expect(blue[2]).toBeGreaterThan(before[2]);
        expect(pixel(72)).toEqual(neighbor);
        frame(encodePlantPigment([24, 48, 240], 0.5)!);
        expect(pixel(24)[2]).toBeGreaterThan(before[2]);
        expect(pixel(24)[2]).toBeLessThan(blue[2]);
        frame(1);
        expect(pixel(24)).toEqual(before);
      }
      const bark = Shader.find("Planning/TemplateTranslucent") ?? Shader.create(template);
      expect(
        bark.compileVariant(engine, [
          "MATERIAL_TEMPLATE_PLANT_PIGMENT",
          "RENDERER_HAS_NORMAL",
          "RENDERER_HAS_UV",
          "MATERIAL_HAS_BASETEXTURE"
        ])
      ).toBe(true);
    } finally {
      engine.destroy();
    }
  }
);

function registerPlantProject(engine: WebGLEngine) {
  const projectUrl = new URL("../../../packages/terrain/src/data/seed-world/project.json", import.meta.url);
  engine.resourceManager.registerVirtualResources(
    project.files.map(({ virtualPath, type, path }) => ({
      virtualPath,
      type,
      path: new URL(path, projectUrl).href
    }))
  );
  useProjectPlantResources(engine);
}

it.each(["sakura-pearl", "emerald-forest", "titan-wasteland"])(
  "picks and recolors each %s template tree independently across its material slots",
  async (templateId) => {
    const fetchSpy = useLocalBasis();
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    try {
      registerPlantProject(engine);
      const ground = () => 0;
      const plan = {
        parameters: { seed: 42, width: 1024, depth: 1024, worldTemplate: { id: templateId } },
        worldTemplateSite: { templateId, center: { x: 512, z: 512 } }
      } as IslandPlan;
      const scene = resolveWorldTemplateScene(plan, ground)!;
      const subject = scene.nodes.find(({ node }) => node.vegetation)!;
      const neighbor = {
        ...subject,
        position: [subject.position[0] + subject.node.scale[0] * 2, subject.position[1], subject.position[2]] as [
          number,
          number,
          number
        ],
        node: { ...subject.node, id: "neighbor" }
      };
      const root = engine.sceneManager.activeScene.createRootEntity();
      const camera = root.createChild().addComponent(Camera);
      const runtime = (await WorldTemplateRuntime.create(
        root,
        plan,
        ground,
        {
          ...scene,
          nodes: [subject, neighbor]
        },
        undefined,
        undefined,
        camera
      ))!;
      const slots = (id: string) => {
        const result: MeshRenderer[] = [];
        runtime.visitPickBatches((batch) => {
          if (batch.resolve(0) === id) result.push(batch.renderer);
        });
        return result.flatMap((renderer) => renderer.getMaterials());
      };
      const original = slots(subject.node.id);
      const isBarkMaterial = (name: string) =>
        subject.node.vegetation!.barkMaterials!.includes(name.replace(/\(Clone\)$/, ""));
      expect(original.some((m) => isBarkMaterial(m!.name))).toBe(true);
      expect(original.some((m) => m!.name.includes(subject.node.assetLeafMaterials![0]))).toBe(true);
      expect(slots("neighbor").every((m, i) => m === original[i])).toBe(true);
      const target = { kind: "asset" as const, assetKind: "tree" as const, id: subject.node.id };
      const record = patchVegetationColor(undefined, target, {
        foliageColorRgb: [0, 0, 255],
        barkColorRgb: [255, 0, 0]
      })!;
      runtime.setLocalColors(new VegetationColors([record]));
      slots(subject.node.id).forEach((material, index) => {
        const prior = original[index]!;
        const isBark = isBarkMaterial(prior.name);
        expect(material).not.toBe(prior);
        const value = material!.shaderData.getVector4("material_TemplatePlantPigment");
        const leafGain =
          (subject.node.assetLeafIntensity ?? 1) / (1 + prior.shaderData.getFloat("material_LeafAlbedoTextureBlend"));
        expect([value.x, value.y, value.z, value.w]).toEqual(isBark ? [1, 0, 0, 1] : [0, 0, leafGain, 1]);
        expect(material!.shaderData.getTexture("material_BaseTexture")).toBe(
          prior.shaderData.getTexture("material_BaseTexture")
        );
      });
      expect(slots("neighbor").every((m, i) => m === original[i])).toBe(true);
      runtime.setLocalColors(new VegetationColors([]));
      expect(slots(subject.node.id).every((m, i) => m === original[i])).toBe(true);
      if (templateId === "titan-wasteland") {
        const [x, y, z] = subject.position;
        camera.entity.transform.setPosition(x, y, z + subject.node.scale[0] * 2);
        camera.entity.transform.lookAt(new Vector3(x, y, z));
        expect(await pickedKeys(engine, camera, runtime)).toContain(subject.node.id);
      }
      runtime.dispose();
    } finally {
      engine.destroy();
      fetchSpy.mockRestore();
    }
  }
);

function templatePlan(templateId: string): IslandPlan {
  return {
    parameters: { seed: 42, width: 1024, depth: 1024, worldTemplate: { id: templateId } },
    worldTemplateSite: { templateId, center: { x: 512, z: 512 } },
    rocks: []
  } as unknown as IslandPlan;
}

async function pickedKeys(engine: WebGLEngine, camera: Camera, runtime: WorldTemplateRuntime) {
  const picker = new SeedWorldPicker(camera);
  const post = camera.enablePostProcess;
  camera.enablePostProcess = true;
  try {
    const captured = picker.capture(
      (visit) => runtime.visitPickBatches(visit),
      () => ({ entityId: 1, componentId: 1, componentType: "vegetation" })
    );
    engine.update();
    const frame = await captured;
    try {
      const keys = new Set<string | undefined>();
      const pixels = frame.identities.read(0, 0, frame.width, frame.height);
      for (let i = 0; i < pixels.length; i += 4) {
        const id = decodeViewIdentity(pixels, i, frame.identities.identityBits);
        if (id) keys.add(frame.identities.resolve(id)?.instanceKey);
      }
      return keys;
    } finally {
      frame.identities.dispose();
      frame.image.dispose();
    }
  } finally {
    picker.dispose();
    camera.enablePostProcess = post;
  }
}

it.each(["oak", "pine"])(
  "paints only the selected low-poly %s organs in a shared GPU draw and picks both trees",
  async (species) => {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 96;
    const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    try {
      registerPlantProject(engine);
      const ground = () => 0;
      const plan = templatePlan("low-poly");
      const scene = resolveWorldTemplateScene(plan, ground)!;
      const trees = scene.nodes
        .filter(({ node }) => node.vegetation?.assetId === species)
        .slice(0, 2)
        .map((tree, i) => ({
          ...tree,
          position: [504 + i * 16, 5, 512] as [number, number, number],
          node: { ...tree.node, scale: [10, 10, 10] as [number, number, number] }
        }));
      const world = engine.sceneManager.activeScene;
      const root = world.createRootEntity();
      world.background.solidColor = new Color(0, 0, 0, 1);
      const eye = root.createChild();
      eye.transform.setPosition(512, 5, 550);
      eye.transform.lookAt(new Vector3(512, 5, 512));
      const camera = eye.addComponent(Camera);
      camera.isOrthographic = true;
      camera.orthographicSize = 8;
      root.createChild().addComponent(DirectLight).intensity = 1;
      const runtime = (await WorldTemplateRuntime.create(
        root,
        plan,
        ground,
        { ...scene, nodes: trees },
        undefined,
        undefined,
        camera
      ))!;
      runtime.root.findByName("Template procedural plants")!.isActive = false;
      const gl = canvas.getContext("webgl2")!;
      const instanced = vi.spyOn(gl, "drawElementsInstanced");
      const texture = new Texture2D(engine, 192, 96);
      const target = new RenderTarget(engine, 192, 96, texture);
      camera.renderTarget = target;
      function frame() {
        instanced.mockClear();
        engine.update();
        expect(instanced.mock.calls.map((args) => args[4])).toEqual([2]);
        const result = new Uint8Array(192 * 96 * 4);
        texture.getPixelBuffer(result);
        return result;
      }
      const original = frame();
      const [first, neighbor] = trees;
      const area = patchVegetationColor(
        undefined,
        {
          kind: "area",
          id: "tree-area",
          shape: { kind: "circle", center: { x: first.position[0], z: first.position[2] }, radiusMetres: 4 },
          targetKinds: ["tree"],
          assetIds: [species],
          featherMetres: 1
        },
        { foliageColorRgb: [0, 0, 255] }
      )!;
      const trunk = patchVegetationColor(
        undefined,
        { kind: "asset", assetKind: "tree", id: first.node.id },
        { barkColorRgb: [255, 0, 255] }
      )!;
      runtime.setLocalColors(new VegetationColors([area]));
      const blue = frame();
      runtime.setLocalColors(new VegetationColors([area, trunk]));
      const both = frame();
      let leaves = 0,
        wood = 0;
      for (let i = 0; i < original.length; i += 4) {
        const x = (i / 4) % 192;
        const equal = (a: Uint8Array, b: Uint8Array) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2];
        if (x >= 96) {
          if (!equal(original, both)) throw new Error("The neighboring tree changed");
        } else if (original[i + 1] > original[i] && original[i + 1] > original[i + 2]) {
          expect(blue[i + 2]).toBeGreaterThan(blue[i + 1]);
          expect(equal(blue, both)).toBe(true);
          leaves++;
        } else if (original[i] > original[i + 1] && original[i + 1] > original[i + 2]) {
          expect(equal(original, blue)).toBe(true);
          expect(both[i + 2]).toBeGreaterThan(both[i + 1]);
          wood++;
        }
      }
      expect(leaves).toBeGreaterThan(0);
      expect(wood).toBeGreaterThan(0);
      camera.renderTarget = null;
      expect(await pickedKeys(engine, camera, runtime)).toEqual(new Set([first.node.id, neighbor.node.id]));
      camera.renderTarget = target;
      runtime.setLocalColors(new VegetationColors([]));
      expect(frame()).toEqual(original);
      runtime.dispose();
    } finally {
      engine.destroy();
    }
  }
);

it.each([
  ["titan-wasteland", "island-pastel-flower-1", 75],
  ["low-poly", "roadside-white-flower-1", 22]
] as const)(
  "keeps %s template plant IDs and pigments attached to the same GPU records after culling and re-grounding",
  async (templateId, flowerId, count) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    try {
      registerPlantProject(engine);
      const ground = () => 0,
        plan = templatePlan(templateId);
      const scene = resolveWorldTemplateScene(plan, ground)!;
      const root = engine.sceneManager.activeScene.createRootEntity();
      root.createChild().addComponent(DirectLight);
      const eye = root.createChild();
      const camera = eye.addComponent(Camera);
      camera.isOrthographic = true;
      camera.farClipPlane = 500;
      const runtime = (await WorldTemplateRuntime.create(
        root,
        plan,
        ground,
        { ...scene, nodes: [] },
        undefined,
        undefined,
        camera
      ))!;
      const byId = new Map(runtime.vegetationAssets.map((a) => [a.ref.id, a]));
      const flowers = runtime.vegetationAssets.filter((a) => a.properties.distribution === "clump");
      expect(flowers).toHaveLength(count);
      const [x, , z] = byId.get(flowerId)!.position!;
      const focus = (height: number, size: number) => {
        camera.orthographicSize = size;
        eye.transform.setPosition(x, height, z);
        eye.transform.lookAt(new Vector3(x, 0, z), new Vector3(0, 0, -1));
        engine.update();
      };
      focus(35, 120);
      const blue = [6, 48, 241] as [number, number, number],
        pink = [245, 18, 110] as [number, number, number];
      const area = patchVegetationColor(
        undefined,
        {
          kind: "area",
          id: "all-flowers",
          targetKinds: ["flower"],
          shape: {
            kind: "circle",
            center: { x, z },
            radiusMetres: 1 + Math.max(...flowers.map((a) => Math.hypot(a.position![0] - x, a.position![2] - z)))
          },
          featherMetres: 0
        },
        { foliageColorRgb: blue }
      )!;
      const one = patchVegetationColor(
        undefined,
        { kind: "asset", assetKind: "flower-field", id: flowerId },
        { foliageColorRgb: pink }
      )!;
      const wood = patchVegetationColor(
        undefined,
        { kind: "asset", assetKind: "tree", id: "left-bank-snag-1" },
        { barkColorRgb: pink }
      )!;
      const shrub = patchVegetationColor(
        undefined,
        {
          kind: "area",
          id: "sage-area",
          targetKinds: ["shrub"],
          assetIds: ["desert-shrub"],
          shape: { kind: "circle", center: { x, z }, radiusMetres: 500 },
          featherMetres: 0
        },
        { foliageColorRgb: blue, barkColorRgb: pink }
      )!;
      const colors = new VegetationColors([area, one, wood, shrub]);
      function records() {
        const result: { id: string; part: string; pigment: number; name: string }[] = [];
        runtime.visitPickBatches((batch: SeedWorldPickBatch) => {
          if (!batch.instanced) return;
          const mesh = batch.renderer.mesh as BufferMesh;
          const element = mesh.vertexElements.find((e) => e.attribute === "ASSEMBLY_COLOR")!;
          const binding = mesh.vertexBufferBindings[element.bindingIndex]!;
          const stride = binding.stride / Float32Array.BYTES_PER_ELEMENT;
          const data = new Float32Array(batch.count * stride);
          binding.buffer.getData(data);
          for (let i = 0; i < batch.count; i++) {
            const id = batch.resolve(i)!;
            const pos = byId.get(id)!.position!;
            expect(data[i * stride] + scene.anchor[0]).toBeCloseTo(pos[0], 4);
            expect(data[i * stride + 2] + scene.anchor[2]).toBeCloseTo(pos[2], 4);
            const name = batch.renderer.entity.name;
            result.push({
              id,
              name,
              part: name.split("/").pop()!,
              pigment: data[i * stride + TREE_ASSEMBLY_LOD_FADE_FLOAT_OFFSET]
            });
          }
        });
        return result;
      }
      const initial = records();
      expect(initial.every((r) => r.pigment === 1)).toBe(true);
      runtime.setLocalColors(colors);
      const shown = records();
      expect(shown.map((r) => [r.id, r.name])).toEqual(initial.map((r) => [r.id, r.name]));
      function assertPigments(rows: ReturnType<typeof records>) {
        for (const { id, part, pigment } of rows) {
          const kind = byId.get(id)!.ref.kind;
          let expected = 1;
          if (kind === "flower-field" && ["petals", "petalsAlt"].includes(part))
            expected = encodePlantPigment(id === flowerId ? pink : blue, 1)!;
          else if (kind === "shrub") expected = encodePlantPigment(part === "bark" ? pink : blue, 1)!;
          else if (id === "left-bank-snag-1") expected = encodePlantPigment(pink, 1)!;
          expect(pigment).toBe(expected);
        }
      }
      assertPigments(shown);
      expect(new Set(shown.filter((r) => r.part === "petals").map((r) => r.id)).size).toBe(count);
      if (templateId === "titan-wasteland") {
        expect(shown.some((r) => r.id === "left-bank-snag-1")).toBe(true);
        expect(shown.some((r) => r.id.startsWith("cliff-ledge-shrub-"))).toBe(true);
        expect(shown.some((r) => r.id.startsWith("hero-sage-shrub-"))).toBe(true);
        const ledgeId = "cliff-ledge-shrub-1";
        const [sx, , sz] = byId.get(ledgeId)!.position!;
        const ledgeHeight = 6;
        runtime.prepareRockGrounding(plan, () => 2, [
          {
            id: "shelf",
            origin: [sx, ledgeHeight, sz],
            owners: ["shelf"],
            stats: { bodies: 1, vertices: 3 },
            mesh: { positions: new Float32Array([-1, 0, -1, 0, 0, 1, 1, 0, -1]), indices: new Uint32Array([0, 1, 2]) }
          }
        ])!();
        expect(runtime.vegetationAssets.find((a) => a.ref.id === ledgeId)!.position).toEqual([sx, ledgeHeight, sz]);
        expect(runtime.vegetationAssets.find((a) => a.ref.id === flowerId)!.position![1]).toBe(2);
        assertPigments(records());
      }
      focus(7, 2);
      const close = records();
      expect(close.some((r) => r.id === flowerId && r.name.includes("/lod0/"))).toBe(true);
      expect(shown.some((r) => r.id === flowerId && !r.name.includes("/lod0/"))).toBe(true);
      assertPigments(close);
      const texture = new Texture2D(engine, 96, 96);
      camera.renderTarget = new RenderTarget(engine, 96, 96, texture);
      const instanced = vi.spyOn(canvas.getContext("webgl2")!, "drawElementsInstanced");
      const frame = (paint: VegetationColors) => {
        runtime.setLocalColors(paint);
        instanced.mockClear();
        camera.render();
        const pixels = new Uint8Array(96 * 96 * 4);
        texture.getPixelBuffer(pixels);
        return { pixels, draws: instanced.mock.calls.map((args) => args[4]) };
      };
      const defaults = new VegetationColors([]);
      const before = frame(defaults),
        after = frame(colors);
      expect(before.draws.length).toBeGreaterThan(0);
      expect(after.draws).toEqual(before.draws);
      expect(after.pixels.some((channel, i) => i % 4 !== 3 && channel !== before.pixels[i])).toBe(true);
      expect(frame(defaults).pixels).toEqual(before.pixels);
      camera.renderTarget = null;
      expect(await pickedKeys(engine, camera, runtime)).toContain(flowerId);
      expect(records().every((r) => r.pigment === 1)).toBe(true);
      runtime.dispose();
    } finally {
      engine.destroy();
    }
  },
  60_000
);
