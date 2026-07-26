/** Transient WebGL2 fixture that renders raw Surface Appearance calibration samples. */
import { createWaterContactFoamShaderFunctions } from "./WaterContactFoamShader";
import { createWaterSurfaceAppearanceShaderFunctions } from "./WaterSurfaceAppearanceShader";
import { createWaterSurfaceBrdfShaderFunctions } from "./WaterSurfaceBrdfShader";

const CALIBRATION_TARGET_WIDTH = 2048;
const CALIBRATION_TARGET_HEIGHT = 128;
const DETAIL_NORMAL_SIZE = 128;
const PROFILE_SAMPLE_COUNT = 2048;
const CONTACT_PROFILE_MAX_DEPTH_METERS = 0.4;
const COASTAL_PROFILE_MAX_DEPTH_METERS = 0.75;
const SPECULAR_MINIMUM_ANGLE_DEGREES = -8;
const SPECULAR_MAXIMUM_ANGLE_DEGREES = 8;
const REFRACTION_DELTA_ENCODING_SCALE = 8;
const SPECULAR_ENCODING_SCALE = 16;

export interface WaterSurfaceAppearanceGpuCalibrationInput {
  readonly normalImage: TexImageSource;
  readonly normalWidth: number;
  readonly normalHeight: number;
  readonly normalTiling: number;
  readonly normalScrollUvPerSecond: number;
  readonly normalStrength: number;
  readonly normalFlipGreen: boolean;
  readonly surfaceTime: number;
  readonly depthTintDistanceMeters: number;
  readonly depthTintExponent: number;
  readonly depthTintSampleMeters: readonly [number, number, number, number, number];
  readonly contactDistanceMeters: number;
  readonly coastalDistanceMeters: number;
  readonly refractionStrength: number;
  readonly roughness: number;
  readonly fresnelF0: number;
}

export interface WaterSurfaceAppearanceGpuCalibrationResourceCount {
  readonly shader: number;
  readonly program: number;
  readonly buffer: number;
  readonly vertexArray: number;
  readonly texture: number;
  readonly framebuffer: number;
  readonly renderbuffer: number;
}

export interface WaterSurfaceAppearanceGpuCalibrationReadback {
  readonly schemaVersion: 1;
  readonly source: "transient-webgl2-shared-glsl";
  readonly context: {
    readonly version: string;
    readonly renderer: string;
    readonly unmaskedRenderer: string | null;
    readonly framebufferStatus: "complete";
    readonly readPixelsFormat: "rgba8";
    readonly glError: 0;
  };
  readonly shader: {
    readonly vertexSourceSha256: string;
    readonly fragmentSourceSha256: string;
    readonly appearanceHelperCallCount: number;
    readonly contactFoamHelperCallCount: number;
    readonly brdfHelperCallCount: number;
  };
  readonly detailNormal: {
    readonly width: typeof DETAIL_NORMAL_SIZE;
    readonly height: typeof DETAIL_NORMAL_SIZE;
    readonly rgbaBytes: readonly number[];
    readonly worldExtentMeters: readonly [80, 48];
    readonly tiling: number;
    readonly scrollUvPerSecond: number;
    readonly strength: number;
    readonly flipGreen: boolean;
    readonly surfaceTime: number;
  };
  readonly sceneDepthDepthColor: {
    readonly sampleDepthDeltaMeters: readonly number[];
    readonly rangeMeters: number;
    readonly exponent: number;
    readonly depthTintRgbaBytes: readonly number[];
    readonly contactProfile: {
      readonly minimumDepthMeters: 0;
      readonly maximumDepthMeters: typeof CONTACT_PROFILE_MAX_DEPTH_METERS;
      readonly sampleCount: typeof PROFILE_SAMPLE_COUNT;
      readonly rgbaBytes: readonly number[];
      readonly contactDistanceMeters: number;
    };
  };
  readonly refraction: {
    readonly normalDelta: readonly [0.25, -0.2];
    readonly strength: number;
    readonly deltaEncodingScale: typeof REFRACTION_DELTA_ENCODING_SCALE;
    readonly encodedUvDeltaRgbaBytes: readonly number[];
    readonly gradientTextureSize: readonly [64, 64];
    readonly centeredUv: readonly [0.25, 0.5];
    readonly centeredSampleRgbaBytes: readonly number[];
    readonly validDisplacedSampleRgbaBytes: readonly number[];
    readonly aboveWaterGuardedSampleRgbaBytes: readonly number[];
  };
  readonly coastalAlpha: {
    readonly minimumDepthMeters: 0;
    readonly maximumDepthMeters: typeof COASTAL_PROFILE_MAX_DEPTH_METERS;
    readonly sampleCount: typeof PROFILE_SAMPLE_COUNT;
    readonly rgbaBytes: readonly number[];
    readonly distanceMeters: number;
  };
  readonly specularResponse: {
    readonly source: "gpu-controlled-normal-wedge";
    readonly minimumAngleDegrees: typeof SPECULAR_MINIMUM_ANGLE_DEGREES;
    readonly maximumAngleDegrees: typeof SPECULAR_MAXIMUM_ANGLE_DEGREES;
    readonly sampleCount: typeof PROFILE_SAMPLE_COUNT;
    readonly rgbaBytes: readonly number[];
    readonly encodingScale: typeof SPECULAR_ENCODING_SCALE;
    readonly roughness: number;
    readonly fresnelF0: number;
    readonly viewDirection: readonly [0, 0, 1];
    readonly lightDirection: readonly [0, 0, 1];
  };
  readonly cleanup: {
    readonly canvasWasDetached: true;
    readonly contextReleaseRequested: boolean;
    readonly created: WaterSurfaceAppearanceGpuCalibrationResourceCount;
    readonly deleted: WaterSurfaceAppearanceGpuCalibrationResourceCount;
    readonly activeAfterCleanup: WaterSurfaceAppearanceGpuCalibrationResourceCount;
  };
}

