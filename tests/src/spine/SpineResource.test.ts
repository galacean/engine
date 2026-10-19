import { AssetType, Camera, Color, Entity, Texture2D, WebGLEngine } from "@galacean/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpineResource } from "../../../packages/spine/src/loader/SpineResource";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";
import { registerSpineRuntime } from "../../../packages/spine/src/runtime/SpineRuntimeRegistry";
import { Spine38Runtime } from "../../../packages/spine-core-3.8/src/Spine38Runtime";
import { Spine42Runtime } from "../../../packages/spine-core-4.2/src/Spine42Runtime";
import { SpineSkeleton } from "../../../packages/spine/src/SpineSkeleton";
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
    engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { preserveDrawingBuffer: true } });
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
    for (const mode of ["atlas-relative", "explicit", "virtual", "single-url-query", "single-url-fragment"] as const) {
      it(`${version}: loads and renders with ${mode} atlas textures`, async () => {
        const atlasUrl = new URL(`./fixtures/${version}.atlas`, import.meta.url).href;
        const textureUrls = ["page.png", "alt.png"].map((name) => new URL(`./fixtures/${name}`, import.meta.url).href);
        let resource: SpineResource;
        if (mode === "virtual") {
          const skeletonPath = `/characters/${version}/character.json`;
          const atlasPath = `/characters/${version}/character.atlas`;
          const texturePaths = ["page.png", "alt.png"].map((name) => `/textures/${version}/${name}`);
          engine.resourceManager.registerVirtualResources([
            { virtualPath: skeletonPath, path: urls[version], type: "Spine", dependentAssetMap: { atlas: atlasPath } },
            {
              virtualPath: atlasPath,
              path: atlasUrl,
              type: "SpineAtlas",
              dependentAssetMap: { page: texturePaths[0], alt: texturePaths[1] }
            },
            ...texturePaths.map((virtualPath, index) => ({
              virtualPath,
              path: textureUrls[index],
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
          resource = await engine.resourceManager.load<SpineResource>({
            urls: [urls[version], atlasUrl, ...(mode === "explicit" ? textureUrls : [])],
            type: "Spine"
          });
        }
        const renderer = attach(resource);
        expect(visiblePixels()).to.be.greaterThan(100);
        renderer.skeleton.setSkinByName("alt");
        renderer.skeleton.setSlotsToSetupPose();
        expect(visiblePixels()).to.be.greaterThan(100);
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
      expect(renderer.getMaterials()).to.have.length(0);
      expect(geometry.batches.every((batch) => batch.texture === null)).to.be.true;
      renderer.skeleton.setAttachment("slot0", "quad");
      expect(visiblePixels()).to.be.greaterThan(100);
      expect(renderer._subPrimitives).to.have.length(1);
    });
  }

  for (const version of ["3.8", "4.2"] as const) {
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
      a.update(0);
      expect(bone.worldX).to.equal(2);
      expect(b.skeleton.findBone("root")!.x).to.equal(0);
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
      expect(b.getMaterial()).to.not.equal(material);
      engine.resourceManager.gc();
      expect(material.destroyed).to.equal(true);
      // The resource owns its template, including the template renderer's primitive.
      const template = resource["_template"];
      const primitive = template.getComponent(SpineAnimationRenderer)._primitive;
      b.entity.destroy();
      engine.resourceManager.gc();
      expect(resource.destroyed).to.equal(true);
      expect(template.destroyed).to.equal(true);
      expect(primitive.destroyed).to.equal(true);
      expect(SpineAnimationRenderer._materialCacheMap.size).to.equal(0);
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
    expect(renderer.getMaterials()).to.have.length(0);
    expect(visiblePixels()).to.equal(0);
  });
});
