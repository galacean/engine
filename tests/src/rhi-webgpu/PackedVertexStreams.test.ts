import { expect, it, vi } from "vitest";
import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Camera,
  Material,
  MeshRenderer,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFormat,
  VertexElement,
  VertexElementFormat,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";

it.skipIf(!navigator.gpu)(
  "renders eleven independent streams on an eight-slot device and preserves earlier draws after both input classes change",
  async () => {
    const engine = await WebGPUEngine.create({
      canvas: document.createElement("canvas"),
      graphicDeviceOptions: { requiredLimits: { maxVertexBuffers: 8 } }
    });
    const hardware = engine._hardwareRenderer as WebGPUGraphicDevice;
    const gpu = hardware.device;
    gpu.pushErrorScope("validation");
    try {
      const scene = engine.sceneManager.activeScene,
        root = scene.createRootEntity();
      const camera = root.createChild().addComponent(Camera);
      camera.enableFrustumCulling = false;
      const lanes = Array.from({ length: 7 }, (_, i) => "LANE" + i);
      const shader = Shader.create(
        `Shader "Test/PackedVertexStreams" { SubShader "s" { Pass "forward" {
      struct Attributes { vec3 POSITION; vec4 TANGENT; ${lanes.map((n) => "float " + n + ";").join(" ")} float SHIFT; vec4 TONE; float ABSENT; };
      struct Varyings { vec4 tint; };
      Varyings vert(Attributes a) {
        Varyings v; gl_Position=vec4(a.POSITION.xy * vec2(0.43,1.0) + vec2(a.SHIFT,0.0),0.0,1.0);
        v.tint=vec4((a.TANGENT.w+${lanes.map((n) => "a." + n).join("+")})/8.0,a.TONE.x,a.ABSENT,1.0); return v;
      }
      void frag(Varyings v) {gl_FragColor=v.tint;}
      VertexShader=vert; FragmentShader=frag;
    } } }`,
        engine
      );
      const mesh = new BufferMesh(engine),
        elements: VertexElement[] = [];
      const add = (
        name: string,
        format: VertexElementFormat,
        slot: number,
        values: Float32Array | Uint8Array,
        stride: number,
        rate = 0,
        offset = 0
      ) => {
        const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Dynamic);
        mesh.setVertexBufferBinding(buffer, stride, slot);
        elements.push(new VertexElement(name, offset, format, slot, rate));
        return buffer;
      };
      add("POSITION", VertexElementFormat.Vector3, 0, new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), 12);
      const tangent = add(
        "TANGENT",
        VertexElementFormat.Vector4,
        5,
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        16
      );
      for (let i = 0; i < lanes.length; i++)
        add(lanes[i], VertexElementFormat.Float, 8 + i, new Float32Array([1, 1, 1]), 4);
      add("SHIFT", VertexElementFormat.Float, 16, new Float32Array([-0.5, 0.5]), 4, 1);
      const tone = add("TONE", VertexElementFormat.NormalizedUByte4, 20, new Uint8Array([77, 0, 0, 0, 255]), 5, 2, 1);
      mesh.setVertexElements(elements);
      mesh.instanceCount = 2;
      mesh.addSubMesh(0, 3);
      const renderer = root.createChild().addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(new Material(engine, shader));
      const makeTarget = () =>
        new RenderTarget(
          engine,
          32,
          16,
          new Texture2D(engine, 32, 16, TextureFormat.R8G8B8A8_UNorm, false, false),
          TextureFormat.Depth24Stencil8
        );
      const a = makeTarget(),
        b = makeTarget();
      engine._beginFrame();
      try {
        camera.renderTarget = a;
        camera.render();
        tangent.setData(new Float32Array([0, 0, 0, -7, 0, 0, 0, -7, 0, 0, 0, -7]));
        tone.setData(new Uint8Array([77, 255, 0, 0, 255]));
        camera.renderTarget = b;
        camera.render();
      } finally {
        engine._endFrame();
      }
      const first = new Uint8Array(32 * 16 * 4),
        second = new Uint8Array(first.length);
      await (a.getColorTexture() as Texture2D).getPixelBufferAsync(first);
      await (b.getColorTexture() as Texture2D).getPixelBufferAsync(second);
      for (const x of [8, 24]) {
        const offset = (8 * 32 + x) * 4;
        expect([...first.subarray(offset, offset + 4)]).toEqual([255, 0, 0, 255]);
        expect([...second.subarray(offset, offset + 4)]).toEqual([0, 255, 0, 255]);
      }
      const retire = vi.spyOn(hardware, "_retireBuffer");
      try {
        renderer.mesh = null;
        mesh.destroy(true);
        expect(
          retire.mock.calls.filter(([buffer]) => buffer.label === "Galacean packed vertex input").length
        ).toBeGreaterThanOrEqual(2);
      } finally {
        retire.mockRestore();
      }
      expect((await gpu.popErrorScope())?.message).toBeUndefined();
    } finally {
      engine.destroy();
    }
  }
);
