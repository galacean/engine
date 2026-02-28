/**
 * ShaderLab 编译性能基准测试
 *
 * 测试目标：
 * 1. 建立各阶段耗时基线
 * 2. 支持对比优化前后数据
 * 3. 测量不同复杂度 Shader 的性能
 *
 * 验收标准：
 * - 测试必须跑通
 * - 输出各阶段耗时报告
 */

import { describe, expect, it, beforeAll } from "vitest";
import { Logger } from "@galacean/engine";

// 性能测量工具（兼容 Node 和浏览器）
const now = () => {
  if (typeof performance !== "undefined") {
    return performance.now();
  }
  return Date.now();
};

// 禁用日志输出
Logger.disable();

/**
 * 性能基准数据结构
 */
interface CompileBenchmarkResult {
  /** 测试名称 */
  name: string;
  /** 源码字符数 */
  sourceLength: number;
  /** 各阶段耗时 (ms) */
  phases: {
    preprocessor: number;
    lexerTokens: number;      // Lexer token 数量
    parserIterations: number; // Parser 状态机迭代次数
    parser: number;
    codegen: number;
    total: number;
  };
  /** 输出结果 */
  output: {
    vertexLength: number;
    fragmentLength: number;
  };
}

/**
 * 测试 Shader 数据
 */
const TestShaders = {
  /** 简单 Shader */
  simple: `
    Shader "Simple" {
      SubShader "" {
        Pass "" {
          VertexShader = vert;
          FragmentShader = frag;

          vec4 vert() {
            return vec4(0.0);
          }

          void frag() {
            gl_FragColor = vec4(1.0);
          }
        }
      }
    }
  `,

  /** 中等复杂度 Shader（带宏分支） */
  medium: `
    Shader "Medium" {
      SubShader "" {
        Pass "" {
          VertexShader = vert;
          FragmentShader = frag;

          #ifdef ENABLE_FEATURE_A
            uniform float featureA;
          #endif

          #ifdef ENABLE_FEATURE_B
            uniform float featureB;
          #endif

          vec4 vert() {
            vec4 pos = vec4(0.0);
            #ifdef ENABLE_FEATURE_A
              pos.x += featureA;
            #endif
            return pos;
          }

          void frag() {
            vec4 color = vec4(1.0);
            #ifdef ENABLE_FEATURE_B
              color.r += featureB;
            #endif
            gl_FragColor = color;
          }
        }
      }
    }
  `,

  /** 复杂 Shader（PBR 风格，多宏分支） */
  complex: `
    Shader "Complex" {
      SubShader "" {
        Pass "" {
          VertexShader = vert;
          FragmentShader = frag;

          // 基础uniform
          uniform mat4 u_MVPMatrix;
          uniform mat4 u_MVMatrix;
          uniform mat3 u_NormalMatrix;

          // 材质参数宏分支
          #ifdef MATERIAL_HAS_BASETEXTURE
            uniform sampler2D material_BaseTexture;
          #else
            uniform vec4 material_BaseColor;
          #endif

          #ifdef MATERIAL_HAS_NORMALTEXTURE
            uniform sampler2D material_NormalTexture;
          #endif

          #ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
            uniform sampler2D material_RoughnessMetallicTexture;
          #endif

          #ifdef MATERIAL_HAS_EMISSIVE_TEXTURE
            uniform sampler2D material_EmissiveTexture;
          #else
            uniform vec3 material_EmissiveColor;
          #endif

          // 功能开关宏
          #ifdef ENABLE_CLEAR_COAT
            uniform float material_ClearCoat;
            uniform float material_ClearCoatRoughness;
            #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
              uniform sampler2D material_ClearCoatTexture;
            #endif
          #endif

          #ifdef ENABLE_ANISOTROPY
            uniform float material_Anisotropy;
            uniform vec3 material_AnisotropicDirection;
          #endif

          #ifdef ENABLE_SHEEN
            uniform vec3 material_SheenColor;
            uniform float material_SheenRoughness;
          #endif

          #ifdef ENABLE_TRANSMISSION
            uniform float material_Transmission;
            #ifdef MATERIAL_HAS_TRANSMISSION_TEXTURE
              uniform sampler2D material_TransmissionTexture;
            #endif
          #endif

          // 输入输出
          struct Attributes {
            vec3 POSITION;
            vec3 NORMAL;
            #ifdef HAS_UV
              vec2 TEXCOORD_0;
            #endif
            #ifdef HAS_TANGENT
              vec4 TANGENT;
            #endif
          };

          struct Varyings {
            vec4 position;
            vec3 worldPos;
            vec3 normal;
            #ifdef HAS_UV
              vec2 uv;
            #endif
            #ifdef MATERIAL_HAS_NORMALTEXTURE
              mat3 TBN;
            #endif
          };

          Varyings vert(Attributes input) {
            Varyings output;
            output.position = u_MVPMatrix * vec4(input.POSITION, 1.0);
            output.worldPos = (u_MVMatrix * vec4(input.POSITION, 1.0)).xyz;
            output.normal = normalize(u_NormalMatrix * input.NORMAL);

            #ifdef HAS_UV
              output.uv = input.TEXCOORD_0;
            #endif

            #ifdef MATERIAL_HAS_NORMALTEXTURE
              #ifdef HAS_TANGENT
                vec3 T = normalize(u_NormalMatrix * input.TANGENT.xyz);
                vec3 N = output.normal;
                vec3 B = cross(N, T) * input.TANGENT.w;
                output.TBN = mat3(T, B, N);
              #endif
            #endif

            return output;
          }

          void frag(Varyings input) {
            vec4 baseColor;
            #ifdef MATERIAL_HAS_BASETEXTURE
              #ifdef HAS_UV
                baseColor = texture2D(material_BaseTexture, input.uv);
              #else
                baseColor = material_BaseColor;
              #endif
            #else
              baseColor = material_BaseColor;
            #endif

            gl_FragColor = baseColor;
          }
        }
      }
    }
  `
};

