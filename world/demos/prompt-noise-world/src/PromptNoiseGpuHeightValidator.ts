import type { Engine } from "@galacean/engine";
import promptNoiseHeightSource from "../shaders/PromptNoiseHeight.glsl?raw";
import { TerrainAnalyticFieldProvider } from "./PromptNoiseField.ts";
import type { PromptNoiseWorldPlanV1 } from "./PromptNoiseWorldContract.ts";

const VALIDATION_COORDINATES = Object.freeze([
  -1180, -910, -760, 640, -440, -520, -180, 840,
  0, 0, 190, -780, 460, 520, 790, -330,
  1120, 880, -980, 260, 340, 1160, -620, -1120
] as const);

/** Numeric result from executing the production height GLSL through WebGL2 transform feedback. */
export interface PromptNoiseGpuHeightValidation {
  readonly sampleCount: number;
  readonly maximumErrorMeters: number;
  readonly cpuHash: string;
  readonly gpuHash: string;
}

/**
 * Executes the production analytic height function on the GPU and compares it with CPU authority.
 * @param engine WebGL2 engine providing the live graphics context.
 * @param plan Immutable plan whose exact uniforms are validated.
 * @returns Maximum absolute error and detached sample hashes.
 */
export function validatePromptNoiseGpuHeight(
  engine: Engine,
  plan: PromptNoiseWorldPlanV1
): PromptNoiseGpuHeightValidation {
  const gl = (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl;
  const sampleCount = VALIDATION_COORDINATES.length / 2;
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, createValidationVertexShader(sampleCount));
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
out vec4 outputColor;
void main() { outputColor = vec4(0.0); }
`);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create GPU height validation program");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.transformFeedbackVaryings(program, ["validationHeight"], gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const diagnostics = gl.getProgramInfoLog(program) ?? "Unknown link failure";
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`GPU height validation link failed: ${diagnostics}`);
  }
  const output = new Float32Array(sampleCount);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Unable to create GPU height validation buffer");
  try {
    gl.useProgram(program);
    bindValidationUniforms(gl, program, plan);
    gl.uniform2fv(requiredUniform(gl, program, "validationCoordinates[0]"), VALIDATION_COORDINATES);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, buffer);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, output.byteLength, gl.STREAM_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, sampleCount);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
  } finally {
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
    gl.useProgram(null);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }
  const field = new TerrainAnalyticFieldProvider(plan);
  const cpu = new Float32Array(sampleCount);
  let maximumErrorMeters = 0;
  for (let index = 0; index < sampleCount; index++) {
    const x = VALIDATION_COORDINATES[index * 2];
    const z = VALIDATION_COORDINATES[index * 2 + 1];
    cpu[index] = field.sampleHeight(x, z);
    maximumErrorMeters = Math.max(maximumErrorMeters, Math.abs(cpu[index] - output[index]));
  }
  return Object.freeze({
    sampleCount,
    maximumErrorMeters,
    cpuHash: hashFloatSamples(cpu),
    gpuHash: hashFloatSamples(output)
  });
}

function createValidationVertexShader(sampleCount: number): string {
  const uniformSource = promptNoiseHeightSource.replace(
    /^(float|int|vec[234])\s+((?:material_|renderer_)[A-Za-z0-9_]+(?:\[[^;]+\])?);/gm,
    "uniform $1 $2;"
  );
  return `#version 300 es
precision highp float;
precision highp int;
uniform vec2 validationCoordinates[${sampleCount}];
uniform mat4 renderer_ModelMat;
uniform vec3 camera_Position;
${uniformSource}
out float validationHeight;
void main() {
  validationHeight = promptNoiseHeight(validationCoordinates[gl_VertexID]);
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;
}

function bindValidationUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  plan: PromptNoiseWorldPlanV1
): void {
  const terrain = plan.terrain;
  const terrain3d = terrain.terrain3dReference;
  gl.uniform1i(
    requiredUniform(gl, program, "material_TerrainProfile"),
    terrain.noiseProfile === "terrain3d-reference" ? 1 : 0
  );
  gl.uniform4f(
    requiredUniform(gl, program, "material_Terrain3DShape"),
    terrain3d.scale,
    terrain3d.height,
    terrain3d.offset[1],
    terrain3d.lodDistance
  );
  gl.uniform4f(
    requiredUniform(gl, program, "material_Terrain3DOffset"),
    terrain3d.offset[0],
    terrain3d.offset[2],
    terrain3d.minimumOctaves,
    terrain3d.maximumOctaves
  );
  gl.uniform2f(requiredUniform(gl, program, "material_WorldOrigin"), 0, 0);
  gl.uniform3f(requiredUniform(gl, program, "camera_Position"), 0, 0, 0);
  gl.uniform1i(requiredUniform(gl, program, "material_HeightSeed"), plan.stageSeeds.height | 0);
  gl.uniform1i(requiredUniform(gl, program, "material_WarpSeed"), plan.stageSeeds.warp | 0);
  gl.uniform1i(requiredUniform(gl, program, "material_TerrainOctaves"), terrain.octaves);
  gl.uniform1i(requiredUniform(gl, program, "material_RidgeOctaves"), terrain.ridgeOctaves);
  gl.uniform1f(requiredUniform(gl, program, "material_RidgeFrequency"), terrain.ridgeFrequency);
  gl.uniform1f(requiredUniform(gl, program, "material_DirectionalUplift"), terrain.directionalUplift);
  gl.uniform1i(
    requiredUniform(gl, program, "material_DirectionalBias"),
    terrain.directionalBias === "north" ? 1 : terrain.directionalBias === "left" ? 2 : 0
  );
  gl.uniform1i(requiredUniform(gl, program, "material_Archipelago"), terrain.archipelago ? 1 : 0);
  gl.uniform4f(
    requiredUniform(gl, program, "material_TerrainShape"),
    terrain.baseHeight,
    terrain.relief,
    terrain.frequency,
    terrain.warpStrength
  );
  gl.uniform4f(
    requiredUniform(gl, program, "material_TerrainDetail"),
    terrain.ridgeStrength,
    plan.surface.grassMoisture,
    terrain.directionalStrength,
    terrain.directionalScale
  );
  const bodyA = new Float32Array(8 * 4);
  const bodyB = new Float32Array(8 * 4);
  const bodySeeds = new Int32Array(8);
  plan.water.bodies.slice(0, 8).forEach((body, index) => {
    bodyA.set([body.center[0], body.center[1], body.radius[0], body.radius[1]], index * 4);
    bodyB.set([body.waterLevel, body.depth, body.irregularity, 0], index * 4);
    bodySeeds[index] = body.seed | 0;
  });
  gl.uniform1i(requiredUniform(gl, program, "material_WaterBodyCount"), Math.min(8, plan.water.bodies.length));
  gl.uniform4fv(requiredUniform(gl, program, "material_WaterBodyA[0]"), bodyA);
  gl.uniform4fv(requiredUniform(gl, program, "material_WaterBodyB[0]"), bodyB);
  gl.uniform1iv(requiredUniform(gl, program, "material_WaterBodySeeds[0]"), bodySeeds);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create GPU height validation shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const diagnostics = gl.getShaderInfoLog(shader) ?? "Unknown compile failure";
    gl.deleteShader(shader);
    throw new Error(`GPU height validation compile failed: ${diagnostics}`);
  }
  return shader;
}

function requiredUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`GPU height validation uniform is inactive: ${name}`);
  return location;
}

function hashFloatSamples(samples: Float32Array): string {
  let hash = 0x811c9dc5;
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
