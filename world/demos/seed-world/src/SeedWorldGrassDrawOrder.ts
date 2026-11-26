import {
  PipelineStage,
  RenderQueueType,
  RenderStateElementKey,
  ShaderProperty,
  type Camera,
  type MeshRenderer
} from "@galacean/engine";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";

const grassQueue = ShaderProperty.getByName("material_GrassRenderQueue");

export function installSeedWorldGrassDrawOrder(
  camera: Camera,
  readWorld: () =>
    | {
        population: Pick<SeedWorldTerrainRuntime["population"], "visitForwardGrassRenderers">;
        clipmap: Pick<SeedWorldTerrainRuntime["clipmap"], "visitRenderers">;
      }
    | undefined
): () => void {
  const render = camera.render;
  const renderers: MeshRenderer[] = [];
  const priorities: number[] = [];
  let installed = true;
  const collectGrass = (renderer: MeshRenderer) => {
    if (
      camera.cullingMask & renderer.entity.layer &&
      renderer.enabled &&
      renderer.entity.isActiveInHierarchy &&
      renderer.mesh?.instanceCount
    ) {
      renderers.push(renderer);
      priorities.push(renderer.priority);
    }
  };
  const collectTerrain = (renderer: MeshRenderer) => {
    if (camera.cullingMask & renderer.entity.layer) {
      renderers.push(renderer);
      priorities.push(renderer.priority);
    }
  };

  const renderWithGrassOrder: Camera["render"] = function (cubeFace, mipLevel) {
    const world =
      installed &&
      !renderers.length &&
      this.engine._hardwareRenderer._options.depth &&
      !this.renderTarget &&
      !this._replacementShader &&
      cubeFace === undefined &&
      !mipLevel
        ? readWorld()
        : undefined;
    if (!world) return render.call(this, cubeFace, mipLevel);

    world.population.visitForwardGrassRenderers(collectGrass);
    const grass = renderers[0]?.getMaterial();
    const pass = grass?.shader.subShaders[0]?.passes.find((pass) => pass._pipelineStage === PipelineStage.Forward);
    const queueKey = RenderStateElementKey.RenderQueueType;
    if (
      !grass ||
      !pass ||
      pass._renderState._getRenderQueueByShaderData(pass._renderStateDataMap, grass.shaderData) !==
        RenderQueueType.AlphaTest
    ) {
      renderers.length = priorities.length = 0;
      return render.call(this, cubeFace, mipLevel);
    }

    const grassCount = renderers.length;
    world.clipmap.visitRenderers(collectTerrain);
    if (renderers.length === grassCount) {
      renderers.length = priorities.length = 0;
      return render.call(this, cubeFace, mipLevel);
    }

    // Retain the stock AlphaTest default for other materials using this shader.
    const queueProperty = (pass._renderStateDataMap[queueKey] ??= grassQueue);
    const previousQueue = grass.shaderData.getFloat(queueProperty);
    try {
      grass.shaderData.setFloat(queueProperty, RenderQueueType.Opaque);
      for (let i = 0; i < renderers.length; i++) {
        renderers[i]!.priority = Number.MAX_SAFE_INTEGER - (i < grassCount ? 1 : 0);
      }
      render.call(this, cubeFace, mipLevel);
    } finally {
      grass.shaderData.setFloat(queueProperty, previousQueue ?? RenderQueueType.AlphaTest);
      for (let i = 0; i < renderers.length; i++) renderers[i]!.priority = priorities[i]!;
      renderers.length = priorities.length = 0;
    }
  };
  camera.render = renderWithGrassOrder;
  return () => {
    installed = false;
    if (camera.render === renderWithGrassOrder) camera.render = render;
  };
}