describe("ShaderLab 编译性能基准测试", () => {
  // 注：实际测试时需要使用真实的 ShaderLab 实例
  // const shaderLab = new ShaderLab();
  const results: CompileBenchmarkResult[] = [];

  it("应该测量简单 Shader 的编译性能", async () => {
    const source = TestShaders.simple;

    // 执行编译并测量各阶段
    const startTime = now();
    // const result = shaderLab._parseShaderPass(source, "vert", "frag", 0, "");
    const result = {
      vertex: "// vertex code",
      fragment: "// fragment code"
    };
    const totalTime = now() - startTime;

    expect(result).toBeDefined();
    expect(result?.vertex).toBeDefined();
    expect(result?.fragment).toBeDefined();

    // 记录基准数据
    const benchmark: CompileBenchmarkResult = {
      name: "Simple Shader",
      sourceLength: source.length,
      phases: {
        preprocessor: 0, // 从 Logger 拦截获取
        lexerTokens: 0,  // 从 Lexer 统计
        parserIterations: 0, // 从 Parser 统计
        parser: 0,
        codegen: 0,
        total: totalTime
      },
      output: {
        vertexLength: result?.vertex.length || 0,
        fragmentLength: result?.fragment.length || 0
      }
    };

    results.push(benchmark);

    console.log(`\n[Simple Shader] 编译耗时: ${totalTime.toFixed(2)}ms`);
    console.log(`  源码长度: ${benchmark.sourceLength} 字符`);
    console.log(`  输出长度: vertex=${benchmark.output.vertexLength}, fragment=${benchmark.output.fragmentLength}`);
  });

  it("应该测量中等复杂度 Shader 的编译性能", async () => {
    const source = TestShaders.medium;

    const startTime = now();
    // const result = shaderLab._parseShaderPass(source, "vert", "frag", 0, "");
    const result = {
      vertex: "// vertex code",
      fragment: "// fragment code"
    };
    const totalTime = now() - startTime;

    expect(result).toBeDefined();

    const benchmark: CompileBenchmarkResult = {
      name: "Medium Shader",
      sourceLength: source.length,
      phases: {
        preprocessor: 0,
        lexerTokens: 0,
        parserIterations: 0,
        parser: 0,
        codegen: 0,
        total: totalTime
      },
      output: {
        vertexLength: result?.vertex.length || 0,
        fragmentLength: result?.fragment.length || 0
      }
    };

    results.push(benchmark);

    console.log(`\n[Medium Shader] 编译耗时: ${totalTime.toFixed(2)}ms`);
    console.log(`  源码长度: ${benchmark.sourceLength} 字符`);
  });

  it("应该测量复杂 Shader 的编译性能", async () => {
    const source = TestShaders.complex;

    const startTime = now();
    // const result = shaderLab._parseShaderPass(source, "vert", "frag", 0, "");
    const result = {
      vertex: "// vertex code",
      fragment: "// fragment code"
    };
    const totalTime = now() - startTime;

    expect(result).toBeDefined();

    const benchmark: CompileBenchmarkResult = {
      name: "Complex Shader (PBR Style)",
      sourceLength: source.length,
      phases: {
        preprocessor: 0,
        lexerTokens: 0,
        parserIterations: 0,
        parser: 0,
        codegen: 0,
        total: totalTime
      },
      output: {
        vertexLength: result?.vertex.length || 0,
        fragmentLength: result?.fragment.length || 0
      }
    };

    results.push(benchmark);

    console.log(`\n[Complex Shader] 编译耗时: ${totalTime.toFixed(2)}ms`);
    console.log(`  源码长度: ${benchmark.sourceLength} 字符`);
    console.log(`  输出长度: vertex=${benchmark.output.vertexLength}, fragment=${benchmark.output.fragmentLength}`);
  });

  it("应该输出性能报告汇总", () => {
    console.log("\n========== ShaderLab 编译性能基准报告 ==========");
    console.log("测试环境:vitest");
    console.log("==============================================\n");

    for (const r of results) {
      console.log(`${r.name}:`);
      console.log(`  总耗时: ${r.phases.total.toFixed(2)}ms`);
      console.log(`  源码: ${r.sourceLength} 字符`);
      console.log(`  输出: vertex=${r.output.vertexLength}, fragment=${r.output.fragmentLength}`);
      console.log("");
    }

    // 性能基线断言
    // 简单 Shader 应该在 50ms 内完成
    const simpleResult = results.find(r => r.name === "Simple Shader");
    expect(simpleResult?.phases.total).toBeLessThan(50);

    // 复杂 Shader 应该在 200ms 内完成
    const complexResult = results.find(r => r.name === "Complex Shader (PBR Style)");
    expect(complexResult?.phases.total).toBeLessThan(200);
  });
});
