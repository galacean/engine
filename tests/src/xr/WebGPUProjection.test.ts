import {
  Camera,
  Layer,
  Matrix,
  MeshRenderer,
  PrimitiveMesh,
  UnlitMaterial,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";
import { XRSessionMode, XRTrackedInputDevice } from "@galacean/engine-xr";
import { WebXRDevice } from "../../../packages/xr-webxr";
import { expect, it, vi } from "vitest";

it("reports missing XRGPUBinding before requesting a WebGPU session", async () => {
  vi.stubGlobal("XRGPUBinding", undefined);
  try {
    const backend = { backend: "webgpu" as const, device: {}, _options: {}, setExternalProjectionTarget() {} };
    await expect(new WebXRDevice().requestSession(backend, XRSessionMode.VR, [])).rejects.toThrow("XRGPUBinding");
  } finally {
    vi.unstubAllGlobals();
  }
});

it.skipIf(!navigator.gpu)(
  "renders tracked eyes into distinct compositor layers with their native viewport and depth",
  async () => {
    const originalXR = Object.getOwnPropertyDescriptor(navigator, "xr");
    let frameCallback: XRFrameRequestCallback;
    const session = Object.assign(new EventTarget(), {
      inputSources: [],
      renderState: { depthNear: 0.25, depthFar: 64 },
      requestReferenceSpace: async () => ({}),
      updateRenderState: vi.fn(),
      requestAnimationFrame(callback: XRFrameRequestCallback) {
        frameCallback = callback;
        return 1;
      },
      cancelAnimationFrame() {},
      async end() {
        this.dispatchEvent(new Event("end"));
      }
    });
    const xr = { isSessionSupported: async () => true, requestSession: vi.fn(async () => session) };
    Object.defineProperty(navigator, "xr", { configurable: true, value: xr });
    const layer = { textureWidth: 24, textureHeight: 24, textureArrayLength: 2 };
    const leftView = { x: 2, y: 1, width: 16, height: 16 };
    const rightView = { x: 4, y: 5, width: 16, height: 16 };
    let color: GPUTexture;
    let depth: GPUTexture;
    const eyes: string[] = [];
    vi.stubGlobal(
      "XRGPUBinding",
      class {
        constructor(
          s: XRSession,
          private device: GPUDevice
        ) {
          expect(s).toBe(session);
        }
        getPreferredColorFormat() {
          return "rgba8unorm";
        }
        createProjectionLayer(init: {
          colorFormat: GPUTextureFormat;
          depthStencilFormat: GPUTextureFormat;
          textureUsage: GPUTextureUsageFlags;
        }) {
          color = this.device.createTexture({ size: [24, 24, 2], format: init.colorFormat, usage: init.textureUsage });
          depth = this.device.createTexture({
            size: [24, 24, 2],
            format: init.depthStencilFormat,
            usage: init.textureUsage
          });
          return layer;
        }
        getViewSubImage(actualLayer: XRProjectionLayer, view: XRView) {
          expect(actualLayer).toBe(layer);
          eyes.push(view.eye);
          const left = view.eye === "left";
          return {
            colorTexture: color,
            depthStencilTexture: depth,
            viewport: left ? leftView : rightView,
            getViewDescriptor: () => ({
              dimension: "2d",
              baseArrayLayer: left ? 0 : 1,
              arrayLayerCount: 1,
              mipLevelCount: 1
            })
          };
        }
      }
    );
    let engine: WebGPUEngine;
    try {
      engine = await WebGPUEngine.create({ canvas: document.createElement("canvas"), xrDevice: new WebXRDevice() });
      const rhi = engine._hardwareRenderer as WebGPUGraphicDevice;
      const { device } = rhi;
      device.pushErrorScope("validation");
      const scene = engine.sceneManager.activeScene;
      const root = scene.createRootEntity();
      engine.xrManager.origin = root;
      const cameras: Camera[] = [];
      for (let i = 0; i < 2; i++) {
        const camera = root.createChild().addComponent(Camera);
        cameras.push(camera);
        const eyeLayer = i === 0 ? Layer.Layer0 : Layer.Layer1;
        camera.cullingMask = eyeLayer;
        engine.xrManager.cameraManager.attachCamera(
          i === 0 ? XRTrackedInputDevice.LeftCamera : XRTrackedInputDevice.RightCamera,
          camera
        );
        const entity = root.createChild();
        entity.layer = eyeLayer;
        entity.transform.setPosition(0, 0, -0.5);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 0.25);
        const material = new UnlitMaterial(engine);
        material.baseColor.set(i === 0 ? 1 : 0, i === 0 ? 0 : 1, 0, 1);
        renderer.setMaterial(material);
      }
      const originalFar = cameras[0].farClipPlane;
      const originalProjection = cameras[1].projectionMatrix.clone();
      originalProjection.elements[0] = 0.25;
      cameras[1].projectionMatrix = originalProjection;
      await engine.xrManager.enterXR(XRSessionMode.VR);
      expect(xr.requestSession).toHaveBeenCalledWith(
        "immersive-vr",
        expect.objectContaining({ requiredFeatures: ["local", "webgpu"] })
      );
      expect(session.updateRenderState).toHaveBeenCalledWith({ layers: [layer] });
      const projection = new Matrix();
      projection.elements[10] = -1;
      const transform = {
        matrix: new Matrix().elements,
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };
      const views = ["left", "right"].map((eye) => ({ eye, transform, projectionMatrix: projection.elements }));
      const frame = { getViewerPose: () => ({ views, emulatedPosition: false }) } as unknown as XRFrame;
      const platform = engine.xrManager.sessionManager._platformSession!;
      platform.requestAnimationFrame(() => {
        engine.update();
      });
      frameCallback!(performance.now(), frame);
      expect(eyes).toEqual(["left", "right"]);
      expect(cameras[0].nearClipPlane).toBe(0.25);
      expect(cameras[0].farClipPlane).toBe(64);
      expect(cameras[0].projectionMatrix.elements[10]).toBe(-2);
      expect(cameras[0].projectionMatrix.elements[14]).toBe(-1);
      const { x, y, width, height } = cameras[1].pixelViewport;
      expect([x, y, width, height]).toEqual([4, 5, 16, 16]);
      expect(rhi.hasExternalProjectionDepth).toBe(false);

      const pixels = device.createBuffer({ size: 1024, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const result = device.createBuffer({ size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const shader = device.createShaderModule({
        code: `
      @group(0) @binding(0) var tex: texture_depth_2d_array;
      @group(0) @binding(1) var<storage,read_write> values:array<f32>;
      @compute @workgroup_size(1) fn main() {
        values[0]=textureLoad(tex,vec2i(10,9),0,0);
        values[1]=textureLoad(tex,vec2i(12,13),1,0);
      }`
      });
      const pipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: shader, entryPoint: "main" }
      });
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: depth!.createView({ dimension: "2d-array", aspect: "depth-only" }) },
          { binding: 1, resource: { buffer: result } }
        ]
      });
      const commands = device.createCommandEncoder();
      for (const [eye, x, y] of [
        [0, 10, 9],
        [1, 12, 13]
      ]) {
        commands.copyTextureToBuffer(
          { texture: color!, origin: [x, y, eye] },
          { buffer: pixels, offset: 256 * eye },
          [1, 1, 1]
        );
      }
      const pass = commands.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(1);
      pass.end();
      commands.copyBufferToBuffer(result, 0, pixels, 512, 8);
      device.queue.submit([commands.finish()]);
      await pixels.mapAsync(GPUMapMode.READ);
      const bytes = pixels.getMappedRange();
      expect([...new Uint8Array(bytes, 0, 4)]).toEqual([255, 0, 0, 255]);
      expect([...new Uint8Array(bytes, 256, 4)]).toEqual([0, 255, 0, 255]);
      for (const z of new Float32Array(bytes, 512, 2)) expect(z).toBeCloseTo(0.375, 3);
      pixels.unmap();
      pixels.destroy();
      result.destroy();
      expect(await device.popErrorScope()).toBeNull();
      await engine.xrManager.exitXR();
      expect(engine.xrManager.sessionManager._platformSession).toBeNull();
      expect(cameras[0].pixelViewport.width).toBe(engine.canvas.width);
      expect(cameras[0].farClipPlane).toBe(originalFar);
      expect(cameras[0]._isCustomProjectionMatrix).toBe(false);
      expect(cameras[1].projectionMatrix.elements[0]).toBe(0.25);
      cameras[0].render();
      expect(eyes).toHaveLength(2);
      expect(rhi.hasExternalProjectionDepth).toBe(false);
    } finally {
      engine?.destroy();
      color?.destroy();
      depth?.destroy();
      vi.unstubAllGlobals();
      if (originalXR) Object.defineProperty(navigator, "xr", originalXR);
      else Reflect.deleteProperty(navigator, "xr");
    }
  }
);
