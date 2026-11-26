import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { createWebGPUShaderCompilerSync } from "@galacean/engine-shader-compiler/webgpu";
import { type IWebGPUShaderProgram } from "@galacean/engine-design";
import { ShaderLanguage } from "@galacean/engine-webgpu";

/**
 * Conformance suite scoped strictly to the GLSL ES 3.00 grammar, builtin
 * functions, and builtin variables supported by dev/2.0 ShaderLab
 * (`packages/shader-parser/src/parser/TargetParser.y` + `builtin/{functions,variables}.ts`).
 *
 * Every test compiles through `ShaderCompiler` (`ShaderLanguage.WGSL`) and validates
 * the emitted WGSL against Chromium's real WebGPU/Tint `createShaderModule()`.
 * Semantic tests also execute a real 1x1 render pass on the GPU and assert pixel output.
 */
describe.skipIf(!navigator.gpu)("ShaderLab dev/2.0 WGSL conformance", () => {
  const compiler = new ShaderCompiler(createWebGPUShaderCompilerSync());
  let device: GPUDevice;

  beforeAll(async () => {
    const adapter = await navigator.gpu.requestAdapter();
    expect(adapter).not.toBeNull();
    device = await adapter!.requestDevice();
  });

  afterAll(() => {
    device?.destroy();
  });

  async function validateWGSL(source: string, vert = "vert", frag = "frag"): Promise<IWebGPUShaderProgram> {
    const pass = compiler._parseShaderPass(source, vert, frag, ShaderLanguage.WGSL);
    expect(pass?.wgsl).toBeDefined();
    const program = pass!.wgsl!;
    for (const [stage, code] of [
      ["vertex", program.vertex],
      ["fragment", program.fragment]
    ] as const) {
      const mod = device.createShaderModule({ label: `conformance-${stage}`, code });
      const info = await mod.getCompilationInfo();
      const errors = info.messages.filter((m) => m.type === "error");
      if (errors.length > 0) {
        const formatted = errors.map((e) => `L${e.lineNum}:${e.linePos} ${e.message}`).join("\n");
        throw new Error(`WGSL ${stage} compilation failed:\n${formatted}\n---\n${code}`);
      }
    }
    return program;
  }

  async function executeFragment(source: string): Promise<Uint8Array> {
    const program = await validateWGSL(source);
    const vMod = device.createShaderModule({ code: program.vertex });
    const fMod = device.createShaderModule({ code: program.fragment });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: vMod, entryPoint: "main" },
      fragment: { module: fMod, entryPoint: "main", targets: [{ format: "rgba8unorm" }] }
    });
    const tex = device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    });
    const readback = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: tex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store"
        }
      ]
    });
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    encoder.copyTextureToBuffer({ texture: tex }, { buffer: readback, bytesPerRow: 256 }, [1, 1]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const out = new Uint8Array(readback.getMappedRange(0, 4)).slice();
    readback.unmap();
    tex.destroy();
    readback.destroy();
    return out;
  }

  const fullscreenVert = `
    void vert() {
      vec2 pos[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
      gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
    }
  `;

  it("compiles and evaluates operators, control flow, comma expressions, logical xor, and bitwise broadcasting", async () => {
    const px = await executeFragment(`
      ${fullscreenVert}
      void frag() {
        // Logical XOR ^^
        bool x1 = (true ^^ false);
        bool x2 = !(true ^^ true);

        // Bitwise vector-scalar & shift broadcasting + compound assignments
        ivec2 bv = ivec2(0x1ff, 0x2aa) & 0xff;
        bv |= 1;
        bv ^= 2;
        bv <<= 1;
        bv >>= 1;
        bool bitOk = (bv == ivec2(0xfd, 0xa9));

        // While + for with continue/break + prefix/postfix inc/dec + comma expr
        int sum = 0;
        for (int i = 0; i < 10; i++) {
          if (i == 2) continue;
          if (i == 6) break;
          sum += i;
        }
        int w = 0;
        int acc = 0;
        while (w < 4) {
          int prev = w++;
          acc += prev;
        }
        int c = (sum += 1, ++w, sum);
        // sum before comma: 0+1+3+4+5 = 13 -> +1 = 14; acc = 0+1+2+3 = 6; w = 5
        bool loopOk = (c == 14) && (acc == 6) && (w == 5);

        // Ternary with scalar and vector
        vec2 t = x1 ? vec2(1.0, 0.5) : vec2(0.0, 0.0);
        gl_FragColor = vec4(
          (x1 && x2) ? 1.0 : 0.0,
          bitOk ? 1.0 : 0.0,
          loopOk ? 1.0 : 0.0,
          t.x
        );
      }
    `);
    expect(Array.from(px)).toEqual([255, 255, 255, 255]);
  });

  it("compiles and evaluates structs, brace initializers, array/struct/matrix equality, .length(), and overloads", async () => {
    const px = await executeFragment(`
      struct Pair {
        int a;
        vec2 b;
      };

      float calc(float x) { return x * 2.0; }
      float calc(vec2 v) { return v.x + v.y; }

      void mutate(inout vec4 v, out float total) {
        v.zw = vec2(3.0, 4.0);
        total = v.x + v.y + v.z + v.w;
      }

      ${fullscreenVert}
      void frag() {
        Pair p1 = { 7, vec2(1.0, 2.0) };
        Pair p2 = Pair(7, vec2(1.0, 2.0));
        bool structEq = (p1 == p2) && !(p1 != p2);

        float arrA[3] = { 1.0, 2.0, 3.0 };
        float arrB[3] = float[3](1.0, 2.0, 3.0);
        bool arrEq = (arrA == arrB) && (arrA.length() == 3);

        mat2 m1 = mat2(1.0);
        mat2 m2 = mat2(1.0, 0.0, 0.0, 1.0);
        bool matEq = (m1 == m2) && (m1.length() == 2) && (p1.b.length() == 2);

        vec4 v = vec4(1.0, 2.0, 0.0, 0.0);
        float total = 0.0;
        mutate(v, total);
        bool callOk = (calc(2.0) == 4.0) && (calc(vec2(1.5, 2.5)) == 4.0) && (total == 10.0);

        gl_FragColor = vec4(
          structEq ? 1.0 : 0.0,
          arrEq ? 1.0 : 0.0,
          matEq ? 1.0 : 0.0,
          callOk ? 1.0 : 0.0
        );
      }
    `);
    expect(Array.from(px)).toEqual([255, 255, 255, 255]);
  });

  it("compiles and evaluates dev/2.0 math, hyperbolic, bitcast, pack/unpack, vector compare, and matrix builtins", async () => {
    const px = await executeFragment(`
      ${fullscreenVert}
      void frag() {
        // Trig & hyperbolic
        float h = sinh(0.0) + cosh(0.0) + tanh(0.0) + asinh(0.0) + acosh(1.0) + atanh(0.0);
        bool hypOk = abs(h - 1.0) < 1e-4;

        // Rounding, mod, mix(bvec), step/smoothstep with scalar broadcast
        vec2 m = mod(vec2(5.5, -1.5), 2.0);
        vec2 r = roundEven(vec2(1.5, 2.5));
        vec2 mx = mix(vec2(1.0, 2.0), vec2(3.0, 4.0), bvec2(true, false));
        vec2 cl = clamp(vec2(-1.0, 5.0), 0.0, 2.0);
        bool mathOk = abs(m.x - 1.5) < 1e-4 && abs(m.y - 0.5) < 1e-4
          && r == vec2(2.0, 2.0) && mx == vec2(3.0, 2.0) && cl == vec2(0.0, 2.0);

        // Bitcast & 2x16 pack/unpack + isnan/isinf
        uint bits = floatBitsToUint(1.5);
        int ibits = floatBitsToInt(-2.0);
        bool bitcastOk = (uintBitsToFloat(bits) == 1.5) && (intBitsToFloat(ibits) == -2.0);
        vec2 hp = unpackHalf2x16(packHalf2x16(vec2(0.5, -0.25)));
        vec2 up = unpackUnorm2x16(packUnorm2x16(vec2(0.0, 1.0)));
        vec2 sp = unpackSnorm2x16(packSnorm2x16(vec2(-1.0, 1.0)));
        bool packOk = abs(hp.x - 0.5) < 1e-3 && abs(hp.y + 0.25) < 1e-3
          && abs(up.y - 1.0) < 1e-3 && abs(sp.x + 1.0) < 1e-3
          && !isnan(hp.x) && !isinf(hp.x);

        // Rectangular matrices, transpose, outerProduct, matrixCompMult, determinant, inverse, vector compare
        mat2x3 m23 = mat2x3(vec3(1.0, 2.0, 3.0), vec3(4.0, 5.0, 6.0));
        mat3x2 m32 = transpose(m23);
        mat2x3 op = outerProduct(vec3(1.0, 2.0, 3.0), vec2(2.0, 3.0));
        mat2 cm = matrixCompMult(mat2(1.0, 2.0, 3.0, 4.0), mat2(2.0, 3.0, 4.0, 5.0));
        mat2 inv = inverse(mat2(2.0, 0.0, 0.0, 4.0));
        float det = determinant(mat2(2.0, 0.0, 0.0, 4.0));
        bvec3 cmp = lessThan(vec3(1.0, 2.0, 3.0), vec3(2.0, 2.0, 4.0));
        bool matOk = (m32[2].y == 6.0) && (op[1].z == 9.0) && (cm[1].y == 20.0)
          && abs(inv[1].y - 0.25) < 1e-4 && abs(det - 8.0) < 1e-4
          && all(equal(cmp, bvec3(true, false, true)))
          && any(not(cmp))
          && all(greaterThanEqual(vec2(2.0, 3.0), vec2(2.0, 1.0)))
          && all(lessThanEqual(ivec2(1, 2), ivec2(1, 3)))
          && all(notEqual(uvec2(1u, 2u), uvec2(2u, 1u)));

        gl_FragColor = vec4(
          hypOk ? 1.0 : 0.0,
          mathOk ? 1.0 : 0.0,
          (bitcastOk && packOk) ? 1.0 : 0.0,
          matOk ? 1.0 : 0.0
        );
      }
    `);
    expect(Array.from(px)).toEqual([255, 255, 255, 255]);
  });

  it("compiles all dev/2.0 ShaderLab sampler types, texture builtins, derivatives, and builtin variables", async () => {
    await validateWGSL(`
      sampler2D u_tex2d;
      sampler3D u_tex3d;
      samplerCube u_cube;
      sampler2DArray u_arr;
      sampler2DShadow u_shadow2d;
      samplerCubeShadow u_shadowCube;
      sampler2DArrayShadow u_shadowArr;
      isampler2D u_itex2d;
      usampler2D u_utex2d;

      struct a2v {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };
      struct v2f {
        vec2 uv;
        flat int inst;
      };

      v2f vert(a2v v) {
        v2f o;
        vec4 s = textureLod(u_tex2d, v.TEXCOORD_0, 0.0);
        o.uv = v.TEXCOORD_0 + s.xy * 0.0;
        o.inst = gl_VertexID + gl_InstanceID + gl_MaxVertexAttribs;
        gl_PointSize = 2.0;
        gl_Position = vec4(v.POSITION, 1.0);
        return o;
      }

      void frag(v2f i) {
        vec2 uv = i.uv;
        vec4 c = vec4(0.0);

        // 2D / 3D / Cube / Array sampling + bias + lod + grad + offset + proj
        c += texture(u_tex2d, uv);
        c += texture(u_tex2d, uv, 0.5);
        c += texture2D(u_tex2d, uv);
        c += textureLod(u_tex2d, uv, 1.0);
        c += texture2DLodEXT(u_tex2d, uv, 1.0);
        c += textureGrad(u_tex2d, uv, dFdx(uv), dFdy(uv));
        c += textureOffset(u_tex2d, uv, ivec2(1, -1));
        c += textureLodOffset(u_tex2d, uv, 0.0, ivec2(1, 0));
        c += textureGradOffset(u_tex2d, uv, dFdx(uv), dFdy(uv), ivec2(0, 1));
        c += textureProj(u_tex2d, vec3(uv, 1.0));
        c += textureProj(u_tex2d, vec4(uv, 0.0, 1.0));
        c += textureProjLod(u_tex2d, vec3(uv, 1.0), 0.0);
        c += textureProjOffset(u_tex2d, vec3(uv, 1.0), ivec2(1, 0));
        c += textureProjGrad(u_tex2d, vec3(uv, 1.0), dFdx(uv), dFdy(uv));

        c += texture(u_tex3d, vec3(uv, 0.5));
        c += textureLod(u_tex3d, vec3(uv, 0.5), 0.0);
        c += texture(u_cube, normalize(vec3(uv, 1.0)));
        c += textureCubeLodEXT(u_cube, normalize(vec3(uv, 1.0)), 0.0);
        c += texture(u_arr, vec3(uv, 0.0));
        c += textureLod(u_arr, vec3(uv, 0.0), 0.0);

        // Shadow samplers (2D, Cube, 2DArray) including Grad / Offset / Proj
        float sh = 0.0;
        sh += texture(u_shadow2d, vec3(uv, 0.5));
        sh += textureLod(u_shadow2d, vec3(uv, 0.5), 0.0);
        sh += textureOffset(u_shadow2d, vec3(uv, 0.5), ivec2(1, 0));
        sh += textureGrad(u_shadow2d, vec3(uv, 0.5), dFdx(uv), dFdy(uv));
        sh += textureProj(u_shadow2d, vec4(uv, 0.5, 1.0));
        sh += texture(u_shadowCube, vec4(normalize(vec3(uv, 1.0)), 0.5));
        sh += textureGrad(u_shadowCube, vec4(normalize(vec3(uv, 1.0)), 0.5), vec3(0.01), vec3(0.01));
        sh += texture(u_shadowArr, vec4(uv, 0.0, 0.5));

        // Integer/unsigned textures & textureSize / texelFetch / texelFetchOffset
        ivec2 sz2 = textureSize(u_tex2d, 0);
        ivec3 sz3 = textureSize(u_tex3d, 0);
        ivec2 szc = textureSize(u_cube, 0);
        ivec3 sza = textureSize(u_arr, 0);
        ivec2 szs = textureSize(u_shadow2d, 0);
        ivec4 it = texelFetch(u_itex2d, ivec2(0), 0);
        uvec4 ut = texelFetchOffset(u_utex2d, ivec2(0), 0, ivec2(1, 0));

        // Derivatives & fragment builtins + discard
        vec2 fw = fwidth(uv);
        float meta = float(sz2.x + sz3.z + szc.x + sza.z + szs.x + it.x + int(ut.x) + i.inst + gl_MaxDrawBuffers);
        if (gl_FragCoord.x < -1.0 && !gl_FrontFacing) {
          discard;
        }
        gl_FragDepth = clamp(gl_PointCoord.x * 0.5, 0.0, 1.0);
        gl_FragColor = c + vec4(sh, fw.x, fw.y, meta * 0.0);
      }
    `);
  });

  it("compiles explicit Scene/Camera uniform blocks, MRT struct outputs, qualifiers, and nested struct/array uniforms", async () => {
    await validateWGSL(`
      uniform Camera {
        mat4 camera_VPMat;
      };

      uniform Scene {
        vec4 scene_FogParams;
        vec4 scene_Tints[2];
      };

      struct MaterialCfg {
        vec4 baseColor;
        float roughness;
      };

      MaterialCfg material_cfg;
      const float[3] kWeights = float[3](0.25, 0.5, 0.25);

      struct FragOut {
        layout(location = 0) vec4 albedo;
        layout(location = 1) vec4 normal;
      };

      struct a2v {
        vec3 POSITION;
      };

      struct v2f {
        smooth vec2 uv;
        flat int tag;
        centroid vec2 cuv;
      };

      v2f vert(a2v v) {
        v2f o;
        o.uv = v.POSITION.xy;
        o.cuv = v.POSITION.xy;
        o.tag = gl_VertexID;
        gl_Position = camera_VPMat * vec4(v.POSITION, 1.0);
        return o;
      }

      FragOut frag(v2f i) {
        FragOut o;
        float w = kWeights[0] + kWeights[1] + kWeights[2];
        o.albedo = material_cfg.baseColor * w + scene_Tints[0] + vec4(i.uv + i.cuv, float(i.tag), 0.0);
        o.normal = scene_Tints[1] + scene_FogParams * material_cfg.roughness;
        return o;
      }
    `);
  });
});
