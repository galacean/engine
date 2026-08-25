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

  it("publishes a typed Analyzer-to-Codegen shared-parse contract", () => {
    const sourceFile = join(consumerDirectory, "shared-parse.ts");
    writeFileSync(
      sourceFile,
      `import { ShaderLanguage } from "@galacean/engine-core";
import { ShaderAnalyzer, type ParsedShaderPass } from "@galacean/engine-shader-analyzer";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

const analysis = ShaderAnalyzer.analyze(${JSON.stringify(shaderSource(undefined, "1.0"))});
const pass: ParsedShaderPass = analysis.passes[0];
new ShaderCompiler().generate(pass, ShaderLanguage.GLSLES100);
`
    );
    const typecheck = spawnSync(
      join(repositoryRoot, "node_modules", ".bin", "tsc"),
      [
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--target",
        "ES2022",
        "--module",
        "Node16",
        "--moduleResolution",
        "Node16",
        sourceFile
      ],
      { cwd: consumerDirectory, encoding: "utf8" }
    );
    expect(typecheck.status, typecheck.stderr || typecheck.stdout).toBe(0);
  });

  it("publishes the offline precompiler without adding it to the runtime entry", () => {
    for (const mode of ["require", "import"] as const) {
      const imports =
        mode === "require"
          ? `const runtime = require("@galacean/engine-shader-compiler");
             const { ShaderPrecompiler } = require("@galacean/engine-shader-compiler/offline");`
          : `const runtime = await import("@galacean/engine-shader-compiler");
             const { ShaderPrecompiler } = await import("@galacean/engine-shader-compiler/offline");`;
      const probe = runNode(
        `${imports}
         const precompiled = new ShaderPrecompiler().precompile(${JSON.stringify(shaderSource(undefined, "1.0"))}, 0);
         let invalidAssignmentRejected = false;
         try {
           new ShaderPrecompiler().precompile(${JSON.stringify(
             shaderSource(undefined, "1.0").replace("gl_FragColor = vec4(1.0);", "1 = 2; gl_FragColor = vec4(1.0);")
           )}, 0);
         } catch (error) {
           invalidAssignmentRejected = String(error).includes("modifiable l-value");
         }
         process.stdout.write(JSON.stringify({
           hasRuntimePrecompiler: "ShaderPrecompiler" in runtime,
           invalidAssignmentRejected,
           name: precompiled.name
         }));`,
        mode === "import"
      );
      expect(probe.status, probe.stderr).toBe(0);
      expect(JSON.parse(probe.stdout)).toEqual({
        hasRuntimePrecompiler: false,
        invalidAssignmentRejected: true,
        name: "Consumer"
      });
    }
  });

  it("reuses analyzer output for codegen in installed ESM and CommonJS packages", () => {
    for (const mode of ["require", "import"] as const) {
      const imports =
        mode === "require"
          ? `const { ShaderAnalyzer } = require("@galacean/engine-shader-analyzer");
             const { ShaderCompiler } = require("@galacean/engine-shader-compiler");`
          : `const { ShaderAnalyzer } = await import("@galacean/engine-shader-analyzer");
             const { ShaderCompiler } = await import("@galacean/engine-shader-compiler");`;
      const probe = runNode(
        `${imports}
         const analysis = ShaderAnalyzer.analyze(${JSON.stringify(shaderSource(undefined, "1.0"))});
         const generated = new ShaderCompiler().generate(analysis.passes[0], 0);
         process.stdout.write("SHARED_PARSE_RESULT:" + JSON.stringify({
           diagnostics: analysis.diagnostics,
           passCount: analysis.passes.length,
           fragment: generated?.fragment
         }));`,
        mode === "import"
      );
      expect(probe.status, probe.stderr).toBe(0);
      const marker = probe.stdout.lastIndexOf("SHARED_PARSE_RESULT:");
      expect(marker).toBeGreaterThanOrEqual(0);
      const output = JSON.parse(probe.stdout.slice(marker + "SHARED_PARSE_RESULT:".length));
      expect(output.diagnostics).toEqual([]);
      expect(output.passCount).toBe(1);
      expect(output.fragment).toContain("gl_FragColor");
    }
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

    mkdirSync(join(shaderDirectory, "Nested"), { recursive: true });
    mkdirSync(join(shaderDirectory, "User Effects"), { recursive: true });
    writeFileSync(
      join(shaderDirectory, "User Effects", "Math Functions.glsl"),
      "float absoluteValue() { return 2.0; }"
    );
    writeFileSync(
      join(shaderDirectory, "Nested", "Absolute.shader"),
      shaderSource("/User Effects/Math Functions.glsl", "absoluteValue()")
    );
    const absolute = spawnSync(
      binary,
      ["--include-root", shaderDirectory, join(shaderDirectory, "Nested", "Absolute.shader")],
      { cwd: consumerDirectory, encoding: "utf8" }
    );
    expect(absolute.status, absolute.stderr || absolute.stdout).toBe(0);

    writeFileSync(
      join(shaderDirectory, "Dead.shader"),
      shaderSource(undefined, "1.0").replace(
        "void vert()",
        `#if 0
#include "missing.glsl"
float deadValue = ;
#endif
void vert()`
      )
    );
    const dead = spawnSync(binary, [join(shaderDirectory, "Dead.shader")], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(dead.status, dead.stderr || dead.stdout).toBe(0);

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

    writeFileSync(join(consumerDirectory, "Assets", "Outside.glsl"), "float outsideValue() { return 4.0; }");
    writeFileSync(
      join(shaderDirectory, "Escaped.shader"),
      shaderSource("/chunks%2F..%2F..%2FOutside.glsl", "outsideValue()")
    );
    const escaped = spawnSync(binary, ["--json", join(shaderDirectory, "Escaped.shader")], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(escaped.status).toBe(1);
    expect(JSON.parse(escaped.stdout).diagnostics).toContainEqual(
      expect.objectContaining({ code: "PreprocessorError" })
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

  it("precompiles relative and root-relative disk includes through the installed offline bin", () => {
    const inputDirectory = join(consumerDirectory, "Offline Shaders");
    const outputDirectory = join(consumerDirectory, "Offline Output");
    mkdirSync(join(inputDirectory, "Nested"), { recursive: true });
    mkdirSync(join(inputDirectory, "User Effects"), { recursive: true });
    writeFileSync(join(inputDirectory, "User Effects", "Values.glsl"), "float diskValue() { return 3.0; }");
    writeFileSync(
      join(inputDirectory, "User Effects", "Common Math.glsl"),
      '#include "./Values.glsl"\nfloat includedValue() { return diskValue(); }'
    );
    writeFileSync(
      join(inputDirectory, "Nested", "Root.shader"),
      shaderSource("/User Effects/Common Math.glsl", "includedValue()")
    );

    const valid = spawnSync(installedCompilerBinary(), [inputDirectory, outputDirectory, "--emit-index"], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(valid.status, valid.stderr || valid.stdout).toBe(0);
    expect(JSON.parse(readFileSync(join(outputDirectory, "Nested", "Root.shaderc"), "utf8")).name).toBe("Consumer");
    expect(readFileSync(join(outputDirectory, "index.ts"), "utf8")).toContain("RootSource");

    writeFileSync(join(inputDirectory, "Broken.shader"), shaderSource("/Missing.glsl", "1.0"));
    const invalid = spawnSync(installedCompilerBinary(), [inputDirectory, outputDirectory], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr + invalid.stdout).toContain('Shader include "Missing.glsl" was not found.');

    const programmatic = runNode(
      `const { precompile } = await import("@galacean/engine-shader-compiler/bundler/precompile");
       try {
         await precompile(${JSON.stringify({ input: inputDirectory, output: outputDirectory })});
       } catch (error) {
         process.stdout.write("PROGRAMMATIC_FAILURE:" + error.message);
       }`,
      true
    );
    expect(programmatic.status, programmatic.stderr).toBe(0);
    expect(programmatic.stdout).toContain("PROGRAMMATIC_FAILURE:1 shader(s) failed to precompile.");

    const outsideSource = join(consumerDirectory, "Outside.shader");
    writeFileSync(outsideSource, shaderSource(undefined, "1.0"));
    const outside = spawnSync(installedCompilerBinary(), [inputDirectory, outputDirectory, "--only", outsideSource], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(outside.status).toBe(1);
    expect(outside.stderr + outside.stdout).toContain("must be a .shader file inside the input directory");

    mkdirSync(join(inputDirectory, "ShaderLibrary", "Common"), { recursive: true });
    mkdirSync(join(consumerDirectory, "ShaderLibrary", "Common"), { recursive: true });
    writeFileSync(join(inputDirectory, "ShaderLibrary", "Common", "Common.glsl"), "float localValue() { return 1.0; }");
    writeFileSync(
      join(consumerDirectory, "ShaderLibrary", "Common", "Common.glsl"),
      "float libraryValue() { return 2.0; }"
    );
    const duplicate = spawnSync(installedCompilerBinary(), [inputDirectory, outputDirectory], {
      cwd: consumerDirectory,
      encoding: "utf8"
    });
    expect(duplicate.status).toBe(1);
    expect(duplicate.stderr + duplicate.stdout).toContain(
      'Shader include "ShaderLibrary/Common/Common.glsl" is registered more than once.'
    );
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
         const passBody = "void vert() { gl_Position = vec4(0.0); }\\nvoid frag() { gl_FragColor = vec4(1.0); }";
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
           const analysis = ShaderAnalyzer.analyze(source);
           for (const pass of analysis.passes) {
             compiler.generate(pass, 0);
           }
         }, 200);
         const runtimeCodegen = measure(() => {
           compiler._parseShaderPass(passBody, "vert", "frag", 0, "");
         }, 400);
         process.stdout.write("MEMORY_RESULT:" + JSON.stringify({ analyzerOnly, sharedCodegen, runtimeCodegen }));`
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

function installedCompilerBinary(): string {
  const name = process.platform === "win32" ? "shader-compiler-precompile.cmd" : "shader-compiler-precompile";
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
