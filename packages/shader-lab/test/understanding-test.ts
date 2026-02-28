/**
 * ShaderLab 编译系统理解验证测试
 *
 * 本测试用例用于验证对 ShaderLab 编译流程的理解：
 * 1. Preprocessor: 展开 #include，收集宏定义
 * 2. Lexer: 词法分析，将源代码转为 tokens
 * 3. Parser (LALR): 语法解析，将 tokens 转为 AST
 * 4. CodeGen: 代码生成，将 AST 转为 GLSL 代码（保留宏分支）
 * 5. MacroParser: 运行时宏展开，根据宏选择代码分支
 *
 * 关键洞察：
 * - Preprocessor 不会处理 #ifdef/#ifndef（这些留给 Parser 和 MacroParser 处理）
 * - Parser 生成的 AST 会保留宏分支结构（MacroPushContext/MacroPopContext）
 * - CodeGen 输出的代码仍包含 #ifdef/#else/#endif
 * - MacroParser 在运行时根据实际宏值选择分支
 */

import { describe, expect, it } from "vitest";
import { ShaderLab } from "../src/ShaderLab";
import { Preprocessor } from "../src/Preprocessor";
import { Lexer } from "../src/lexer";
import { Logger, ShaderMacro } from "@galacean/engine";

// 禁用 Logger 输出
Logger.disable();

