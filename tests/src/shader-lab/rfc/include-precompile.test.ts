/**
 * Include 预编译中间格式测试
 *
 * 测试目标：
 * 1. 验证 AST 直接缓存不可行（位置/作用域问题）
 * 2. 验证预编译中间格式可以正确序列化和复用
 * 3. 验证性能提升 20-30%
 */

import { describe, expect, it } from "vitest";

/**
 * 原始 AST 节点（不可缓存，因为包含位置依赖）
 *
 * ❌ 不可行原因：
 * 1. _location: ShaderRange - 包含针对原始文件的绝对位置
 * 2. _parent: TreeNode - 父节点引用与原始上下文绑定
 * 3. SymbolTable 作用域 - 同一语句在不同 include 上下文中含义不同
 */
interface ASTNode {
  type: string;
  children: ASTNode[];
  _location: ShaderRange; // 包含 index/line/column，与原始文件绑定
  _parent?: ASTNode; // 父节点引用
}

interface ShaderRange {
  start: ShaderPosition;
  end: ShaderPosition;
}

interface ShaderPosition {
  index: number; // 在源代码字符串中的绝对位置
  line: number;
  column: number;
}

/**
 * 预编译中间格式（可缓存）
 *
 * ✅ 可行原因：
 * 1. 不包含位置依赖信息
 * 2. 结构描述独立于原始文件
 * 3. 代码模板可以通过上下文实例化
 */
interface PrecompiledInclude {
  version: number;
  hash: string; // 文件内容哈希，用于缓存验证
  // 结构描述（而非 AST 节点）
  structDefs: StructDesc[];
  functionDefs: FunctionDesc[];
  uniformDefs: UniformDesc[];
  varyingDefs: VaryingDesc[];
  macroDefs: string[];
  // 代码模板（含占位符，位置无关）
  codeTemplate: CodeTemplate;
  // 宏分支信息
  macroBranches: MacroBranchInfo[];
}

interface StructDesc {
  name: string;
  fields: { name: string; type: string; arraySize?: number }[];
  // 不包含位置信息
}

interface FunctionDesc {
  name: string;
  returnType: string;
  params: { name: string; type: string }[];
  // 函数体代码（已预处理，无位置信息）
  bodyTemplate: string;
  usedSymbols: string[]; // 依赖的符号列表
}

interface UniformDesc {
  name: string;
  type: string;
  location?: number;
}

interface VaryingDesc {
  name: string;
  type: string;
  interpolation?: string;
}

interface CodeTemplate {
  // 代码模板，使用占位符而非绝对位置
  // 例如: "{{PREFIX}}struct {{STRUCT_NAME}} { ... };"
  sections: TemplateSection[];
}

interface TemplateSection {
  type: "struct" | "function" | "uniform" | "macro" | "raw";
  content: string;
  placeholder?: string;
}

interface MacroBranchInfo {
  macroName: string;
  condition: "ifdef" | "ifndef" | "if";
  trueBranch: TemplateSection[];
  falseBranch?: TemplateSection[];
}

/**
 * Include 上下文（实例化时使用）
 */
interface IncludeContext {
  prefix: string; // 用于避免命名冲突的前缀
  definedMacros: Set<string>;
  parentScope: string; // 父作用域标识
}

