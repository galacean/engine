import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { rollup } from "rollup";
import { describe, expect, it } from "vitest";

const root = resolve("packages");
const require = createRequire(import.meta.url);

describe("published graphics backend isolation", () => {
  it.each(["module", "main"] as const)("keeps the %s product graph independent for each backend", async (format) => {
    for (const gpu of [false, true]) {
      // Load at the published package entry, including the UI and both Spine
      // integrations in the WebGPU product graph. Transitive resolution uses
      // the same node-resolve/CommonJS plugins that browser consumers use.
      const targets = gpu ? ["galacean-webgpu", "ui", "spine", "spine-core-3.8", "spine-core-4.2"] : ["galacean"];
      const input = targets.map((name) => {
        const pkg = JSON.parse(readFileSync(resolve(root, name, "package.json"), "utf8"));
        return resolve(root, name, pkg[format]);
      });
      const bundle = await rollup({
        input,
        plugins: [nodeResolve({ mainFields: format === "main" ? ["main"] : ["module", "main"] }), commonjs()],
        onwarn(warning, warn) {
          if (warning.code === "UNRESOLVED_IMPORT") throw new Error(warning.message);
          if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
        }
      });
      try {
        const files = bundle.watchFiles.map((f) => f.replaceAll("\\", "/")).join("\n");
        if (gpu) {
          expect(files).toContain("/rhi-webgpu/dist/");
          expect(files).toMatch(/\/shader\/dist\/webgpu\.(?:module|main)\.js/);
          expect(files).toMatch(/\/shader-compiler\/dist\/webgpu\.(?:module|main)\.js/);
          expect(files).not.toContain("web-naga");
          expect(files).not.toContain("/rhi-webgl/dist/");
          expect(files).not.toMatch(/\/shader\/dist\/(?:module|main)\.js/);
        } else {
          expect(files).toContain("/rhi-webgl/dist/");
          expect(files).toMatch(/\/shader\/dist\/(?:module|main)\.js/);
          expect(files).not.toContain("/rhi-webgpu/dist/");
          expect(files).not.toMatch(/web-naga|web_naga_bg\.wasm|\/shader(?:-compiler)?\/dist\/webgpu\./);
        }
      } finally {
        await bundle.close();
      }
    }
  });

  it("provides Engine probes and RHI modes from the standalone WebGPU entry", async () => {
    const { Engine, RHIMode } = require(resolve(root, "galacean-webgpu/dist/main.js"));
    expect(typeof Engine.isWebGL2Supported).toBe("function");
    expect(typeof Engine.isWebGPUSupported).toBe("function");
    expect(Engine.isWebGL2Supported()).toBe(false);
    expect(await Engine.isWebGPUSupported()).toBe(false);
    expect(RHIMode.WebGPU).toBe("webgpu");
  });

  it("loads the native AST WGSL compiler from a CommonJS consumer without WASM", async () => {
    const consumer = createRequire(resolve("tests/package.json"));
    const entry = consumer.resolve("@galacean/engine-shader-compiler/webgpu");
    const compiler = await require(entry).createWebGPUShaderCompiler();
    const pass = compiler.compileWebGPUVariant(
      "void main(){gl_Position=vec4(1.0);}",
      "out vec4 c; void main(){c=vec4(1.0);}"
    );
    expect(pass.vertex).toContain("@vertex");
    expect(pass.fragment).toContain("@fragment");
  });
});
