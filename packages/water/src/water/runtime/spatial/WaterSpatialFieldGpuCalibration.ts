/** Transient WebGL2 readback for shared Spatial Field atlas decode. */
import { Texture2D } from "@galacean/engine-core";
import waterSpatialFieldCalibrationFragmentTemplate from "../../shaders/calibration/WaterSpatialFieldCalibration.frag?raw";
import waterSpatialFieldCalibrationVertexSource from "../../shaders/calibration/WaterSpatialFieldCalibration.vert?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";
import type { WaterSpatialFieldGpuBinding } from "./WaterSpatialFieldProvider";
import { createWaterSpatialFieldShaderDecodeFunctions } from "./WaterSpatialFieldShaderDecode";

export type WaterSpatialFieldGpuCalibrationEncoding = "heightfield-local-map-v1" | "ocean-nearshore-static-atlas-v1";

export interface WaterSpatialFieldGpuCalibrationInput {
  readonly encoding: WaterSpatialFieldGpuCalibrationEncoding;
  readonly sourceHash: string;
  readonly compiledHash: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaBytes: Uint8Array;
  readonly maximumDepth: number;
  readonly shoreDistanceRange: number;
  readonly maximumDepthDecodeError: number;
  readonly maximumShoreDecodeError: number;
}

export interface WaterSpatialFieldEngineTextureCalibrationInput
  extends Omit<WaterSpatialFieldGpuCalibrationInput, "rgbaBytes" | "sourceHash" | "compiledHash"> {
  /** The exact live binding published by the active backend runtime. */
  readonly binding: WaterSpatialFieldGpuBinding;
  /**
   * Optional immutable compiler bytes used only for an identity check.
   * Shader calibration always consumes bytes read back from the live Engine
   * Texture2D, never this expected copy.
   */
  readonly expectedRgbaBytes?: Uint8Array;
}

export interface WaterSpatialFieldGpuCalibrationResourceCount {
  readonly shader: number;
  readonly program: number;
  readonly buffer: number;
  readonly vertexArray: number;
  readonly texture: number;
  readonly framebuffer: number;
}

export interface WaterSpatialFieldGpuCalibrationReadback {
  readonly schemaVersion: 1;
  readonly source: "transient-webgl2-shared-spatial-field-glsl";
  readonly identity: {
    readonly sourceHash: string;
    readonly compiledHash: string;
    readonly atlasContentSha256: string;
  };
  readonly atlas: {
    readonly encoding: WaterSpatialFieldGpuCalibrationEncoding;
    readonly width: number;
    readonly height: number;
    readonly texelCount: number;
    readonly maximumDepth: number;
    readonly shoreDistanceRange: number;
    readonly maximumDepthDecodeError: number;
    readonly maximumShoreDecodeError: number;
  };
  readonly coverage: {
    readonly sampledTexelCount: number;
    readonly distinctDepthCodeCount: number;
    readonly distinctShoreCodeCount: number;
  };
  readonly samples: {
    readonly texelCoordinates: readonly number[];
    readonly sourceRgbaBytes: readonly number[];
    /**
     * RG packs decoded depth as UNORM16. BA packs decoded shore distance
     * mapped from [-range, range] to UNORM16.
     */
    readonly decodedRgbaBytes: readonly number[];
  };
  readonly context: {
    readonly version: string;
    readonly renderer: string;
    readonly unmaskedRenderer: string | null;
    readonly framebufferStatus: "complete";
    readonly readPixelsFormat: "rgba8-packed-unorm16";
    readonly glError: 0;
  };
  readonly shader: {
    readonly vertexSourceSha256: string;
    readonly fragmentSourceSha256: string;
    readonly sharedDecodeSourceSha256: string;
  };
  readonly cleanup: {
    readonly canvasWasDetached: true;
    readonly contextReleaseRequested: boolean;
    readonly created: WaterSpatialFieldGpuCalibrationResourceCount;
    readonly deleted: WaterSpatialFieldGpuCalibrationResourceCount;
    readonly activeAfterCleanup: WaterSpatialFieldGpuCalibrationResourceCount;
  };
}