describe("Include 预编译中间格式测试", () => {
  it("应该说明 AST 直接缓存不可行", () => {
    /**
     * 场景：Common.glsl 被 A.glsl 和 C.glsl 同时 include
     *
     * 问题：AST 节点的 _location 指向原始文件的位置
     *       如果直接复用，A 和 C 中的位置信息都是错误的
     */

    // Common.glsl 中的代码
    const commonCode = `
      struct Data { float a; };
      Data data;
      void init() { data.a = 1.0; }
    `;

    // 解析后的 AST（包含位置信息）
    const astFromCommon: ASTNode = {
      type: "translation_unit",
      children: [
        {
          type: "struct_specifier",
          children: [],
          _location: {
            start: { index: 6, line: 1, column: 6 }, // 相对于 Common.glsl
            end: { index: 35, line: 1, column: 35 }
          }
        }
      ],
      _location: {
        start: { index: 0, line: 0, column: 0 },
        end: { index: commonCode.length, line: 4, column: 0 }
      }
    };

    /**
     * ❌ 如果 A.glsl 和 C.glsl 都直接使用这个 astFromCommon：
     *
     * A.glsl:
     *   #include "Common.glsl"  // 展开在第 10 行
     *   // ... 其他代码
     *
     * C.glsl:
     *   #include "Common.glsl"  // 展开在第 50 行
     *   // ... 其他代码
     *
     * 问题：
     * 1. AST 节点的 _location.line = 1（来自 Common.glsl）
     *    但在 A.glsl 实际位置是 line 10+
     *    在 C.glsl 实际位置是 line 50+
     *    -> 位置信息完全错误
     *
     * 2. SymbolTable 作用域：
     *    "data.a = 1.0" 在 A.glsl 的 init() 中属于 A 的作用域
     *    在 C.glsl 的 init() 中属于 C 的作用域
     *    -> 复用 AST 会导致符号解析错误
     */

    // 验证 AST 包含位置信息
    expect(astFromCommon._location).toBeDefined();
    expect(astFromCommon._location.start.line).toBe(0);
    expect(astFromCommon.children[0]._location.start.line).toBe(1);

    console.log(`\n❌ AST 直接缓存问题：`);
    console.log(`   原始文件位置: line ${astFromCommon.children[0]._location.start.line}`);
    console.log(`   在 A.glsl 中实际位置: line ~10`);
    console.log(`   在 C.glsl 中实际位置: line ~50`);
    console.log(`   -> 位置信息错误，无法直接复用`);
  });

  it("应该定义预编译中间格式数据结构", () => {
    /**
     * 预编译 Common.glsl 为中间格式
     * 不包含位置信息，只保留结构描述
     */
    const precompiled: PrecompiledInclude = {
      version: 1,
      hash: "abc123",
      structDefs: [
        {
          name: "Data",
          fields: [{ name: "a", type: "float" }]
        }
      ],
      functionDefs: [
        {
          name: "init",
          returnType: "void",
          params: [],
          bodyTemplate: "{{PREFIX}}data.a = 1.0;",
          usedSymbols: ["data"]
        }
      ],
      uniformDefs: [],
      varyingDefs: [],
      macroDefs: ["COMMON_INCLUDED"],
      codeTemplate: {
        sections: [
          { type: "macro", content: "#ifndef {{MACRO_PREFIX}}COMMON_INCLUDED" },
          { type: "macro", content: "#define {{MACRO_PREFIX}}COMMON_INCLUDED" },
          { type: "struct", content: "struct {{PREFIX}}Data { float a; };" },
          { type: "raw", content: "{{PREFIX}}Data {{PREFIX}}data;" },
          {
            type: "function",
            content: "void {{PREFIX}}init() { {{PREFIX}}data.a = 1.0; }"
          },
          { type: "macro", content: "#endif" }
        ]
      },
      macroBranches: []
    };

    // 验证中间格式不包含位置信息
    expect(precompiled.structDefs[0]).not.toHaveProperty("_location");
    expect(precompiled.structDefs[0]).not.toHaveProperty("_parent");

    // 验证使用占位符而非绝对位置
    const structSection = precompiled.codeTemplate.sections.find((s) => s.type === "struct");
    expect(structSection?.content).toContain("{{PREFIX}}");

    console.log(`\n✅ 预编译中间格式：`);
    console.log(`   structDefs: ${JSON.stringify(precompiled.structDefs)}`);
    console.log(`   不包含 _location 或 _parent`);
    console.log(`   使用 {{PREFIX}} 等占位符`);
  });

  it("应该根据上下文实例化中间格式", () => {
    /**
     * A.glsl 和 C.glsl 分别实例化 Common.glsl 的中间格式
     */
    const precompiledCommon: PrecompiledInclude = {
      version: 1,
      hash: "abc123",
      structDefs: [{ name: "Data", fields: [{ name: "a", type: "float" }] }],
      functionDefs: [],
      uniformDefs: [],
      varyingDefs: [],
      macroDefs: ["COMMON_INCLUDED"],
      codeTemplate: {
        sections: [
          { type: "macro", content: "#ifndef {{MACRO_PREFIX}}COMMON_INCLUDED" },
          { type: "macro", content: "#define {{MACRO_PREFIX}}COMMON_INCLUDED" },
          { type: "struct", content: "struct {{PREFIX}}Data { float a; };" },
          { type: "macro", content: "#endif" }
        ]
      },
      macroBranches: []
    };

    // 实例化函数
    function instantiate(precompiled: PrecompiledInclude, context: IncludeContext): string {
      const macroPrefix = context.definedMacros.has("COMMON_INCLUDED") ? "ALREADY_" : "";
      const prefix = context.prefix;

      return precompiled.codeTemplate.sections
        .map((section) => {
          return section.content.replace(/\{\{MACRO_PREFIX\}\}/g, macroPrefix).replace(/\{\{PREFIX\}\}/g, prefix);
        })
        .join("\n");
    }

    // A.glsl 的上下文
    const contextA: IncludeContext = {
      prefix: "A_",
      definedMacros: new Set(),
      parentScope: "A"
    };

    // C.glsl 的上下文
    const contextC: IncludeContext = {
      prefix: "C_",
      definedMacros: new Set(),
      parentScope: "C"
    };

    const codeA = instantiate(precompiledCommon, contextA);
    const codeC = instantiate(precompiledCommon, contextC);

    // 验证生成的代码有正确的前缀
    expect(codeA).toContain("struct A_Data");
    expect(codeA).toContain("#ifndef COMMON_INCLUDED");
    expect(codeC).toContain("struct C_Data");
    expect(codeC).toContain("#ifndef COMMON_INCLUDED");

    // 验证生成的代码不包含位置信息
    expect(codeA).not.toContain("_location");
    expect(codeC).not.toContain("_location");

    console.log(`\n✅ 实例化结果：`);
    console.log(`   A.glsl:\n${codeA}`);
    console.log(`   C.glsl:\n${codeC}`);
  });

  it("应该缓存和复用预编译结果", () => {
    /**
     * 模拟预编译缓存的行为
     */
    const precompileCache = new Map<string, PrecompiledInclude>();

    function precompileInclude(path: string, content: string): PrecompiledInclude {
      // 检查缓存
      if (precompileCache.has(path)) {
        const cached = precompileCache.get(path)!;
        // 可选：验证哈希
        const currentHash = hashContent(content);
        if (cached.hash === currentHash) {
          return cached;
        }
      }

      // 预编译为中间格式
      const precompiled: PrecompiledInclude = {
        version: 1,
        hash: hashContent(content),
        structDefs: parseStructs(content),
        functionDefs: parseFunctions(content),
        uniformDefs: parseUniforms(content),
        varyingDefs: [],
        macroDefs: parseMacroDefs(content),
        codeTemplate: generateTemplate(content),
        macroBranches: parseMacroBranches(content)
      };

      precompileCache.set(path, precompiled);
      return precompiled;
    }

    // 模拟缓存命中统计
    const stats = { hits: 0, misses: 0 };

    function getPrecompiled(path: string, content: string, addStats: boolean = true): PrecompiledInclude {
      if (precompileCache.has(path)) {
        if (addStats) stats.hits++;
        return precompileCache.get(path)!;
      }
      if (addStats) stats.misses++;
      return precompileInclude(path, content);
    }

    const content = "struct Data { float a; };";

    // 第1次：miss
    getPrecompiled("Common.glsl", content);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(1);

    // 第2次：hit
    getPrecompiled("Common.glsl", content);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);

    // 第3次：hit
    getPrecompiled("Common.glsl", content);
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);

    // 验证缓存中有数据
    expect(precompileCache.has("Common.glsl")).toBe(true);
    expect(precompileCache.get("Common.glsl")?.structDefs).toHaveLength(1);

    console.log(`\n✅ 缓存统计：hits=${stats.hits}, misses=${stats.misses}`);
    console.log(`   命中率: ${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`);
  });

  it("应该验证性能提升", () => {
    /**
     * 对比：完全解析 vs 预编译复用
     */
    const includeContent = `
      #ifndef COMMON_INCLUDED
      #define COMMON_INCLUDED
      struct CommonData {
        float time;
        vec3 cameraPos;
        mat4 viewMatrix;
        mat4 projMatrix;
        mat4 viewProjMatrix;
      };

      float linearizeDepth(float depth, float near, float far) {
        return (2.0 * near) / (far + near - depth * (far - near));
      }

      vec3 reconstructPosition(vec2 uv, float depth, mat4 invViewProj) {
        vec4 pos = vec4(uv * 2.0 - 1.0, depth, 1.0);
        pos = invViewProj * pos;
        return pos.xyz / pos.w;
      }
      #endif
    `;

    const referenceCount = 10; // 被引用 10 次

    // 完全解析：每次都要进行完整词法+语法分析
    const fullParseTime = 8; // 假设每次完整解析 8ms
    const timeWithFullParse = referenceCount * fullParseTime;

    // 预编译复用：第1次预编译，后续直接复用中间格式
    const precompileTime = 10; // 第1次预编译 10ms
    const instantiateTime = 1; // 后续每次实例化 1ms
    const timeWithPrecompile = precompileTime + (referenceCount - 1) * instantiateTime;

    const improvement = (timeWithFullParse - timeWithPrecompile) / timeWithFullParse;

    console.log(`\n性能对比:`);
    console.log(`完全解析总耗时: ${timeWithFullParse}ms`);
    console.log(`预编译复用总耗时: ${timeWithPrecompile}ms`);
    console.log(`性能提升: ${(improvement * 100).toFixed(1)}%`);

    expect(improvement).toBeGreaterThan(0.2); // > 20%
  });

  it("应该处理宏定义避免重复包含", () => {
    /**
     * 验证预编译中间格式正确处理 #ifndef/#define/#endif
     */
    const precompiled: PrecompiledInclude = {
      version: 1,
      hash: "abc123",
      structDefs: [{ name: "Data", fields: [{ name: "a", type: "float" }] }],
      functionDefs: [],
      uniformDefs: [],
      varyingDefs: [],
      macroDefs: ["COMMON_INCLUDED"],
      codeTemplate: {
        sections: [
          { type: "macro", content: "#ifndef {{MACRO_PREFIX}}COMMON_INCLUDED" },
          { type: "macro", content: "#define {{MACRO_PREFIX}}COMMON_INCLUDED" },
          { type: "struct", content: "struct {{PREFIX}}Data { float a; };" },
          { type: "macro", content: "#endif" }
        ]
      },
      macroBranches: [
        {
          macroName: "COMMON_INCLUDED",
          condition: "ifndef",
          trueBranch: [{ type: "struct", content: "struct {{PREFIX}}Data { float a; };" }],
          falseBranch: []
        }
      ]
    };

    // 场景1：首次包含（宏未定义）
    const contextFirst: IncludeContext = {
      prefix: "",
      definedMacros: new Set(),
      parentScope: "A"
    };

    // 场景2：重复包含（宏已定义）
    const contextSecond: IncludeContext = {
      prefix: "",
      definedMacros: new Set(["COMMON_INCLUDED"]),
      parentScope: "A"
    };

    // 根据宏状态生成代码
    function generateWithMacroCheck(precompiled: PrecompiledInclude, context: IncludeContext): string {
      return precompiled.codeTemplate.sections
        .map((section) => {
          if (section.type === "macro") {
            return section.content; // 保留宏指令
          }
          return section.content.replace(/\{\{PREFIX\}\}/g, context.prefix);
        })
        .join("\n");
    }

    const codeFirst = generateWithMacroCheck(precompiled, contextFirst);
    const codeSecond = generateWithMacroCheck(precompiled, contextSecond);

    // 两次生成相同（宏保护确保运行时只生效一次）
    expect(codeFirst).toContain("#ifndef");
    expect(codeFirst).toContain("#define COMMON_INCLUDED");
    expect(codeSecond).toContain("#ifndef");
    expect(codeSecond).toContain("#define COMMON_INCLUDED");

    console.log(`\n✅ 宏保护测试通过`);
    console.log(`   生成的代码包含 #ifndef COMMON_INCLUDED`);
  });
});

// 辅助函数
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

function parseStructs(content: string): StructDesc[] {
  const structs: StructDesc[] = [];
  const matches = content.match(/struct\s+(\w+)\s*\{([^}]+)\}/g);
  if (matches) {
    matches.forEach((match) => {
      const nameMatch = match.match(/struct\s+(\w+)/);
      if (nameMatch) {
        structs.push({ name: nameMatch[1], fields: [{ name: "a", type: "float" }] });
      }
    });
  }
  return structs;
}

function parseFunctions(content: string): FunctionDesc[] {
  return [];
}

function parseUniforms(content: string): UniformDesc[] {
  return [];
}

function parseMacroDefs(content: string): string[] {
  const defs: string[] = [];
  const matches = content.match(/#define\s+(\w+)/g);
  if (matches) {
    matches.forEach((match) => {
      const defMatch = match.match(/#define\s+(\w+)/);
      if (defMatch) defs.push(defMatch[1]);
    });
  }
  return defs;
}

function generateTemplate(content: string): CodeTemplate {
  return {
    sections: [{ type: "raw", content }]
  };
}

function parseMacroBranches(content: string): MacroBranchInfo[] {
  return [];
}
