import { seedWorldViewSize } from "../assistant/SeedWorldViewCapture";
import { destroyPhotoResources } from "./SeedWorldPhotoResources";
import { GpuPhoto } from "./SeedWorldPhotoImage";
import photoCopySource from "./PhotoCopy.shader?raw";
import type { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import {
  AntiAliasing,
  Blitter,
  Camera,
  Material,
  PostProcessPass,
  RenderTarget,
  Script,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine";

/** Runs only for a pending capture. The destination is the exact texture fed to Final Pass. */
class PhotoOutputPass extends PostProcessPass {
  capture?: (camera: Camera, source: Texture2D) => void;
  override onRender(camera: Camera, source: Texture2D, destination: RenderTarget): void {
    Blitter.blitTexture(this.engine, source, destination);
    this.capture?.(camera, destination.getColorTexture(0) as Texture2D);
  }
}

/** A one-shot request consumed by the next normal world-camera frame, before Overlay UI. */
export class SeedWorldFrameCapture extends Script {
  private pending?: {
    ready?: () => boolean;
    run: (photo: GpuPhoto) => Promise<void>;
    reject: (error: unknown) => void;
    cleanup: () => void;
  };
  private outputPass?: PhotoOutputPass;
  private color?: GpuPhoto;
  private photoCopy?: Material;
  private budget?: ImageResourceBudget;
  private failure?: unknown;
  private srgb?: Material;
  private fxaa?: Material;

  request<T>(
    run: (photo: GpuPhoto) => T | Promise<T>,
    signal?: AbortSignal,
    budget?: ImageResourceBudget,
    ready?: () => boolean
  ): Promise<T> {
    if (this.destroyed) return Promise.reject(new Error("Screenshot camera is disposed"));
    if (this.pending) return Promise.reject(new Error("A screenshot is already awaiting a frame"));
    this.budget = budget;
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        this.pending = undefined;
        cleanup();
        reject(signal?.reason ?? new Error("Screenshot cancelled"));
      };
      const cleanup = () => {
        signal?.removeEventListener("abort", cancel);
        if (this.outputPass) this.outputPass.isActive = false;
        this.color?.dispose();
        this.color = undefined;
        this.failure = undefined;
      };
      if (signal?.aborted) {
        cancel();
        return;
      }
      this.pending = {
        ready,
        run: async (photo) => {
          resolve(await run(photo));
        },
        reject,
        cleanup
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (!this.outputPass) {
        const pass = (this.outputPass = new PhotoOutputPass(this.engine));
        pass.event = Number.MAX_SAFE_INTEGER;
        pass.capture = (camera, source) => {
          if (camera.entity !== this.entity || !this.pending) return;
          try {
            if (this.pending.ready && !this.pending.ready()) return;
            if (camera.renderTarget) throw new Error("Screenshot requires the screen camera");
            const { width, height } = seedWorldViewSize(source.width, source.height);
            this.color = this.freezeFinalColor(camera, source, width, height);
          } catch (error) {
            this.failure = error;
          }
        };
        this.engine.addPostProcessPass(pass);
      }
      this.outputPass.isActive = true;
    });
  }

  override onEndRender(camera: Camera): void {
    const request = this.pending;
    if (!request) return;
    // Normal rendering can publish a new variant in this very frame. Wait for its
    // queued preparation, then capture a later complete frame; never pair old color
    // with new identities or compile a missing companion inside the ID draw.
    if (!this.failure && request.ready) {
      try {
        if (!request.ready()) {
          this.color?.dispose();
          this.color = undefined;
          return;
        }
      } catch (error) {
        this.failure = error;
      }
    }
    this.pending = undefined;
    const color = this.color,
      failure = this.failure;
    this.color = undefined;
    request.cleanup();
    try {
      if (failure) throw failure;
      if (!color) throw new Error("Screenshot requires this frame's post-process output");
      // No await or simulation update between consuming the color frame and drawing IDs.
      void request.run(color).catch((error) => {
        color.dispose();
        request.reject(error);
      });
    } catch (error) {
      color?.dispose();
      request.reject(error);
    }
  }

  private freezeFinalColor(camera: Camera, source: Texture2D, width: number, height: number): GpuPhoto {
    const { engine } = this;
    const release = this.budget?.reserve(
      "temporary",
      (source.width * source.height * (camera.antiAliasing === AntiAliasing.FXAA ? 2 : 1) + width * height * 2) * 4
    );
    const temporary: { texture: Texture2D; target: RenderTarget }[] = [];
    const allocate = (w: number, h: number) => {
      // Raw sRGB bytes: do not enable hardware sRGB encoding on these attachments.
      const texture = new Texture2D(engine, w, h, TextureFormat.R8G8B8A8, false, false);
      texture.filterMode = TextureFilterMode.Bilinear;
      texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
      try {
        const resource = { texture, target: new RenderTarget(engine, w, h, texture, null, 1) };
        temporary.push(resource);
        return resource;
      } catch (error) {
        texture.destroy(true);
        throw error;
      }
    };
    try {
      if (!this.srgb) {
        this.srgb = new Material(engine, Shader.find("PostProcess/FinalSRGB")!);
        this.srgb.isGCIgnored = true;
      }
      let final = allocate(source.width, source.height);
      Blitter.blitTexture(engine, source, final.target, 0, undefined, this.srgb);
      if (camera.antiAliasing === AntiAliasing.FXAA) {
        if (!this.fxaa) {
          this.fxaa = new Material(engine, Shader.find("PostProcess/FinalAntiAliasing")!);
          this.fxaa.isGCIgnored = true;
        }
        // Match screen output; the stock shader otherwise converts RT output back to linear.
        this.fxaa.shaderData.enableMacro("ENGINE_OUTPUT_SRGB_CORRECT");
        const antialiased = allocate(source.width, source.height);
        Blitter.blitTexture(engine, final.texture, antialiased.target, 0, undefined, this.fxaa);
        final = antialiased;
      }
      if (width !== source.width || height !== source.height) {
        const reduced = allocate(width, height);
        Blitter.blitTexture(engine, final.texture, reduced.target);
        final = reduced;
      }
      // Store an actual sRGB texture. Decode the raw Final Pass bytes before hardware
      // sRGB encoding, so display materials and JPEG export use the same color contract.
      if (!this.photoCopy) {
        this.photoCopy = new Material(engine, Shader.find("SeedWorld/PhotoCopy") ?? Shader.create(photoCopySource));
        this.photoCopy.isGCIgnored = true;
      }
      const texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false, true);
      let target: RenderTarget | undefined;
      try {
        target = new RenderTarget(engine, width, height, texture, null, 1);
        Blitter.blitTexture(engine, final.texture, target, 0, undefined, this.photoCopy);
        return new GpuPhoto(texture, this.budget);
      } catch (error) {
        texture.destroy(true);
        throw error;
      } finally {
        target?.destroy(true);
      }
    } finally {
      destroyPhotoResources(
        temporary.flatMap(({ target, texture }) => [target, texture]),
        release
      );
    }
  }

  override onDestroy(): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.cleanup();
    pending?.reject(new Error("Screenshot camera is disposed"));
    this.outputPass?.destroy();
    this.srgb?.destroy();
    this.fxaa?.destroy();
    this.photoCopy?.destroy();
  }
}