export interface WaterSpatialFieldEngineTextureCalibrationReadback extends WaterSpatialFieldGpuCalibrationReadback {
  readonly engineTexture: {
    readonly source: "galacean-texture2d-get-pixel-buffer";
    readonly liveBinding: true;
    readonly width: number;
    readonly height: number;
    readonly byteLength: number;
    readonly contentSha256: string;
    readonly expectedContentSha256?: string;
    readonly matchesExpectedBytes?: boolean;
  };
}

interface MutableResourceCount {
  shader: number;
  program: number;
  buffer: number;
  vertexArray: number;
  texture: number;
  framebuffer: number;
}

interface CalibrationResources {
  vertexShader: WebGLShader | null;
  fragmentShader: WebGLShader | null;
  program: WebGLProgram | null;
  sampleBuffer: WebGLBuffer | null;
  vertexArray: WebGLVertexArrayObject | null;
  sourceTexture: WebGLTexture | null;
  colorTexture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
}

interface MutableCleanupReadback {
  canvasWasDetached: true;
  contextReleaseRequested: boolean;
  created: WaterSpatialFieldGpuCalibrationResourceCount;
  deleted: WaterSpatialFieldGpuCalibrationResourceCount;
  activeAfterCleanup: WaterSpatialFieldGpuCalibrationResourceCount;
}

interface SelectedTexels {
  readonly coordinates: Int32Array;
  readonly sourceRgbaBytes: Uint8Array;
  readonly distinctDepthCodeCount: number;
  readonly distinctShoreCodeCount: number;
}

const VERTEX_SOURCE = waterSpatialFieldCalibrationVertexSource.trimEnd();

export function createWaterSpatialFieldGpuCalibrationFragmentSource(): string {
  return renderWaterShaderTemplate(waterSpatialFieldCalibrationFragmentTemplate.trimEnd(), {
    SPATIAL_FIELD_DECODE_FUNCTIONS: createWaterSpatialFieldShaderDecodeFunctions()
  });
}

function emptyResourceCount(): MutableResourceCount {
  return {
    shader: 0,
    program: 0,
    buffer: 0,
    vertexArray: 0,
    texture: 0,
    framebuffer: 0
  };
}

function freezeResourceCount(value: MutableResourceCount): WaterSpatialFieldGpuCalibrationResourceCount {
  return Object.freeze({ ...value });
}

function subtractResourceCount(
  created: MutableResourceCount,
  deleted: MutableResourceCount
): WaterSpatialFieldGpuCalibrationResourceCount {
  return Object.freeze({
    shader: created.shader - deleted.shader,
    program: created.program - deleted.program,
    buffer: created.buffer - deleted.buffer,
    vertexArray: created.vertexArray - deleted.vertexArray,
    texture: created.texture - deleted.texture,
    framebuffer: created.framebuffer - deleted.framebuffer
  });
}

function requireObject<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

function assertInput(input: Readonly<WaterSpatialFieldGpuCalibrationInput>): void {
  if (!Number.isInteger(input.width) || input.width <= 0 || !Number.isInteger(input.height) || input.height <= 0) {
    throw new RangeError("Spatial Field GPU calibration requires positive integer atlas dimensions.");
  }
  if (input.rgbaBytes.length !== input.width * input.height * 4) {
    throw new RangeError("Spatial Field GPU calibration atlas byte length does not match its dimensions.");
  }
  for (const [name, value] of [
    ["maximumDepth", input.maximumDepth],
    ["shoreDistanceRange", input.shoreDistanceRange],
    ["maximumDepthDecodeError", input.maximumDepthDecodeError],
    ["maximumShoreDecodeError", input.maximumShoreDecodeError]
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`Spatial Field GPU calibration ${name} must be finite and non-negative.`);
    }
  }
  if (!input.sourceHash || !input.compiledHash) {
    throw new Error("Spatial Field GPU calibration requires source and compiled identity.");
  }
}

