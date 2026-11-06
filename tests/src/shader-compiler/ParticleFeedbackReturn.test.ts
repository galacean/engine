import { ShaderFactory, ShaderLanguage, ShaderMacro, ShaderMacroCollection, ShaderPass } from "@galacean/engine-core";
import { ShaderMacroProcessor } from "@galacean/engine-core/src/shader/ShaderMacroProcessor";
import type { IPrecompiledShader } from "@galacean/engine-design";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { WebGLEngine, WebGLMode } from "@galacean/engine";
import { server } from "@vitest/browser/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("ParticleFeedback early return", () => {
  let engine: WebGLEngine;
  let source: string;

  beforeAll(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
    });
    source = await server.commands.readFile("../packages/shader/src/Shaders/Effect/ParticleFeedback.shader");
  });

  afterAll(() => engine?.destroy());

  for (const target of [ShaderLanguage.GLSLES100, ShaderLanguage.GLSLES300]) {
    for (const entry of ["runtime", "precompiled"] as const) {
      it.each([false, true])(
        `${entry} ${ShaderLanguage[target]} preserves the zero-duration return (trajectory=%s)`,
        (trajectory) => {
          const compiler = new ShaderCompiler();
          compiler._setIncludeMap(ShaderFactory.includeMap);
          const parsedPass = compiler._parseShaderSource(source).subShaders[0].passes[0];
          expect(parsedPass.name).toBe("TransformFeedback");
          const precompiler = new ShaderPrecompiler();
          precompiler.setIncludeMap(ShaderFactory.includeMap);
          const generated =
            entry === "runtime"
              ? compiler._parseShaderPass(
                  parsedPass.contents,
                  parsedPass.vertexEntry,
                  parsedPass.fragmentEntry,
                  target,
                  undefined,
                  parsedPass.contentScopeStarts
                )
              : (JSON.parse(JSON.stringify(precompiler.precompile(source, target))) as IPrecompiledShader).subShaders[0]
                  .passes[0];
          expect(generated?.vertexShaderInstructions).toBeDefined();
          expect(generated?.fragmentShaderInstructions).toBeDefined();

          const macroNames = ["RENDERER_NOISE_MODULE_ENABLED"];
          const feedbackVaryings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
          if (trajectory) {
            macroNames.push("RENDERER_TRAJECTORY_FEEDBACK");
            feedbackVaryings.push("v_FeedbackWorldPosition", "v_FeedbackTrajectoryVelocity");
          }
          const macros = new ShaderMacroCollection();
          for (const name of macroNames) macros.enable(ShaderMacro.getByName(name));
          const vertex = ShaderMacroProcessor.evaluate(
            generated!.vertexShaderInstructions!,
            new Map(macroNames.map((name) => [name, ""]))
          );
          const pass = new ShaderPass(
            parsedPass.name,
            generated!.vertexShaderInstructions!,
            generated!.fragmentShaderInstructions!,
            target,
            parsedPass.tags
          );
          const program = pass._compileShaderProgram(engine, macros, feedbackVaryings);
          try {
            expect(program.isValid, "ParticleFeedback must compile and link with its transform-feedback outputs").toBe(
              true
            );
          } finally {
            program.destroy();
          }

          // A varying-return entry becomes void main; its guard must still exit before simulation.
          const guard = vertex.match(
            /if\s*\(\s*simulationDuration\s*<=\s*0\.0\s*\)\s*\{([^{}]*)\}\s*simulateParticleStep\s*\(/
          );
          expect(guard, "the zero-duration guard must precede simulateParticleStep").not.toBeNull();
          expect(guard![1]).toMatch(/v_FeedbackPosition\s*=\s*position\s*;/);
          expect(guard![1]).toMatch(/v_FeedbackVelocity\s*=\s*localVelocity\s*;/);
          expect(guard![1]).toMatch(/return\s*;\s*$/);
          if (trajectory) {
            expect(guard![1]).toMatch(/v_FeedbackWorldPosition\s*=\s*previousWorldPosition\s*;/);
            expect(guard![1]).toMatch(/v_FeedbackTrajectoryVelocity\s*=\s*vec3\s*\(\s*0\.0\s*\)\s*;/);
          } else {
            expect(vertex).not.toContain("v_FeedbackTrajectoryVelocity");
          }
        }
      );
    }
  }
});
