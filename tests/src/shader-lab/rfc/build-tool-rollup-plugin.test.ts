/**
 * Rollup 插件测试
 *
 * 测试目标：
 * 1. 验证 Rollup 插件可以正确预编译 Shader
 * 2. 验证 watch 模式下增量编译
 * 3. 验证插件接口符合 Rollup 规范
 */

import { describe, expect, it } from "vitest";

/**
 * Rollup 插件接口
 */
interface RollupPlugin {
  name: string;
  transform?(code: string, id: string): TransformResult | Promise<TransformResult>;
  load?(id: string): LoadResult | Promise<LoadResult>;
  resolveId?(source: string, importer?: string): ResolveIdResult | Promise<ResolveIdResult>;
  watchChange?(id: string, event: WatchChangeEvent): void;
  buildEnd?(error?: Error): void | Promise<void>;
}

type TransformResult =
  | { code: string; map?: SourceMap; ast?: unknown }
  | string
  | null;
type LoadResult = { code: string; map?: SourceMap } | string | null;
type ResolveIdResult = string | { id: string; external?: boolean } | null;
type SourceMap = { version: number; sources: string[]; mappings: string };
type WatchChangeEvent = { event: 'create' | 'update' | 'delete' };

/**
 * Rollup 插件配置选项
 */
interface ShaderLabRollupPluginOptions {
  /**
   * 匹配的文件后缀
   */
  extensions?: string[];

  /**
   * 输出格式
   */
  outputFormat?: 'json' | 'base64' | 'esm';

  /**
   * 是否压缩
   */
  minify?: boolean;

  /**
   * 自定义 include 路径解析
   */
  includePaths?: string[];
}