interface MutableResourceCount {
  shader: number;
  program: number;
  buffer: number;
  vertexArray: number;
  texture: number;
  framebuffer: number;
  renderbuffer: number;
}

interface CalibrationResources {
  vertexShader: WebGLShader | null;
  fragmentShader: WebGLShader | null;
  program: WebGLProgram | null;
  buffer: WebGLBuffer | null;
  vertexArray: WebGLVertexArrayObject | null;
  normalTexture: WebGLTexture | null;
  gradientTexture: WebGLTexture | null;
  colorTexture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
}

interface MutableCleanupReadback {
  canvasWasDetached: true;
  contextReleaseRequested: boolean;
  created: WaterSurfaceAppearanceGpuCalibrationResourceCount;
  deleted: WaterSurfaceAppearanceGpuCalibrationResourceCount;
  activeAfterCleanup: WaterSurfaceAppearanceGpuCalibrationResourceCount;
}

function emptyResourceCount(): MutableResourceCount {
  return {
    shader: 0,
    program: 0,
    buffer: 0,
    vertexArray: 0,
    texture: 0,
    framebuffer: 0,
    renderbuffer: 0
  };
}

function freezeResourceCount(value: MutableResourceCount): WaterSurfaceAppearanceGpuCalibrationResourceCount {
  return Object.freeze({ ...value });
}

function subtractResourceCount(
  created: MutableResourceCount,
  deleted: MutableResourceCount
): WaterSurfaceAppearanceGpuCalibrationResourceCount {
  return Object.freeze({
    shader: created.shader - deleted.shader,
    program: created.program - deleted.program,
    buffer: created.buffer - deleted.buffer,
    vertexArray: created.vertexArray - deleted.vertexArray,
    texture: created.texture - deleted.texture,
    framebuffer: created.framebuffer - deleted.framebuffer,
    renderbuffer: created.renderbuffer - deleted.renderbuffer
  });
}

