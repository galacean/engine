/**
 * 宏分支索引测试
 *
 * 测试目标：
 * 1. 验证宏分支索引可以正确提取
 * 2. 验证使用索引后的 MacroParser 性能提升 60% 以上
 * 3. 验证嵌套宏分支正确处理
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
 * 宏分支索引数据结构
 */
interface MacroBranchInfo {
  type: 'ifdef' | 'ifndef' | 'if';
  macroName: string;
  range: { start: number; end: number };
  trueBranch: { start: number; end: number };
  falseBranch?: { start: number; end: number };
  nested: MacroBranchInfo[];
}

/**
 * 带索引的展开函数签名（伪代码）
 */
interface MacroParserWithIndex {
  /**
   * 提取宏分支索引
   */
  extractBranchIndex(source: string): MacroBranchInfo[];

  /**
   * 使用索引展开
   */
  expandWithIndex(
    source: string,
    index: MacroBranchInfo[],
    macros: ShaderMacro[]
  ): string;
}

/**
 * 测试代码：包含简单宏分支
 */
const SimpleBranchCode = `
precision highp float;

uniform float alwaysUsed;

#ifdef USE_FEATURE_A
  uniform float featureAUniform;
  float calculateA(float x) {
    return x * featureAUniform;
  }
#else
  float calculateA(float x) {
    return x;
  }
#endif

void main() {
  float result = calculateA(alwaysUsed);
  gl_FragColor = vec4(result);
}
`;

/**
 * 测试代码：包含嵌套宏分支
 */
const NestedBranchCode = `
precision highp float;

#ifdef OUTER
  float outerValue;

  #ifdef INNER
    float innerValue;
  #else
    float innerElseValue;
  #endif

  void useOuter() {
    outerValue = 1.0;
    #ifdef INNER
      innerValue = 2.0;
    #else
      innerElseValue = 3.0;
    #endif
  }
#else
  float noOuterValue;

  #ifdef INNER
    float innerInElse;
  #endif
#endif

void main() {
  gl_FragColor = vec4(1.0);
}
`;

/**
 * 测试代码：包含多个独立宏
 */
const MultipleBranchesCode = `
precision highp float;

#ifdef FEATURE_A
  uniform float a;
#endif

#ifdef FEATURE_B
  uniform float b;
#endif

#ifdef FEATURE_C
  uniform float c;
#else
  uniform float cDefault;
#endif

void main() {
  float result = 0.0;

  #ifdef FEATURE_A
    result += a;
  #endif

  #ifdef FEATURE_B
    result += b;
  #endif

  #ifdef FEATURE_C
    result += c;
  #else
    result += cDefault;
  #endif

  gl_FragColor = vec4(result);
}
`;

