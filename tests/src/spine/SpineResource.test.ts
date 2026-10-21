import { AssetType, Camera, Color, Entity, Script, Shader, Texture2D, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import spineShaderSource from "../../../packages/shader/src/Shaders/2D/Spine.shader?raw";
import { SpineMaterial } from "../../../packages/spine/src/renderer/SpineMaterial";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpineResource } from "../../../packages/spine/src/loader/SpineResource";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";
import { registerSpineRuntime } from "../../../packages/spine/src/runtime/SpineRuntimeRegistry";
import { Spine38Runtime } from "../../../packages/spine-core-3.8/src/Spine38Runtime";
import { Spine42Runtime } from "../../../packages/spine-core-4.2/src/Spine42Runtime";
import { SpineSkeleton } from "../../../packages/spine/src/SpineSkeleton";
import { SpineSlot } from "../../../packages/spine/src/SpineSlot";
import { SpineAnimationState } from "../../../packages/spine/src/SpineAnimationState";
import { SpineTrackEntry } from "../../../packages/spine/src/SpineTrackEntry";
import type { SpineEvent } from "../../../packages/spine/src/SpineAnimationStateListener";
import "../../../packages/spine/src/loader/SpineLoader";

const runtimes = { "3.8": new Spine38Runtime(), "4.2": new Spine42Runtime() };
for (const runtime of Object.values(runtimes)) registerSpineRuntime(runtime);
const urls = {
  "3.8": new URL("./fixtures/3.8.json", import.meta.url).href,
  "4.2": new URL("./fixtures/4.2.json", import.meta.url).href
};