function selectRepresentativeTexels(input: Readonly<WaterSpatialFieldGpuCalibrationInput>): SelectedTexels {
  const depthCoordinates = new Int32Array(256);
  const shoreCoordinates = new Int32Array(256);
  depthCoordinates.fill(-1);
  shoreCoordinates.fill(-1);
  const pixels = input.rgbaBytes;
  let distinctDepthCodeCount = 0;
  let distinctShoreCodeCount = 0;
  for (let texel = 0; texel < input.width * input.height; texel++) {
    const offset = texel * 4;
    const depthCode = pixels[offset + 2];
    const shoreCode = pixels[offset + 3];
    if (depthCoordinates[depthCode] === -1) {
      depthCoordinates[depthCode] = texel;
      distinctDepthCodeCount++;
    }
    if (shoreCoordinates[shoreCode] === -1) {
      shoreCoordinates[shoreCode] = texel;
      distinctShoreCodeCount++;
    }
  }
  const selected = new Set<number>();
  for (const texel of depthCoordinates) {
    if (texel >= 0) selected.add(texel);
  }
  for (const texel of shoreCoordinates) {
    if (texel >= 0) selected.add(texel);
  }
  const ordered = [...selected].sort((first, second) => first - second);
  const coordinates = new Int32Array(ordered.length * 2);
  const sourceRgbaBytes = new Uint8Array(ordered.length * 4);
  for (let sample = 0; sample < ordered.length; sample++) {
    const texel = ordered[sample];
    coordinates[sample * 2] = texel % input.width;
    coordinates[sample * 2 + 1] = Math.floor(texel / input.width);
    sourceRgbaBytes.set(pixels.subarray(texel * 4, texel * 4 + 4), sample * 4);
  }
  return {
    coordinates,
    sourceRgbaBytes,
    distinctDepthCodeCount,
    distinctShoreCodeCount
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireObject(gl.createShader(type), "Spatial Field calibration could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`Spatial Field calibration shader compilation failed: ${log}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram {
  const program = requireObject(gl.createProgram(), "Spatial Field calibration could not create a program.");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`Spatial Field calibration program link failed: ${log}`);
  }
  return program;
}

async function sha256Bytes(bytes: BufferSource): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(source: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(source));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function setUniform1f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  gl.uniform1f(
    requireObject(gl.getUniformLocation(program, name), `Missing Spatial Field calibration uniform ${name}.`),
    value
  );
}

function setUniform1i(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  gl.uniform1i(
    requireObject(gl.getUniformLocation(program, name), `Missing Spatial Field calibration uniform ${name}.`),
    value
  );
}

function deleteResources(
  gl: WebGL2RenderingContext,
  resources: CalibrationResources,
  deleted: MutableResourceCount
): void {
  if (resources.framebuffer) {
    gl.deleteFramebuffer(resources.framebuffer);
    resources.framebuffer = null;
    deleted.framebuffer++;
  }
  for (const key of ["sourceTexture", "colorTexture"] as const) {
    const texture = resources[key];
    if (!texture) continue;
    gl.deleteTexture(texture);
    resources[key] = null;
    deleted.texture++;
  }
  if (resources.vertexArray) {
    gl.deleteVertexArray(resources.vertexArray);
    resources.vertexArray = null;
    deleted.vertexArray++;
  }
  if (resources.sampleBuffer) {
    gl.deleteBuffer(resources.sampleBuffer);
    resources.sampleBuffer = null;
    deleted.buffer++;
  }
  if (resources.program) {
    gl.deleteProgram(resources.program);
    resources.program = null;
    deleted.program++;
  }
  for (const key of ["vertexShader", "fragmentShader"] as const) {
    const shader = resources[key];
    if (!shader) continue;
    gl.deleteShader(shader);
    resources[key] = null;
    deleted.shader++;
  }
}

/**
 * Uploads the exact compiled RGBA8 atlas, executes the shared runtime GLSL,
 * reads raw packed values, and destroys all transient resources. Threshold
 * evaluation belongs to the independent E2E harness.
 */