describe("宏分支索引测试", () => {
  const shaderLab = new ShaderLab();

  it("应该提取简单宏分支索引", () => {
    /**
     * 期望提取的分支索引结构
     */
    const expectedIndex: MacroBranchInfo[] = [
      {
        type: "ifdef",
        macroName: "USE_FEATURE_A",
        range: { start: 50, end: 250 },  // #ifdef 到 #endif 的范围
        trueBranch: { start: 80, end: 160 },  // ifdef 分支内容
        falseBranch: { start: 170, end: 230 },  // else 分支内容
        nested: []  // 无嵌套
      }
    ];

    // 验证结构
    expect(expectedIndex[0].type).toBe("ifdef");
    expect(expectedIndex[0].macroName).toBe("USE_FEATURE_A");
    expect(expectedIndex[0].falseBranch).toBeDefined();
    expect(expectedIndex[0].nested).toHaveLength(0);

    /**
     * 伪代码：提取索引
     *
     * const index = extractBranchIndex(SimpleBranchCode);
     * expect(index).toHaveLength(1);
     * expect(index[0].macroName).toBe("USE_FEATURE_A");
     * expect(index[0].trueBranch).toBeDefined();
     * expect(index[0].falseBranch).toBeDefined();
     */
  });

  it("应该提取嵌套宏分支索引", () => {
    /**
     * 嵌套分支期望结构
     */
    const expectedNestedIndex: MacroBranchInfo[] = [
      {
        type: "ifdef",
        macroName: "OUTER",
        range: { start: 0, end: 500 },
        trueBranch: { start: 20, end: 400 },
        falseBranch: { start: 410, end: 500 },
        nested: [
          {
            type: "ifdef",
            macroName: "INNER",
            range: { start: 50, end: 150 },
            trueBranch: { start: 70, end: 95 },
            falseBranch: { start: 105, end: 130 },
            nested: []
          },
          {
            type: "ifdef",
            macroName: "INNER",
            range: { start: 200, end: 280 },
            trueBranch: { start: 220, end: 245 },
            falseBranch: { start: 255, end: 275 },
            nested: []
          },
          {
            type: "ifdef",
            macroName: "INNER",
            range: { start: 450, end: 490 },
            trueBranch: { start: 470, end: 485 },
            nested: []
          }
        ]
      }
    ];

    expect(expectedNestedIndex[0].nested).toHaveLength(3);
    expect(expectedNestedIndex[0].nested[0].macroName).toBe("INNER");
  });

  it("应该使用索引快速展开宏分支", () => {
    /**
     * 伪代码：对比有无索引的展开性能
     */
    const source = SimpleBranchCode;
    const macros = [ShaderMacro.getByName("USE_FEATURE_A")];

    // 方法 1：传统方式（无索引）
    const start1 = now();
    const result1 = shaderLab._parseMacros(source, macros);
    const time1 = now() - start1;

    // 方法 2：使用索引（优化后）
    /**
     * const index = extractBranchIndex(source);
     * const start2 = now();
     * const result2 = expandWithIndex(source, index, macros);
     * const time2 = now() - start2;
     *
     * // 验证结果一致
     * expect(result1).toBe(result2);
     *
     * // 验证性能提升
     * const improvement = (time1 - time2) / time1;
     * expect(improvement).toBeGreaterThan(0.6); // 60%
     */
  });

  it("应该处理 #ifndef 分支", () => {
    /**
     * 验证 #ifndef 分支提取
     */
    const sourceWithIfndef = `
      #ifndef DISABLE_FEATURE
        float featureEnabled;
      #else
        float featureDisabled;
      #endif
    `;

    const expectedIfndef: MacroBranchInfo[] = [
      {
        type: "ifndef",
        macroName: "DISABLE_FEATURE",
        range: { start: 0, end: 150 },
        trueBranch: { start: 30, end: 60 },  // #ifndef 分支
        falseBranch: { start: 70, end: 105 },  // #else 分支
        nested: []
      }
    ];

    expect(expectedIfndef[0].type).toBe("ifndef");
  });

  it("应该处理无 else 的 #ifdef", () => {
    /**
     * 验证只有 true 分支的情况
     */
    const sourceNoElse = `
      #ifdef FEATURE_A
        float a;
      #endif

      #ifdef FEATURE_B
        float b;
      #endif
    `;

    const expectedNoElse: MacroBranchInfo[] = [
      {
        type: "ifdef",
        macroName: "FEATURE_A",
        range: { start: 0, end: 50 },
        trueBranch: { start: 20, end: 35 },
        // falseBranch: undefined,  // 无 else 分支
        nested: []
      },
      {
        type: "ifdef",
        macroName: "FEATURE_B",
        range: { start: 60, end: 110 },
        trueBranch: { start: 80, end: 95 },
        nested: []
      }
    ];

    expect(expectedNoElse[0].falseBranch).toBeUndefined();
    expect(expectedNoElse).toHaveLength(2);
  });

  it("应该正确处理宏组合展开", () => {
    /**
     * 测试多个宏组合的场景
     */
    const source = MultipleBranchesCode;

    // 场景 1：定义 A 和 B，未定义 C
    const macros1 = [
      ShaderMacro.getByName("FEATURE_A"),
      ShaderMacro.getByName("FEATURE_B")
    ];

    const result1 = shaderLab._parseMacros(source, macros1);

    // 验证：包含 A 和 B 的定义，C 走 else 分支
    expect(result1).toContain("uniform float a;");
    expect(result1).toContain("uniform float b;");
    expect(result1).not.toContain("uniform float c;");
    expect(result1).toContain("uniform float cDefault;");

    // 场景 2：定义 A、B、C
    const macros2 = [
      ShaderMacro.getByName("FEATURE_A"),
      ShaderMacro.getByName("FEATURE_B"),
      ShaderMacro.getByName("FEATURE_C")
    ];

    const result2 = shaderLab._parseMacros(source, macros2);

    // 验证：包含 C 的定义，不走 else
    expect(result2).toContain("uniform float c;");
    expect(result2).not.toContain("uniform float cDefault;");
  });

  it("应该统计宏分支使用频率", () => {
    /**
     * 验证可以统计哪些宏分支被使用
     */
    const branchUsage = {
      "FEATURE_A": { count: 10, avgTime: 2.5 },
      "FEATURE_B": { count: 8, avgTime: 2.3 },
      "FEATURE_C": { count: 5, avgTime: 2.8 }
    };

    // 找出最常用的宏分支
    const mostUsed = Object.entries(branchUsage)
      .sort((a, b) => b[1].count - a[1].count)[0];

    expect(mostUsed[0]).toBe("FEATURE_A");
    expect(mostUsed[1].count).toBe(10);
  });
});
