import {
  Camera,
  DepthTextureMode,
  Engine,
  Entity,
  MeshRenderer,
  SkinnedMeshRenderer,
  type BufferMesh,
  type ModelMesh,
  type Material,
  ShaderData,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass
} from "@galacean/engine";
import type { PlantCreationScheduler } from "./createProceduralPlant";

type RuntimeProgram = ReturnType<ShaderPass["_getShaderProgram"]>;
type RuntimePass = ShaderPass;
type RuntimeEngine = Engine;
interface RuntimeCamera {
  _updateShaderData(): void;
}
interface RuntimeScene {
  readonly _lightManager: { _updateShaderData(data: ShaderData): void };
}

/** Candidate prewarming, not a second render pipeline. Runtime chooses which stages actually draw.
 * Depth may be prepared even when Forward resolves it; SSR passes follow scene/camera settings and material opt-in.
 * This conservative set avoids reproducing camera targets or sunlight arbitration.
 */
export function getPlantShaderPreparationPasses(
  engine: Engine,
  camera: Camera,
  renderer: MeshRenderer,
  material: Material,
  castShadows = renderer.castShadows
): readonly ShaderPass[] {
  const scene = camera.entity.scene!;
  const hardware = (engine as RuntimeEngine)._hardwareRenderer;
  const runtimeCamera = camera as unknown as {
    _enableForwardDepthResolve?: boolean;
    _isIndependentCanvasEnabled?: () => boolean;
  };
  const ambientOcclusionEnabled = Boolean(scene?.ambientOcclusion?.enabled && scene.ambientOcclusion.intensity > 0);
  const cameraDepthRequested = camera.depthTextureMode === DepthTextureMode.PrePass;
  const forwardDepthResolveEnabled =
    cameraDepthRequested &&
    Boolean(runtimeCamera._enableForwardDepthResolve) &&
    !ambientOcclusionEnabled &&
    Boolean(runtimeCamera._isIndependentCanvasEnabled?.());
  const ssrSettings = camera.screenSpaceReflectionOverride ?? scene?.screenSpaceReflection;
  const ssrEnabled =
    camera.enableScreenSpaceReflection !== false &&
    Boolean(ssrSettings?.enabled) &&
    (ssrSettings?.intensity ?? 0) > 0 &&
    (ssrSettings?.maxRoughness ?? 0) > 0;
  const ssrSupported = ssrEnabled && (hardware.capability?.maxDrawBuffers ?? 0) >= 2;
  const prepareDepth = ambientOcclusionEnabled || (cameraDepthRequested && !forwardDepthResolveEnabled) || ssrSupported;
  const prepareSSRReceiver = ssrSupported && material.screenSpaceReflectionIntensity > 0;
  const prepareSSRContributionDepth = ssrSupported && Boolean(material.contributeScreenSpaceReflectionDepth);
  return (material.shader.subShaders[0]?.passes ?? []).filter((pass) => {
    switch (pass.getTagValue("pipelineStage")) {
      case "Forward":
        return true;
      case "ShadowCaster":
        return scene.castShadows && castShadows;
      case "DepthOnly":
        return prepareDepth;
      case "SSRReceiver":
        return prepareSSRReceiver;
      case "SSRContributionDepth":
        return prepareSSRContributionDepth;
      default:
        return false;
    }
  });
}

/** Prepare the current scene/camera/mesh/material variants before a partial plant is published.
 * Engine owns program caching. With KHR_parallel_shader_compile, polls do not wait for driver linking.
 * Hosts without the extension retain Engine's synchronous fallback; this is not a hard frame cap.
 */