describe("Spine resource ownership", () => {
  let engine: WebGLEngine;
  let canvas: HTMLCanvasElement;
  let root: Entity;
  beforeEach(async () => {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    engine = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { preserveDrawingBuffer: true }
    });
    root = engine.sceneManager.activeScene.createRootEntity();
    const cameraEntity = root.createChild();
    cameraEntity.transform.setPosition(0, 0, 3);
    const camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.enableHDR = false;
    engine.sceneManager.activeScene.background.solidColor = new Color(0, 0, 0, 1);
  });
  afterEach(() => engine.destroy());

  async function load(version: "3.8" | "4.2") {
    return engine.resourceManager.load<SpineResource>({ url: urls[version], type: "Spine" });
  }
  async function createGeometryResource(version: "3.8" | "4.2", raw: object) {
    const atlasText = await fetch(new URL(`./fixtures/${version}.atlas`, import.meta.url)).then((r) => r.text());
    const textures = await engine.resourceManager.load<Texture2D[]>(
      ["page.png", "alt.png"].map((name) => ({
        url: new URL(`./fixtures/${name}`, import.meta.url).href,
        type: AssetType.Texture
      }))
    );
    const runtime = runtimes[version];
    const data = runtime.createSkeletonData(JSON.stringify(raw), runtime.createTextureAtlas(atlasText, textures), 0.01);
    return SpineResource._create(engine, runtime, data, urls[version]);
  }
  function attach(resource: SpineResource) {
    const entity = resource.instantiate();
    root.addChild(entity);
    return entity.getComponent(SpineAnimationRenderer);
  }
  function visiblePixels() {
    engine.update();
    const gl = canvas.getContext("webgl2")!;
    const pixels = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 30) count++;
    expect(gl.getError()).to.equal(0);
    return count;
  }

  for (const version of ["3.8", "4.2"] as const) {
    it(`${version}: renders slot materials through late edits, skin changes and animated draw order`, async () => {
      const raw = await fetch(urls[version]).then((r) => r.json());
      raw.slots = [0, 1, 2].map((i) => ({ name: `slot${i}`, bone: "root", attachment: "quad" }));
      raw.skins.forEach((skin, skinIndex) => {
        skin.attachments = Object.fromEntries(
          [0, 1, 2].map((i) => [
            `slot${i}`,
            { quad: { path: skinIndex ? "alt" : "quad", x: (i - 1) * 60, width: 40, height: 40 } }
          ])
        );
      });
      raw.animations = {
        reorder: { drawOrder: [{ time: 0, offsets: [{ slot: "slot1", offset: 1 }] }] }
      };
      const resource = await createGeometryResource(version, raw);
      resource._runtime.getTextures(resource.skeletonData._native).forEach((texture, i) => {
        const color = i ? [0, 0, 255, 255] : [255, 0, 0, 255];
        texture.setPixelBuffer(new Uint8Array(Array.from({ length: 16 }, () => color).flat()));
      });
      const renderer = attach(resource);
      const slot = renderer.skeleton.findSlot("slot1")!;
      const original = renderer.getMaterial();
      const shader = Shader.create(
        spineShaderSource
          .replace('Shader "2D/Spine"', `Shader "SpineSlotMaterial${version}"`)
          .replace("gl_FragColor = texColor * lightColor;", "gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);")
      );
      const material = new SpineMaterial(engine, shader);
      let changeMaterial: (() => void) | null = null;
      class LateMaterialChange extends Script {
        override onLateUpdate(): void {
          changeMaterial?.();
          changeMaterial = null;
        }
      }
      renderer.entity.addComponent(LateMaterialChange);
      const sample = () =>
        [26, 64, 102].map((x) => {
          const pixel = new Uint8Array(4);
          canvas.getContext("webgl2")!.readPixels(x, 64, 1, 1, 0x1908, 0x1401, pixel);
          return Array.from(pixel.slice(0, 3));
        });
      visiblePixels();
      expect(renderer["_geometry"].batchCount).to.equal(1);
      changeMaterial = () => renderer.setMaterial(slot, material);
      visiblePixels();
      expect(sample()).to.deep.equal([
        [255, 0, 0],
        [0, 255, 0],
        [255, 0, 0]
      ]);
      expect(renderer["_geometry"].batchCount).to.equal(3);
      expect(renderer.getMaterial(slot)).to.equal(material);
      expect(renderer.getMaterial(0)).to.equal(original);

      renderer.state.setAnimation(0, "reorder", true);
      visiblePixels();
      expect(sample()).to.deep.equal([
        [255, 0, 0],
        [0, 255, 0],
        [255, 0, 0]
      ]);
      expect(renderer["_geometry"].batchCount).to.equal(2);
      expect(renderer["_geometry"].batches.slice(0, 2).map((batch) => batch.material)).to.deep.equal([
        original,
        material
      ]);
      renderer.skeleton.setSkinByName("alt");
      renderer.skeleton.setSlotsToSetupPose();
      visiblePixels();
      expect(sample()).to.deep.equal([
        [0, 0, 255],
        [0, 255, 0],
        [0, 0, 255]
      ]);

      changeMaterial = () => renderer.setMaterial(slot, null);
      visiblePixels();
      expect(renderer.getMaterial(slot)).to.equal(original);
      expect(renderer["_geometry"].batchCount).to.equal(1);
      expect(sample()).to.deep.equal([
        [0, 0, 255],
        [0, 0, 255],
        [0, 0, 255]
      ]);
      changeMaterial = () => {
        renderer.setMaterial(0, material);
        renderer.setMaterial(slot, material);
      };
      visiblePixels();
      expect(renderer["_geometry"].batchCount).to.equal(1);
      expect(sample()).to.deep.equal([
        [0, 255, 0],
        [0, 255, 0],
        [0, 255, 0]
      ]);
      changeMaterial = () => renderer.setMaterial(null);
      visiblePixels();
      expect(sample()).to.deep.equal([
        [0, 0, 0],
        [0, 255, 0],
        [0, 0, 0]
      ]);
    });

    it(`${version}: owns slot material references across cloning, rebinding and destruction`, async () => {
      const resource = await load(version);
      const a = attach(resource);
      const slot = a.skeleton.findSlot("slot")!;
      const material = new SpineMaterial(engine);
      a.setMaterial(slot, material);
      a.setMaterial(slot, material);
      expect(material.refCount).to.equal(1);
      const b = a.entity.clone().getComponent(SpineAnimationRenderer);
      root.addChild(b.entity);
      const cloneSlot = b.skeleton.findSlot("slot")!;
      expect(b.getMaterial(cloneSlot)).to.equal(material);
      expect(material.refCount).to.equal(2);
      expect(() => b.setMaterial(slot, material)).to.throw("current skeleton");
      expect(() => b.getMaterial(slot)).to.throw("current skeleton");
      a.resource = await load(version === "3.8" ? "4.2" : "3.8");
      expect(material.refCount).to.equal(1);
      expect(() => a.setMaterial(slot, material)).to.throw("current skeleton");
      expect(a.getMaterial(a.skeleton.findSlot("slot")!)).to.equal(a.getMaterial());
      engine.resourceManager.gc();
      expect(material.destroyed).to.equal(false);
      b.entity.destroy();
      expect(material.refCount).to.equal(0);
      engine.resourceManager.gc();
      expect(material.destroyed).to.equal(true);
    });

    it(`${version}: keeps slot handles stable across skin changes and attachment edits local to each instance`, async () => {
      const resource = await load(version);
      const a = attach(resource);
      const b = attach(resource);
      const slot = a.skeleton.findSlot("slot")!;
      expect(slot).to.be.instanceOf(SpineSlot);
      expect(slot).to.equal(a.skeleton.slots[0]);
      expect(slot.bone).to.equal(a.skeleton.findBone("root"));
      expect(slot).to.not.equal(b.skeleton.findSlot("slot"));
      expect(a.skeleton.findSlot("missing")).to.equal(null);

      slot.setAttachment(null);
      a.update(0);
      b.update(0);
      expect(a["_geometry"].indexCount).to.equal(0);
      expect(b["_geometry"].indexCount).to.be.greaterThan(0);

      a.skeleton.setSkinByName("alt");
      slot.setToSetupPose();
      a.update(0);
      expect(a["_geometry"].indexCount).to.be.greaterThan(0);
      expect(a["_geometry"].batches[0].texture).to.not.equal(b["_geometry"].batches[0].texture);
      expect(a.skeleton.findSlot("slot")).to.equal(slot);
      slot.setAttachment(null);
      slot.setAttachment("quad");
      a.update(0);
      expect(a["_geometry"].indexCount).to.be.greaterThan(0);
    });

    it(`${version}: scales animation and skeleton time together, and applies manual poses while paused`, async () => {
      const renderer = attach(await load(version));
      const state = renderer.state;
      const entry = state.setAnimation(0, "idle", true);
      renderer.timeScale = 0.5;
      state.timeScale = 0.5;
      entry.timeScale = 0.5;
      renderer.update(0.8);
      expect(entry.trackTime).to.be.closeTo(0.1, 1e-6);
      expect((renderer["_skeleton"] as any).time).to.be.closeTo(0.4, 1e-6);
      renderer.timeScale = 0;
      renderer.update(1);
      expect(entry.trackTime).to.be.closeTo(0.1, 1e-6);
      expect((renderer["_skeleton"] as any).time).to.be.closeTo(0.4, 1e-6);
      entry.trackTime = 0.75;
      renderer.update(1);
      expect(renderer.skeleton.findBone("root").x).to.be.closeTo(0.15, 1e-6);
      renderer.skeleton.setSkinByName("alt");
      renderer.skeleton.setSlotsToSetupPose();
      expect(visiblePixels()).to.be.greaterThan(100);
      renderer.timeScale = 1;
      renderer.update(0.4);
      expect(entry.trackTime).to.be.closeTo(0.85, 1e-6);
      expect((renderer["_skeleton"] as any).time).to.be.closeTo(0.8, 1e-6);
    });

    it(`${version}: seeks within a trimmed animation, clamping once and wrapping when looping`, async () => {
      const renderer = attach(await load(version));
      const entry = renderer.state.setAnimation(0, "idle", false);
      entry.animationStart = 0.25;
      entry.animationEnd = 0.75;
      entry.trackTime = 0.6;
      renderer.update(0);
      expect(entry.isComplete()).to.be.true;
      expect(entry.getAnimationTime()).to.be.closeTo(0.75, 1e-6);
      expect(renderer.skeleton.findBone("root").x).to.be.closeTo(0.15, 1e-6);

      entry.loop = true;
      renderer.update(0);
      expect(entry.getAnimationTime()).to.be.closeTo(0.35, 1e-6);
      expect(renderer.skeleton.findBone("root").x).to.be.closeTo(0.07, 1e-6);
    });

    it(`${version}: draws per-batch textures and blend modes with one shared material, respecting fixed custom states`, async () => {
      const raw = await fetch(urls[version]).then((r) => r.json());
      raw.slots = [];
      raw.skins = [{ name: "default", attachments: {} }];
      ["normal", "additive", "multiply", "screen"].forEach((blend, index) => {
        for (let layer = 0; layer < 2; layer++) {
          const name = `slot${index}_${layer}`;
          raw.slots.push({ name, bone: "root", attachment: "quad", blend: layer ? blend : "normal" });
          raw.skins[0].attachments[name] = {
            quad: { path: layer ? "alt" : "quad", x: -60 + index * 40, width: 30, height: 40 }
          };
        }
      });
      const resource = await createGeometryResource(version, raw);
      const textures = resource._runtime.getTextures(resource.skeletonData._native);
      textures.forEach((texture, index) => {
        const pixel = index ? [0, 128, 0, 255] : [128, 0, 0, 255];
        texture.setPixelBuffer(new Uint8Array(Array.from({ length: 16 }, () => pixel).flat()));
      });
      const renderer = attach(resource);
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(renderer.getMaterials()).to.have.length(1);
      const gl = canvas.getContext("webgl2")!;
      const sample = (x: number) => {
        const pixel = new Uint8Array(4);
        gl.readPixels(x, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return Array.from(pixel);
      };
      const [normal, additive, multiply, screen] = [26, 51, 77, 102].map(sample);
      expect(normal[0]).to.equal(0);
      expect(normal[1]).to.be.greaterThan(50);
      expect(additive[0]).to.be.greaterThan(50);
      expect(additive[1]).to.be.greaterThan(50);
      expect(multiply.slice(0, 3)).to.deep.equal([0, 0, 0]);
      expect(screen[0]).to.be.greaterThan(50);
      expect(screen[1]).to.be.greaterThan(50);
      const fixedShader = Shader.create(
        spineShaderSource
          .replace('Shader "2D/Spine"', `Shader "SpineFixedBlend${version}"`)
          .replace(
            "SourceColorBlendFactor = renderElement_SpineSourceColorBlendFactor;",
            "SourceColorBlendFactor = BlendFactor.One;"
          )
          .replace(
            "DestinationColorBlendFactor = renderElement_SpineDestinationColorBlendFactor;",
            "DestinationColorBlendFactor = BlendFactor.Zero;"
          )
      );
      renderer.setMaterial(new SpineMaterial(engine, fixedShader));
      expect(visiblePixels()).to.be.greaterThan(100);
      for (const x of [26, 51, 77, 102]) {
        const pixel = sample(x);
        expect(pixel[0]).to.equal(0);
        expect(pixel[1]).to.be.greaterThan(50);
      }
    });

    it(`${version}: keeps one custom material across batches, parameter edits, skins and resource bindings`, async () => {
      const raw = await fetch(urls[version]).then((r) => r.json());
      raw.slots.push({ name: "second", bone: "root", attachment: "quad", blend: "additive" });
      raw.skins[0].attachments.second = { quad: { path: "alt", width: 100, height: 100 } };
      const resource = await createGeometryResource(version, raw);
      const renderer = attach(resource);
      expect(renderer.resource).to.equal(resource);
      const shader = Shader.create(
        spineShaderSource
          .replace('Shader "2D/Spine"', `Shader "SpineCustomMaterial${version}"`)
          .replace(
            "sampler2D renderElement_SpineTexture;",
            "sampler2D renderElement_SpineTexture;\nfloat material_TestBrightness;"
          )
          .replace(
            "gl_FragColor = texColor * lightColor;",
            "gl_FragColor = texColor * lightColor;\ngl_FragColor.rgb *= material_TestBrightness;"
          )
      );
      const material = new SpineMaterial(engine, shader);
      material.shaderData.setFloat("material_TestBrightness", 1);
      renderer.setMaterial(material);
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(renderer["_geometry"].batchCount).to.equal(2);
      expect(renderer.getMaterials()).to.deep.equal([material]);
      material.shaderData.setFloat("material_TestBrightness", 0);
      expect(visiblePixels()).to.equal(0);
      material.shaderData.setFloat("material_TestBrightness", 1);
      const instance = renderer.getInstanceMaterial();
      expect(instance).to.not.equal(material);
      expect(instance.shader).to.equal(shader);
      instance.shaderData.setFloat("material_TestBrightness", 0);
      expect(visiblePixels()).to.equal(0);
      expect(material.shaderData.getFloat("material_TestBrightness")).to.equal(1);
      instance.shaderData.setFloat("material_TestBrightness", 1);
      renderer.skeleton.setSkinByName("alt");
      renderer.skeleton.setSlotsToSetupPose();
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(renderer.getMaterial()).to.equal(instance);
      renderer.resource = null;
      expect(visiblePixels()).to.equal(0);
      expect(renderer.getMaterial()).to.equal(instance);
      renderer.resource = await load(version === "3.8" ? "4.2" : "3.8");
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(renderer.getMaterial()).to.equal(instance);
      renderer.setMaterial(null);
      expect(visiblePixels()).to.equal(0);
    });
  }

  it("4.2: renderer speed scales physics simulation with the same elapsed time as animation", async () => {
    const resource = await engine.resourceManager.load<SpineResource>({
      url: new URL("./fixtures/physics.json", import.meta.url).href,
      type: "Spine"
    });
    const slow = attach(resource);
    const reference = attach(resource);
    slow.timeScale = 0.5;
    const slowEntry = slow.state.setAnimation(0, "idle", true);
    const referenceEntry = reference.state.setAnimation(0, "idle", true);
    for (let i = 0; i < 60; i++) {
      slow.update(1 / 60);
      reference.update(1 / 120);
    }
    expect(slowEntry.trackTime).to.be.closeTo(0.5, 1e-6);
    expect(slowEntry.trackTime).to.equal(referenceEntry.trackTime);
    const a = slow["_skeleton"] as any;
    const b = reference["_skeleton"] as any;
    expect(a.time).to.be.closeTo(0.5, 1e-6);
    expect(a.physicsConstraints[0].lastTime).to.be.closeTo(0.5, 1e-6);
    expect(a.physicsConstraints[0].lastTime).to.equal(b.physicsConstraints[0].lastTime);
    expect(a.bones[0].worldX).to.be.closeTo(b.bones[0].worldX, 1e-6);
    const worldX = a.bones[0].worldX;
    slow.timeScale = 0;
    slow.update(1);
    expect(a.time).to.be.closeTo(0.5, 1e-6);
    expect(a.bones[0].worldX).to.be.closeTo(worldX, 1e-6);
  });

  for (const version of ["3.8", "4.2"] as const) {
    for (const mode of [
      "atlas-relative",
      "explicit",
      "explicit-query",
      "virtual",
      "single-url-query",
      "single-url-fragment"
    ] as const) {
      it(`${version}: loads and renders with ${mode} atlas textures`, async () => {
        const atlasUrl = new URL(`./fixtures/${version}.atlas`, import.meta.url).href;
        const textureUrls = ["page.png", "alt.png"].map((name) => new URL(`./fixtures/${name}`, import.meta.url).href);
        let resource: SpineResource;
        if (mode === "virtual") {
          const skeletonPath = `/characters/${version}/character.json`;
          const atlasPath = `/characters/${version}/character.atlas`;
          const texturePaths = [0, 1].map((index) => `/textures/${version}/${index}.tex`);
          engine.resourceManager.registerVirtualResources([
            { virtualPath: skeletonPath, path: urls[version], type: "Spine", dependentAssetMap: { atlas: atlasPath } },
            {
              virtualPath: atlasPath,
              path: atlasUrl,
              type: "SpineAtlas",
              dependentAssetMap: { "textures[0]": texturePaths[0], "textures[1]": texturePaths[1] }
            },
            ...texturePaths.map((virtualPath, index) => ({
              virtualPath,
              path: textureUrls[index] + "?v=1",
              type: AssetType.Texture
            }))
          ]);
          resource = await engine.resourceManager.load<SpineResource>({ url: skeletonPath, type: "Spine" });
        } else if (mode === "single-url-query" || mode === "single-url-fragment") {
          const suffix = mode === "single-url-query" ? "?v=1.2&source=file.bin#preview" : "#preview";
          resource = await engine.resourceManager.load<SpineResource>({
            url: urls[version] + suffix,
            type: "Spine"
          });
        } else {
          const explicitPaths =
            mode === "explicit-query"
              ? textureUrls
                  .slice()
                  .reverse()
                  .map((url) => url + "?v=1&source=/other/image.png")
              : mode === "explicit"
                ? textureUrls
                : [];
          if (mode === "explicit-query") {
            const textures = await engine.resourceManager.load<Texture2D[]>(explicitPaths);
            textures.forEach((texture) => (texture.name = "user-renamed-texture"));
          }
          resource = await engine.resourceManager.load<SpineResource>({
            urls: [urls[version], atlasUrl, ...explicitPaths],
            type: "Spine"
          });
        }
        const renderer = attach(resource);
        const gl = canvas.getContext("webgl2")!;
        const pixel = new Uint8Array(4);
        expect(visiblePixels()).to.be.greaterThan(100);
        gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        expect(Array.from(pixel)).to.deep.equal([255, 0, 0, 255]);
        renderer.skeleton.setSkinByName("alt");
        renderer.skeleton.setSlotsToSetupPose();
        expect(visiblePixels()).to.be.greaterThan(100);
        gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        expect(Array.from(pixel)).to.deep.equal([0, 0, 255, 255]);
      });
    }
  }

  for (const version of ["3.8", "4.2"] as const) {
    it(`${version}: grows CPU geometry, reuses GPU buffers and switches tint layout`, async () => {
      const raw = await fetch(urls[version]).then((r) => r.json());
      raw.slots = [];
      raw.skins.length = 1;
      raw.skins[0].attachments = {};
      for (let i = 0; i < 40; i++) {
        const name = `slot${i}`;
        raw.slots.push({ name, bone: "root", attachment: "quad", dark: "000000" });
        raw.skins[0].attachments[name] = {
          quad: { path: i % 2 ? "alt" : "quad", width: 100, height: 100 }
        };
      }
      const resource = await createGeometryResource(version, raw);
      const renderer = attach(resource);
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(renderer._subPrimitives).to.have.length(40);
      expect(renderer._subPrimitives[39].start).to.equal(39 * 6);
      const geometry = renderer["_geometry"];
      expect(geometry.vertexCount).to.equal(160);
      expect(geometry.indexCount).to.equal(240);
      expect(Math.max(...geometry.indices.subarray(0, geometry.indexCount))).to.equal(159);
      const vertices = geometry.vertices;
      const indices = geometry.indices;
      const vertexBuffer = renderer._vertexBuffer;
      const indexBuffer = renderer._indexBuffer;
      visiblePixels();
      expect(geometry.vertices).to.equal(vertices);
      expect(geometry.indices).to.equal(indices);
      expect(renderer._vertexBuffer).to.equal(vertexBuffer);
      expect(renderer._indexBuffer).to.equal(indexBuffer);
      renderer.tintBlack = true;
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(geometry.vertexStride).to.equal(12);
      expect(vertexBuffer.destroyed).to.be.true;
      expect(indexBuffer.destroyed).to.be.true;
      renderer.tintBlack = false;
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(geometry.vertexStride).to.equal(9);
      for (let i = 0; i < 40; i++) renderer.skeleton.setAttachment(`slot${i}`, null);
      expect(visiblePixels()).to.equal(0);
      expect(renderer._subPrimitives).to.have.length(0);
      expect(renderer.getMaterials()).to.have.length(1);
      expect(geometry.batches.every((batch) => batch.texture === null)).to.be.true;
      renderer.skeleton.setAttachment("slot0", "quad");
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(renderer._subPrimitives).to.have.length(1);
    });
  }

  for (const version of ["3.8", "4.2"] as const) {
    it(`${version}: batches adjacent attachments without losing draw order or index offsets`, async () => {
      const raw = await fetch(urls[version]).then((r) => r.json());
      raw.slots = [];
      raw.skins.length = 1;
      raw.skins[0].attachments = {};
      const paths = ["quad", null, "quad", "quad", "alt", "quad"];
      paths.forEach((path, index) => {
        const name = `slot${index}`;
        raw.slots.push({
          name,
          bone: "root",
          attachment: path ? "quad" : undefined,
          blend: index === 3 ? "additive" : "normal",
          dark: "000000"
        });
        if (path) raw.skins[0].attachments[name] = { quad: { path, width: 100, height: 100 } };
      });
      const renderer = attach(await createGeometryResource(version, raw));
      renderer.zSpacing = 0.01;
      for (const tintBlack of [false, true]) {
        renderer.tintBlack = tintBlack;
        expect(visiblePixels()).to.be.greaterThan(100);
        const geometry = renderer["_geometry"];
        expect(geometry.vertexCount).to.equal(20);
        expect(geometry.indexCount).to.equal(30);
        expect(geometry.batchCount).to.equal(4);
        expect(
          geometry.batches.slice(0, 4).map(({ start, count, blendMode }) => [start, count, blendMode])
        ).to.deep.equal([
          [0, 12, 0],
          [12, 6, 1],
          [18, 6, 0],
          [24, 6, 0]
        ]);
        expect(geometry.batches[0].texture).to.equal(geometry.batches[1].texture);
        expect(geometry.batches[0].texture).to.not.equal(geometry.batches[2].texture);
        expect(geometry.batches[0].texture).to.equal(geometry.batches[3].texture);
        const drawOrder = [0, 2, 3, 4, 5];
        for (let quad = 0; quad < 5; quad++) {
          expect(Array.from(geometry.indices.subarray(quad * 6, quad * 6 + 6))).to.deep.equal(
            [0, 1, 2, 2, 3, 0].map((index) => index + quad * 4)
          );
          for (let vertex = 0; vertex < 4; vertex++) {
            expect(geometry.vertices[(quad * 4 + vertex) * geometry.vertexStride + 2]).to.be.closeTo(
              drawOrder[quad] * renderer.zSpacing,
              0.000001
            );
          }
        }
        expect(renderer._localBounds.min.z).to.equal(0);
        expect(renderer._localBounds.max.z).to.equal(0.05);
      }
    });

    it(`${version}: allocates mesh vertices independently of triangle indices`, async () => {
      const raw = await fetch(urls[version]).then((r) => r.json());
      raw.skins.length = 1;
      const points = [
        [-50, -50],
        [50, -50],
        [-50, 50]
      ];
      raw.skins[0].attachments.slot.quad = {
        type: "mesh",
        path: "quad",
        hull: 3,
        triangles: [0, 1, 2],
        uvs: Array.from({ length: 80 }, (_, i) => points[i % 3].map((v) => (v + 50) / 100)).flat(),
        vertices: Array.from({ length: 80 }, (_, i) => points[i % 3]).flat()
      };
      const renderer = attach(await createGeometryResource(version, raw));
      expect(visiblePixels()).to.be.greaterThan(100);
      const geometry = renderer["_geometry"];
      expect(geometry.vertexCount).to.equal(80);
      expect(geometry.indexCount).to.equal(3);
      expect(renderer._vertexBuffer.byteLength).to.be.at.least(80 * 9 * 4);
      expect(Array.from(geometry.vertices.subarray(0, 3))).to.deep.equal([-0.5, -0.5, 0]);
    });

    it(`${version}: preserves clipping with both vertex layouts`, async () => {
      const raw = await fetch(urls[version]).then((r) => r.json());
      raw.slots.unshift({ name: "clip", bone: "root", attachment: "clip" });
      raw.slots[1].dark = "000000";
      raw.skins[0].attachments.clip = {
        clip: { type: "clipping", end: "slot", vertexCount: 4, vertices: [-25, -25, -25, 25, 25, 25, 25, -25] }
      };
      const renderer = attach(await createGeometryResource(version, raw));
      for (const tintBlack of [false, true]) {
        renderer.tintBlack = tintBlack;
        const count = visiblePixels();
        expect(count).to.be.greaterThan(200);
        expect(count).to.be.lessThan(2000);
        expect(renderer._localBounds.min.x).to.be.closeTo(-0.25, 0.001);
        expect(renderer._localBounds.max.x).to.be.closeTo(0.25, 0.001);
      }
    });
  }

  it("rejects the Spine load when its atlas cannot be fetched", async () => {
    await expect(
      engine.resourceManager.load<SpineResource>({
        urls: [urls["3.8"], new URL("./fixtures/missing.atlas", import.meta.url).href],
        type: "Spine"
      })
    ).rejects.toBeDefined();
  });

  for (const first of ["3.8", "4.2"] as const) {
    for (const nextAction of ["replace", "enqueue"] as const) {
      it(`${first}: ${nextAction}s the next animation from a playback completion callback`, async () => {
        const renderer = attach(await load(first));
        const state = renderer.state;
        const firstEntry = state.setAnimation(0, "idle", false);
        let nextEntry: SpineTrackEntry;
        let completions = 0;
        let disposals = 0;
        state.addListener({ dispose: () => disposals++ });
        firstEntry.listener = {
          complete(entry) {
            expect(entry).to.equal(firstEntry);
            completions++;
            nextEntry =
              nextAction === "replace" ? state.setAnimation(0, "idle", true) : state.addAnimation(0, "idle", true, 0);
          }
        };
        renderer.update(0);
        renderer.update(1.1);
        renderer.update(0.1);
        expect(completions).to.equal(1);
        expect(state.getCurrent(0)).to.equal(nextEntry!);
        expect(nextEntry!.disposed).to.equal(false);
        expect(visiblePixels()).to.be.greaterThan(100);
        state.clearTracks();
        expect(firstEntry.disposed).to.equal(true);
        expect(nextEntry!.disposed).to.equal(true);
        expect(disposals).to.equal(2);
      });
    }

    for (const updateMode of ["engine", "manual"] as const) {
      it(`${first}: disposes a completed effect and its queued animations during ${updateMode} update`, async () => {
        const renderer = attach(await load(first));
        const state = renderer.state;
        const effect = state.setAnimation(0, "idle", false);
        const queued = state.addAnimation(0, "idle", false, 2);
        const globalDisposals: SpineTrackEntry[] = [];
        const entryDisposals: SpineTrackEntry[] = [];
        state.addListener({
          dispose(entry) {
            expect(entry.disposed).to.equal(false);
            expect(entry.trackTime).to.be.a("number");
            globalDisposals.push(entry);
          }
        });
        const dispose = (entry: SpineTrackEntry) => {
          expect(entry.disposed).to.equal(false);
          entryDisposals.push(entry);
        };
        effect.listener = { complete: () => renderer.entity.destroy(), dispose };
        queued.listener = { dispose };
        renderer.update(0);
        if (updateMode === "engine") {
          effect.trackTime = 1.1;
          engine.update();
        } else {
          renderer.update(1.1);
        }
        expect(renderer.entity.destroyed).to.equal(true);
        expect(globalDisposals).to.have.members([effect, queued]);
        expect(entryDisposals).to.have.members([effect, queued]);
        expect(effect.disposed).to.equal(true);
        expect(queued.disposed).to.equal(true);
        expect(() => {
          effect.trackTime = 0;
        }).to.throw("disposed");
        expect(visiblePixels()).to.equal(0);
      });
    }

    it(`${first}: publishes a fully configured empty animation before its start callback`, async () => {
      const renderer = attach(await load(first));
      const state = renderer.state;
      state.setAnimation(0, "idle", true);
      renderer.update(0);
      let started: SpineTrackEntry;
      state.addListener({
        start(entry) {
          started = entry;
          expect(entry.mixDuration).to.equal(0.25);
        }
      });
      const entry = state.setEmptyAnimation(0, 0.25);
      expect(started!).to.equal(entry);
    });

    it(`${first}: reuses public objects and forwards pose and mix changes to the backend`, async () => {
      const resource = await load(first);
      const a = attach(resource),
        b = attach(resource);
      expect(a.skeleton).to.be.instanceOf(SpineSkeleton);
      expect(a.state).to.be.instanceOf(SpineAnimationState);
      expect(a.skeleton).to.not.equal(a["_skeleton"]);
      expect(a.state).to.not.equal(a["_state"]);
      expect(a.skeleton.data).to.equal(resource.skeletonData);
      expect(a.state.data).to.equal(resource.stateData);
      expect(a.state.data.skeletonData).to.equal(resource.skeletonData);
      const bones = a.skeleton.bones;
      const bone = a.skeleton.findBone("root")!;
      expect(bone).to.equal(bones[0]);
      bone.x = 2;
      bone.y = 3;
      bone.rotation = 30;
      bone.scaleX = 2;
      bone.scaleY = 3;
      bone.shearX = 60;
      bone.shearY = 30;
      a.skeleton.x = 10;
      a.skeleton.y = 20;
      a.skeleton.scaleX = -2;
      a.skeleton.scaleY = 4;
      a.update(0);
      // Local axes point at 90 and 150 degrees before the skeleton's scale and translation are applied.
      expect(bone.a).to.be.closeTo(0, 1e-6);
      expect(bone.b).to.be.closeTo(3 * Math.sqrt(3), 1e-6);
      expect(bone.c).to.be.closeTo(8, 1e-6);
      expect(bone.d).to.be.closeTo(6, 1e-6);
      expect(bone.worldX).to.equal(6);
      expect(bone.worldY).to.equal(32);
      b.update(0);
      const otherBone = b.skeleton.findBone("root")!;
      expect(otherBone.a).to.equal(1);
      expect(otherBone.b).to.be.closeTo(0, 1e-6);
      expect(otherBone.c).to.equal(0);
      expect(otherBone.d).to.be.closeTo(1, 1e-6);
      expect([otherBone.worldX, otherBone.worldY]).to.deep.equal([0, 0]);
      bone.setToSetupPose();
      a.update(0);
      expect([bone.x, bone.y, bone.rotation, bone.scaleX, bone.scaleY, bone.shearX, bone.shearY]).to.deep.equal([
        0, 0, 0, 1, 1, 0, 0
      ]);
      // Resetting a bone preserves placement and mirroring of the skeleton instance.
      expect([a.skeleton.x, a.skeleton.y, a.skeleton.scaleX, a.skeleton.scaleY]).to.deep.equal([10, 20, -2, 4]);
      expect(bone.a).to.be.closeTo(-2, 1e-6);
      expect(bone.b).to.be.closeTo(0, 1e-6);
      expect(bone.c).to.be.closeTo(0, 1e-6);
      expect(bone.d).to.be.closeTo(4, 1e-6);
      expect([bone.worldX, bone.worldY]).to.deep.equal([10, 20]);
      expect(a.skeleton.bones).to.equal(bones);
      expect(a.skeleton.findBone("root")).to.equal(bone);
      const skin = resource.skeletonData.findSkin("alt")!;
      expect(resource.skeletonData.findSkin("alt")).to.equal(skin);
      a.skeleton.setSkin(skin);
      b.skeleton.setSkin(skin);
      expect(a.skeleton.skin).to.equal(b.skeleton.skin);
      resource.stateData.defaultMix = 0.25;
      expect(a.state.data.defaultMix).to.equal(0.25);
      expect(b["_state"].data.defaultMix).to.equal(0.25);
    });

    it(`${first}: wraps callback arguments and invalidates entries before native pool reuse`, async () => {
      const renderer = attach(await load(first));
      const state = renderer.state;
      let started: SpineTrackEntry;
      let completed: SpineTrackEntry;
      let snapshot: SpineEvent;
      let rawEvent: unknown;
      const disposed: SpineTrackEntry[] = [];
      const listener = {
        start(entry: SpineTrackEntry) {
          started = entry;
        },
        complete(entry: SpineTrackEntry) {
          completed = entry;
        },
        event(entry: SpineTrackEntry, event: SpineEvent) {
          expect(entry).to.equal(state.getCurrent(0));
          snapshot = event;
        },
        dispose(entry: SpineTrackEntry) {
          expect(entry.disposed).to.equal(false);
          expect(entry.trackTime).to.be.a("number");
          disposed.push(entry);
        }
      };
      state.addListener(listener);
      const entry = state.setAnimation(0, "idle", false);
      const native = renderer["_state"].getCurrent(0)!;
      renderer["_state"].addListener({
        event(_entry, event) {
          rawEvent = event;
        }
      });
      expect(entry).to.be.instanceOf(SpineTrackEntry);
      expect(entry).to.equal(started!);
      expect(entry).to.equal(state.getCurrent(0));
      expect(entry).to.not.equal(native);
      let perEntryDisposed: SpineTrackEntry;
      entry.listener = {
        dispose(value) {
          perEntryDisposed = value;
        }
      };
      renderer.update(0);
      renderer.update(0.6);
      expect(snapshot!.data.name).to.equal("step");
      expect(snapshot!.intValue).to.equal(7);
      expect(snapshot).to.not.equal(rawEvent);
      expect(Object.isFrozen(snapshot)).to.equal(true);
      renderer.update(0.5);
      expect(completed!).to.equal(entry);
      state.clearTrack(0);
      expect(perEntryDisposed!).to.equal(entry);
      expect(disposed).to.deep.equal([entry]);
      expect(entry.disposed).to.equal(true);
      expect(() => entry.trackTime).to.throw("disposed");
      const replacement = state.setAnimation(0, "idle", true);
      expect(renderer["_state"].getCurrent(0)).to.equal(native);
      expect(replacement).to.not.equal(entry);
      expect(() => {
        entry.trackTime = 99;
      }).to.throw("disposed");
      expect(replacement.trackTime).to.equal(0);
      state.removeListener(listener);
      state.clearListeners();
      state.clearTracks();
      expect(replacement.disposed).to.equal(true);
      expect(disposed).to.have.length(1);
    });

    it(`loads ${first} first, shares data and preserves independent poses through cross-version clones`, async () => {
      const second = first === "3.8" ? "4.2" : "3.8";
      const a = await load(first);
      const a1 = attach(a);
      const before = visiblePixels();
      expect(before).to.be.greaterThan(100);
      const b = await load(second);
      const b1 = attach(b);
      const a2 = attach(a);
      const b2 = b1.entity.clone().getComponent(SpineAnimationRenderer);
      root.addChild(b2.entity);
      expect(a1.skeleton.data).to.equal(a2.skeleton.data);
      expect(a1.state.data).to.equal(a2.state.data);
      expect(a1.skeleton).to.not.equal(a2.skeleton);
      expect(a1.skeleton.bones[0]).to.not.equal(a2.skeleton.bones[0]);
      expect(a1.state).to.not.equal(a2.state);
      a1.state.setAnimation(0, "idle", true);
      a1.update(0.5);
      expect(a1.skeleton.bones[0].x).to.not.equal(a2.skeleton.bones[0].x);
      expect(a1.physics!.supported).to.equal(first === "4.2");
      expect(b2.physics!.supported).to.equal(second === "4.2");
      for (const renderer of [a1, b1, a2, b2]) {
        renderer.update(0);
        expect(renderer._subPrimitives.length).to.be.greaterThan(0);
      }
      expect(visiblePixels()).to.be.greaterThan(100);
    });

    it(`${first}: retains inactive-skin textures and shared materials until the last user releases them`, async () => {
      const resource = await load(first);
      const textures = resource._runtime.getTextures(resource.skeletonData._native);
      expect(textures).to.have.length(2);
      const a = attach(resource);
      const b = attach(resource);
      engine.resourceManager.gc();
      for (const texture of textures) expect(texture.destroyed).to.equal(false);
      a.update(0);
      b.update(0);
      const material = a.getMaterial();
      expect(material).to.equal(b.getMaterial());
      a.entity.destroy();
      engine.resourceManager.gc();
      expect(material.destroyed).to.equal(false);
      expect(b.getMaterial()).to.equal(material);
      expect(visiblePixels()).to.be.greaterThan(100);
      b.skeleton.setSkinByName("alt");
      b.skeleton.setSlotsToSetupPose();
      b.update(0);
      expect(b.getMaterial()).to.equal(material);
      engine.resourceManager.gc();
      expect(material.destroyed).to.equal(false);
      // The resource owns its template, including the template renderer's primitive.
      const template = resource["_template"];
      const primitive = template.getComponent(SpineAnimationRenderer)._primitive;
      b.entity.destroy();
      engine.resourceManager.gc();
      expect(resource.destroyed).to.equal(true);
      expect(template.destroyed).to.equal(true);
      expect(primitive.destroyed).to.equal(true);
      expect(material.destroyed).to.equal(true);
    });
  }

  it("parses binary assets with both native backends", async () => {
    for (const version of ["3.8", "4.2"] as const) {
      const resource = await engine.resourceManager.load<SpineResource>({
        url: urls[version].replace(".json", ".skel"),
        type: "Spine"
      });
      expect(resource.skeletonData.version).to.equal(`${version}.99`);
      expect(resource._runtime).to.equal(runtimes[version]);
      attach(resource).update(0);
    }
  });

  it("accepts BOM and whitespace before a JSON skeleton", async () => {
    const resource = await engine.resourceManager.load<SpineResource>({
      url: new URL("./fixtures/whitespace.skel", import.meta.url).href,
      type: "Spine"
    });
    expect(resource._runtime).to.equal(runtimes["3.8"]);
    attach(resource);
    expect(visiblePixels()).to.be.greaterThan(100);
  });

  it("protects sequence frames that are not currently displayed", async () => {
    const resource = await engine.resourceManager.load<SpineResource>({
      url: new URL("./fixtures/sequence.json", import.meta.url).href,
      type: "Spine"
    });
    const renderer = attach(resource);
    const textures = resource._runtime.getTextures(resource.skeletonData._native);
    expect(textures).to.have.length(2);
    engine.resourceManager.gc();
    textures.forEach((texture) => expect(texture.destroyed).to.equal(false));
    renderer.update(0);
    expect(visiblePixels()).to.be.greaterThan(100);
  });

  it("distinguishes unsupported physics from supported empty constraints, and owns physics per instance", async () => {
    const unsupported = attach(await load("3.8")).physics!;
    expect(unsupported.supported).to.equal(false);
    if (!unsupported.supported) expect(unsupported.reason).to.contain("3.8");
    const empty = attach(await load("4.2")).physics!;
    expect(empty.supported).to.equal(true);
    if (empty.supported) expect(empty.value.physicsConstraints).to.have.length(0);
    const resource = await engine.resourceManager.load<SpineResource>({
      url: new URL("./fixtures/physics.json", import.meta.url).href,
      type: "Spine"
    });
    const a = attach(resource),
      b = attach(resource);
    const pa = a.physics!,
      pb = b.physics!;
    expect(pa.supported && pb.supported).to.equal(true);
    if (pa.supported && pb.supported) {
      expect(pa.value.physicsConstraints).to.have.length(1);
      expect(pa.value.physicsConstraints[0]).to.not.equal(pb.value.physicsConstraints[0]);
      pa.value.physicsTranslate(1, 2);
      pa.value.physicsRotate(0, 0, 10);
      pa.value.physicsConstraints[0].reset();
      a.update(1 / 60);
      b.update(1 / 60);
      expect(Number.isFinite(a.skeleton.bones[0].worldX)).to.equal(true);
    }
  });

  it("composes skins using only the public resource contract", async () => {
    for (const version of ["3.8", "4.2"] as const) {
      const resource = await load(version);
      const custom = resource.createSkin("custom");
      custom.addSkin(resource.skeletonData.findSkin("alt")!);
      const renderer = attach(resource);
      renderer.skeleton.setSkin(custom);
      renderer.skeleton.setSlotsToSetupPose();
      renderer.update(0);
      expect(renderer.skeleton.skin).to.equal(custom);
    }
    expect(visiblePixels()).to.be.greaterThan(100);
  });

  it("rejects skins from a different resource before reaching a version backend", async () => {
    const a = await load("3.8"),
      b = await load("4.2");
    const skin = a.createSkin("custom");
    const foreign = b.skeletonData.findSkin("alt")!;
    expect(() => skin.addSkin(foreign)).to.throw("different Spine resources");
    expect(() => attach(a).skeleton.setSkin(foreign)).to.throw("another Spine resource");
  });

  it("switches a manually assigned resource across versions and clears stale geometry on detach", async () => {
    const a = await load("3.8");
    const b = await load("4.2");
    const renderer = root.createChild().addComponent(SpineAnimationRenderer);
    renderer.resource = a;
    expect(a.refCount).to.equal(1);
    const clone = renderer.entity.clone();
    expect(a.refCount).to.equal(2);
    clone.getComponent(SpineAnimationRenderer).update(0);
    clone.destroy();
    expect(a.refCount).to.equal(1);
    renderer.update(0);
    renderer.resource = b;
    expect(a.refCount).to.equal(0);
    expect(b.refCount).to.equal(1);
    expect(renderer.physics!.supported).to.equal(true);
    renderer.update(0);
    renderer.resource = null;
    expect(b.refCount).to.equal(0);
    expect(renderer._subPrimitives).to.have.length(0);
    expect(renderer.getMaterials()).to.have.length(1);
    expect(visiblePixels()).to.equal(0);
  });
});
