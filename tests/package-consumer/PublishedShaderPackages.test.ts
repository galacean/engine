import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const packageDirectories = ["math", "design", "core", "shader-parser", "shader-analyzer", "shader-compiler"] as const;
const temporaryRoot = mkdtempSync(join(tmpdir(), "galacean-shader-packages-"));
const tarballDirectory = join(temporaryRoot, "tarballs");
const consumerDirectory = join(temporaryRoot, "consumer");

beforeAll(() => {
  mkdirSync(tarballDirectory);
  mkdirSync(consumerDirectory);
  const dependencies: Record<string, string> = {};
  for (const directory of packageDirectories) {
    const packageDirectory = join(repositoryRoot, "packages", directory);
    const packageJson = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")) as { name: string };
    execFileSync("pnpm", ["pack", "--pack-destination", tarballDirectory], {
      cwd: packageDirectory,
      stdio: "pipe"
    });
    const prefix = packageJson.name.replace("@galacean/", "galacean-").replaceAll("/", "-");
    const tarball = readdirSync(tarballDirectory).find((file) => file.startsWith(prefix) && file.endsWith(".tgz"));
    if (!tarball) throw new Error(`Packed tarball not found for ${packageJson.name}.`);
    dependencies[packageJson.name] = `file:${join(tarballDirectory, tarball)}`;
  }
  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify(
      {
        name: "shader-package-consumer",
        private: true,
        version: "1.0.0",
        dependencies,
        pnpm: { overrides: dependencies }
      },
      null,
      2
    )
  );
  const install = spawnSync("pnpm", ["install", "--prefer-offline", "--ignore-scripts"], {
    cwd: consumerDirectory,
    encoding: "utf8"
  });
  if (install.status !== 0) throw new Error(install.stderr || install.stdout);
});

afterAll(() => {
  rmSync(temporaryRoot, { recursive: true, force: true });
});

