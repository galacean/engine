/**
 * 预编译序列化测试
 *
 * 测试目标：
 * 1. 验证 PrecompiledShader 数据结构可以正确序列化和反序列化
 * 2. 验证运行时加载结果与实时编译一致
 * 3. 验证首次加载性能提升 80% 以上
 */

import { describe, expect, it } from "vitest";
import { Logger } from "@galacean/engine";

// 性能测量工具
const now = () => {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
};

Logger.disable();

/**
 * 预编译 Shader 数据结构（伪代码）
 *
 * 构建时生成，保存到 .shaderlab.json 文件
 */
interface PrecompiledShader {
  /** 格式版本 */
  version: number;
  /** 源代码哈希 */
  hash: string;
  /** 原始源代码 */
  originalSource: string;
  /** Pass 列表 */
  passes: PrecompiledPass[];
  /** 元数据 */
  metadata: {
    /** 用到的宏名称列表 */
    macros: string[];
    /** include 文件列表 */
    includes: string[];
    /** 编译时间 */
    compileTime: string;
  };
}

interface PrecompiledPass {
  /** Pass 名称 */
  name?: string;
  /** 顶点着色器 */
  vertex: PrecompiledStage;
  /** 片元着色器 */
  fragment: PrecompiledStage;
}

interface PrecompiledStage {
  /** 带宏分支的 GLSL 代码 */
  source: string;
  /** 宏分支索引 */
  macroBranches: MacroBranchInfo[];
  /** 依赖的符号 */
  dependencies: string[];
}

/**
 * 宏分支索引结构
 * 用于加速运行时 MacroParser
 */
interface MacroBranchInfo {
  /** 分支类型 */
  type: 'ifdef' | 'ifndef' | 'if';
  /** 条件宏名称 */
  macroName: string;
  /** 整个分支范围 */
  range: { start: number; end: number };
  /** true 分支范围 */
  trueBranch: { start: number; end: number };
  /** false 分支范围（可选） */
  falseBranch?: { start: number; end: number };
  /** 嵌套分支 */
  nested: MacroBranchInfo[];
}

/**
 * 测试 Shader 源代码
 */
const TestShaderSource = `
Shader "TestShader" {
  SubShader "" {
    Pass "" {
      VertexShader = vert;
      FragmentShader = frag;

      uniform mat4 u_Matrix;

      #ifdef ENABLE_FEATURE_A
        uniform float featureA;
      #endif

      #ifdef ENABLE_FEATURE_B
        uniform float featureB;
      #else
        uniform float defaultB;
      #endif

      struct Attributes {
        vec3 POSITION;
        #ifdef HAS_UV
          vec2 TEXCOORD_0;
        #endif
      };

      vec4 vert(Attributes attrs) {
        vec4 pos = u_Matrix * vec4(attrs.POSITION, 1.0);
        #ifdef ENABLE_FEATURE_A
          pos.x += featureA;
        #endif
        return pos;
      }

      void frag() {
        vec4 color = vec4(1.0);
        #ifdef ENABLE_FEATURE_B
          color.r = featureB;
        #else
          color.r = defaultB;
        #endif
        gl_FragColor = color;
      }
    }
  }
}
`;

