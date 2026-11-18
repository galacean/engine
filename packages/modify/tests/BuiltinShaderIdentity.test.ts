// Run the upstream identity regressions with World's source substitutions enabled.
import "../../../tests/src/core/BuiltinShaderIdentity.test";
import { Engine, ParticleRenderer, Shader, WebGLEngine } from "@galacean/engine";
import {
  ProbeDepthCaptureSource,
  RealtimeIBLAccumulateSource,
  RealtimeIBLProjectSHSource,
  RealtimeIBLResolveSource,
  ScreenSpaceReflectionSource,
  ScreenSpaceReflectionSurfaceSource,
  VolumetricCloudSource,
  WindGpuFieldSource,
  WindGpuGroundResponseSource,
  WindGpuTreeResponseSource
} from "@galacean/engine-shader";
import { expect, it } from "vitest";

it("preserves World shaders and their feedback layouts during bootstrap", () => {
  for (const source of [
    ProbeDepthCaptureSource,
    RealtimeIBLAccumulateSource,
    RealtimeIBLProjectSHSource,
    RealtimeIBLResolveSource,
    ScreenSpaceReflectionSource,
    ScreenSpaceReflectionSurfaceSource,
    VolumetricCloudSource,
    WindGpuFieldSource,
    WindGpuGroundResponseSource,
    WindGpuTreeResponseSource
  ]) {
    expect(Shader.find(source.name), source.name).toBeDefined();
  }
  expect(Engine._builtinShaders.particleFeedback.subShaders[0].passes[0]._feedbackVaryings).toEqual([
    "v_FeedbackPosition",
    "v_FeedbackVelocity"
  ]);
  const passes = Shader.find(RealtimeIBLProjectSHSource.name)!.subShaders[0].passes;
  expect(passes[0]._feedbackVaryings).toEqual(Array.from({ length: 9 }, (_, index) => `v_SH${index}`));
  expect(passes[1]._feedbackVaryings).toEqual(["v_SH"]);
});

it("keeps World particle simulation bound to its supplied shader despite a namesake", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const builtin = Engine._builtinShaders.particleFeedback;
  const namesake = Shader._createFromPrecompiled({ name: builtin.name, platformTarget: 0, subShaders: [] });
  try {
    expect(Shader.find(builtin.name)).toBe(namesake);
    const renderer = engine.sceneManager.activeScene!.createRootEntity().addComponent(ParticleRenderer);
    renderer.generator.noise.enabled = true;
    renderer.generator._setTransformFeedback();
    const simulator = renderer.generator["_feedbackSimulator"]!;
    expect(simulator["_simulator"]["_shaderPass"]).toBe(builtin.subShaders[0].passes[0]);
  } finally {
    namesake.destroy();
    engine.destroy();
  }
});