export async function readWaterSpatialFieldGpuCalibration(
  input: Readonly<WaterSpatialFieldGpuCalibrationInput>
): Promise<WaterSpatialFieldGpuCalibrationReadback> {
  assertInput(input);
  const selected = selectRepresentativeTexels(input);
  const sampleCount = selected.coordinates.length / 2;
  const canvas = document.createElement("canvas");
  canvas.width = sampleCount;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false
  });
  if (!gl) {
    throw new Error("Spatial Field GPU calibration requires WebGL2.");
  }
  if (input.width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || input.height > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
    throw new Error("Spatial Field GPU calibration atlas exceeds MAX_TEXTURE_SIZE.");
  }

  const created = emptyResourceCount();
  const deleted = emptyResourceCount();
  const resources: CalibrationResources = {
    vertexShader: null,
    fragmentShader: null,
    program: null,
    sampleBuffer: null,
    vertexArray: null,
    sourceTexture: null,
    colorTexture: null,
    framebuffer: null
  };
  let releaseRequested = false;
  let cleanupReadback: MutableCleanupReadback | undefined;
  try {
    const fragmentSource = createWaterSpatialFieldGpuCalibrationFragmentSource();
    resources.vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    created.shader++;
    resources.fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    created.shader++;
    resources.program = createProgram(gl, resources.vertexShader, resources.fragmentShader);
    created.program++;
    gl.useProgram(resources.program);

    resources.vertexArray = requireObject(gl.createVertexArray(), "Spatial Field calibration could not create a VAO.");
    created.vertexArray++;
    gl.bindVertexArray(resources.vertexArray);
    resources.sampleBuffer = requireObject(
      gl.createBuffer(),
      "Spatial Field calibration could not create a sample buffer."
    );
    created.buffer++;
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.sampleBuffer);
    const vertices = new Float32Array(sampleCount * 3);
    for (let sample = 0; sample < sampleCount; sample++) {
      vertices[sample * 3] = ((sample + 0.5) / sampleCount) * 2 - 1;
      vertices[sample * 3 + 1] = selected.coordinates[sample * 2];
      vertices[sample * 3 + 2] = selected.coordinates[sample * 2 + 1];
    }
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const sampleLocation = gl.getAttribLocation(resources.program, "a_sample");
    if (sampleLocation < 0) {
      throw new Error("Spatial Field calibration sample attribute is unavailable.");
    }
    gl.enableVertexAttribArray(sampleLocation);
    gl.vertexAttribPointer(sampleLocation, 3, gl.FLOAT, false, 0, 0);

    resources.sourceTexture = requireObject(
      gl.createTexture(),
      "Spatial Field calibration could not create an atlas texture."
    );
    created.texture++;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.sourceTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, input.width, input.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, input.rgbaBytes);
    setUniform1i(gl, resources.program, "u_atlas", 0);

    resources.colorTexture = requireObject(
      gl.createTexture(),
      "Spatial Field calibration could not create a color texture."
    );
    created.texture++;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.colorTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, sampleCount, 1);
    resources.framebuffer = requireObject(
      gl.createFramebuffer(),
      "Spatial Field calibration could not create a framebuffer."
    );
    created.framebuffer++;
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.colorTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Spatial Field calibration framebuffer is incomplete.");
    }

    setUniform1i(gl, resources.program, "u_encoding", input.encoding === "heightfield-local-map-v1" ? 0 : 1);
    setUniform1f(gl, resources.program, "u_maximumDepth", input.maximumDepth);
    setUniform1f(gl, resources.program, "u_shoreDistanceRange", input.shoreDistanceRange);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.sourceTexture);
    gl.viewport(0, 0, sampleCount, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, sampleCount);
    gl.finish();
    const decodedRgbaBytes = new Uint8Array(sampleCount * 4);
    gl.readPixels(0, 0, sampleCount, 1, gl.RGBA, gl.UNSIGNED_BYTE, decodedRgbaBytes);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      throw new Error(`Spatial Field calibration failed with WebGL error ${error}.`);
    }
    const debugRendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const unmaskedRenderer = debugRendererInfo
      ? String(gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL))
      : null;
    cleanupReadback = {
      canvasWasDetached: true,
      contextReleaseRequested: false,
      created: freezeResourceCount(created),
      deleted: freezeResourceCount(deleted),
      activeAfterCleanup: subtractResourceCount(created, deleted)
    };
    const sharedDecodeSource = createWaterSpatialFieldShaderDecodeFunctions();
    return {
      schemaVersion: 1,
      source: "transient-webgl2-shared-spatial-field-glsl",
      identity: {
        sourceHash: input.sourceHash,
        compiledHash: input.compiledHash,
        atlasContentSha256: await sha256Bytes(input.rgbaBytes)
      },
      atlas: {
        encoding: input.encoding,
        width: input.width,
        height: input.height,
        texelCount: input.width * input.height,
        maximumDepth: input.maximumDepth,
        shoreDistanceRange: input.shoreDistanceRange,
        maximumDepthDecodeError: input.maximumDepthDecodeError,
        maximumShoreDecodeError: input.maximumShoreDecodeError
      },
      coverage: {
        sampledTexelCount: sampleCount,
        distinctDepthCodeCount: selected.distinctDepthCodeCount,
        distinctShoreCodeCount: selected.distinctShoreCodeCount
      },
      samples: {
        texelCoordinates: Object.freeze(Array.from(selected.coordinates)),
        sourceRgbaBytes: Object.freeze(Array.from(selected.sourceRgbaBytes)),
        decodedRgbaBytes: Object.freeze(Array.from(decodedRgbaBytes))
      },
      context: {
        version: String(gl.getParameter(gl.VERSION)),
        renderer: String(gl.getParameter(gl.RENDERER)),
        unmaskedRenderer,
        framebufferStatus: "complete",
        readPixelsFormat: "rgba8-packed-unorm16",
        glError: 0
      },
      shader: {
        vertexSourceSha256: await sha256Text(VERTEX_SOURCE),
        fragmentSourceSha256: await sha256Text(fragmentSource),
        sharedDecodeSourceSha256: await sha256Text(sharedDecodeSource)
      },
      cleanup: cleanupReadback
    };
  } finally {
    deleteResources(gl, resources, deleted);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);
    const loseContext = gl.getExtension("WEBGL_lose_context");
    if (loseContext) {
      loseContext.loseContext();
      releaseRequested = true;
    }
    canvas.remove();
    if (cleanupReadback) {
      cleanupReadback.contextReleaseRequested = releaseRequested;
      cleanupReadback.deleted = freezeResourceCount(deleted);
      cleanupReadback.activeAfterCleanup = subtractResourceCount(created, deleted);
    }
  }
}