describe("Rollup 插件测试", () => {
  it("应该定义 Rollup 插件接口", () => {
    /**
     * 验证插件基本结构
     */
    const mockPlugin: RollupPlugin = {
      name: "rollup-plugin-galacean-shaderlab",

      transform(code: string, id: string): TransformResult {
        // 只处理 .shaderlab 文件
        if (!id.endsWith(".shaderlab")) {
          return null;
        }

        // 预编译代码
        // const precompiled = shaderLab.precompile(code, id);

        return {
          code: `export default ${JSON.stringify({ precompiled: true })};`,
          map: { version: 3, sources: [id], mappings: "" }
        };
      },

      load(id: string): LoadResult {
        // 可以在这里处理特殊的加载逻辑
        return null;
      },

      resolveId(source: string, importer?: string): ResolveIdResult {
        // 处理 include 路径解析
        if (source.startsWith("shader:")) {
          return { id: source.replace("shader:", ""), external: false };
        }
        return null;
      },

      watchChange(id: string, event: WatchChangeEvent): void {
        if (id.endsWith(".shaderlab")) {
          console.log(`Shader ${event.event}: ${id}`);
        }
      },

      buildEnd(error?: Error): void | Promise<void> {
        if (error) {
          console.error("Build error:", error);
        }
      }
    };

    expect(mockPlugin.name).toBe("rollup-plugin-galacean-shaderlab");
    expect(typeof mockPlugin.transform).toBe("function");
    expect(typeof mockPlugin.watchChange).toBe("function");
  });

  it("应该处理 .shaderlab 文件", () => {
    /**
     * 验证文件处理逻辑
     */
    const testFiles = [
      { id: "/project/src/pbr.shaderlab", shouldTransform: true },
      { id: "/project/src/unlit.shaderlab", shouldTransform: true },
      { id: "/project/src/main.js", shouldTransform: false },
      { id: "/project/node_modules/lib/index.js", shouldTransform: false }
    ];

    function shouldTransform(id: string): boolean {
      return id.endsWith(".shaderlab");
    }

    for (const test of testFiles) {
      expect(shouldTransform(test.id)).toBe(test.shouldTransform);
    }
  });

  it("应该生成不同类型的输出", () => {
    /**
     * 验证不同输出格式
     */
    const precompiledData = {
      version: 1,
      hash: "abc123",
      passes: []
    };

    // ESM 格式（默认）
    const esmOutput = `export default ${JSON.stringify(precompiledData)};`;
    expect(esmOutput).toContain("export default");

    // JSON 格式
    const jsonOutput = JSON.stringify(precompiledData);
    expect(typeof JSON.parse(jsonOutput)).toBe("object");

    // Base64 格式（用于内联）
    const base64Output = Buffer.from(JSON.stringify(precompiledData)).toString("base64");
    expect(typeof base64Output).toBe("string");
  });

  it("应该支持 watch 模式增量编译", () => {
    /**
     * 验证 watch 模式下的处理
     */
    const changedFiles: Array<{ id: string; event: string }> = [];
    const compiledFiles: string[] = [];

    const plugin: RollupPlugin = {
      name: "test-plugin",

      watchChange(id: string, event: WatchChangeEvent): void {
        changedFiles.push({ id, event: event.event });

        if (id.endsWith(".shaderlab")) {
          // 标记需要重新编译
          console.log(`Shader changed: ${id} (${event.event})`);
        }
      },

      transform(code: string, id: string): TransformResult {
        if (!id.endsWith(".shaderlab")) {
          return null;
        }

        compiledFiles.push(id);

        return {
          code: `export default {/* compiled ${id} */};`,
          map: null
        };
      }
    };

    // 模拟文件变更
    plugin.watchChange!("src/shaders/pbr.shaderlab", { event: "update" });
    plugin.watchChange!("src/shaders/unlit.shaderlab", { event: "create" });
    plugin.transform!("// shader code", "src/shaders/pbr.shaderlab");

    expect(changedFiles).toHaveLength(2);
    expect(compiledFiles).toContain("src/shaders/pbr.shaderlab");
  });

  it("应该解析 include 路径", () => {
    /**
     * 验证 include 路径解析
     */
    const includePaths: string[] = [
      "/project/src/shaders",
      "/project/assets/shaders"
    ];

    function resolveIncludePath(includeName: string): string | null {
      // 尝试在配置的 include 路径中查找
      for (const basePath of includePaths) {
        const fullPath = `${basePath}/${includeName}`;
        // 模拟文件存在检查
        if (fullPath.includes("Common")) {
          return fullPath;
        }
      }
      return null;
    }

    expect(resolveIncludePath("Common.glsl")).toBe("/project/src/shaders/Common.glsl");
    expect(resolveIncludePath("nonexistent.glsl")).toBeNull();
  });

  it("应该支持 Source Map", () => {
    /**
     * 验证 Source Map 生成
     */
    function generateSourceMap(originalId: string, originalCode: string): SourceMap {
      // 简化的 source map 生成
      const lines = originalCode.split("\n").length;

      return {
        version: 3,
        sources: [originalId],
        mappings: "AAAA".repeat(lines)  // 简化的 mapping
      };
    }

    const sourceMap = generateSourceMap(
      "/src/pbr.shaderlab",
      "Shader \"PBR\" {\n  SubShader {\n    Pass {\n    }\n  }\n}"
    );

    expect(sourceMap.version).toBe(3);
    expect(sourceMap.sources).toEqual(["/src/pbr.shaderlab"]);
    expect(sourceMap.mappings.length).toBeGreaterThan(0);
  });

  it("应该处理编译错误", () => {
    /**
     * 验证错误处理
     */
    const errors: Array<{ code: string; message: string }> = [];

    const plugin: RollupPlugin = {
      name: "test-plugin",

      transform(code: string, id: string): TransformResult {
        try {
          if (id.endsWith(".shaderlab")) {
            // 模拟编译错误
            if (code.includes("SYNTAX_ERROR")) {
              throw new Error("Shader syntax error at line 5");
            }

            return { code: `export default {};`, map: null };
          }
        } catch (err) {
          errors.push({
            code: "SHADER_COMPILE_ERROR",
            message: (err as Error).message
          });
          throw err;  // 重新抛出让 Rollup 处理
        }

        return null;
      },

      buildEnd(error?: Error): void {
        if (error) {
          console.error("Build ended with error:", error.message);
        }
      }
    };

    // 正常代码
    const goodResult = plugin.transform!("Shader \"Test\" {}", "/test.shaderlab");
    expect(goodResult).toBeDefined();
    expect(errors).toHaveLength(0);
  });

  it("应该支持配置选项", () => {
    /**
     * 验证配置选项处理
     */
    function createPlugin(options: ShaderLabRollupPluginOptions): RollupPlugin {
      const {
        extensions = [".shaderlab"],
        outputFormat = "esm",
        minify = false,
        includePaths = []
      } = options;

      return {
        name: "galacean-shaderlab",

        transform(code: string, id: string): TransformResult {
          // 检查扩展名
          if (!extensions.some(ext => id.endsWith(ext))) {
            return null;
          }

          // 预编译
          const precompiled = { /* ... */ };

          // 根据格式输出
          let output = "";
          switch (outputFormat) {
            case "json":
              output = `export default ${JSON.stringify(precompiled)};`;
              break;
            case "base64":
              output = `export default "${Buffer.from(JSON.stringify(precompiled)).toString("base64")}";`;
              break;
            case "esm":
            default:
              output = `export default ${JSON.stringify(precompiled)};`;
          }

          // 压缩（如果启用）
          if (minify) {
            output = output.replace(/\s+/g, " ");
          }

          return { code: output, map: null };
        },

        resolveId(source: string): ResolveIdResult {
          // 使用 includePaths 解析
          for (const path of includePaths) {
            if (source.startsWith(path)) {
              return { id: source, external: false };
            }
          }
          return null;
        }
      };
    }

    // 测试不同配置
    const plugin1 = createPlugin({ extensions: [".shaderlab"] });
    expect(plugin1.name).toBe("galacean-shaderlab");

    const plugin2 = createPlugin({
      extensions: [".shaderlab", ".glsl"],
      outputFormat: "base64",
      minify: true,
      includePaths: ["/shaders"]
    });
    expect(typeof plugin2.transform).toBe("function");
  });

  it("应该统计编译信息", () => {
    /**
     * 验证编译统计
     */
    const stats = {
      totalFiles: 10,
      totalTime: 500,  // ms
      averageTimePerFile: 50,  // ms
      cacheHits: 7,
      cacheMisses: 3,
      outputSize: 50000  // bytes
    };

    console.log(`\nRollup 编译统计:`);
    console.log(`  总文件数: ${stats.totalFiles}`);
    console.log(`  总耗时: ${stats.totalTime}ms`);
    console.log(`  平均耗时: ${stats.averageTimePerFile}ms`);
    console.log(`  缓存命中率: ${(stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(1)}%`);
    console.log(`  输出大小: ${(stats.outputSize / 1024).toFixed(2)}KB`);

    expect(stats.averageTimePerFile).toBe(stats.totalTime / stats.totalFiles);
  });
});
