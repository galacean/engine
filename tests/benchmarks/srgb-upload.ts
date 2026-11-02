import {
  Camera,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFormat,
  TextureUsage
} from "@galacean/engine-core";
import { WebGLEngine, WebGLMode } from "@galacean/engine-rhi-webgl";

/** Controlled upload microbenchmark. Run in a real browser after building the modules. */
export async function benchmarkSRGBUploads() {
  const samples: {
    round: number;
    variant: string;
    source: string;
    size: number;
    phase: string;
    index: number;
    at: number;
    callMs: number;
    completeMs?: number;
  }[] = [];
  const environments = [];
  const startedAt = new Date().toISOString();
  const clockOrigin = performance.timeOrigin;
  const shader =
    Shader.find("srgb-upload-benchmark") ??
    Shader.create(
      "srgb-upload-benchmark",
      "attribute vec3 POSITION; uniform mat4 renderer_MVPMat; void main(){gl_Position=renderer_MVPMat*vec4(POSITION,1.0);}",
      "uniform sampler2D inputTexture; void main(){gl_FragColor=texture2D(inputTexture,vec2(0.5));}"
    );
  for (let round = 0; round < 3; round++) {
    // Reverse the order on the middle repeat to expose warmup/order drift.
    const variants = ["native-srgb", "fallback-srgb", "linear-control"];
    if (round % 2) variants.reverse();
    for (const variant of variants) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 8;
      const gl = canvas.getContext("webgl");
      const getExtension = gl.getExtension.bind(gl);
      const nativeSRGB = getExtension("EXT_sRGB");
      if (!nativeSRGB) throw new Error("This comparison requires native EXT_sRGB support.");
      gl.getExtension = ((name: string) =>
        (variant !== "native-srgb" && name === "EXT_sRGB") || name.includes("compressed_texture_astc")
          ? null
          : getExtension(name)) as typeof gl.getExtension;
      const debug = getExtension("WEBGL_debug_renderer_info");
      environments.push({
        round,
        variant,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION)
      });
      const engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { webGLMode: WebGLMode.WebGL1 } });
      try {
        const root = engine.sceneManager.activeScene.createRootEntity();
        const ce = root.createChild();
        ce.transform.setPosition(0, 0, 3);
        const camera = ce.addComponent(Camera);
        camera.isOrthographic = true;
        camera.orthographicSize = 1;
        const output = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
        camera.renderTarget = new RenderTarget(engine, 1, 1, output, null);
        const renderer = root.createChild().addComponent(MeshRenderer);
        renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1);
        const material = new Material(engine, shader);
        renderer.setMaterial(material);
        for (const size of [256, 512, 1024])
          for (const source of ["buffer", "image", "dynamic-canvas"]) {
            // Both inputs represent the same linear brightness; the control is already linearized.
            const value = variant === "linear-control" ? 55 : 128;
            const bytes = new Uint8Array(size * size * 4).fill(value);
            for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
            const imageCanvas = document.createElement("canvas");
            imageCanvas.width = imageCanvas.height = size;
            const ctx = imageCanvas.getContext("2d");
            ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer), size, size), 0, 0);
            const image = new Image();
            image.src = imageCanvas.toDataURL();
            await image.decode();
            const texture = new Texture2D(
              engine,
              size,
              size,
              TextureFormat.R8G8B8A8,
              false,
              variant !== "linear-control",
              source === "dynamic-canvas" ? TextureUsage.Dynamic : TextureUsage.Static
            );
            material.shaderData.setTexture("inputTexture", texture);
            const upload = () =>
              source === "buffer"
                ? texture.setPixelBuffer(bytes)
                : texture.setImageSource(source === "image" ? image : imageCanvas);
            const measure = (phase: string, index: number, synchronize: boolean) => {
              // Mutate a corner outside the measured interval; force a new dynamic source frame.
              if (source === "dynamic-canvas") {
                ctx.fillStyle = index % 2 ? "white" : "black";
                ctx.fillRect(0, 0, 1, 1);
              }
              const at = performance.now();
              upload();
              const end = performance.now();
              let completeMs: number | undefined;
              if (synchronize) {
                gl.finish();
                completeMs = performance.now() - at;
              }
              samples.push({ round, variant, source, size, phase, index, at, callMs: end - at, completeMs });
            };
            const validate = () => {
              camera.render();
              const pixel = new Uint8Array(4);
              output.getPixelBuffer(pixel);
              if (Math.abs(pixel[0] - 55) > 2 || pixel[3] !== 255 || gl.getError() !== gl.NO_ERROR)
                throw new Error(`Invalid benchmark upload: ${variant}/${source}/${size}: ${pixel}`);
            };
            gl.finish();
            measure("first-upload", 0, true);
            validate();
            for (let i = 0; i < 4; i++) upload();
            gl.finish();
            for (let i = 0; i < 16; i++) {
              await new Promise(requestAnimationFrame);
              measure("submission", i, false);
            }
            gl.finish();
            validate();
            // Separate serialized diagnostic: finish forces completion, not a GPU-only timer.
            for (let i = 0; i < 8; i++) measure("serialized-completion", i, true);
            validate();
            texture.destroy(true);
            imageCanvas.width = imageCanvas.height = 0;
            if (gl.isContextLost()) throw new Error("Context lost during benchmark");
          }
      } finally {
        engine.destroy();
        gl.getExtension = getExtension;
        getExtension("WEBGL_lose_context")?.loseContext();
      }
    }
  }
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    clockOrigin,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    environments,
    samples
  };
}