/**
 * Reads the active Engine Texture2D through its platform texture, then runs the
 * shared GLSL decode Gate over those exact native readback bytes.
 *
 * This closes a different boundary from {@link readWaterSpatialFieldGpuCalibration}:
 * the latter proves compiler bytes + decode GLSL, while this function also
 * proves the backend-published Engine texture contains those bytes.
 */
export async function readWaterSpatialFieldEngineTextureCalibration(
  input: Readonly<WaterSpatialFieldEngineTextureCalibrationInput>
): Promise<WaterSpatialFieldEngineTextureCalibrationReadback> {
  const texture = input.binding.texture;
  if (!(texture instanceof Texture2D)) {
    throw new Error("Spatial Field Engine calibration requires a live Texture2D binding.");
  }
  if (texture.destroyed) {
    throw new Error("Spatial Field Engine calibration cannot read a destroyed Texture2D.");
  }
  if (texture.width !== input.width || texture.height !== input.height) {
    throw new RangeError("Spatial Field Engine texture dimensions do not match the declared atlas.");
  }
  if (input.binding.sourceHash.length === 0 || input.binding.compiledHash.length === 0) {
    throw new Error("Spatial Field Engine calibration requires non-empty binding identity.");
  }

  const rgbaBytes = new Uint8Array(input.width * input.height * 4);
  texture.getPixelBuffer(rgbaBytes);
  const expected = input.expectedRgbaBytes;
  if (expected && expected.length !== rgbaBytes.length) {
    throw new RangeError("Spatial Field expected compiler bytes do not match the Engine texture byte length.");
  }

  const [calibration, contentSha256, expectedContentSha256] = await Promise.all([
    readWaterSpatialFieldGpuCalibration({
      encoding: input.encoding,
      sourceHash: input.binding.sourceHash,
      compiledHash: input.binding.compiledHash,
      width: input.width,
      height: input.height,
      rgbaBytes,
      maximumDepth: input.maximumDepth,
      shoreDistanceRange: input.shoreDistanceRange,
      maximumDepthDecodeError: input.maximumDepthDecodeError,
      maximumShoreDecodeError: input.maximumShoreDecodeError
    }),
    sha256Bytes(rgbaBytes),
    expected ? sha256Bytes(expected) : Promise.resolve(undefined)
  ]);

  return Object.freeze({
    ...calibration,
    engineTexture: Object.freeze({
      source: "galacean-texture2d-get-pixel-buffer",
      liveBinding: true,
      width: texture.width,
      height: texture.height,
      byteLength: rgbaBytes.byteLength,
      contentSha256,
      expectedContentSha256,
      matchesExpectedBytes: expected === undefined ? undefined : equalBytes(rgbaBytes, expected)
    })
  });
}