function requireObject<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireObject(gl.createShader(type), "Controlled calibration could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown compile error";
    gl.deleteShader(shader);
    throw new Error(`Controlled calibration shader compilation failed: ${log}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram {
  const program = requireObject(gl.createProgram(), "Controlled calibration could not create a program.");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown link error";
    gl.deleteProgram(program);
    throw new Error(`Controlled calibration program link failed: ${log}`);
  }
  return program;
}

async function sha256Text(source: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

function countCalls(source: string, name: string): number {
  return source.split(name).length - 1;
}

function createGradientTextureBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      bytes[offset] = Math.round((x / (width - 1)) * 255);
      bytes[offset + 1] = Math.round((y / (height - 1)) * 255);
      bytes[offset + 2] = (x * 17 + y * 31) % 256;
      bytes[offset + 3] = 255;
    }
  }
  return bytes;
}

export function createWaterSurfaceAppearanceGpuCalibrationFragmentSource(): string {
  const appearance = createWaterSurfaceAppearanceShaderFunctions();
  const contactFoam = createWaterContactFoamShaderFunctions(3);
  const brdf = createWaterSurfaceBrdfShaderFunctions();
  return `#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;
out vec4 outputColor;

uniform int u_mode;
uniform float u_sampleCount;
uniform sampler2D u_normalTexture;
uniform sampler2D u_gradientTexture;
uniform float u_normalTiling;
uniform float u_normalScrollUvPerSecond;
uniform float u_normalStrength;
uniform float u_normalFlipGreen;
uniform float u_surfaceTime;
uniform float u_depthTintDistance;
uniform float u_depthTintExponent;
uniform float u_depthSteps[5];
uniform float u_contactDistance;
uniform float u_coastalDistance;
uniform float u_refractionStrength;
uniform float u_roughness;
uniform float u_fresnelF0;

${appearance}
${contactFoam}
${brdf}

float calibrationSampleT() {
  return floor(gl_FragCoord.x - 0.5) / max(u_sampleCount - 1.0, 1.0);
}

vec3 calibrationGradient(vec2 uv) {
  return texture(u_gradientTexture, clamp(uv, vec2(0.0), vec2(0.999999))).rgb;
}

void main() {
  if (u_mode == 0) {
    vec2 worldPositionXz = (v_uv - vec2(0.5)) * vec2(80.0, 48.0);
    vec2 worldUv = worldPositionXz * u_normalTiling;
    vec2 scrollUv = vec2(u_surfaceTime * u_normalScrollUvPerSecond);
    vec3 firstNormal = waterSurfaceAppearanceDecodeTangentNormal(
      texture(u_normalTexture, worldUv + scrollUv),
      u_normalStrength,
      u_normalFlipGreen
    );
    vec3 secondNormal = waterSurfaceAppearanceDecodeTangentNormal(
      texture(u_normalTexture, -worldUv + scrollUv),
      u_normalStrength,
      u_normalFlipGreen
    );
    outputColor = vec4(
      waterSurfaceAppearanceBlendTangentNormals(firstNormal, secondNormal) * 0.5 + 0.5,
      1.0
    );
    return;
  }

  if (u_mode == 1) {
    int sampleIndex = clamp(int(floor(gl_FragCoord.x - 0.5)), 0, 4);
    float factor = waterSurfaceAppearanceDepthTintFactor(
      u_depthSteps[sampleIndex],
      u_depthTintDistance,
      u_depthTintExponent
    );
    outputColor = vec4(vec3(factor), 1.0);
    return;
  }

  if (u_mode == 2) {
    float depth = calibrationSampleT() * ${CONTACT_PROFILE_MAX_DEPTH_METERS};
    float mask = evaluateWaterContactFoamDepthMask(depth, step(0.0, depth), u_contactDistance);
    outputColor = vec4(vec3(mask), 1.0);
    return;
  }

  if (u_mode == 3) {
    float depth = calibrationSampleT() * ${COASTAL_PROFILE_MAX_DEPTH_METERS};
    float alpha = waterSurfaceAppearanceCoastalAlpha(depth, u_coastalDistance);
    outputColor = vec4(vec3(alpha), 1.0);
    return;
  }

  vec2 normalDelta = vec2(0.25, -0.2);
  vec2 refractionDelta = waterSurfaceAppearanceRefractionUvDelta(
    normalDelta,
    u_refractionStrength
  );
  vec2 centeredUv = vec2(0.25, 0.5);
  if (u_mode == 4) {
    outputColor = vec4(
      refractionDelta * ${REFRACTION_DELTA_ENCODING_SCALE}.0 + vec2(0.5),
      0.0,
      1.0
    );
    return;
  }
  if (u_mode == 5 || u_mode == 6) {
    float centeredDepthBehind = u_mode == 5 ? 1.0 : 0.0;
    float validity = waterSurfaceAppearanceRefractionSampleValidity(
      1.0,
      1.0,
      1.0,
      centeredDepthBehind,
      1.0
    );
    outputColor = vec4(
      mix(
        calibrationGradient(centeredUv),
        calibrationGradient(centeredUv + refractionDelta),
        validity
      ),
      1.0
    );
    return;
  }
  if (u_mode == 7) {
    outputColor = vec4(calibrationGradient(centeredUv), 1.0);
    return;
  }

  float angleDegrees = mix(
    ${SPECULAR_MINIMUM_ANGLE_DEGREES}.0,
    ${SPECULAR_MAXIMUM_ANGLE_DEGREES}.0,
    calibrationSampleT()
  );
  float angle = radians(angleDegrees);
  vec3 normal = normalize(vec3(sin(angle), 0.0, cos(angle)));
  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  vec3 lightDirection = vec3(0.0, 0.0, 1.0);
  vec3 halfDirection = normalize(viewDirection + lightDirection);
  float directSpecular = waterSurfaceDirectSpecular(
    u_fresnelF0,
    u_roughness,
    max(dot(normal, viewDirection), 0.0),
    max(dot(normal, lightDirection), 0.0),
    max(dot(normal, halfDirection), 0.0),
    max(dot(lightDirection, halfDirection), 0.0)
  );
  outputColor = vec4(vec3(directSpecular * ${SPECULAR_ENCODING_SCALE}.0), 1.0);
}`;
}

const VERTEX_SOURCE = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

function setUniform1f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  gl.uniform1f(requireObject(gl.getUniformLocation(program, name), `Missing calibration uniform ${name}.`), value);
}

function setUniform1i(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  gl.uniform1i(requireObject(gl.getUniformLocation(program, name), `Missing calibration uniform ${name}.`), value);
}

function setUniform1fv(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  value: readonly number[]
): void {
  gl.uniform1fv(requireObject(gl.getUniformLocation(program, name), `Missing calibration uniform ${name}.`), value);
}

function renderPass(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  mode: number,
  width: number,
  height: number
): readonly number[] {
  setUniform1i(gl, program, "u_mode", mode);
  setUniform1f(gl, program, "u_sampleCount", width);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();
  const bytes = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    throw new Error(`Controlled calibration pass ${mode} failed with WebGL error ${error}.`);
  }
  return Object.freeze(Array.from(bytes));
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
  for (const key of ["normalTexture", "gradientTexture", "colorTexture"] as const) {
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
  if (resources.buffer) {
    gl.deleteBuffer(resources.buffer);
    resources.buffer = null;
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

function bindTexture(
  gl: WebGL2RenderingContext,
  unit: number,
  texture: WebGLTexture,
  uniformName: string,
  program: WebGLProgram
): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  setUniform1i(gl, program, uniformName, unit);
}

/**
 * Compiles, draws, reads, and destroys a detached WebGL2 calibration fixture.
 * The caller receives raw pixels and inputs only; threshold evaluation belongs
 * to the independent E2E harness.
 */
export async function readWaterSurfaceAppearanceGpuCalibration(
  input: Readonly<WaterSurfaceAppearanceGpuCalibrationInput>
): Promise<WaterSurfaceAppearanceGpuCalibrationReadback> {
  const canvas = document.createElement("canvas");
  canvas.width = CALIBRATION_TARGET_WIDTH;
  canvas.height = CALIBRATION_TARGET_HEIGHT;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false
  });
  if (!gl) throw new Error("Controlled calibration requires WebGL2.");

  const created = emptyResourceCount();
  const deleted = emptyResourceCount();
  const resources: CalibrationResources = {
    vertexShader: null,
    fragmentShader: null,
    program: null,
    buffer: null,
    vertexArray: null,
    normalTexture: null,
    gradientTexture: null,
    colorTexture: null,
    framebuffer: null
  };
  let releaseRequested = false;
  let cleanupReadback: MutableCleanupReadback | undefined;
  try {
    const fragmentSource = createWaterSurfaceAppearanceGpuCalibrationFragmentSource();
    resources.vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    created.shader++;
    resources.fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    created.shader++;
    resources.program = createProgram(gl, resources.vertexShader, resources.fragmentShader);
    created.program++;
    gl.useProgram(resources.program);

    resources.vertexArray = requireObject(gl.createVertexArray(), "Controlled calibration could not create a VAO.");
    created.vertexArray++;
    gl.bindVertexArray(resources.vertexArray);
    resources.buffer = requireObject(gl.createBuffer(), "Controlled calibration could not create a vertex buffer.");
    created.buffer++;
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(resources.program, "a_position");
    if (positionLocation < 0) throw new Error("Controlled calibration position attribute is unavailable.");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    resources.colorTexture = requireObject(
      gl.createTexture(),
      "Controlled calibration could not create a color texture."
    );
    created.texture++;
    gl.bindTexture(gl.TEXTURE_2D, resources.colorTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, CALIBRATION_TARGET_WIDTH, CALIBRATION_TARGET_HEIGHT);
    resources.framebuffer = requireObject(
      gl.createFramebuffer(),
      "Controlled calibration could not create a framebuffer."
    );
    created.framebuffer++;
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resources.colorTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Controlled calibration framebuffer is incomplete.");
    }

    resources.normalTexture = requireObject(
      gl.createTexture(),
      "Controlled calibration could not create a normal texture."
    );
    created.texture++;
    bindTexture(gl, 0, resources.normalTexture, "u_normalTexture", resources.program);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.normalImage);
    gl.generateMipmap(gl.TEXTURE_2D);

    resources.gradientTexture = requireObject(
      gl.createTexture(),
      "Controlled calibration could not create a gradient texture."
    );
    created.texture++;
    bindTexture(gl, 1, resources.gradientTexture, "u_gradientTexture", resources.program);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, createGradientTextureBytes(64, 64));

    setUniform1f(gl, resources.program, "u_normalTiling", input.normalTiling);
    setUniform1f(gl, resources.program, "u_normalScrollUvPerSecond", input.normalScrollUvPerSecond);
    setUniform1f(gl, resources.program, "u_normalStrength", input.normalStrength);
    setUniform1f(gl, resources.program, "u_normalFlipGreen", input.normalFlipGreen ? 1 : 0);
    setUniform1f(gl, resources.program, "u_surfaceTime", input.surfaceTime);
    setUniform1f(gl, resources.program, "u_depthTintDistance", input.depthTintDistanceMeters);
    setUniform1f(gl, resources.program, "u_depthTintExponent", input.depthTintExponent);
    setUniform1fv(gl, resources.program, "u_depthSteps", input.depthTintSampleMeters);
    setUniform1f(gl, resources.program, "u_contactDistance", input.contactDistanceMeters);
    setUniform1f(gl, resources.program, "u_coastalDistance", input.coastalDistanceMeters);
    setUniform1f(gl, resources.program, "u_refractionStrength", input.refractionStrength);
    setUniform1f(gl, resources.program, "u_roughness", input.roughness);
    setUniform1f(gl, resources.program, "u_fresnelF0", input.fresnelF0);

    const detailNormal = renderPass(gl, resources.program, 0, DETAIL_NORMAL_SIZE, DETAIL_NORMAL_SIZE);
    const depthTint = renderPass(gl, resources.program, 1, input.depthTintSampleMeters.length, 1);
    const contactProfile = renderPass(gl, resources.program, 2, PROFILE_SAMPLE_COUNT, 1);
    const coastalProfile = renderPass(gl, resources.program, 3, PROFILE_SAMPLE_COUNT, 1);
    const encodedRefractionDelta = renderPass(gl, resources.program, 4, 1, 1);
    const validDisplacedSample = renderPass(gl, resources.program, 5, 1, 1);
    const aboveWaterGuardedSample = renderPass(gl, resources.program, 6, 1, 1);
    const centeredSample = renderPass(gl, resources.program, 7, 1, 1);
    const specularProfile = renderPass(gl, resources.program, 8, PROFILE_SAMPLE_COUNT, 1);
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
    const result: WaterSurfaceAppearanceGpuCalibrationReadback = {
      schemaVersion: 1,
      source: "transient-webgl2-shared-glsl",
      context: {
        version: String(gl.getParameter(gl.VERSION)),
        renderer: String(gl.getParameter(gl.RENDERER)),
        unmaskedRenderer,
        framebufferStatus: "complete",
        readPixelsFormat: "rgba8",
        glError: 0
      },
      shader: {
        vertexSourceSha256: await sha256Text(VERTEX_SOURCE),
        fragmentSourceSha256: await sha256Text(fragmentSource),
        appearanceHelperCallCount: countCalls(fragmentSource, "waterSurfaceAppearance"),
        contactFoamHelperCallCount: countCalls(fragmentSource, "evaluateWaterContactFoamDepthMask"),
        brdfHelperCallCount: countCalls(fragmentSource, "waterSurfaceDirectSpecular")
      },
      detailNormal: {
        width: DETAIL_NORMAL_SIZE,
        height: DETAIL_NORMAL_SIZE,
        rgbaBytes: detailNormal,
        worldExtentMeters: Object.freeze([80, 48] as const),
        tiling: input.normalTiling,
        scrollUvPerSecond: input.normalScrollUvPerSecond,
        strength: input.normalStrength,
        flipGreen: input.normalFlipGreen,
        surfaceTime: input.surfaceTime
      },
      sceneDepthDepthColor: {
        sampleDepthDeltaMeters: Object.freeze([...input.depthTintSampleMeters]),
        rangeMeters: input.depthTintDistanceMeters,
        exponent: input.depthTintExponent,
        depthTintRgbaBytes: depthTint,
        contactProfile: {
          minimumDepthMeters: 0,
          maximumDepthMeters: CONTACT_PROFILE_MAX_DEPTH_METERS,
          sampleCount: PROFILE_SAMPLE_COUNT,
          rgbaBytes: contactProfile,
          contactDistanceMeters: input.contactDistanceMeters
        }
      },
      refraction: {
        normalDelta: Object.freeze([0.25, -0.2] as const),
        strength: input.refractionStrength,
        deltaEncodingScale: REFRACTION_DELTA_ENCODING_SCALE,
        encodedUvDeltaRgbaBytes: encodedRefractionDelta,
        gradientTextureSize: Object.freeze([64, 64] as const),
        centeredUv: Object.freeze([0.25, 0.5] as const),
        centeredSampleRgbaBytes: centeredSample,
        validDisplacedSampleRgbaBytes: validDisplacedSample,
        aboveWaterGuardedSampleRgbaBytes: aboveWaterGuardedSample
      },
      coastalAlpha: {
        minimumDepthMeters: 0,
        maximumDepthMeters: COASTAL_PROFILE_MAX_DEPTH_METERS,
        sampleCount: PROFILE_SAMPLE_COUNT,
        rgbaBytes: coastalProfile,
        distanceMeters: input.coastalDistanceMeters
      },
      specularResponse: {
        source: "gpu-controlled-normal-wedge",
        minimumAngleDegrees: SPECULAR_MINIMUM_ANGLE_DEGREES,
        maximumAngleDegrees: SPECULAR_MAXIMUM_ANGLE_DEGREES,
        sampleCount: PROFILE_SAMPLE_COUNT,
        rgbaBytes: specularProfile,
        encodingScale: SPECULAR_ENCODING_SCALE,
        roughness: input.roughness,
        fresnelF0: input.fresnelF0,
        viewDirection: Object.freeze([0, 0, 1] as const),
        lightDirection: Object.freeze([0, 0, 1] as const)
      },
      cleanup: cleanupReadback
    };
    return result;
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
