import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Camera,
  ComputeShader,
  EngineEventType,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderLanguage,
  ShaderMacroProcessor,
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

        const linked = cs._linkVariant();
        // Verify `atomicCompSwap` lowers to a strong-CAS retry loop that only breaks on `exchanged || old != cmp`
        expect(linked.compute).toContain("atomicCompareExchangeWeak");
        expect(linked.compute).toMatch(/\.exchanged\s*\|\|\s*\w+\s*!=\s*\w+/);

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

  /**
   * Upstream Naga `tests/in/wgsl/` compute & storage conformance ports.
   * Every test explicitly verifies Chrome Tint compilation (`getCompilationInfo()` zero errors),
   * WebGPU validation error scope, AND real GPU buffer/texture readback values.
   */
  async function assertCleanComputeWGSL(device: GPUDevice, cs: ComputeShader, kernelName?: string): Promise<void> {
    const linked = cs._linkVariant(kernelName);
    const mod = device.createShaderModule({ label: `naga-compute-${cs.name}`, code: linked.compute });
    const info = await mod.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");
    if (errors.length > 0) {
      throw new Error(
        `Chrome Tint WGSL compilation error in ${cs.name}:\n${errors
          .map((e) => `L${e.lineNum}:${e.linePos} ${e.message}`)
          .join("\n")}\n---\n${linked.compute}`
      );
    }
  }

  it.skipIf(!navigator.gpu)(
    "Naga collatz.wgsl: executes in-place SSBO while-loop recurrence with exact known results",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Naga/Collatz" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;

            storage PrimeIndices {
              uint data[];
            };

            uint collatz_iterations(uint n_base) {
              uint n = n_base;
              uint i = 0u;
              while (n > 1u) {
                if (n % 2u == 0u) {
                  n = n / 2u;
                } else {
                  n = 3u * n + 1u;
                }
                i = i + 1u;
              }
              return i;
            }

            void csMain() {
              uint id = gl_GlobalInvocationID.x;
              data[id] = collatz_iterations(data[id]);
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs);

        const input = new Uint32Array([1, 2, 3, 4, 7, 27]);
        const buf = new Buffer(engine, BufferBindFlag.StorageBuffer, input, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("PrimeIndices", buf);
        cs.dispatch(6, 1, 1);

        const out = new Uint32Array(6);
        await buf.getDataAsync(out);
        expect(Array.from(out)).toEqual([0, 1, 7, 2, 16, 111]);

        cs.destroy();
        buf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "Naga boids.wgsl: executes double-buffered struct-array SSBO flocking simulation with uniforms",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Naga/Boids" {
            WorkgroupSize = (4, 1, 1);
            ComputeKernel = csMain;

            struct Particle {
              vec2 pos;
              vec2 vel;
            };

            readonly storage ParticlesSrc {
              Particle srcParticles[];
            };

            storage ParticlesDst {
              Particle dstParticles[];
            };

            float u_deltaT;
            float u_rule1Distance;
            float u_rule2Distance;
            float u_rule3Distance;
            float u_rule1Scale;
            float u_rule2Scale;
            float u_rule3Scale;

            void csMain() {
              uint index = gl_GlobalInvocationID.x;
              uint total = uint(srcParticles.length());
              if (index >= total) return;

              vec2 vPos = srcParticles[index].pos;
              vec2 vVel = srcParticles[index].vel;
              vec2 cMass = vec2(0.0);
              vec2 cVel = vec2(0.0);
              vec2 colVel = vec2(0.0);
              int cMassCount = 0;
              int cVelCount = 0;

              for (uint i = 0u; i < total; i++) {
                if (i == index) continue;
                vec2 pos = srcParticles[i].pos;
                vec2 vel = srcParticles[i].vel;
                if (distance(pos, vPos) < u_rule1Distance) {
                  cMass += pos;
                  cMassCount++;
                }
                if (distance(pos, vPos) < u_rule2Distance) {
                  colVel -= (pos - vPos);
                }
                if (distance(pos, vPos) < u_rule3Distance) {
                  cVel += vel;
                  cVelCount++;
                }
              }
              if (cMassCount > 0) cMass = cMass / float(cMassCount) - vPos;
              if (cVelCount > 0) cVel = cVel / float(cVelCount);

              vVel = vVel + cMass * u_rule1Scale + colVel * u_rule2Scale + cVel * u_rule3Scale;
              float speed = length(vVel);
              if (speed > 0.0001) {
                vVel = normalize(vVel) * clamp(speed, 0.0, 0.5);
              }
              vPos = vPos + vVel * u_deltaT;

              dstParticles[index].pos = vPos;
              dstParticles[index].vel = vVel;
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs);

        // 4 particles: each Particle is 4 floats (vec2 pos, vec2 vel) = 16 bytes
        const init = new Float32Array([
          0.0, 0.0, 0.1, 0.0,
          0.2, 0.0, 0.1, 0.0,
          0.0, 0.2, 0.0, 0.1,
          0.2, 0.2, 0.0, 0.1
        ]);
        const srcBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, init, BufferUsage.Static);
        const dstBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, init.byteLength, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("ParticlesSrc", srcBuf);
        cs.shaderData.setBuffer("ParticlesDst", dstBuf);
        cs.shaderData.setFloat("u_deltaT", 1.0);
        cs.shaderData.setFloat("u_rule1Distance", 1.0);
        cs.shaderData.setFloat("u_rule2Distance", 0.05);
        cs.shaderData.setFloat("u_rule3Distance", 1.0);
        cs.shaderData.setFloat("u_rule1Scale", 0.1);
        cs.shaderData.setFloat("u_rule2Scale", 0.1);
        cs.shaderData.setFloat("u_rule3Scale", 0.1);

        cs.dispatch(1);

        const out = new Float32Array(16);
        await dstBuf.getDataAsync(out);
        // Particle 0 starts at (0,0) with vel (0.1,0); neighbors average pos=(2/15? (0.4/3,0.4/3)), avg vel=(0.1/3,0.2/3)
        // New vel should point into (+x, +y) quadrant and pos should move strictly > 0 in both x and y
        expect(out[0]).toBeGreaterThan(0.1);
        expect(out[1]).toBeGreaterThan(0.01);
        expect(Number.isFinite(out[12])).toBe(true);
        expect(Number.isFinite(out[15])).toBe(true);

        cs.destroy();
        srcBuf.destroy();
        dstBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "Naga atomicOps.wgsl + 9883-atomic_sub-negative + atomicCompareExchange: tests signed atomic_int, workgroup atomics, all ops, and float CAS loop",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Naga/AtomicOpsFull" {
            WorkgroupSize = (4, 1, 1);
            ComputeKernel = csMain;

            storage SignedBuf {
              atomic_int sAdd;
              atomic_int sSubNeg;
              atomic_int sMin;
              atomic_int sMax;
              atomic_int sBit;
              atomic_int sExch;
              atomic_int sFloatCas;
            };

            storage OutputBuf {
              int wgSum;
              int exchOld;
            };

            shared atomic_int wgCounter;

            void csMain() {
              uint lid = gl_LocalInvocationIndex;
              if (lid == 0u) {
                atomicStore(wgCounter, 0);
              }
              workgroupBarrier();

              // Signed storage & workgroup atomics including Naga #9883 atomicSub(x, -1)
              atomicAdd(wgCounter, int(lid) + 1); // 1+2+3+4 = 10
              atomicAdd(sAdd, -2);                // 4 * (-2) = -8
              atomicSub(sSubNeg, -3);             // 0 - 4*(-3) = +12
              atomicMin(sMin, int(lid) - 10);     // min(0, -10,-9,-8,-7) = -10
              atomicMax(sMax, int(lid) - 2);      // max(-5, -2,-1,0,1) = 1

              if (lid == 0u) {
                atomicOr(sBit, 0x0F);
                atomicAnd(sBit, 0x06);
                atomicXor(sBit, 0x03);            // (0x0F & 0x06) ^ 0x03 = 0x05
                exchOld = atomicExchange(sExch, -77);
              }

              // Naga atomicCompareExchange.wgsl: lock-free float add (+1.5 per thread = 6.0) via atomicCompSwap
              int oldBits = atomicLoad(sFloatCas);
              for (int iter = 0; iter < 32; iter++) {
                float nextVal = intBitsToFloat(oldBits) + 1.5;
                int prev = atomicCompSwap(sFloatCas, oldBits, floatBitsToInt(nextVal));
                if (prev == oldBits) break;
                oldBits = prev;
              }

              workgroupBarrier();
              if (lid == 0u) {
                wgSum = atomicLoad(wgCounter);
              }
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs);

        const initSigned = new Int32Array([0, 0, 0, -5, 0, 123, 0]);
        const signedBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, initSigned, BufferUsage.Dynamic);
        const outBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, 8, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("SignedBuf", signedBuf);
        cs.shaderData.setBuffer("OutputBuf", outBuf);
        cs.dispatch(1);

        const signedOut = new Int32Array(7);
        const extraOut = new Int32Array(2);
        await signedBuf.getDataAsync(signedOut);
        await outBuf.getDataAsync(extraOut);

        expect(signedOut[0]).toBe(-8);
        expect(signedOut[1]).toBe(12);
        expect(signedOut[2]).toBe(-10);
        expect(signedOut[3]).toBe(1);
        expect(signedOut[4]).toBe(5);
        expect(signedOut[5]).toBe(-77);
        const floatResult = new Float32Array(signedOut.buffer, 6 * 4, 1)[0];
        expect(floatResult).toBeCloseTo(6.0, 4);
        expect(Array.from(extraOut)).toEqual([10, 123]);

        cs.destroy();
        signedBuf.destroy();
        outBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "Naga storage-textures.wgsl: executes writeonly imageStore -> readonly imageLoad on r32float storage texture and sampler2D compute read",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Naga/StorageTexAndSample" {
            Kernel "WriteR32F" {
              WorkgroupSize = (4, 4, 1);
              ComputeKernel = csWrite;
              layout(r32float) writeonly image2D dstTex;
              void csWrite() {
                ivec2 p = ivec2(int(gl_GlobalInvocationID.x), int(gl_GlobalInvocationID.y));
                float v = float(p.y * 4 + p.x) * 0.5 + 1.0;
                imageStore(dstTex, p, vec4(v, 0.0, 0.0, 1.0));
              }
            }

            Kernel "ReadAndSample" {
              WorkgroupSize = (4, 4, 1);
              ComputeKernel = csRead;
              layout(r32float) readonly image2D srcStorage;
              sampler2D srcSampled;
              storage OutBuf {
                float results[];
              };
              void csRead() {
                ivec2 p = ivec2(int(gl_GlobalInvocationID.x), int(gl_GlobalInvocationID.y));
                vec4 stVal = imageLoad(srcStorage, p);
                vec4 texVal = texelFetch(srcSampled, p, 0);
                ivec2 sz = textureSize(srcSampled, 0);
                // Pack: storage read value + sampled red channel * 10 + (sz == 4x4 ? 100 : 0)
                results[p.y * 4 + p.x] = stVal.x + texVal.x * 10.0 + (sz.x == 4 && sz.y == 4 ? 100.0 : 0.0);
              }
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs, "WriteR32F");
        await assertCleanComputeWGSL(device, cs, "ReadAndSample");

        const r32Tex = new Texture2D(engine, 4, 4, TextureFormat.R32_SFloat, false, false);
        const rgbaTex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false, false);
        const rgbaInit = new Uint8Array(4 * 4 * 4);
        for (let i = 0; i < 16; i++) {
          rgbaInit[i * 4] = 255; // red = 1.0
          rgbaInit[i * 4 + 3] = 255;
        }
        rgbaTex.setPixelBuffer(rgbaInit);

        const outBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, 16 * 4, BufferUsage.Dynamic);
        cs.shaderData.setTexture("dstTex", r32Tex);
        cs.shaderData.setTexture("srcStorage", r32Tex);
        cs.shaderData.setTexture("srcSampled", rgbaTex);
        cs.shaderData.setBuffer("OutBuf", outBuf);

        cs.dispatch("WriteR32F", 1, 1, 1);
        cs.dispatch("ReadAndSample", 1, 1, 1);

        const out = new Float32Array(16);
        await outBuf.getDataAsync(out);
        for (let i = 0; i < 16; i++) {
          const expected = i * 0.5 + 1.0 + 10.0 + 100.0;
          expect(out[i]).toBeCloseTo(expected, 4);
        }

        cs.destroy();
        r32Tex.destroy();
        rgbaTex.destroy();
        outBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "Naga workgroup-var-init + barriers + WorkGroupID/LocalInvocationID/NumWorkGroups multi-group reduction",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Naga/MultiWorkgroupReduce" {
            WorkgroupSize = (4, 1, 1);
            ComputeKernel = csMain;

            storage OutBuf {
              uint groupSums[];
            };

            shared uint s_vals[4];

            void csMain() {
              uint lid = gl_LocalInvocationID.x;
              uint wid = gl_WorkGroupID.x;
              uint nwg = gl_NumWorkGroups.x;
              s_vals[lid] = wid * 10u + lid + 1u;
              workgroupBarrier();
              storageBarrier();
              if (lid == 0u) {
                groupSums[wid] = (s_vals[0] + s_vals[1] + s_vals[2] + s_vals[3]) + nwg * 1000u;
              }
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs);

        const outBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, 3 * 4, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("OutBuf", outBuf);
        cs.dispatch(3, 1, 1);

        const out = new Uint32Array(3);
        await outBuf.getDataAsync(out);
        // wid=0: (1+2+3+4)+3000 = 3010; wid=1: (11+12+13+14)+3000 = 3050; wid=2: (21+22+23+24)+3000 = 3090
        expect(Array.from(out)).toEqual([3010, 3050, 3090]);

        cs.destroy();
        outBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "recovers ComputeShader execution after forceLoseDevice and forceRestoreDevice",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/DeviceRestore" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;

            storage OutBuf {
              uint outVal;
            };

            void csMain() {
              outVal = 7u;
            }
          }`,
          engine
        );

        const bufBefore = new Buffer(engine, BufferBindFlag.StorageBuffer, 4, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("OutBuf", bufBefore);
        cs.dispatch(1);
        const beforeOut = new Uint32Array(1);
        await bufBefore.getDataAsync(beforeOut);
        expect(beforeOut[0]).toBe(7);

        // Force device loss and restoration
        const restored = new Promise<void>((resolve) => {
          engine.once(EngineEventType.DeviceRestored, () => resolve());
        });
        engine.forceLoseDevice();
        engine.forceRestoreDevice();
        await restored;

        const { device: restoredDevice } = engine._hardwareRenderer as WebGPUGraphicDevice;
        restoredDevice.pushErrorScope("validation");

        const bufAfter = new Buffer(engine, BufferBindFlag.StorageBuffer, 4, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("OutBuf", bufAfter);
        cs.dispatch(1);
        const afterOut = new Uint32Array(1);
        await bufAfter.getDataAsync(afterOut);
        expect(afterOut[0]).toBe(7);

        cs.destroy();
        bufBefore.destroy();
        bufAfter.destroy();
        expect(await restoredDevice.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "retains storage buffers bound to active materials across resourceManager.gc() and updates ref-counts on replace and clone",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      try {
        const scene = engine.sceneManager.activeScene;
        const root = scene.createRootEntity();

        const shader = Shader.create(
          `Shader "Tests/BufferRefCount" {
            SubShader "Default" {
              Pass "0" {
                VertexShader = vert;
                FragmentShader = frag;
                readonly storage DataBuf { vec4 color; };
                struct a2v { vec3 POSITION; };
                void vert(a2v v) { gl_Position = vec4(v.POSITION, 1.0); }
                void frag() { gl_FragColor = color; }
              }
            }
          }`,
          engine
        );

        const material = new Material(engine, shader);
        const mesh = PrimitiveMesh.createPlane(engine, 1, 1);
        const e1 = root.createChild("e1");
        const r1 = e1.addComponent(MeshRenderer);
        r1.mesh = mesh;
        r1.setMaterial(material);
        expect(material._getReferCount()).toBe(1);

        const buf1 = new Buffer(engine, BufferBindFlag.StorageBuffer, 16, BufferUsage.Dynamic);
        material.shaderData.setBuffer("DataBuf", buf1);
        expect(buf1._getReferCount()).toBe(1);

        // Active material's storage buffer must NOT be destroyed by GC
        engine.resourceManager.gc();
        expect(buf1.destroyed).toBe(false);

        // Replacing the buffer drops ref-count on the old buffer and increments the new one
        const buf2 = new Buffer(engine, BufferBindFlag.StorageBuffer, 16, BufferUsage.Dynamic);
        material.shaderData.setBuffer("DataBuf", buf2);
        expect(buf1._getReferCount()).toBe(0);
        expect(buf2._getReferCount()).toBe(1);

        // Cloning the material to another active renderer increments the shared buffer's ref-count
        const cloned = material.clone();
        const e2 = root.createChild("e2");
        const r2 = e2.addComponent(MeshRenderer);
        r2.mesh = mesh;
        r2.setMaterial(cloned);
        expect(buf2._getReferCount()).toBe(2);

        // Clearing on the first material drops ref-count back to 1; GC destroys only unreferenced buf1
        material.shaderData.setBuffer("DataBuf", null);
        expect(buf2._getReferCount()).toBe(1);
        engine.resourceManager.gc();
        expect(buf1.destroyed).toBe(true);
        expect(buf2.destroyed).toBe(false);

        shader.destroy();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "supports storage texture declarations with precision qualifiers before or after access qualifiers",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/StorageTexPrecisionOrder" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;

            layout(r32float) writeonly highp image2D dstA;
            layout(rgba8unorm) highp writeonly image2D dstB;
            layout(r32float) readonly mediump image2D srcA;

            void csMain() {
              vec4 c = imageLoad(srcA, ivec2(0, 0));
              imageStore(dstA, ivec2(0, 0), vec4(c.r, 0.0, 0.0, 1.0));
              imageStore(dstB, ivec2(0, 0), vec4(c.r, 0.5, 0.25, 1.0));
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs);

        const srcTex = new Texture2D(engine, 1, 1, TextureFormat.R32_SFloat, false, false);
        srcTex.setPixelBuffer(new Float32Array([0.75]));
        const dstATex = new Texture2D(engine, 1, 1, TextureFormat.R32_SFloat, false, false);
        const dstBTex = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false, false);
        cs.shaderData.setTexture("srcA", srcTex);
        cs.shaderData.setTexture("dstA", dstATex);
        cs.shaderData.setTexture("dstB", dstBTex);
        cs.dispatch(1, 1, 1);

        const outB = new Uint8Array(4);
        await dstBTex.getPixelBufferAsync(0, 0, 1, 1, outB);
        expect(Math.abs(outB[0] - 191)).toBeLessThanOrEqual(1);
        expect(Math.abs(outB[1] - 128)).toBeLessThanOrEqual(1);
        expect(Math.abs(outB[2] - 64)).toBeLessThanOrEqual(1);
        expect(outB[3]).toBe(255);

        // Also verify `readwrite lowp image2D` compiles cleanly in Chrome Tint WGSL
        const csRw = ComputeShader.create(
          `ComputeShader "Tests/ReadWritePrecision" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;
            layout(r32float) readwrite lowp image2D rwImg;
            void csMain() {
              vec4 v = imageLoad(rwImg, ivec2(0, 0));
              imageStore(rwImg, ivec2(0, 0), v + vec4(1.0));
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, csRw);

        csRw.destroy();
        cs.destroy();
        srcTex.destroy();
        dstATex.destroy();
        dstBTex.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "retains storage buffers bound to ComputeShader.shaderData across resourceManager.gc() and releases them on destroy()",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/ComputeBufferGC" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;
            storage OutBuf {
              uint outVal;
            };
            void csMain() {
              outVal = 7u;
            }
          }`,
          engine
        );

        const buf = new Buffer(engine, BufferBindFlag.StorageBuffer, 4, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("OutBuf", buf);
        expect(buf._getReferCount()).toBe(1);

        cs.dispatch(1);
        const first = new Uint32Array(1);
        await buf.getDataAsync(first);
        expect(first[0]).toBe(7);

        // GC must NOT destroy a buffer still bound to a live ComputeShader
        engine.resourceManager.gc();
        expect(buf.destroyed).toBe(false);

        buf.setData(new Uint32Array([0]));
        cs.dispatch(1);
        const second = new Uint32Array(1);
        await buf.getDataAsync(second);
        expect(second[0]).toBe(7);

        // Destroying ComputeShader releases shaderData ref-count so GC reclaims the buffer
        cs.destroy();
        expect(buf._getReferCount()).toBe(0);
        engine.resourceManager.gc();
        expect(buf.destroyed).toBe(true);
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "preserves for-loop init variables when condition uses atomicCompSwap or hoisted side effects, and supports macro-wrapped atomicCompSwap",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/AtomicForAndMacro" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;

            storage OutBuf {
              atomic_uint a;
              atomic_uint b;
              uint resForCas[2];
              uint resForHoist;
              uint resMacroOld[2];
              uint resMacroParam[2];
              uint resMacroInc;
            };

            shared atomic_uint wgAtom;

            #define OLD(c, v) atomicCompSwap(a, c, v)
            #define CAS(t, c, v) atomicCompSwap(t, c, v)
            #define INC(x) (++x)

            void csMain() {
              // 1. for-loop condition using atomicCompSwap
              uint iterCas = 0u;
              for (int i = 0; i < 4 && atomicCompSwap(b, 0u, 7u) == 0u; i++) {
                iterCas += uint(i + 1);
              }
              resForCas[0] = iterCas;
              resForCas[1] = atomicLoad(b);

              // 2. for-loop condition that forces WGSL loop lowering via hoisted ++step
              uint stepCount = 0u;
              uint iterHoist = 0u;
              for (int i = 0; i < 4 && (++stepCount <= 2u); i++) {
                iterHoist += uint(i + 1);
              }
              // i=0 -> +1, i=1 -> +2 => 3
              resForHoist = iterHoist;

              // 3. function-like macro wrapping atomicCompSwap on global SSBO atomic
              uint oldVal = OLD(0u, 1u);
              resMacroOld[0] = atomicLoad(a);
              resMacroOld[1] = oldVal;

              // 4. function-like macro with target parameter on workgroup atomic + hoisting INC macro
              atomicStore(wgAtom, 10u);
              uint prevWg = CAS(wgAtom, 10u, 25u);
              resMacroParam[0] = atomicLoad(wgAtom);
              resMacroParam[1] = prevWg;

              uint n = 5u;
              resMacroInc = INC(n) + n;
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs);

        const init = new Uint32Array(10);
        const buf = new Buffer(engine, BufferBindFlag.StorageBuffer, init, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("OutBuf", buf);
        cs.dispatch(1);

        const out = new Uint32Array(10);
        await buf.getDataAsync(out);
        // out[2..3] = resForCas -> [1, 7]
        expect([out[2], out[3]]).toEqual([1, 7]);
        // out[4] = resForHoist -> 3
        expect(out[4]).toBe(3);
        // out[5..6] = resMacroOld -> [1, 0]
        expect([out[5], out[6]]).toEqual([1, 0]);
        // out[7..8] = resMacroParam -> [25, 10]
        expect([out[7], out[8]]).toEqual([25, 10]);
        // out[9] = resMacroInc -> 6 + 6 = 12
        expect(out[9]).toBe(12);

        cs.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "allows user struct types named readwrite in workgroup shared declarations",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Tests/SharedUserTypeReadwrite" {
            WorkgroupSize = (1, 1, 1);
            ComputeKernel = csMain;

            struct readwrite {
              uint v;
            };

            shared readwrite tmp;

            storage OutBuf {
              uint outVal;
            };

            void csMain() {
              tmp.v = 42u;
              workgroupBarrier();
              outVal = tmp.v;
            }
          }`,
          engine
        );
        await assertCleanComputeWGSL(device, cs);

        const buf = new Buffer(engine, BufferBindFlag.StorageBuffer, 4, BufferUsage.Dynamic);
        cs.shaderData.setBuffer("OutBuf", buf);
        cs.dispatch(1);

        const out = new Uint32Array(1);
        await buf.getDataAsync(out);
        expect(out[0]).toBe(42);

        cs.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it("compiles GLSL ES 3.00 identifiers named storage, shared, and readwrite in real Chrome WebGL2 (note: readonly/writeonly are GLSL ES 3.00 reserved words)", () => {
    const compiler = new ShaderCompiler();
    const source = `
      Shader "Tests/ContextualKeywords" {
        SubShader "Default" {
          Pass "0" {
            VertexShader = vert;
            FragmentShader = frag;
            struct a2v { vec4 POSITION; };
            void vert(a2v v) { gl_Position = v.POSITION; }
            void frag() {
              float storage = 0.2;
              float shared = 0.3;
              float readwrite = 0.4;
              gl_FragColor = vec4(storage, shared, readwrite, 1.0);
            }
          }
        }
      }
    `;
    const parsed = compiler._parseShaderSource(source);
    const pass = parsed.subShaders[0].passes[0];
    const gles = compiler._parseShaderPass(pass.contents, pass.vertexEntry, pass.fragmentEntry, ShaderLanguage.GLSLES300);
    expect(gles?.fragmentShaderInstructions?.length).toBeGreaterThan(0);

    const glMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["GL_ES", "1"],
      ["GL_FRAGMENT_PRECISION_HIGH", "1"],
      ["__VERSION__", "300"]
    ]);
    const fsSrc =
      "#version 300 es\nprecision highp float;\n" +
      ShaderMacroProcessor.evaluate(gles!.fragmentShaderInstructions!, glMacros);

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    expect(gl).not.toBeNull();
    const fs = gl!.createShader(gl!.FRAGMENT_SHADER)!;
    gl!.shaderSource(fs, fsSrc);
    gl!.compileShader(fs);
    const ok = gl!.getShaderParameter(fs, gl!.COMPILE_STATUS);
    const log = gl!.getShaderInfoLog(fs);
    gl!.deleteShader(fs);
    expect(ok, `Chrome WebGL2 compile failed: ${log}\n--- FS ---\n${fsSrc}`).toBe(true);
  });
});
