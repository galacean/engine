import { AssetPromise, AssetType, Shader } from "@galacean/engine";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it, vi } from "vitest";

const shaderSource = `
// Leading comments are valid ShaderLab source.
Shader "Loader/ReusableAcrossEngines" {
  SubShader "Default" {
    Pass "Default" {
      struct Attributes { vec4 POSITION; };

      VertexShader = vert;
      FragmentShader = frag;

      void vert(Attributes attr) {
        gl_Position = attr.POSITION;
      }

      void frag() {
        gl_FragColor = vec4(1.0);
      }
    }
  }
}`;

const precompiledShader = JSON.stringify({
  name: "Loader/ReusablePrecompiledAcrossEngines",
  platformTarget: 0,
  subShaders: []
});

const conflictingShaderSource = shaderSource
  .replace("Loader/ReusableAcrossEngines", "Loader/ConflictingAcrossEngines")
  .replace("vec4(1.0)", "vec4(0.0)");

describe("ShaderLoader", () => {
  it("reuses source and precompiled shaders across engine resource managers", async () => {
    const sourceURL = "Shaders/reusable-across-engines.shader";
    const precompiledURL = "Shaders/reusable-precompiled-across-engines.shaderc";
    const canvas = document.createElement("canvas");
    const engine1 = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler()
    });
    const request1 = vi
      // @ts-expect-error _requestByRemoteUrl is @internal
      .spyOn(engine1.resourceManager, "_requestByRemoteUrl")
      .mockImplementation((url: string) => AssetPromise.resolve(url === sourceURL ? shaderSource : precompiledShader));

    let engine2: WebGLEngine;
    let sourceShader: Shader;
    let precompiled: Shader;
    try {
      sourceShader = await engine1.resourceManager.load<Shader>({ url: sourceURL, type: AssetType.Shader });
      precompiled = await engine1.resourceManager.load<Shader>({ url: precompiledURL, type: AssetType.Shader });
      expect(request1).toHaveBeenCalledTimes(2);
      expect(sourceShader.compileVariant(engine1, [])).true;

      engine1.destroy();
      engine2 = await WebGLEngine.create({
        canvas,
        shaderCompiler: new ShaderCompiler()
      });
      const request2 = vi
        // @ts-expect-error _requestByRemoteUrl is @internal
        .spyOn(engine2.resourceManager, "_requestByRemoteUrl")
        .mockImplementation((url: string) =>
          AssetPromise.resolve(url === sourceURL ? shaderSource : precompiledShader)
        );

      const reusedSource = await engine2.resourceManager.load<Shader>({ url: sourceURL, type: AssetType.Shader });
      const reusedPrecompiled = await engine2.resourceManager.load<Shader>({
        url: precompiledURL,
        type: AssetType.Shader
      });

      expect(reusedSource).equal(sourceShader);
      expect(reusedPrecompiled).equal(precompiled);
      expect(request2).toHaveBeenCalledTimes(2);
      expect(reusedSource.compileVariant(engine2, [])).true;
    } finally {
      engine1.destroy();
      engine2?.destroy();
      Shader.find("Loader/ReusableAcrossEngines")?.destroy(true);
      Shader.find("Loader/ReusablePrecompiledAcrossEngines")?.destroy(true);
    }
  });

  it("rejects a same-name shader whose source changes across engines", async () => {
    const url = "Shaders/conflicting-across-engines.shader";
    const canvas = document.createElement("canvas");
    const engine1 = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    vi.spyOn(engine1.resourceManager, "_requestByRemoteUrl")
      // @ts-expect-error _requestByRemoteUrl is @internal
      .mockReturnValue(AssetPromise.resolve(conflictingShaderSource));

    let engine2: WebGLEngine;
    try {
      await engine1.resourceManager.load<Shader>({ url, type: AssetType.Shader });
      engine1.destroy();

      engine2 = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
      vi.spyOn(engine2.resourceManager, "_requestByRemoteUrl")
        // @ts-expect-error _requestByRemoteUrl is @internal
        .mockReturnValue(AssetPromise.resolve(conflictingShaderSource.replace("vec4(0.0)", "vec4(0.5)")));

      await expect(engine2.resourceManager.load<Shader>({ url, type: AssetType.Shader })).rejects.toThrow(
        `Shader named "Loader/ConflictingAcrossEngines" from "${url}" conflicts`
      );
    } finally {
      engine1.destroy();
      engine2?.destroy();
      Shader.find("Loader/ConflictingAcrossEngines")?.destroy(true);
    }
  });
});