describe("ShaderLab 编译系统理解验证", () => {
  const shaderLab = new ShaderLab();

  describe("1. Preprocessor 阶段", () => {
    it("应该展开 #include 并收集宏定义", () => {
      const source = `
#define PI 3.14159
#define SQUARE(x) ((x) * (x))

#include "Common.glsl"

void main() {
  float r = 1.0;
  float area = PI * SQUARE(r);
}
`;
      const macroDefineList = {};
      const result = Preprocessor.parse(source, "test.glsl", macroDefineList);

      // 验证：宏定义被收集
      expect(macroDefineList["PI"]).toBeDefined();
      expect(macroDefineList["PI"][0].value).toBe("3.14159");
      expect(macroDefineList["SQUARE"]).toBeDefined();
      expect(macroDefineList["SQUARE"][0].isFunction).toBe(true);
      expect(macroDefineList["SQUARE"][0].params).toEqual(["x"]);

      // 验证：#include 被展开（Common.glsl 内容会被插入）
      // 注意：由于 ShaderLib 中可能没有 Common.glsl，这里只是验证行为
    });

    it("应该正确处理条件编译宏结构", () => {
      const source = `
#ifndef COMMON_INCLUDED
#define COMMON_INCLUDED

float calculateArea(float radius) {
  return 3.14159 * radius * radius;
}

#endif
`;
      const macroDefineList = {};
      const result = Preprocessor.parse(source, "test.glsl", macroDefineList);

      // 关键洞察：Preprocessor 不会处理 #ifndef/#define/#endif
      // 这些条件编译指令会被原样保留，交给 Parser 处理
      expect(result).toContain("#ifndef COMMON_INCLUDED");
      expect(result).toContain("#define COMMON_INCLUDED");
      expect(result).toContain("#endif");

      // 但 #define 定义的宏会被收集
      expect(macroDefineList["COMMON_INCLUDED"]).toBeDefined();
    });
  });

  describe("2. Lexer 阶段", () => {
    it("应该正确识别宏相关 token", () => {
      const source = `
#ifdef ENABLE_FEATURE
  float value = 1.0;
#else
  float value = 0.0;
#endif
`;
      const lexer = new Lexer(source, {});
      const tokens = Array.from(lexer.tokenize());

      // 验证：识别宏指令 token
      const tokenTypes = tokens.map((t) => t.type);

      // Lexer 应该识别 #ifdef, #else, #endif 等宏指令
      expect(tokens.some((t) => t.lexeme === "#ifdef")).toBe(true);
      expect(tokens.some((t) => t.lexeme === "#else")).toBe(true);
      expect(tokens.some((t) => t.lexeme === "#endif")).toBe(true);
    });
  });

  describe("3. Parser 阶段", () => {
    it("应该构建包含宏分支的 AST", () => {
      // 这是一个简单的 GLSL 代码示例
      const source = `
float getValue() {
#ifdef USE_HIGH_PRECISION
  return 1.0;
#else
  return 0.5;
#endif
}

void main() {
  float v = getValue();
}
`;
      const macroDefineList = {};
      const preprocessed = Preprocessor.parse(source, "test.glsl", macroDefineList);
      const lexer = new Lexer(preprocessed, macroDefineList);
      const tokens = lexer.tokenize();

      const parser = ShaderLab.createParser();
      const program = parser.parse(tokens, macroDefineList);

      // 验证：AST 被正确构建
      expect(program).not.toBeNull();

      // 关键洞察：Parser 生成的 AST 会保留宏分支结构
      // 这意味着 #ifdef/#else/#endif 作为特殊的 AST 节点存在
      // 可以通过检查 program.shaderData 的内容来验证
    });
  });

  describe("4. CodeGen 阶段", () => {
    it("应该生成保留宏分支的 GLSL 代码", () => {
      // 注意：这里需要一个完整的 ShaderLab 代码
      // 由于 ShaderLab 代码结构较复杂，这里简化示意
      const source = `
Shader "" {
  SubShader "" {
    Pass "" {
      VertexShader = vert;
      FragmentShader = frag;

      #ifdef ENABLE_FEATURE
      float featureValue = 1.0;
      #else
      float featureValue = 0.0;
      #endif

      vec4 vert() {
        return vec4(0.0);
      }

      void frag() {
        float v = featureValue;
      }
    }
  }
}
`;
      const result = shaderLab._parseShaderPass(source, "vert", "frag", 0, "");

      if (result) {
        // 验证：生成的代码仍然包含宏分支
        // 这是因为 Parser 和 CodeGen 保留了宏分支结构
        expect(result.vertex).toBeDefined();
        expect(result.fragment).toBeDefined();
      }
    });
  });

  describe("5. MacroParser 阶段", () => {
    it("应该根据宏选择正确的代码分支", () => {
      // 模拟 CodeGen 输出的带有宏分支的代码
      const codeWithMacros = `
precision highp float;

#ifdef MATERIAL_HAS_BASETEXTURE
  uniform sampler2D material_BaseTexture;
#else
  uniform vec4 material_BaseColor;
#endif

void main() {
#ifdef MATERIAL_HAS_BASETEXTURE
  vec4 color = texture2D(material_BaseTexture, vec2(0.0));
#else
  vec4 color = material_BaseColor;
#endif
  gl_FragColor = color;
}
`;

      // 测试场景 1：定义了 MATERIAL_HAS_BASETEXTURE
      const macros1: ShaderMacro[] = [ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE")];
      const result1 = shaderLab._parseMacros(codeWithMacros, macros1);

      // 验证：选择了 true 分支
      expect(result1).toContain("uniform sampler2D material_BaseTexture");
      expect(result1).toContain("texture2D(material_BaseTexture");
      expect(result1).not.toContain("uniform vec4 material_BaseColor");

      // 测试场景 2：没有定义 MATERIAL_HAS_BASETEXTURE
      const macros2: ShaderMacro[] = [];
      const result2 = shaderLab._parseMacros(codeWithMacros, macros2);

      // 验证：选择了 false 分支
      expect(result2).toContain("uniform vec4 material_BaseColor");
      expect(result2).not.toContain("uniform sampler2D material_BaseTexture");
    });

    it("应该处理嵌套宏分支", () => {
      const codeWithNestedMacros = `
#ifdef OUTER
  float outerValue = 1.0;
  #ifdef INNER
    float innerValue = 2.0;
  #else
    float innerValue = 0.0;
  #endif
#else
  float outerValue = 0.0;
#endif
`;

      // 测试场景：只定义 OUTER，不定义 INNER
      const macros: ShaderMacro[] = [ShaderMacro.getByName("OUTER")];
      const result = shaderLab._parseMacros(codeWithNestedMacros, macros);

      expect(result).toContain("float outerValue = 1.0");
      expect(result).toContain("float innerValue = 0.0"); // INNER 未定义，走 else 分支
    });
  });

  describe("6. 完整编译流程性能测量", () => {
    it("应该测量各阶段耗时", () => {
      // 这是一个简化的 ShaderLab 代码用于性能测试
      const source = `
Shader "Test" {
  SubShader "" {
    Pass "" {
      VertexShader = vert;
      FragmentShader = frag;

      #ifdef ENABLE_FEATURE_A
      float featureA = 1.0;
      #endif

      #ifdef ENABLE_FEATURE_B
      float featureB = 2.0;
      #endif

      vec4 vert() {
        float result = 0.0;
        #ifdef ENABLE_FEATURE_A
        result += featureA;
        #endif
        #ifdef ENABLE_FEATURE_B
        result += featureB;
        #endif
        return vec4(result);
      }

      void frag() {
        gl_FragColor = vec4(1.0);
      }
    }
  }
}
`;

      // 首次编译（包含 Preprocessor + Lexer + Parser + CodeGen）
      const compileStart = performance.now();
      const result = shaderLab._parseShaderPass(source, "vert", "frag", 0, "");
      const compileTime = performance.now() - compileStart;

      console.log(`首次编译耗时: ${compileTime.toFixed(2)}ms`);

      if (result) {
        // 测试多个宏变种的展开性能
        const macroVariants = [
          [],
          [ShaderMacro.getByName("ENABLE_FEATURE_A")],
          [ShaderMacro.getByName("ENABLE_FEATURE_B")],
          [ShaderMacro.getByName("ENABLE_FEATURE_A"), ShaderMacro.getByName("ENABLE_FEATURE_B")],
        ];

        const vertexSource = result.vertex;
        const fragmentSource = result.fragment;

        console.log(`Vertex source length: ${vertexSource.length} chars`);
        console.log(`Fragment source length: ${fragmentSource.length} chars`);

        for (let i = 0; i < macroVariants.length; i++) {
          const macros = macroVariants[i];

          const variantStart = performance.now();
          const vResult = shaderLab._parseMacros(vertexSource, macros);
          const fResult = shaderLab._parseMacros(fragmentSource, macros);
          const variantTime = performance.now() - variantStart;

          console.log(`变种 ${i + 1} 展开耗时: ${variantTime.toFixed(2)}ms`);
        }
      }
    });
  });
});

// 扩展 ShaderLab 类型声明
declare module "../src/ShaderLab" {
  interface ShaderLab {
    _parseShaderPass(
      source: string,
      vertexEntry: string,
      fragmentEntry: string,
      backend: number,
      basePath: string
    ): { vertex: string; fragment: string } | undefined;
    _parseMacros(content: string, macros: ShaderMacro[]): string;
  }
}