describe("published shader packages", () => {
  it("rejects the parser root while loading both internal entries in ESM and CommonJS", () => {
    for (const mode of ["require", "import"] as const) {
      const rootProbe = runNode(
        mode === "require"
          ? 'require("@galacean/engine-shader-parser")'
          : 'await import("@galacean/engine-shader-parser")',
        mode === "import"
      );
      expect(rootProbe.status).not.toBe(0);
      expect(rootProbe.stderr).toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");

      const entryProbe = runNode(
        mode === "require"
          ? `const runtime = require("@galacean/engine-shader-parser/internal");
             const analyzer = require("@galacean/engine-shader-parser/internal/analyzer");
             process.stdout.write(JSON.stringify({ runtime: Object.keys(runtime), analyzer: Object.keys(analyzer) }));`
          : `const runtime = await import("@galacean/engine-shader-parser/internal");
             const analyzer = await import("@galacean/engine-shader-parser/internal/analyzer");
             process.stdout.write(JSON.stringify({ runtime: Object.keys(runtime), analyzer: Object.keys(analyzer) }));`,
        mode === "import"
      );
      expect(entryProbe.status, entryProbe.stderr).toBe(0);
      const surfaces = JSON.parse(entryProbe.stdout) as { runtime: string[]; analyzer: string[] };
      expect(surfaces.runtime).toContain("Lexer");
      expect(surfaces.runtime).not.toContain("AnalyzerLexer");
      expect(surfaces.analyzer).toContain("AnalyzerLexer");
    }
  });

  it("installs every shared parser chunk referenced by both module formats", () => {
    const sharedDirectory = join(
      consumerDirectory,
      "node_modules",
      "@galacean",
      "engine-shader-parser",
      "dist",
      "shared"
    );
    const sharedFiles = readdirSync(sharedDirectory);
    expect(sharedFiles.some((file) => file.endsWith(".module.js"))).toBe(true);
    expect(sharedFiles.some((file) => file.endsWith(".main.js"))).toBe(true);
  });

  it("runs help, include, stdin, diagnostic, and usage contracts through the installed bin", () => {
    const binary = installedBinary();
    const help = spawnSync(binary, ["--help"], { cwd: consumerDirectory, encoding: "utf8" });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("Usage: galacean-shader-analyzer");

    const shaderDirectory = join(consumerDirectory, "Assets", "Shaders");
    mkdirSync(join(shaderDirectory, "chunks"), { recursive: true });
    writeFileSync(join(shaderDirectory, "chunks", "Common.glsl"), "float includedValue() { return 1.0; }");
    writeFileSync(join(shaderDirectory, "Root.shader"), shaderSource("./chunks/Common.glsl", "includedValue()"));
    const valid = spawnSync(binary, [join(shaderDirectory, "Root.shader")], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(valid.status, valid.stderr || valid.stdout).toBe(0);

    writeFileSync(join(shaderDirectory, "chunks", "Broken.glsl"), "#if 123 defined(USE)\n#endif");
    writeFileSync(join(shaderDirectory, "Broken.shader"), shaderSource("./chunks/Broken.glsl", "1.0"));
    const invalid = spawnSync(binary, ["--json", join(shaderDirectory, "Broken.shader")], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(invalid.status).toBe(1);
    const invalidOutput = JSON.parse(invalid.stdout) as {
      diagnostics: Array<{ code: string; sourceFile?: string }>;
    };
    expect(invalidOutput.diagnostics).toContainEqual(
      expect.objectContaining({ code: "PreprocessorError", sourceFile: "chunks/Broken.glsl" })
    );

    const stdin = spawnSync(binary, ["--json", "-"], {
      cwd: consumerDirectory,
      encoding: "utf8",
      input: shaderSource(undefined, "1.0")
    });
    expect(stdin.status, stdin.stderr).toBe(0);
    expect(JSON.parse(stdin.stdout).diagnostics).toEqual([]);

    const usage = spawnSync(binary, ["--unknown"], { cwd: consumerDirectory, encoding: "utf8" });
    expect(usage.status).toBe(2);
  });

  it("does not retain request-owned parser state across analyzer-only or shared codegen calls", () => {
    const probe = spawnSync(
      process.execPath,
      [
        "--expose-gc",
        "--eval",
        `const { ShaderAnalyzer } = require("@galacean/engine-shader-analyzer");
         const { ShaderCompiler } = require("@galacean/engine-shader-compiler");
         const source = ${JSON.stringify(shaderSource(undefined, "1.0"))};
         const compiler = new ShaderCompiler();
         const measure = (run, iterations) => {
           for (let i = 0; i < 100; i++) run();
           const samples = [];
           for (let batch = 0; batch < 5; batch++) {
             for (let i = 0; i < iterations; i++) run();
             global.gc();
             samples.push(process.memoryUsage().heapUsed);
           }
           return samples;
         };
         const analyzerOnly = measure(() => ShaderAnalyzer.analyze(source), 400);
         const sharedCodegen = measure(() => {
           const unit = ShaderAnalyzer._analyzeWithParsedPasses(source);
           for (const pass of unit.parsedPasses) {
             compiler._generateParsedShaderPass(pass.parsed, pass.vertexEntry, pass.fragmentEntry, 0);
           }
         }, 200);
         process.stdout.write("MEMORY_RESULT:" + JSON.stringify({ analyzerOnly, sharedCodegen }));`
      ],
      { cwd: consumerDirectory, encoding: "utf8" }
    );
    expect(probe.status, probe.stderr).toBe(0);
    const marker = probe.stdout.lastIndexOf("MEMORY_RESULT:");
    expect(marker).toBeGreaterThanOrEqual(0);
    const measurements = JSON.parse(probe.stdout.slice(marker + "MEMORY_RESULT:".length)) as Record<string, number[]>;
    for (const samples of Object.values(measurements)) {
      const baseline = samples[0];
      expect(samples.at(-1)! - baseline).toBeLessThan(4 * 1024 * 1024);
      expect(Math.max(...samples) - baseline).toBeLessThan(8 * 1024 * 1024);
    }
  });
});

function runNode(source: string, esm: boolean): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [...(esm ? ["--input-type=module"] : []), "--eval", source], {
    cwd: consumerDirectory,
    encoding: "utf8"
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function installedBinary(): string {
  const name = process.platform === "win32" ? "galacean-shader-analyzer.cmd" : "galacean-shader-analyzer";
  return join(consumerDirectory, "node_modules", ".bin", name);
}

function shaderSource(includePath: string | undefined, value: string): string {
  const include = includePath ? `#include "${includePath}"` : "";
  return `Shader "Consumer" { SubShader "Default" { Pass "p" {
${include}
void vert() { gl_Position = vec4(0.0); }
void frag() { gl_FragColor = vec4(${value}); }
VertexShader = vert;
FragmentShader = frag;
} } }`;
}