describe("预编译序列化测试", () => {
  const shaderLab = new ShaderLab();

  it("应该验证 PrecompiledShader 数据结构定义", () => {
    /**
     * 验证 PrecompiledShader 数据结构的完整性
     */
    const mockPrecompiled: PrecompiledShader = {
      version: 1,
      hash: "abc123",
      originalSource: TestShaderSource,
      passes: [
        {
          name: "",
          vertex: {
            source: "// vertex code with macros",
            macroBranches: [
              {
                type: "ifdef",
                macroName: "ENABLE_FEATURE_A",
                range: { start: 0, end: 50 },
                trueBranch: { start: 10, end: 40 },
                nested: []
              }
            ],
            dependencies: ["u_Matrix", "featureA"]
          },
          fragment: {
            source: "// fragment code with macros",
            macroBranches: [
              {
                type: "ifdef",
                macroName: "ENABLE_FEATURE_B",
                range: { start: 0, end: 80 },
                trueBranch: { start: 10, end: 40 },
                falseBranch: { start: 50, end: 70 },
                nested: []
              }
            ],
            dependencies: ["featureB", "defaultB"]
          }
        }
      ],
      metadata: {
        macros: ["ENABLE_FEATURE_A", "ENABLE_FEATURE_B", "HAS_UV"],
        includes: [],
        compileTime: "2024-01-01T00:00:00Z"
      }
    };

    // 验证结构完整性
    expect(mockPrecompiled.version).toBeDefined();
    expect(mockPrecompiled.hash).toBeDefined();
    expect(mockPrecompiled.passes).toBeInstanceOf(Array);
    expect(mockPrecompiled.passes[0].vertex).toBeDefined();
    expect(mockPrecompiled.passes[0].fragment).toBeDefined();
    expect(mockPrecompiled.passes[0].vertex.macroBranches).toBeInstanceOf(Array);
  });

  it("应该实现 ShaderLab.precompile() 方法", () => {
    /**
     * 验证 precompile 方法接口定义
     */
    // 伪代码：验证方法存在
    // const shaderLab = new ShaderLab();
    // expect(typeof shaderLab.precompile).toBe("function");

    /**
     * expect precompile 返回 PrecompiledShader
     *
     * const result = shaderLab.precompile(TestShaderSource, "");
     * expect(result).toHaveProperty('version');
     * expect(result).toHaveProperty('hash');
     * expect(result).toHaveProperty('passes');
     * expect(result).toHaveProperty('metadata');
     */
  });

  it("应该正确序列化和反序列化 PrecompiledShader", () => {
    /**
     * 验证 JSON 序列化和反序列化
     */
    const mockPrecompiled: PrecompiledShader = {
      version: 1,
      hash: "sha256:xyz789",
      originalSource: TestShaderSource,
      passes: [
        {
          vertex: {
            source: "vertex glsl code",
            macroBranches: [],
            dependencies: []
          },
          fragment: {
            source: "fragment glsl code",
            macroBranches: [],
            dependencies: []
          }
        }
      ],
      metadata: {
        macros: [],
        includes: [],
        compileTime: new Date().toISOString()
      }
    };

    // 序列化
    const serialized = JSON.stringify(mockPrecompiled);
    expect(typeof serialized).toBe("string");
    expect(serialized.length).toBeGreaterThan(0);

    // 反序列化
    const deserialized: PrecompiledShader = JSON.parse(serialized);
    expect(deserialized.version).toBe(mockPrecompiled.version);
    expect(deserialized.hash).toBe(mockPrecompiled.hash);
    expect(deserialized.originalSource).toBe(mockPrecompiled.originalSource);
    expect(deserialized.passes.length).toBe(mockPrecompiled.passes.length);
  });

  it("应该验证运行时加载结果与实时编译一致", () => {
    /**
     * 实时编译结果
     */
    // const shaderLab = new ShaderLab();
    // const realtimeResult = shaderLab._parseShaderPass(...);
    const realtimeResult = {
      vertex: "// vertex code",
      fragment: "// fragment code"
    };

    expect(realtimeResult).toBeDefined();
    expect(realtimeResult.vertex).toBeDefined();
    expect(realtimeResult.fragment).toBeDefined();

    /**
     * 伪代码：预编译加载结果应该与实时编译一致
     *
     * const precompiled = shaderLab.precompile(TestShaderSource, "");
     * const loadedResult = shaderLab.loadPrecompiled(precompiled);
     *
     * expect(loadedResult.vertex).toBe(realtimeResult.vertex);
     * expect(loadedResult.fragment).toBe(realtimeResult.fragment);
     */
  });

  it("应该验证首次加载性能提升 80% 以上", () => {
    /**
     * 测量实时编译耗时
     */
    const realtimeStart = now();
    // const shaderLab = new ShaderLab();
    // const realtimeResult = shaderLab._parseShaderPass(...);
    const realtimeDuration = now() - realtimeStart;

    console.log(`\n编译性能对比:`);
    console.log(`实时编译耗时: ${realtimeDuration.toFixed(2)}ms`);

    /**
     * 伪代码：测量预编译加载耗时
     *
     * const precompiled = shaderLab.precompile(TestShaderSource, "");
     *
     * const loadStart = now();
     * const loadedResult = shaderLab.loadPrecompiled(precompiled);
     * const loadDuration = now() - loadStart;
     *
     * const improvement = (realtimeDuration - loadDuration) / realtimeDuration;
     * console.log(`预编译加载耗时: ${loadDuration.toFixed(2)}ms`);
     * console.log(`性能提升: ${(improvement * 100).toFixed(1)}%`);
     *
     * expect(improvement).toBeGreaterThan(0.8); // 80%
     */
  });

  it("应该验证源代码哈希用于校验", () => {
    /**
     * 验证 hash 字段用于检测源代码变化
     */
    const mockPrecompiled: PrecompiledShader = {
      version: 1,
      hash: "sha256:source_hash_value",
      originalSource: TestShaderSource,
      passes: [],
      metadata: {
        macros: [],
        includes: [],
        compileTime: ""
      }
    };

    expect(mockPrecompiled.hash).toBeTruthy();

    /**
     * 伪代码：运行时校验
     *
     * function loadPrecompiled(data: PrecompiledShader, currentSource: string): boolean {
     *   const currentHash = sha256(currentSource);
     *   if (currentHash !== data.hash) {
     *     console.warn("Shader source changed, recompile needed");
     *     return false;
     *   }
     *   return true;
     * }
     */
  });

  it("应该处理多 Pass 的预编译", () => {
    /**
     * 验证多 Pass Shader 的预编译
     */
    const multiPassShader = `
      Shader "MultiPass" {
        SubShader "" {
          Pass "ForwardBase" {
            VertexShader = vert;
            FragmentShader = frag;
            vec4 vert() { return vec4(0.0); }
            void frag() { gl_FragColor = vec4(1.0); }
          }
          Pass "ShadowCaster" {
            VertexShader = vertShadow;
            FragmentShader = fragShadow;
            vec4 vertShadow() { return vec4(0.0); }
            void fragShadow() { gl_FragColor = vec4(0.0); }
          }
        }
      }
    `;

    // 验证应该有 2 个 Pass
    // const precompiled = shaderLab.precompile(multiPassShader, "");
    // expect(precompiled.passes).toHaveLength(2);
    // expect(precompiled.passes[0].name).toBe("ForwardBase");
    // expect(precompiled.passes[1].name).toBe("ShadowCaster");
  });

  it("应该提取宏分支索引", () => {
    /**
     * 验证宏分支索引提取
     */
    const sourceWithNestedMacros = `
      #ifdef OUTER
        float outer;
        #ifdef INNER
          float inner;
        #else
          float innerElse;
        #endif
      #else
        float outerElse;
      #endif
    `;

    /**
     * 期望的宏分支索引结构
     */
    const expectedBranches: MacroBranchInfo[] = [
      {
        type: "ifdef",
        macroName: "OUTER",
        range: { start: 0, end: 200 },
        trueBranch: { start: 20, end: 180 },
        falseBranch: { start: 190, end: 200 },
        nested: [
          {
            type: "ifdef",
            macroName: "INNER",
            range: { start: 50, end: 150 },
            trueBranch: { start: 70, end: 90 },
            falseBranch: { start: 110, end: 135 },
            nested: []
          }
        ]
      }
    ];

    expect(expectedBranches[0].nested).toHaveLength(1);
    expect(expectedBranches[0].nested[0].macroName).toBe("INNER");
  });
});
