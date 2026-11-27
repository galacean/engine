import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  ComputeShader,
  Texture2D,
  TextureFormat,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";
import { describe, expect, it } from "vitest";

async function assertCleanWGSL(device: GPUDevice, cs: ComputeShader, kernelName?: string): Promise<string> {
  const linked = cs._linkVariant(kernelName);
  const mod = device.createShaderModule({ label: `bench-${cs.name}-${kernelName ?? "default"}`, code: linked.compute });
  const info = await mod.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === "error");
  if (errors.length > 0) {
    throw new Error(
      `Chrome Tint WGSL compilation error in ${cs.name}/${kernelName ?? "default"}:\n${errors
        .map((e) => `L${e.lineNum}:${e.linePos} ${e.message}`)
        .join("\n")}\n---\n${linked.compute}`
    );
  }
  return linked.compute;
}

describe("ShaderLab WebGPU ComputeShader Real-World Benchmarks", () => {
  it.skipIf(!navigator.gpu)(
    "Benchmark 1: GPU-Driven Frustum Culling + Atomic Stream Compaction (262,144 instances)",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Bench/FrustumCulling" {
            WorkgroupSize = (256, 1, 1);
            ComputeKernel = csCull;

            uint u_instanceCount;
            vec4 u_plane0;
            vec4 u_plane1;
            vec4 u_plane2;
            vec4 u_plane3;
            vec4 u_plane4;
            vec4 u_plane5;

            readonly storage BoundsBuf {
              vec4 spheres[];
            };

            storage VisibleBuf {
              uint indices[];
            };

            storage CounterBuf {
              atomic_uint visibleCount;
            };

            bool sphereInside(vec4 s) {
              vec3 c = s.xyz;
              float r = -s.w;
              if (dot(u_plane0.xyz, c) + u_plane0.w < r) return false;
              if (dot(u_plane1.xyz, c) + u_plane1.w < r) return false;
              if (dot(u_plane2.xyz, c) + u_plane2.w < r) return false;
              if (dot(u_plane3.xyz, c) + u_plane3.w < r) return false;
              if (dot(u_plane4.xyz, c) + u_plane4.w < r) return false;
              if (dot(u_plane5.xyz, c) + u_plane5.w < r) return false;
              return true;
            }

            void csCull() {
              uint idx = gl_GlobalInvocationID.x;
              if (idx >= u_instanceCount) return;
              if (sphereInside(spheres[idx])) {
                uint slot = atomicAdd(visibleCount, 1u);
                indices[slot] = idx;
              }
            }
          }`,
          engine
        );
        await assertCleanWGSL(device, cs);

        const N = 262_144; // 256K instances
        const spheres = new Float32Array(N * 4);
        // Deterministic pseudo-random world positions in [-200, 200] with radius [0.5, 4.5]
        let seed = 0x12345678;
        const nextRand = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        for (let i = 0; i < N; i++) {
          spheres[i * 4 + 0] = (nextRand() - 0.5) * 400;
          spheres[i * 4 + 1] = (nextRand() - 0.5) * 400;
          spheres[i * 4 + 2] = (nextRand() - 0.5) * 400;
          spheres[i * 4 + 3] = 0.5 + nextRand() * 4.0;
        }

        // Axis-aligned box frustum [-80, 80] x [-80, 80] x [-120, 40] (normal pointing inward)
        const planes = [
          [1, 0, 0, 80],
          [-1, 0, 0, 80],
          [0, 1, 0, 80],
          [0, -1, 0, 80],
          [0, 0, 1, 120],
          [0, 0, -1, 40]
        ];

        // CPU reference + CPU timing
        const cpuVisible = new Uint32Array(N);
        const runCPU = () => {
          let count = 0;
          for (let i = 0; i < N; i++) {
            const base = i * 4;
            const cx = spheres[base];
            const cy = spheres[base + 1];
            const cz = spheres[base + 2];
            const nr = -spheres[base + 3];
            if (
              cx + 80 >= nr &&
              -cx + 80 >= nr &&
              cy + 80 >= nr &&
              -cy + 80 >= nr &&
              cz + 120 >= nr &&
              -cz + 40 >= nr
            ) {
              cpuVisible[count++] = i;
            }
          }
          return count;
        };
        // Warmup CPU
        const cpuCount = runCPU();
        let cpuChecksum = 0;
        for (let i = 0; i < cpuCount; i++) cpuChecksum = (cpuChecksum + cpuVisible[i]) >>> 0;

        const cpuIters = 20;
        const cpuStart = performance.now();
        for (let it = 0; it < cpuIters; it++) runCPU();
        const cpuMs = (performance.now() - cpuStart) / cpuIters;

        // GPU buffers & uniforms
        const boundsBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, spheres, BufferUsage.Static);
        const visibleBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, N * 4, BufferUsage.Dynamic);
        const counterBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, new Uint32Array([0]), BufferUsage.Dynamic);

        cs.shaderData.setInt("u_instanceCount", N);
        planes.forEach((p, idx) => {
          cs.shaderData.setFloatArray(`u_plane${idx}`, new Float32Array(p));
        });
        cs.shaderData.setBuffer("BoundsBuf", boundsBuf);
        cs.shaderData.setBuffer("VisibleBuf", visibleBuf);
        cs.shaderData.setBuffer("CounterBuf", counterBuf);

        const groups = Math.ceil(N / 256);

        // Warmup GPU & verify exact numerical match
        cs.dispatch(groups);
        engine._hardwareRenderer.flush();
        await device.queue.onSubmittedWorkDone();

        const gpuCountArr = new Uint32Array(1);
        await counterBuf.getDataAsync(gpuCountArr);
        expect(gpuCountArr[0]).toBe(cpuCount);

        const gpuIndices = new Uint32Array(cpuCount);
        await visibleBuf.getDataAsync(gpuIndices, 0, 0, cpuCount);
        let gpuChecksum = 0;
        for (let i = 0; i < cpuCount; i++) gpuChecksum = (gpuChecksum + gpuIndices[i]) >>> 0;
        expect(gpuChecksum).toBe(cpuChecksum);

        // Timed GPU benchmark (20 dispatches)
        const gpuIters = 20;
        const zeroCounter = new Uint32Array([0]);
        const gpuStart = performance.now();
        for (let it = 0; it < gpuIters; it++) {
          counterBuf.setData(zeroCounter);
          cs.dispatch(groups);
        }
        engine._hardwareRenderer.flush();
        await device.queue.onSubmittedWorkDone();
        const gpuMs = (performance.now() - gpuStart) / gpuIters;

        console.log(
          `[BENCH 1 | Frustum Culling 262K] visible=${cpuCount}/${N} | CPU=${cpuMs.toFixed(3)}ms | GPU=${gpuMs.toFixed(3)}ms | speedup=${(cpuMs / gpuMs).toFixed(1)}x`
        );

        cs.destroy();
        boundsBuf.destroy();
        visibleBuf.destroy();
        counterBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "Benchmark 2: Tiled Shared-Memory N-Body Particle Gravity (4,096 particles = 16.78M pairs/step)",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Bench/TiledNBody" {
            WorkgroupSize = (128, 1, 1);
            ComputeKernel = csStep;

            uint u_count;
            float u_dt;
            float u_softeningSq;

            struct Particle {
              vec4 posMass;
              vec4 velPad;
            };

            readonly storage SrcParticles {
              Particle src[];
            };

            storage DstParticles {
              Particle dst[];
            };

            shared vec4 s_tile[128];

            void csStep() {
              uint gid = gl_GlobalInvocationID.x;
              uint lid = gl_LocalInvocationIndex;

              vec4 myPos = gid < u_count ? src[gid].posMass : vec4(0.0);
              vec3 myVel = gid < u_count ? src[gid].velPad.xyz : vec3(0.0);
              vec3 acc = vec3(0.0);

              uint numTiles = (u_count + 127u) / 128u;
              for (uint t = 0u; t < numTiles; t++) {
                uint idx = t * 128u + lid;
                s_tile[lid] = idx < u_count ? src[idx].posMass : vec4(0.0);
                workgroupBarrier();

                for (uint j = 0u; j < 128u; j++) {
                  vec4 other = s_tile[j];
                  vec3 d = other.xyz - myPos.xyz;
                  float distSq = dot(d, d) + u_softeningSq;
                  float invDist = inversesqrt(distSq);
                  float invDist3 = invDist * invDist * invDist;
                  acc += d * (other.w * invDist3);
                }
                workgroupBarrier();
              }

              if (gid < u_count) {
                vec3 newVel = myVel + acc * u_dt;
                vec3 newPos = myPos.xyz + newVel * u_dt;
                dst[gid].posMass = vec4(newPos, myPos.w);
                dst[gid].velPad = vec4(newVel, 0.0);
              }
            }
          }`,
          engine
        );
        await assertCleanWGSL(device, cs);

        const N = 4096;
        const dt = 0.016;
        const softeningSq = 0.25;
        const initData = new Float32Array(N * 8);
        let seed = 0xabcdef01;
        const nextRand = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        for (let i = 0; i < N; i++) {
          const base = i * 8;
          initData[base + 0] = (nextRand() - 0.5) * 40;
          initData[base + 1] = (nextRand() - 0.5) * 40;
          initData[base + 2] = (nextRand() - 0.5) * 40;
          initData[base + 3] = 0.5 + nextRand() * 1.5; // mass
          initData[base + 4] = (nextRand() - 0.5) * 2;
          initData[base + 5] = (nextRand() - 0.5) * 2;
          initData[base + 6] = (nextRand() - 0.5) * 2;
          initData[base + 7] = 0;
        }

        // CPU reference (1 full step of 4096 x 4096 = 16.78M pairs)
        const cpuOut = new Float32Array(N * 8);
        const cpuStart = performance.now();
        for (let i = 0; i < N; i++) {
          const ib = i * 8;
          const px = initData[ib];
          const py = initData[ib + 1];
          const pz = initData[ib + 2];
          let ax = 0,
            ay = 0,
            az = 0;
          for (let j = 0; j < N; j++) {
            const jb = j * 8;
            const dx = initData[jb] - px;
            const dy = initData[jb + 1] - py;
            const dz = initData[jb + 2] - pz;
            const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
            const invDist = 1 / Math.sqrt(distSq);
            const s = initData[jb + 3] * invDist * invDist * invDist;
            ax += dx * s;
            ay += dy * s;
            az += dz * s;
          }
          const vx = initData[ib + 4] + ax * dt;
          const vy = initData[ib + 5] + ay * dt;
          const vz = initData[ib + 6] + az * dt;
          cpuOut[ib] = px + vx * dt;
          cpuOut[ib + 1] = py + vy * dt;
          cpuOut[ib + 2] = pz + vz * dt;
          cpuOut[ib + 3] = initData[ib + 3];
          cpuOut[ib + 4] = vx;
          cpuOut[ib + 5] = vy;
          cpuOut[ib + 6] = vz;
        }
        const cpuMs = performance.now() - cpuStart;

        // GPU buffers (ping-pong)
        const bufA = new Buffer(engine, BufferBindFlag.StorageBuffer, initData, BufferUsage.Dynamic);
        const bufB = new Buffer(engine, BufferBindFlag.StorageBuffer, N * 8 * 4, BufferUsage.Dynamic);
        cs.shaderData.setInt("u_count", N);
        cs.shaderData.setFloat("u_dt", dt);
        cs.shaderData.setFloat("u_softeningSq", softeningSq);
        cs.shaderData.setBuffer("SrcParticles", bufA);
        cs.shaderData.setBuffer("DstParticles", bufB);

        const groups = N / 128;

        // Single step numerical accuracy verification
        cs.dispatch(groups);
        engine._hardwareRenderer.flush();
        await device.queue.onSubmittedWorkDone();

        const gpuOut = new Float32Array(N * 8);
        await bufB.getDataAsync(gpuOut);
        for (const idx of [0, 17, 513, 2047, 4095]) {
          for (let c = 0; c < 7; c++) {
            expect(gpuOut[idx * 8 + c]).toBeCloseTo(cpuOut[idx * 8 + c], 2);
          }
        }

        // Timed GPU benchmark (20 steps ping-pong)
        const gpuIters = 20;
        const gpuStart = performance.now();
        for (let it = 0; it < gpuIters; it++) {
          cs.shaderData.setBuffer("SrcParticles", it % 2 === 0 ? bufA : bufB);
          cs.shaderData.setBuffer("DstParticles", it % 2 === 0 ? bufB : bufA);
          cs.dispatch(groups);
        }
        engine._hardwareRenderer.flush();
        await device.queue.onSubmittedWorkDone();
        const gpuMs = (performance.now() - gpuStart) / gpuIters;
        const gflops = (N * N * 20) / (gpuMs * 1e6);

        console.log(
          `[BENCH 2 | Tiled N-Body 4096 (16.78M pairs)] CPU=${cpuMs.toFixed(2)}ms | GPU=${gpuMs.toFixed(3)}ms | speedup=${(cpuMs / gpuMs).toFixed(1)}x | ~${gflops.toFixed(1)} GFLOP/s`
        );

        cs.destroy();
        bufA.destroy();
        bufB.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );

  it.skipIf(!navigator.gpu)(
    "Benchmark 3: Post-Processing 256-Bin Luminance Histogram (shared atomics) + Separable Gaussian Blur (1024x1024)",
    async () => {
      const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
      const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
      device.pushErrorScope("validation");
      try {
        const cs = ComputeShader.create(
          `ComputeShader "Bench/PostProcess" {
            Kernel "Histogram" {
              WorkgroupSize = (16, 16, 1);
              ComputeKernel = csHist;

              sampler2D u_inputTex;
              storage HistBuf {
                atomic_uint bins[256];
              };
              shared atomic_uint s_bins[256];

              void csHist() {
                uint lid = gl_LocalInvocationIndex;
                atomicStore(s_bins[lid], 0u);
                workgroupBarrier();

                ivec2 coord = ivec2(int(gl_GlobalInvocationID.x), int(gl_GlobalInvocationID.y));
                ivec2 sz = textureSize(u_inputTex, 0);
                if (coord.x < sz.x && coord.y < sz.y) {
                  vec3 rgb = texelFetch(u_inputTex, coord, 0).rgb;
                  uvec3 u = uvec3(round(rgb * 255.0));
                  // Exact Rec.709 fixed-point luminance: (54*R + 183*G + 19*B) >> 8 (54+183+19=256)
                  uint bin = (u.r * 54u + u.g * 183u + u.b * 19u) >> 8u;
                  atomicAdd(s_bins[bin], 1u);
                }
                workgroupBarrier();

                uint localCount = atomicLoad(s_bins[lid]);
                if (localCount > 0u) {
                  atomicAdd(bins[lid], localCount);
                }
              }
            }

            Kernel "BlurH" {
              WorkgroupSize = (16, 16, 1);
              ComputeKernel = csBlurH;

              sampler2D u_srcTex;
              layout(rgba8unorm) writeonly image2D u_dstTex;

              void csBlurH() {
                ivec2 coord = ivec2(int(gl_GlobalInvocationID.x), int(gl_GlobalInvocationID.y));
                ivec2 sz = imageSize(u_dstTex);
                if (coord.x >= sz.x || coord.y >= sz.y) return;

                float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
                vec4 sum = texelFetch(u_srcTex, coord, 0) * w[0];
                for (int k = 1; k <= 4; k++) {
                  ivec2 pL = ivec2(max(coord.x - k, 0), coord.y);
                  ivec2 pR = ivec2(min(coord.x + k, sz.x - 1), coord.y);
                  sum += (texelFetch(u_srcTex, pL, 0) + texelFetch(u_srcTex, pR, 0)) * w[k];
                }
                imageStore(u_dstTex, coord, vec4(sum.rgb, 1.0));
              }
            }
          }`,
          engine
        );
        await assertCleanWGSL(device, cs, "Histogram");
        await assertCleanWGSL(device, cs, "BlurH");

        const W = 1024;
        const H = 1024;
        const pixels = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const o = (y * W + x) * 4;
            pixels[o + 0] = (x * 7 + y * 3) & 255;
            pixels[o + 1] = (x * 5 + y * 11) & 255;
            pixels[o + 2] = (x * 13 + y * 17) & 255;
            pixels[o + 3] = 255;
          }
        }

        // CPU reference: Histogram + Horizontal 9-tap Gaussian Blur
        const cpuBins = new Uint32Array(256);
        const cpuBlur = new Uint8Array(W * H * 4);
        const weights = [0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216];

        const runCPU = () => {
          cpuBins.fill(0);
          for (let i = 0; i < W * H; i++) {
            const o = i * 4;
            const bin = (pixels[o] * 54 + pixels[o + 1] * 183 + pixels[o + 2] * 19) >>> 8;
            cpuBins[bin]++;
          }
          for (let y = 0; y < H; y++) {
            const row = y * W;
            for (let x = 0; x < W; x++) {
              let r = pixels[(row + x) * 4] * weights[0];
              let g = pixels[(row + x) * 4 + 1] * weights[0];
              let b = pixels[(row + x) * 4 + 2] * weights[0];
              for (let k = 1; k <= 4; k++) {
                const xl = x - k < 0 ? 0 : x - k;
                const xr = x + k >= W ? W - 1 : x + k;
                const wk = weights[k];
                r += (pixels[(row + xl) * 4] + pixels[(row + xr) * 4]) * wk;
                g += (pixels[(row + xl) * 4 + 1] + pixels[(row + xr) * 4 + 1]) * wk;
                b += (pixels[(row + xl) * 4 + 2] + pixels[(row + xr) * 4 + 2]) * wk;
              }
              const o = (row + x) * 4;
              cpuBlur[o] = Math.round(r);
              cpuBlur[o + 1] = Math.round(g);
              cpuBlur[o + 2] = Math.round(b);
              cpuBlur[o + 3] = 255;
            }
          }
        };
        runCPU(); // warmup + reference
        const cpuIters = 5;
        const cpuStart = performance.now();
        for (let it = 0; it < cpuIters; it++) runCPU();
        const cpuMs = (performance.now() - cpuStart) / cpuIters;

        // GPU textures & histogram buffer
        const srcTex = new Texture2D(engine, W, H, TextureFormat.R8G8B8A8_UNorm, false, false);
        srcTex.setPixelBuffer(pixels);
        const dstTex = new Texture2D(engine, W, H, TextureFormat.R8G8B8A8_UNorm, false, false);
        const histBuf = new Buffer(engine, BufferBindFlag.StorageBuffer, new Uint32Array(256), BufferUsage.Dynamic);

        cs.shaderData.setTexture("u_inputTex", srcTex);
        cs.shaderData.setBuffer("HistBuf", histBuf);
        cs.shaderData.setTexture("u_srcTex", srcTex);
        cs.shaderData.setTexture("u_dstTex", dstTex);

        const gx = W / 16;
        const gy = H / 16;

        // Warmup + accuracy verification
        cs.dispatch("Histogram", gx, gy, 1);
        cs.dispatch("BlurH", gx, gy, 1);
        engine._hardwareRenderer.flush();
        await device.queue.onSubmittedWorkDone();

        const gpuBins = new Uint32Array(256);
        await histBuf.getDataAsync(gpuBins);
        let totalPixels = 0;
        for (let b = 0; b < 256; b++) totalPixels += gpuBins[b];
        expect(totalPixels).toBe(W * H);
        // Bit-exact match across all 256 histogram bins (1,048,576 pixels)
        let maxBinDiff = 0;
        for (let b = 0; b < 256; b++) {
          maxBinDiff = Math.max(maxBinDiff, Math.abs(gpuBins[b] - cpuBins[b]));
        }
        expect(maxBinDiff).toBe(0);

        const patch = new Uint8Array(4 * 4 * 4);
        await dstTex.getPixelBufferAsync(500, 500, 4, 4, patch);
        for (let py = 0; py < 4; py++) {
          for (let px = 0; px < 4; px++) {
            const go = (py * 4 + px) * 4;
            const co = ((500 + py) * W + (500 + px)) * 4;
            expect(Math.abs(patch[go] - cpuBlur[co])).toBeLessThanOrEqual(2);
            expect(Math.abs(patch[go + 1] - cpuBlur[co + 1])).toBeLessThanOrEqual(2);
            expect(Math.abs(patch[go + 2] - cpuBlur[co + 2])).toBeLessThanOrEqual(2);
            expect(patch[go + 3]).toBe(255);
          }
        }

        // Timed GPU benchmark (20 iterations)
        const gpuIters = 20;
        const zeroBins = new Uint32Array(256);
        const gpuStart = performance.now();
        for (let it = 0; it < gpuIters; it++) {
          histBuf.setData(zeroBins);
          cs.dispatch("Histogram", gx, gy, 1);
          cs.dispatch("BlurH", gx, gy, 1);
        }
        engine._hardwareRenderer.flush();
        await device.queue.onSubmittedWorkDone();
        const gpuMs = (performance.now() - gpuStart) / gpuIters;

        console.log(
          `[BENCH 3 | 1024x1024 Histogram + 9-Tap Blur] pixels=${W * H} (maxBinDiff=${maxBinDiff}) | CPU=${cpuMs.toFixed(2)}ms | GPU=${gpuMs.toFixed(3)}ms | speedup=${(cpuMs / gpuMs).toFixed(1)}x`
        );

        cs.destroy();
        srcTex.destroy();
        dstTex.destroy();
        histBuf.destroy();
        expect(await device.popErrorScope()).toBeNull();
      } finally {
        engine.destroy();
      }
    }
  );
});
