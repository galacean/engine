import { destroyPhotoResources } from "./SeedWorldPhotoResources";
import { Camera, CameraClearFlags, type Entity, RenderTarget, Texture2D, TextureFormat } from "@galacean/engine";
import type { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { warmupSeedWorldRendererVariants } from "./SeedWorldShaderWarmup";

/** Compile presentation variants, then actually draw them to upload textures before input is enabled. */
export async function warmupPhotoPresentation(
  camera: Camera,
  draw: () => void,
  disposed: () => boolean,
  budget?: ImageResourceBudget,
  roots?: readonly Entity[]
): Promise<void> {
  const engine = camera.engine,
    scene = camera.scene!;
  const targetRoots = roots ?? scene.rootEntities;
  const target = camera.renderTarget,
    enabled = camera.enabled;
  const clear = camera.clearFlags,
    culling = camera.enableFrustumCulling;
  const release = budget?.reserve("temporary", 64 * 64 * 8);
  let texture: Texture2D | undefined, offscreen: RenderTarget | undefined;
  camera.enabled = false;
  try {
    // Include inactive paper, flash and palette geometry. No world-system-specific variants.
    const options = { strict: true, activatedLightRoots: scene.rootEntities };
    await warmupSeedWorldRendererVariants(engine, scene, camera, targetRoots, options);
    if (disposed()) throw new DOMException("Photo presentation disposed", "AbortError");
    texture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false);
    offscreen = new RenderTarget(engine, 64, 64, texture, TextureFormat.Depth24Stencil8, 1);
    camera.renderTarget = offscreen;
    camera.clearFlags = CameraClearFlags.All;
    camera.enableFrustumCulling = false;
    await warmupSeedWorldRendererVariants(engine, scene, camera, targetRoots, options);
    if (disposed()) throw new DOMException("Photo presentation disposed", "AbortError");
    draw();
    // The first draw publishes scene lighting/fog state; compile screen variants with that exact state too.
    camera.renderTarget = target;
    await warmupSeedWorldRendererVariants(engine, scene, camera, targetRoots, options);
  } finally {
    if (!camera.destroyed) {
      camera.renderTarget = target;
      camera.enabled = enabled;
      camera.clearFlags = clear;
      camera.enableFrustumCulling = culling;
    }
    destroyPhotoResources([offscreen, texture], release);
  }
}