export async function preparePlantShaderPrograms(
  engine: Engine,
  root: Entity,
  schedule: PlantCreationScheduler,
  prepareInstances = false,
  options: {
    camera?: Camera;
    shadowStates?: (renderer: MeshRenderer) => readonly { cast: boolean; receive: boolean }[];
  } = {}
) {
  const scene = root.scene;
  if (!scene) return;
  const cameras = options.camera
    ? [options.camera]
    : scene.rootEntities
        .flatMap((entity) => entity.getComponentsIncludeChildren(Camera, []))
        .filter((camera) => camera.enabled && camera.entity.isActiveInHierarchy);
  const renderers = root.getComponentsIncludeChildren(MeshRenderer, []);
  const enabledMacros: ShaderMacro[] = [];
  const appendMacros = (data: ShaderData, out: ShaderMacroCollection) => {
    data.getMacros(enabledMacros);
    for (const macro of enabledMacros) out.enable(macro);
  };
  const prepared = new Set<RuntimeProgram>();
  const submissions: { pass: RuntimePass; macros: ShaderMacroCollection }[] = [];
  for (const camera of cameras) {
    if (camera.enabled === false) continue;
    const runtimeCamera = camera as unknown as RuntimeCamera & { _isIndependentCanvasEnabled?: () => boolean };
    const renderToTexture = Boolean(camera.renderTarget) || Boolean(runtimeCamera._isIndependentCanvasEnabled?.());
    const outputSRGB = ShaderMacro.getByName("ENGINE_OUTPUT_SRGB_CORRECT");
    const cameraMacros = await schedule(() => {
      // Direct callers may not have started Engine.run. Prepare lights through
      // their owner without advancing scene time or physics.
      (scene as unknown as RuntimeScene)._lightManager._updateShaderData(scene.shaderData);
      runtimeCamera._updateShaderData();
      const macros = new ShaderMacroCollection();
      appendMacros(scene.shaderData, macros);
      appendMacros(camera.shaderData, macros);
      return macros;
    }, "shader");
    for (const renderer of renderers) {
      if (!renderer.mesh) continue;
      if (renderer instanceof SkinnedMeshRenderer) {
        (renderer as unknown as { _update(context: Engine["_renderContext"]): void })._update(engine._renderContext);
      }
      const rendererMacros = new ShaderMacroCollection();
      rendererMacros.unionCollection(cameraMacros);
      appendMacros(renderer.shaderData, rendererMacros);
      // Match MeshRenderer's vertex-element macros without activating/rendering the partial root.
      const vertexMacros: Partial<Record<string, string>> = {
        TEXCOORD_0: "RENDERER_HAS_UV",
        TEXCOORD_1: "RENDERER_HAS_UV1",
        NORMAL: "RENDERER_HAS_NORMAL",
        TANGENT: "RENDERER_HAS_TANGENT",
        COLOR_0: renderer.enableVertexColor ? "RENDERER_ENABLE_VERTEXCOLOR" : undefined
      };
      for (const element of (renderer.mesh as ModelMesh | BufferMesh).vertexElements) {
        const macro = vertexMacros[element.semantic];
        if (macro) rendererMacros.enable(ShaderMacro.getByName(macro));
      }
      for (const material of renderer.getMaterials()) {
        if (!material) continue;
        const macros = new ShaderMacroCollection();
        macros.unionCollection(rendererMacros);
        appendMacros(material.shaderData, macros);
        macros.unionCollection((engine as RuntimeEngine)._macroCollection);
        for (const state of options.shadowStates?.(renderer) ?? [
          { cast: renderer.castShadows, receive: renderer.receiveShadows }
        ]) {
          const stateMacros = new ShaderMacroCollection();
          stateMacros.unionCollection(macros);
          const receive = ShaderMacro.getByName("RENDERER_IS_RECEIVE_SHADOWS");
          if (state.receive) stateMacros.enable(receive);
          else stateMacros.disable(receive);
          for (const pass of getPlantShaderPreparationPasses(engine, camera, renderer, material, state.cast)) {
            const stage = pass.getTagValue("pipelineStage");
            const passMacros = new ShaderMacroCollection();
            passMacros.unionCollection(stateMacros);
            if (!renderToTexture && stage === "Forward") passMacros.enable(outputSRGB);
            else passMacros.disable(outputSRGB);
            submissions.push({ pass: pass as RuntimePass, macros: passMacros });
            if (prepareInstances) {
              const instanced = new ShaderMacroCollection();
              instanced.unionCollection(passMacros);
              instanced.enable(ShaderMacro.getByName("RENDERER_GPU_INSTANCE"));
              submissions.push({ pass: pass as RuntimePass, macros: instanced });
            }
          }
        }
      }
    }
  }
  // Submit independent variants before waiting for any one of them. Pending
  // polls share each admitted frame's budget instead of serializing one rAF
  // for every submit and poll, including already cached programs.
  const submitted = await Promise.allSettled(
    submissions.map(({ pass, macros }) =>
      Promise.resolve().then(() => schedule(() => pass._getShaderProgram(engine, macros, true), "shader-submit"))
    )
  );
  for (const result of submitted) {
    if (result.status === "rejected") throw result.reason;
    prepared.add(result.value);
  }
  const checks = await Promise.allSettled(
    [...prepared].map(async (program) => {
      while (!(await schedule(() => program._pollReady(), "shader-poll"))) {
        /* leave the root inactive */
      }
      if (!program.isValid) throw new Error("植物 Shader 编译失败");
    })
  );
  for (const check of checks) if (check.status === "rejected") throw check.reason;
}
