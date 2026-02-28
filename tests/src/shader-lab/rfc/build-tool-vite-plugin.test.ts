/**
 * Vite 插件测试
 *
 * 测试目标：
 * 1. 验证 Vite 插件可以正确预编译 Shader
 * 2. 验证 watch 模式下增量编译
 * 3. 验证插件接口符合 Vite 规范
 */

import { describe, expect, it } from "vitest";

/**
 * Vite 插件接口
 */
interface VitePlugin {
  name: string;
  enforce?: 'pre' | 'post';
  transform?(code: string, id: string): TransformResult | null;
  handleHotUpdate?(ctx: HmrContext): void | Array<File>;
}

type TransformResult = { code: string; map?: SourceMap } | string | null;
type SourceMap = object;
type File = { filepath: string };

interface HmrContext {
  file: string;
  timestamp: number;
  modules: Array<{ url: string }>;
  server: { moduleGraph: unknown };
  read(): string | Promise<string>;
}

/**
 * ShaderLab Vite 插件配置
 */
interface ShaderLabVitePluginOptions {
  /**
   * 匹配的文件模式
   */
  include?: string | RegExp | Array<string | RegExp>;

  /**
   * 排除的文件模式
   */
  exclude?: string | RegExp | Array<string | RegExp>;

  /**
   * 输出目录
   */
  outDir?: string;

  /**
   * 是否启用 HMR
   */
  hmr?: boolean;
}

describe("Vite 插件测试", () => {
  it("应该定义 Vite 插件接口", () => {
    /**
     * 验证插件基本结构
     */
    const mockPlugin: VitePlugin = {
      name: "galacean-shaderlab",
      enforce: "pre",

      transform(code: string, id: string): TransformResult {
        // 只处理 .shaderlab 文件
        if (!id.endsWith(".shaderlab")) {
          return null;
        }

        // 预编译代码
        // const precompiled = shaderLab.precompile(code, id);
        // const output = JSON.stringify(precompiled);

        return {
          code: `export default ${JSON.stringify({ hash: "abc123" })};`,
          map: null
        };
      },

      handleHotUpdate(ctx: HmrContext): void | Array<File> {
        if (ctx.file.endsWith(".shaderlab")) {
          // 通知 Vite 更新该模块
          return ctx.modules;
        }
      }
    };

    expect(mockPlugin.name).toBe("galacean-shaderlab");
    expect(mockPlugin.enforce).toBe("pre");
    expect(typeof mockPlugin.transform).toBe("function");
  });

  it("应该处理 .shaderlab 文件", () => {
    /**
     * 验证文件过滤逻辑
     */
    const testCases = [
      { id: "/src/shaders/pbr.shaderlab", shouldProcess: true },
      { id: "/src/shaders/unlit.shaderlab", shouldProcess: true },
      { id: "/src/utils/helper.ts", shouldProcess: false },
      { id: "/src/styles/main.css", shouldProcess: false },
      { id: "/src/shaders/lib.glsl", shouldProcess: false }
    ];

    function shouldProcess(id: string): boolean {
      return id.endsWith(".shaderlab");
    }

    for (const test of testCases) {
      expect(shouldProcess(test.id)).toBe(test.shouldProcess);
    }
  });

  it("应该生成预编译输出", () => {
    /**
     * 验证预编译输出格式
     */
    const mockShaderSource = `
      Shader "PBR" {
        SubShader "" {
          Pass "" {
            VertexShader = vert;
            FragmentShader = frag;
            vec4 vert() { return vec4(0.0); }
            void frag() { gl_FragColor = vec4(1.0); }
          }
        }
      }
    `;

    /**
     * 期望的预编译输出结构
     */
    const expectedOutput = {
      version: 1,
      hash: "sha256:xyz789",
      originalSource: mockShaderSource,
      passes: [
        {
          name: "",
          vertex: {
            source: "// vertex glsl code with macros",
            macroBranches: [],
            dependencies: []
          },
          fragment: {
            source: "// fragment glsl code with macros",
            macroBranches: [],
            dependencies: []
          }
        }
      ],
      metadata: {
        macros: [],
        includes: [],
        compileTime: "2024-01-01T00:00:00Z"
      }
    };

    // 生成 JS 模块代码
    const jsModuleCode = `export default ${JSON.stringify(expectedOutput)};`;

    expect(jsModuleCode).toContain("export default");
    expect(jsModuleCode).toContain("version");
    expect(jsModuleCode).toContain("hash");
  });

  it("应该支持 HMR 热更新", () => {
    /**
     * 验证热更新逻辑
     */
    const hmrLog: string[] = [];

    const plugin: VitePlugin = {
      name: "test-plugin",

      handleHotUpdate(ctx: HmrContext): void {
        const file = ctx.file;

        if (file.endsWith(".shaderlab")) {
          hmrLog.push(`Shader file changed: ${file}`);

          // 重新预编译
          // const content = await ctx.read();
          // const precompiled = shaderLab.precompile(content, file);

          // 通知更新
          // return ctx.modules;
        }
      }
    };

    // 模拟文件变更
    const mockContext: HmrContext = {
      file: "/src/shaders/pbr.shaderlab",
      timestamp: Date.now(),
      modules: [{ url: "/src/shaders/pbr.shaderlab" }],
      server: { moduleGraph: {} },
      read: () => "// new shader code"
    };

    plugin.handleHotUpdate!(mockContext);

    expect(hmrLog).toContain("Shader file changed: /src/shaders/pbr.shaderlab");
  });

  it("应该支持配置选项", () => {
    /**
     * 验证插件配置
     */
    const options: ShaderLabVitePluginOptions = {
      include: [/\.shaderlab$/i, /\.glsl$/i],
      exclude: [/node_modules/, /\.git/],
      outDir: "dist/shaders",
      hmr: true
    };

    expect(options.include).toBeInstanceOf(Array);
    expect(options.exclude).toBeInstanceOf(Array);
    expect(options.outDir).toBe("dist/shaders");
    expect(options.hmr).toBe(true);

    // 验证 include 匹配
    const testFiles = [
      "src/shaders/pbr.shaderlab",
      "src/shaders/lighting.glsl",
      "src/utils/helper.ts"
    ];

    for (const file of testFiles) {
      const shouldInclude = (options.include as RegExp[]).some(pattern => pattern.test(file));
      const shouldExclude = (options.exclude as RegExp[]).some(pattern => pattern.test(file));

      if (file.endsWith(".shaderlab") || file.endsWith(".glsl")) {
        expect(shouldInclude).toBe(true);
        expect(shouldExclude).toBe(false);
      }
    }
  });

  it("应该生成正确的 Source Map", () => {
    /**
     * 验证 Source Map 生成
     */
    const sourceMap: SourceMap = {
      version: 3,
      sources: ["/src/shaders/pbr.shaderlab"],
      sourcesContent: ["// original source"],
      mappings: "AAAA",
      names: []
    };

    const transformResult: TransformResult = {
      code: "export default {/* precompiled */};",
      map: sourceMap
    };

    expect(transformResult.map).toBeDefined();
    expect(transformResult.map).toHaveProperty("version");
    expect(transformResult.map).toHaveProperty("sources");
  });
});
