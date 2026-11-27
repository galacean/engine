import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Camera,
  ComputeShader,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderLanguage,
  Texture2D,
  TextureFormat,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";
import { WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

describe("ShaderLab ComputeShader & WebGPU-only Capabilities", () => {
  it("rejects WebGPU-only capabilities cleanly on GLSLES300 backend", () => {
    const compiler = new ShaderCompiler();
    const cases: Array<[string, string, RegExp]> = [
      [
        "StorageBuffer",
        `Shader "Tests/GLESRejectSSBO" {
          SubShader "Default" {
            Pass "0" {
              VertexShader = vert;
              FragmentShader = frag;
              readonly storage DataBuf { vec4 items[]; };
              struct a2v { vec4 POSITION; };
              void vert(a2v v) { gl_Position = v.POSITION + items[0]; }
              void frag() { gl_FragColor = vec4(1.0); }
            }
          }
        }`,
        /WebGPU-only capabilities.*StorageBuffer/
      ],
      [
        "StorageTexture",
        `Shader "Tests/GLESRejectStorageTex" {
          SubShader "Default" {
            Pass "0" {
              VertexShader = vert;
              FragmentShader = frag;
              layout(rgba8unorm) writeonly image2D outImg;
              struct a2v { vec4 POSITION; };
              void vert(a2v v) { gl_Position = v.POSITION; }
              void frag() {
                imageStore(outImg, ivec2(0, 0), vec4(1.0));
                gl_FragColor = vec4(1.0);
              }
            }
          }
        }`,
        /WebGPU-only capabilities.*StorageTexture/
      ],
      [
        "Atomic",
        `Shader "Tests/GLESRejectAtomic" {
          SubShader "Default" {
            Pass "0" {
              VertexShader = vert;
              FragmentShader = frag;
              struct Counter { atomic_uint n; };
              struct a2v { vec4 POSITION; };
              void vert(a2v v) { gl_Position = v.POSITION; }
              void frag() { gl_FragColor = vec4(1.0); }
            }
          }
        }`,
        /WebGPU-only capabilities.*Atomic/
      ],
      [
        "Compute shared",
        `Shader "Tests/GLESRejectShared" {
          SubShader "Default" {
            Pass "0" {
              VertexShader = vert;
              FragmentShader = frag;
              shared float s_buf[16];
              struct a2v { vec4 POSITION; };
              void vert(a2v v) { gl_Position = v.POSITION + vec4(s_buf[0]); }
              void frag() { gl_FragColor = vec4(1.0); }
            }
          }
        }`,
        /WebGPU-only capabilities.*Compute/
      ]
    ];

    for (const [label, source, pattern] of cases) {
      const parsed = compiler._parseShaderSource(source);
      const pass = parsed.subShaders[0].passes[0];
      expect(
        () => compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, ShaderLanguage.GLSLES300),
        label
      ).toThrow(pattern);
    }
  });

  it("rejects raster directives inside ComputeShader source", () => {
    const compiler = new ShaderCompiler();
    const badSource = `
      ComputeShader "Tests/BadRasterDirective" {
        SubShader "Default" {
          Pass "0" {}
        }
      }
    `;
    expect(() => compiler._parseShaderSource(badSource)).toThrow(/not allowed inside ComputeShader/);
  });

  it("rejects ComputeShader on WebGL2 engine", async () => {
    const engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    try {
      const computeSrc = `
        ComputeShader "Tests/WebGLReject" {
          WorkgroupSize = (1, 1, 1);
          ComputeKernel = csMain;
          void csMain() {}
        }
      `;
      expect(() => ComputeShader.create(computeSrc, engine)).toThrow(/requires a WebGPU engine/);
      expect(() => Shader.create(computeSrc, engine)).toThrow(/ComputeShader\.create/);
    } finally {
      engine.destroy();
    }
  });

  it.skipIf(!navigator.gpu)(
    "executes SSBO read/write, arrayLength, and uniform parameters on WebGPU",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/ScaleAdd" {
            WorkgroupSize = (64, 1, 1);
            ComputeKernel = csMain;

            readonly storage InputBuf {
              float values[];
            };

            storage OutputBuf {
              float results[];
            };

            float u_scale;
            float u_bias;

            void csMain() {
              uint idx = gl_GlobalInvocationID.x;
              if (idx < uint(values.length())) {
                results[idx] = values[idx] * u_scale + u_bias;
              }
            }
          }`,
          engine
        );

        const count = 128;
        const inputData = new Float32Array(count);
        for (let i = 0; i < count; i++) inputData[i] = i + 1;

        const inputBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, inputData, BufferUsage.Static);
        const outputBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, count * 4, BufferUsage.Dynamic);

        cs.shaderData.setBuffer("InputBuf", inputBuf);
        cs.shaderData.setBuffer("OutputBuf", outputBuf);
        cs.shaderData.setFloat("u_scale", 2.5);
        cs.shaderData.setFloat("u_bias", 10.0);

        cs.dispatch(2, 1, 1);

        const readback = new Float32Array(count);
        await outputBuf.getDataAsync(readback);
        for (let i = 0; i < count; i++) {
          expect(readback[i]).toBeCloseTo((i + 1) * 2.5 + 10.0, 4);
        }

        // Dispatch again with updated uniforms in a second submission
        cs.shaderData.setFloat("u_scale", -1.0);
        cs.shaderData.setFloat("u_bias", 100.0);
        cs.dispatch(2);

        await outputBuf.getDataAsync(readback);
        for (let i = 0; i < count; i++) {
          expect(readback[i]).toBeCloseTo(-(i + 1) + 100.0, 4);
        }

        cs.destroy();
        inputBuf.destroy();
        outputBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "executes workgroup shared memory and workgroupBarrier() tile reversal on WebGPU",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/SharedReverse" {
            WorkgroupSize = (64, 1, 1);
            ComputeKernel = csMain;

            readonly storage InData {
              float src[];
            };

            storage OutData {
              float dst[];
            };

            shared float s_tile[64];

            void csMain() {
              uint gid = gl_GlobalInvocationID.x;
              uint lid = gl_LocalInvocationIndex;
              s_tile[lid] = src[gid];
              workgroupBarrier();
              dst[gid] = s_tile[63u - lid];
            }
          }`,
          engine
        );

        const input = new Float32Array(64);
        for (let i = 0; i < 64; i++) input[i] = i * 3.0 + 1.0;

        const inBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, input, BufferUsage.Static);
        const outBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, 64 * 4, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("InData", inBuf);
        cs.shaderData.setBuffer("OutData", outBuf);
        cs.dispatch(1);

        const result = new Float32Array(64);
        await outBuf.getDataAsync(result);
        for (let i = 0; i < 64; i++) {
          expect(result[i]).toBeCloseTo(input[63 - i], 4);
        }

        cs.destroy();
        inBuf.destroy();
        outBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "executes atomic_uint operations (atomicAdd, atomicMax, atomicCompSwap) on WebGPU",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/Atomics" {
            WorkgroupSize = (64, 1, 1);
            ComputeKernel = csMain;

            storage StatsBuf {
              atomic_uint totalCount;
              atomic_uint maxVal;
              atomic_uint casTarget;
            };

            void csMain() {
              uint idx = gl_GlobalInvocationID.x;
              atomicAdd(totalCount, 1u);
              atomicMax(maxVal, idx + 10u);
              if (idx == 0u) {
                atomicCompSwap(casTarget, 42u, 99u);
              }
            }
          }`,
          engine
        );

        const init = new Uint32Array([0, 0, 42]);
        const statsBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, init, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("StatsBuf", statsBuf);
        cs.dispatch(2); // 128 threads: idx 0..127

        const out = new Uint32Array(3);
        await statsBuf.getDataAsync(out);
        expect(Array.from(out)).toEqual([128, 137, 99]);

        cs.destroy();
        statsBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "writes a storage texture (layout(rgba8unorm) writeonly image2D) via imageStore and imageSize",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/StorageTexWrite" {
            WorkgroupSize = (4, 4, 1);
            ComputeKernel = csMain;

            layout(rgba8unorm) writeonly image2D outTex;

            void csMain() {
              ivec2 coord = ivec2(int(gl_GlobalInvocationID.x), int(gl_GlobalInvocationID.y));
              ivec2 sz = imageSize(outTex);
              if (coord.x < sz.x && coord.y < sz.y) {
                float r = float(coord.x) / float(sz.x - 1);
                float g = float(coord.y) / float(sz.y - 1);
                imageStore(outTex, coord, vec4(r, g, 0.5, 1.0));
              }
            }
          }`,
          engine
        );

        const tex = new Texture2D(engine, 8, 8, TextureFormat.R8G8B8A8_UNorm, false, false);
        cs.shaderData.setTexture("outTex", tex);
        cs.dispatch(2, 2, 1);

        const pixels = new Uint8Array(8 * 8 * 4);
        await tex.getPixelBufferAsync(0, 0, 8, 8, pixels);

        // Top-left (0, 0) -> (0, 0, 128, 255)
        expect(pixels[0]).toBe(0);
        expect(pixels[1]).toBe(0);
        expect(Math.abs(pixels[2] - 128)).toBeLessThanOrEqual(1);
        expect(pixels[3]).toBe(255);

        // Bottom-right (7, 7) -> (255, 255, 128, 255)
        const br = (7 * 8 + 7) * 4;
        expect(pixels[br]).toBe(255);
        expect(pixels[br + 1]).toBe(255);
        expect(Math.abs(pixels[br + 2] - 128)).toBeLessThanOrEqual(1);
        expect(pixels[br + 3]).toBe(255);

        cs.destroy();
        tex.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "supports multi-Kernel ComputeShader blocks with shared storage and runtime macros",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/MultiKernel" {
            storage DataBuf {
              float items[];
            };

            Kernel "Init" {
              WorkgroupSize = (16, 1, 1);
              ComputeKernel = csInit;
              void csInit() {
                uint idx = gl_GlobalInvocationID.x;
                items[idx] = float(idx + 1u);
              }
            }

            Kernel "Transform" {
              WorkgroupSize = (16, 1, 1);
              ComputeKernel = csTransform;
              void csTransform() {
                uint idx = gl_GlobalInvocationID.x;
                float v = items[idx] * 2.0;
                #ifdef ADD_TEN
                  v += 10.0;
                #endif
                items[idx] = v;
              }
            }
          }`,
          engine
        );

        expect(cs.kernelNames).toEqual(["Init", "Transform"]);

        const buf = new Buffer(engine, BufferBindFlag.StorageBuffer, 16 * 4, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("DataBuf", buf);

        cs.dispatch("Init", 1);
        cs.dispatch("Transform", 1);

        const out = new Float32Array(16);
        await buf.getDataAsync(out);
        for (let i = 0; i < 16; i++) {
          expect(out[i]).toBeCloseTo((i + 1) * 2.0, 4);
        }

        // Enable runtime macro and dispatch Transform again
        cs.shaderData.enableMacro("ADD_TEN");
        cs.dispatch("Transform", 1);
        await buf.getDataAsync(out);
        for (let i = 0; i < 16; i++) {
          expect(out[i]).toBeCloseTo((i + 1) * 4.0 + 10.0, 4);
        }

        cs.destroy();
        buf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "runs a Compute -> Raster SSBO pipeline where raster Shader reads compute-written storage buffer",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        // 1. ComputeShader computes a color and writes it to ColorPalette SSBO
        const cs = ComputeShader.create(
          `ComputeShader "Tests/FillPalette" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;
            storage ColorPalette {
              vec4 colors[];
            };
            void csMain() {
              colors[0] = vec4(0.25, 0.5, 0.75, 1.0);
            }
          }`,
          engine
        );

        const paletteBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, 16, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("ColorPalette", paletteBuf);
        cs.dispatch(1);

        // 2. Raster Shader reads ColorPalette via `readonly storage` and draws full screen quad/cube
        const rasterShader = Shader.create(
          `Shader "Tests/ReadPaletteSSBO" {
            SubShader "Default" {
              Pass "Forward" {
                struct Attributes { vec3 POSITION; };
                readonly storage ColorPalette {
                  vec4 colors[];
                };
                void vert(Attributes a) {
                  gl_Position = vec4(a.POSITION.xy * 2.0, 0.0, 1.0);
                }
                void frag() {
                  gl_FragColor = colors[0];
                }
                VertexShader = vert;
                FragmentShader = frag;
              }
            }
          }`,
          engine
        );

        const root = engine.sceneManager.activeScene.createRootEntity();
        const camera = root.createChild().addComponent(Camera);
        camera.entity.transform.setPosition(0, 0, 3);
        const targetTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
        camera.renderTarget = new RenderTarget(engine, 16, 16, targetTex, TextureFormat.Depth24Stencil8);

        const renderer = root.createChild().addComponent(MeshRenderer);
        renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
        const material = new Material(engine, rasterShader);
        material.shaderData.setBuffer("ColorPalette", paletteBuf);
        renderer.setMaterial(material);

        camera.render();

        const pixel = new Uint8Array(4);
        await targetTex.getPixelBufferAsync(8, 8, 1, 1, pixel);
        expect(Math.abs(pixel[0] - 64)).toBeLessThanOrEqual(1);
        expect(Math.abs(pixel[1] - 128)).toBeLessThanOrEqual(1);
        expect(Math.abs(pixel[2] - 191)).toBeLessThanOrEqual(1);
        expect(pixel[3]).toBe(255);

        cs.destroy();
        paletteBuf.destroy();
        targetTex.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );
});
