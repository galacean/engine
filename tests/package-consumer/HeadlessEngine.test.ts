import { resolveObjectURL } from "node:buffer";
import { createRequire } from "node:module";
import { createServer, type ServerResponse } from "node:http";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const enginePackage = require("../../packages/galacean/dist/main.js");
const { HeadlessEngine } = require("../../packages/rhi-null/dist/main.js");
const {
  MeshRenderer,
  SkinnedMeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  Vector2,
  Vector3,
  Buffer: EngineBuffer,
  BufferBindFlag,
  Script,
  Camera,
  Texture2D,
  Texture2DArray,
  TextureCube,
  Shader,
  Material,
  AnimationClip,
  AnimationFloatCurve,
  Keyframe,
  Transform,
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  AssetType,
  Loader,
  request,
  Sprite,
  SpriteRenderer,
  SetDataOptions
} = enginePackage;

const engines: InstanceType<typeof HeadlessEngine>[] = [];
async function createEngine(options = {}) {
  const engine = await HeadlessEngine.create(options);
  engines.push(engine);
  return engine;
}
afterEach(() => {
  engines.forEach((engine) => engine.destroy());
  engines.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("@galacean/engine-rhi-null in Node without browser globals", () => {
  it("initializes real engine classes without DOM, input or a graphics context", async () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(enginePackage.version).not.toBe("__buildVersion");
    expect(enginePackage.version.length).toBeGreaterThan(0);
    expect(enginePackage.SystemInfo.devicePixelRatio).toBe(1);
    expect(await enginePackage.SystemInfo._checkWebpSupported()).toBe(false);
    const engine = await createEngine({ width: 640, height: 360 });
    expect(enginePackage.SystemInfo.supportsTextureFormat(engine, enginePackage.TextureFormat.R8_UNorm)).toBe(true);
    expect([engine.canvas.width, engine.canvas.height]).toEqual([640, 360]);
    expect(engine.isPaused).toBe(true);
    expect(engine.inputManager.pointers).toEqual([]);
    expect(engine.inputManager.isKeyDown()).toBe(false);
    expect(Loader.getClass("MeshRenderer")).toBe(MeshRenderer);
    expect(() => engine._hardwareRenderer.gl).toThrow("WebGL context is unavailable");
    const renderer = engine.sceneManager.activeScene!.createRootEntity().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 4, 6);
    expect(renderer.mesh).toBeInstanceOf(ModelMesh);
    expect(renderer.bounds.min.toJSON()).toEqual({ x: -1, y: -2, z: -3 });
    expect(renderer.bounds.max.toJSON()).toEqual({ x: 1, y: 2, z: 3 });
  });

  it.each([
    ["sphere", (e) => PrimitiveMesh.createSphere(e, 2)],
    ["cuboid", (e) => PrimitiveMesh.createCuboid(e, 2, 4, 6)],
    ["plane", (e) => PrimitiveMesh.createPlane(e, 2, 4)],
    ["capsule", (e) => PrimitiveMesh.createCapsule(e, 1, 2)],
    ["torus", (e) => PrimitiveMesh.createTorus(e, 2, 0.5)],
    ["polygon", (e) => PrimitiveMesh.createPolygon(e, [new Vector2(-1, -2), new Vector2(3, -2), new Vector2(0, 4)])],
    [
      "extrusion",
      (e) => PrimitiveMesh.createExtrudedPolygon(e, [new Vector2(-1, -2), new Vector2(3, -2), new Vector2(0, 4)], 3)
    ]
  ])("uses shared %s geometry and transforms for bounds", async (_name, createMesh) => {
    const engine = await createEngine();
    const parent = engine.sceneManager.activeScene!.createRootEntity();
    parent.transform.setPosition(3, 4, 5);
    parent.transform.setRotation(15, 30, 45);
    parent.transform.setScale(-2, 3, 0.5);
    const entity = parent.createChild();
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = createMesh(engine);
    const before = renderer.bounds.min.clone();
    parent.transform.position.x += 7;
    expect(renderer.bounds.min.x).toBeCloseTo(before.x + 7);
    expect(renderer.bounds.min.y).toBeCloseTo(before.y);
    expect(renderer.bounds.min.z).toBeCloseTo(before.z);
    renderer.mesh.destroy();
  });

  it("supports retained buffers, upload readback, subviews and copies", async () => {
    const engine = await createEngine();
    const original = new Uint16Array([99, 10, 20, 30, 88]);
    const source = new EngineBuffer(engine, BufferBindFlag.VertexBuffer, original.subarray(1, 4), undefined, true);
    original[1] = 123;
    const read = new Uint16Array(5);
    source.getData(read, 0, 1, 3);
    expect([...read]).toEqual([0, 10, 20, 30, 0]);
    source.setData(new Uint16Array([1, 2, 3]), 2, 1, 1);
    source.getData(read, 0, 1, 3);
    expect([...read]).toEqual([0, 10, 2, 30, 0]);
    source.markAsUnreadable();
    expect(() => source.data).toThrow();
    const copy = new EngineBuffer(engine, BufferBindFlag.VertexBuffer, 6);
    copy.copyFromBuffer(source, 0, 0, 6);
    copy.getData(read, 0, 1, 3);
    expect([...read]).toEqual([0, 10, 2, 30, 0]);
    expect(() => source.getData(new Uint8Array(7))).toThrow();
    source.setData(new Uint16Array([7]), 2, 0, 1, SetDataOptions.Discard);
    source.getData(read, 0, 1, 3);
    expect([...read]).toEqual([0, 0, 7, 0, 0]);
    source.setData(new Uint16Array([4, 5, 6]), 0, 0, 0);
    const zeroLenRead = new Uint16Array(3);
    source.getData(zeroLenRead, 0, 0, 0);
    expect([...zeroLenRead]).toEqual([4, 5, 6]);
  });

  it("keeps texture and material objects but rejects unavailable pixel results", async () => {
    const engine = await createEngine();
    const texture = new Texture2D(engine, 2, 2);
    texture.anisoLevel = 8;
    texture.depthCompareFunction = enginePackage.TextureDepthCompareFunction.Less;
    expect(texture.anisoLevel).toBe(8);
    expect(texture.depthCompareFunction).toBe(enginePackage.TextureDepthCompareFunction.Less);
    expect(new enginePackage.RenderTarget(engine, 2, 2, texture, undefined, 4).antiAliasing).toBe(4);
    texture.setPixelBuffer(new Uint8Array(16));
    expect(() => texture.getPixelBuffer(new Uint8Array(16))).toThrow("requires a graphics device");
    const array = new Texture2DArray(engine, 2, 2, 3);
    expect(() => array.getPixelBuffer(0, new Uint8Array(16))).toThrow("requires a graphics device");
    expect(() => array.getPixelBuffer(0, 0, 0, 2, 2, 0, new Uint8Array(16))).toThrow("requires a graphics device");
    const cube = new TextureCube(engine, 2);
    const material = new Material(engine, Shader.find("PBR"));
    expect(material.shader).toBe(Shader.find("PBR"));
    expect(array.length).toBe(3);
    expect(cube.width).toBe(2);
    const entity = engine.sceneManager.activeScene!.createRootEntity();
    const spriteRenderer = entity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = new Sprite(engine, texture);
    expect(spriteRenderer.bounds).toBeDefined();
    expect(entity.addComponent(SkinnedMeshRenderer).localBounds).toBeDefined();
  });

  it("advances the shared lifecycle and animation without rendering cameras", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const engine = await createEngine();
    const entity = engine.sceneManager.activeScene!.createRootEntity();
    const events: string[] = [];
    class Controller extends Script {
      onStart() {
        events.push("start");
      }
      onUpdate() {
        events.push("update");
      }
      onLateUpdate() {
        events.push("late");
      }
      onBeginRender() {
        events.push("render");
      }
      onDestroy() {
        events.push("destroy");
      }
    }
    entity.addComponent(Controller);
    const camera = entity.addComponent(Camera);
    camera.enableHDR = true;
    expect(camera.enableHDR).toBe(true);
    expect(camera.msaaSamples).toBe(enginePackage.MSAASamples.FourX);
    const animator = entity.addComponent(Animator);
    const controller = new AnimatorController(engine);
    const layer = new AnimatorControllerLayer("Base");
    controller.addLayer(layer);
    const clip = new AnimationClip("move");
    const curve = new AnimationFloatCurve();
    for (const [time, value] of [
      [0, 0],
      [1, 10]
    ]) {
      const key = new Keyframe();
      key.time = time;
      key.value = value;
      curve.addKey(key);
    }
    clip.addCurveBinding("", Transform, "position.x", curve);
    layer.stateMachine.addState("move").clip = clip;
    animator.animatorController = controller;
    animator.play("move");
    vi.advanceTimersByTime(100);
    engine.update();
    vi.advanceTimersByTime(100);
    engine.update();
    expect(events).toEqual(["start", "update", "late", "update", "late"]);
    expect(entity.transform.position.x).toBeGreaterThan(0);
    camera.render();
    expect(engine._renderCount).toBe(0);
    engine.destroy();
    expect(events.at(-1)).toBe("destroy");
  });

  it("runs, pauses and destroys without a browser scheduler", async () => {
    vi.useFakeTimers();
    const engine = await createEngine();
    engine.run();
    vi.advanceTimersByTime(50);
    const frame = engine.time.frameCount;
    expect(frame).toBeGreaterThan(0);
    engine.pause();
    vi.advanceTimersByTime(50);
    expect(engine.time.frameCount).toBe(frame);
    engine.resume();
    vi.advanceTimersByTime(50);
    expect(engine.time.frameCount).toBeGreaterThan(frame);
    engine.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("loads a serialized primitive through the existing resource manager", async () => {
    const engine = await createEngine();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "cuboid",
          cuboidWidth: 2,
          cuboidHeight: 4,
          cuboidDepth: 6
        })
      )
    );
    const mesh = await engine.resourceManager.load({
      url: "https://example.test/box.mesh",
      type: AssetType.PrimitiveMesh
    });
    expect(mesh).toBeInstanceOf(ModelMesh);
    expect(mesh.bounds.max.toJSON()).toEqual({ x: 1, y: 2, z: 3 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects unavailable image decoding and preserves HTTP failures", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("pixels"));
    await expect(request("https://example.test/a.json", { type: "json" })).rejects.toThrow("503");
    await expect(request("https://example.test/a.png", { type: "image" })).rejects.toThrow("browser decoder");
  });
  it("loads glTF geometry and instantiates prefabs through existing loaders", async () => {
    const engine = await createEngine();
    const vertices = new Float32Array([-1, -2, -3, 4, 5, 6, 0, 0, 0]);
    const documents = new Map([
      [
        "https://example.test/triangle.gltf",
        {
          asset: { version: "2.0" },
          buffers: [{ uri: "triangle.bin", byteLength: vertices.byteLength }],
          bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength }],
          accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -2, -3], max: [4, 5, 6] }
          ],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          nodes: [{ mesh: 0 }],
          scenes: [{ nodes: [0] }],
          scene: 0
        }
      ],
      [
        "https://example.test/node.prefab",
        {
          version: "2.0",
          root: 0,
          refs: [],
          entities: [{ name: "Root", position: [1, 2, 3], children: [1] }, { name: "Child" }],
          components: []
        }
      ]
    ]);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("triangle.bin")) return new Response(vertices);
      const value = documents.get(String(url));
      if (!value) throw new Error(`Unexpected URL: ${url}`);
      return new Response(JSON.stringify(value));
    });
    const resource = await engine.resourceManager.load({
      url: "https://example.test/triangle.gltf",
      type: AssetType.GLTF
    });
    const renderer = resource.defaultSceneRoot.getComponentsIncludeChildren(MeshRenderer, [])[0];
    expect(renderer.mesh.bounds.min.toJSON()).toEqual({ x: -1, y: -2, z: -3 });
    expect(renderer.mesh.bounds.max.toJSON()).toEqual({ x: 4, y: 5, z: 6 });
    const prefab = await engine.resourceManager.load({
      url: "https://example.test/node.prefab",
      type: AssetType.Prefab
    });
    const instance = prefab.instantiate();
    expect(instance.name).toBe("Root");
    expect(instance.children[0].name).toBe("Child");
    expect(instance.transform.position.toJSON()).toEqual({ x: 1, y: 2, z: 3 });
    instance.destroy();
  });

  it("updates custom renderers and initial CPU particle step before culling without cameras", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const engine = await createEngine();
    const entity = engine.sceneManager.activeScene!.createRootEntity();
    class UpdatingRenderer extends MeshRenderer {
      frames = 0;
      update() {
        this.frames++;
      }
    }
    const renderer = entity.addComponent(UpdatingRenderer);
    const particles = entity.createChild().addComponent(enginePackage.ParticleRenderer);
    vi.advanceTimersByTime(100);
    engine.update();
    const firstStepTime = particles.generator._playTime;
    expect(renderer.frames).toBe(1);
    expect(firstStepTime).toBeGreaterThan(0);
    expect(particles.generator._getAliveParticleCount()).toBeGreaterThan(0);
    expect(particles.bounds.min.x).toBeLessThan(particles.bounds.max.x);
    vi.advanceTimersByTime(100);
    engine.update();
    expect(renderer.frames).toBe(2);
    expect(particles.isCulled).toBe(true);
    expect(particles.generator._playTime).toBe(firstStepTime);
  });

  it("cancels the active transport and never retries a cancelled request", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          signal = options!.signal!;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })
    );
    const task = request("https://example.test/data.json", { type: "json", retryCount: 3, retryInterval: 10 });
    const settled = Promise.resolve(task).catch((error) => error);
    task.cancel();
    expect(await settled).toBe("canceled");
    await vi.advanceTimersByTimeAsync(100);
    expect(signal!.aborted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases streaming HTTP error responses across retries", async () => {
    const activeResponses = new Set<ServerResponse>();
    let attempts = 0;
    const server = createServer((_request, response) => {
      attempts++;
      activeResponses.add(response);
      response.on("close", () => activeResponses.delete(response));
      response.writeHead(503, { "Content-Type": "text/plain" });
      response.write("service unavailable");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local HTTP port");
    try {
      await expect(
        Promise.resolve(
          request(`http://127.0.0.1:${address.port}/error`, { type: "text", retryCount: 2, retryInterval: 1 })
        )
      ).rejects.toThrow("503");
      expect(attempts).toBe(2);
      await vi.waitFor(() => expect(activeResponses.size).toBe(0));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("measures TextRenderer bounds with a host OffscreenCanvas", async () => {
    const engine = await createEngine();
    const entity = engine.sceneManager.activeScene.createRootEntity();
    entity.transform.setPosition(2, 3, 4);
    const text = entity.addComponent(enginePackage.TextRenderer);
    text.text = "Hi";

    class HostOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        if (width <= 0 || height <= 0) throw new RangeError("Canvas dimensions must be positive");
        this.width = width;
        this.height = height;
      }
      getContext(type: string) {
        if (type !== "2d") return null;
        return {
          font: "",
          fillStyle: "",
          textBaseline: "",
          measureText: (str: string) => ({
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: str.length * 10,
            width: str.length * 10
          }),
          clearRect() {},
          fillText() {},
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            const data = new Uint8Array(w * h * 4);
            for (let i = 3; i < data.length; i += 4) data[i] = 255;
            return { data };
          }
        };
      }
    }
    (globalThis as any).OffscreenCanvas = HostOffscreenCanvas;
    try {
      expect(text.bounds.max.x).toBeGreaterThan(text.bounds.min.x);
      expect(text.bounds.max.y).toBeGreaterThan(text.bounds.min.y);
      expect(text.bounds.min.z).toBe(4);
    } finally {
      delete (globalThis as any).OffscreenCanvas;
      enginePackage.TextUtils._textContext = null;
    }
  });

  it("decodes URI and GLB bufferView textures with a host Image without window or requestAnimationFrame", async () => {
    // 2x3 valid PNG header + IEND for dimension parsing
    const png2x3 = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x00, 0x00, 0x03, 0x08, 0x06, 0x00, 0x00, 0x00
    ]);
    class HostImage {
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      crossOrigin = "";
      set src(url: string) {
        const blob = resolveObjectURL(url);
        if (!blob) {
          queueMicrotask(() => this.onerror?.());
          return;
        }
        blob.arrayBuffer().then((buf) => {
          const bytes = new Uint8Array(buf);
          if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
            const view = new DataView(buf);
            this.width = view.getUint32(16, false);
            this.height = view.getUint32(20, false);
            this.onload?.();
          } else {
            this.onerror?.();
          }
        });
      }
    }

    function encodeGLB(image: Uint8Array): string {
      const binLength = (image.byteLength + 3) & ~3;
      const json = Buffer.from(
        JSON.stringify({
          asset: { version: "2.0" },
          buffers: [{ byteLength: binLength }],
          bufferViews: [{ buffer: 0, byteLength: image.byteLength }],
          images: [{ bufferView: 0, mimeType: "image/png" }],
          textures: [{ source: 0 }]
        })
      );
      const jsonLength = (json.byteLength + 3) & ~3;
      const out = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength);
      out.writeUInt32LE(0x46546c67, 0);
      out.writeUInt32LE(2, 4);
      out.writeUInt32LE(out.byteLength, 8);
      out.writeUInt32LE(jsonLength, 12);
      out.writeUInt32LE(0x4e4f534a, 16);
      out.fill(0x20, 20, 20 + jsonLength);
      json.copy(out, 20);
      const binOffset = 20 + jsonLength;
      out.writeUInt32LE(binLength, binOffset);
      out.writeUInt32LE(0x004e4942, binOffset + 4);
      Buffer.from(image).copy(out, binOffset + 8);
      return `data:model/gltf-binary;base64,${out.toString("base64")}`;
    }

    (globalThis as any).Image = HostImage;
    try {
      expect(typeof window).toBe("undefined");
      expect(typeof requestAnimationFrame).toBe("undefined");
      const engine = await createEngine({ glTFLoader: { meshOpt: { workerCount: 0 } } });
      const decoded = await enginePackage.GLTFUtils.loadImageBuffer(png2x3, "image/png");
      expect([decoded.width, decoded.height]).toEqual([2, 3]);

      const uriData = `data:image/png;base64,${Buffer.from(png2x3).toString("base64")}`;
      const uriTex = await engine.resourceManager.load({ url: uriData, type: AssetType.Texture });
      expect([uriTex.width, uriTex.height]).toEqual([2, 3]);

      const gltf = await engine.resourceManager.load({ url: encodeGLB(png2x3), type: AssetType.GLTF });
      expect([gltf.textures[0].width, gltf.textures[0].height]).toEqual([2, 3]);
      await engine.resourceManager._restoreResourcesContent();
      expect([gltf.textures[0].width, gltf.textures[0].height]).toEqual([2, 3]);

      await expect(
        engine.resourceManager.load({ url: encodeGLB(new Uint8Array([1, 2, 3, 4])), type: AssetType.GLTF })
      ).rejects.toThrow("failed to decode texture");
    } finally {
      delete (globalThis as any).Image;
    }
  });

  it("handles unlimited and positive timeouts, retryable timeouts, and immediate cancellation in-flight or during backoff", async () => {
    let slowCalls = 0;
    let failCalls = 0;
    const server = createServer((req, res) => {
      if (req.url === "/slow-ok") {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
        }, 50);
      } else if (req.url === "/timeout-then-ok") {
        const delay = ++slowCalls === 1 ? 60 : 5;
        const timer = setTimeout(() => {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("recovered");
        }, delay);
        res.on("close", () => clearTimeout(timer));
      } else if (req.url === "/hang") {
        res.writeHead(200, { "Content-Type": "text/plain" });
      } else {
        failCalls++;
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("unavailable");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local HTTP port");
    const base = `http://127.0.0.1:${address.port}`;

    try {
      // Unlimited timeout (`timeout: 0` and `timeout: Infinity`) does not abort delayed responses
      const sharedController = new AbortController();
      const removeSpy = vi.spyOn(sharedController.signal, "removeEventListener");
      await expect(
        Promise.resolve(request(`${base}/slow-ok`, { type: "text", timeout: 0, signal: sharedController.signal }))
      ).resolves.toBe("ok");
      await expect(
        Promise.resolve(
          request(`${base}/slow-ok`, { type: "text", timeout: Infinity, signal: sharedController.signal })
        )
      ).resolves.toBe("ok");
      expect(removeSpy).toHaveBeenCalledTimes(2);

      // Positive single-attempt timeout retries and recovers on subsequent attempt, or rejects with TimeoutError
      await expect(
        Promise.resolve(
          request(`${base}/timeout-then-ok`, { type: "text", timeout: 25, retryCount: 2, retryInterval: 5 })
        )
      ).resolves.toBe("recovered");
      expect(slowCalls).toBe(2);
      await expect(
        Promise.resolve(request(`${base}/hang`, { type: "text", timeout: 15, retryCount: 1 }))
      ).rejects.toThrow(`Request timeout from: ${base}/hang`);

      // In-flight external AbortSignal cancellation terminates immediately without retrying
      const inFlightController = new AbortController();
      const inFlightStart = Date.now();
      setTimeout(() => inFlightController.abort(new Error("in-flight-cancelled")), 20);
      await expect(
        Promise.resolve(
          request(`${base}/hang`, {
            type: "text",
            timeout: 1000,
            retryCount: 3,
            retryInterval: 250,
            signal: inFlightController.signal
          })
        )
      ).rejects.toThrow("in-flight-cancelled");
      expect(Date.now() - inFlightStart).toBeLessThan(180);

      // Retry-backoff external AbortSignal cancellation terminates immediately without waiting retryInterval
      failCalls = 0;
      const backoffController = new AbortController();
      const backoffStart = Date.now();
      setTimeout(() => backoffController.abort(new Error("cancelled")), 40);
      await expect(
        Promise.resolve(
          request(`${base}/fail`, {
            type: "text",
            retryCount: 3,
            retryInterval: 250,
            signal: backoffController.signal
          })
        )
      ).rejects.toThrow("cancelled");
      expect(Date.now() - backoffStart).toBeLessThan(180);
      expect(failCalls).toBe(1);

      // Already-aborted signal rejects without sending any request
      failCalls = 0;
      await expect(
        Promise.resolve(request(`${base}/fail`, { type: "text", retryCount: 3, signal: backoffController.signal }))
      ).rejects.toThrow("cancelled");
      expect(failCalls).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

it("installs and resolves the headless engine and its PhysX runtime independently of the workspace", () => {
  const directory = mkdtempSync(join(tmpdir(), "engine-headless-consumer-"));
  const repository = resolve(__dirname, "../..");
  const tarballs = join(directory, "tarballs");
  mkdirSync(tarballs);
  try {
    const dependencies: Record<string, string> = {};
    for (const name of [
      "math",
      "design",
      "core",
      "shader",
      "rhi-webgl",
      "rhi-null",
      "loader",
      "galacean",
      "physics-physx"
    ]) {
      const cwd = join(repository, "packages", name);
      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      execFileSync("pnpm", ["pack", "--pack-destination", tarballs], { cwd, stdio: "pipe" });
      const prefix = pkg.name.replace("@galacean/", "galacean-");
      const tarball = readdirSync(tarballs).find((file) => file.startsWith(prefix + "-") && file.endsWith(".tgz"))!;
      dependencies[pkg.name] = "file:" + join(tarballs, tarball);
    }
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ private: true, dependencies, pnpm: { overrides: dependencies } })
    );
    const install = spawnSync("pnpm", ["install", "--offline", "--ignore-scripts"], {
      cwd: directory,
      encoding: "utf8"
    });
    expect(install.status, install.stdout + install.stderr).toBe(0);
    const physXPackage = join(directory, "node_modules/@galacean/engine-physics-physx");
    expect(existsSync(join(physXPackage, "libs"))).toBe(false);
    const runtimeFiles = ["", ".simd"].flatMap((variant) =>
      ["js", "mjs", "wasm"].map((extension) => `physx.release${variant}.${extension}`)
    );
    expect(readdirSync(join(physXPackage, "dist/libs")).sort()).toEqual(runtimeFiles.sort());
    for (const [load, runtime] of [
      ["require", "WebAssembly"],
      ["await import", "WebAssemblySIMD"]
    ]) {
      const script = `const { HeadlessEngine } = ${load}("@galacean/engine-rhi-null");
        const { BoxCollider, PBRMaterial, PrimitiveMesh, Ray, Vector3 } = ${load}("@galacean/engine");
        const { PhysXPhysics, PhysXRuntimeMode } = ${load}("@galacean/engine-physics-physx");
        HeadlessEngine.create({ physics: new PhysXPhysics(PhysXRuntimeMode.${runtime}) }).then(engine => {
          if (PrimitiveMesh.createCuboid(engine, 2, 4, 6).bounds.max.y !== 2) throw Error("bounds");
          if (new PBRMaterial(engine).shader.name !== "PBR") throw Error("shader");
          const scene = engine.sceneManager.activeScene;
          scene.createRootEntity().addComponent(BoxCollider);
          if (!scene.physics.raycast(new Ray(new Vector3(0, 0, 2), new Vector3(0, 0, -1)))) throw Error("raycast");
          engine.destroy();
        }).catch(error => { console.error(error); process.exitCode = 1; });`;
      const probe = spawnSync(
        process.execPath,
        [...(load === "require" ? [] : ["--input-type=module"]), "-e", script],
        {
          cwd: directory,
          encoding: "utf8"
        }
      );
      expect(probe.status, probe.stdout + probe.stderr).toBe(0);
    }
    const source = join(directory, "consumer.ts");
    writeFileSync(
      source,
      'import { MeshRenderer, PrimitiveMesh } from "@galacean/engine";\n' +
        'import { HeadlessEngine } from "@galacean/engine-rhi-null";\n' +
        "async function run() { const e = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } }); const r = e.sceneManager.activeScene!.createRootEntity().addComponent(MeshRenderer); r.mesh = PrimitiveMesh.createCuboid(e, 1, 2, 3); e.destroy(); }"
    );
    for (const resolution of ["Node16", "Bundler", "Node10"] as const) {
      const config = {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: resolution === "Node16" ? ts.ModuleKind.Node16 : ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind[resolution]
      };
      const program = ts.createProgram([source], config);
      expect(
        ts.getPreEmitDiagnostics(program).map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
      ).toEqual([]);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
