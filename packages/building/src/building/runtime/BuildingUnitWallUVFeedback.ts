import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  MeshTopology,
  ShaderData,
  ShaderDataGroup,
  ShaderLanguage,
  ShaderPass,
  TransformFeedbackSimulator,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat,
  type BufferMesh,
  type Engine,
  type Material
} from "@galacean/engine";
import { restoreResource } from "@galacean/engine-project/rendering/RestorableResources";
import {
  createWallUvProjector,
  type BuildingWallBakeBinding,
  type BuildingWallBakeTexture
} from "./BuildingWallBakeBinding";

const RendererShaderData = ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData;
const rowFloats = 14;
const capturedUV = "masonryCapturedLightmapUV";
interface CaptureProgram {
  pass: ShaderPass;
  samplers: string[];
}
const capturePrograms = new WeakMap<Engine, Map<string, CaptureProgram>>();

/** Capture the actual native brick/plank vertex deformation at rest. Its uniform-block
 * initializers still run in main. Only the draw-list lookup changes to the original unit ID. */
function captureProgram(engine: Engine, source: string, family: string): CaptureProgram {
  let programs = capturePrograms.get(engine);
  if (!programs) capturePrograms.set(engine, (programs = new Map()));
  const cached = programs.get(source);
  if (cached) return cached;
  const brick = family === "brick";
  const reader = brick ? "read_material_data_instance_list" : "read_nani_instance_indirection_buffer";
  const declaration = new RegExp(`uint\\s+${reader}\\s*\\(\\s*int\\s+\\w+\\s*\\)\\s*\\{[^{}]*\\}`);
  if (!declaration.test(source) || !source.includes("original_main();"))
    throw Error("Unsupported native wall unit vertex ABI: " + family);
  const samplers = Array.from(
    source.matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?[iu]?sampler\w+\s+(\w+)\s*;/g),
    (match) => match[1]
  );
  // Feedback uploads renderer uniforms. Give its sampler handles their own property names
  // so normal masonry material slots keep their existing ShaderDataGroup.
  const samplerNames = new Set(samplers);
  const captureSource = source
    .replace(/\b\w+\b/g, (word) => (samplerNames.has(word) ? "masonryCapture_" + word : word))
    .replace(declaration, `uint ${reader}(int ignored) { return uint(masonryCaptureFace.w); }`)
    .replace(
      "original_main();",
      `original_main();
      highp vec3 p = ${brick ? "v2" : "v0"};
      highp vec3 n = normalize(v1);
      highp vec2 uv = vec2(dot(masonryCapturePlane.xy, p.xz) + masonryCapturePlane.z,
                            masonryCaptureFace.x * p.y + masonryCapturePlane.w);
      bool front = abs(n.y) < 0.75 && dot(n.xz, masonryCaptureFace.yz) >= 0.12;
      ${capturedUV} = front
        ? (masonryCaptureClamp != 0 ? clamp(uv, masonryCaptureBounds.xy, masonryCaptureBounds.zw) : uv)
        : masonryCaptureDark;
    `
    );
  const header = `
in highp vec4 masonryCapturePlane;
in highp vec4 masonryCaptureFace;
in highp vec4 masonryCaptureBounds;
in highp vec2 masonryCaptureDark;
uniform highp int masonryCaptureClamp;
out highp vec2 ${capturedUV};
`;
  const pass = new ShaderPass(
    "NativeWallLightmapUV",
    [[0, header + captureSource]],
    [[0, "precision highp float; out vec4 color; void main(){ color = vec4(0.0); }"]],
    ShaderLanguage.GLSLES300
  );
  const program = { pass, samplers };
  programs.set(source, program);
  return program;
}

/** Native unit topology stays intact. A conservative sphere identifies units whose
 * triangles may cross a packed tile edge. Those units use a shared, independently
 * clamped chart, so the UV stays affine even along a plank longer than its light patch. */
export function partitionWallReceiverUnits(
  binding: BuildingWallBakeBinding,
  bounds: Float32Array,
  radii: Float32Array
): { dark: Uint32Array; lit: { ids: Uint32Array; binding: BuildingWallBakeBinding }[] } {
  const projector = createWallUvProjector(binding);
  const groups = new Map<BuildingWallBakeBinding, Map<BuildingWallBakeTexture, number[]>>();
  const dark: number[] = [];
  for (let i = 0; i < radii.length; i++) {
    const x = bounds[4 * i],
      y = bounds[4 * i + 1],
      z = bounds[4 * i + 2],
      r = radii[i];
    const chart = projector.select(x, y, z, 0, 0, 0);
    const u = chart.u[0] * x + chart.u[2] * z + chart.u[3],
      ru = r * Math.hypot(chart.u[0], chart.u[2]);
    const v = chart.v[1] * y + chart.v[3],
      rv = r * Math.abs(chart.v[1]);
    const [u0, v0, u1, v1] = chart.bounds;
    if (r <= 0 || chart === projector.black || u + ru < u0 || u - ru > u1 || v + rv < v0 || v - rv > v1) {
      dark.push(i);
      continue;
    }
    const crosses = !chart.unbounded && (u - ru < u0 || u + ru > u1 || v - rv < v0 || v + rv > v1);
    // A facade with one contributing emitter retains the native single-tap draw,
    // including its own black-bordered crop for long units crossing the patch.
    const source = binding.singleReceiver?.(chart.chartIndex);
    const receiver = source?.binding ?? binding;
    const texture = crosses
      ? receiver.texture.isolatedChart(source?.sourceChart ?? chart.chartIndex)
      : receiver.texture;
    let textures = groups.get(receiver);
    if (!textures) groups.set(receiver, (textures = new Map()));
    let ids = textures.get(texture);
    if (!ids) textures.set(texture, (ids = []));
    ids.push(i);
  }
  return {
    dark: Uint32Array.from(dark),
    lit: Array.from(groups, ([source, textures]) =>
      Array.from(textures, ([texture, ids]) => ({
        ids: Uint32Array.from(ids),
        binding: texture === source.texture ? source : { ...source, texture }
      }))
    ).flat()
  };
}

/** Generate one ordinary vec2 vertex attribute for each (unit, native template vertex).
 * Draw-arrays points includes each indexed template vertex once. Row order follows unitIDs.
 * The expanded render mesh borrows no feedback objects and can bind this buffer directly. */
export function bakeUnitWallUV(
  engine: Engine,
  mesh: BufferMesh,
  vertexSource: string,
  family: string,
  material: Material,
  binding: BuildingWallBakeBinding,
  centersAndRadii: Float32Array,
  vertexCount: number,
  unitIDs: Uint32Array
): Buffer {
  if (!unitIDs.length || !Number.isSafeInteger(vertexCount) || vertexCount < 1)
    throw Error("A wall UV capture requires units and template vertices");
  const { pass, samplers } = captureProgram(engine, vertexSource, family);
  const projector = createWallUvProjector(binding);
  const rows = new Float32Array(unitIDs.length * rowFloats);
  for (let i = 0; i < unitIDs.length; i++) {
    const id = unitIDs[i],
      c = id * 4;
    if (c + 3 >= centersAndRadii.length || id > 0xffffff) throw Error("Invalid wall unit ID");
    const chart = projector.select(centersAndRadii[c], centersAndRadii[c + 1], centersAndRadii[c + 2], 0, 0, 0);
    rows.set(
      [
        chart.u[0],
        chart.u[2],
        chart.u[3],
        chart.v[3],
        chart.v[1],
        chart.normal[0],
        chart.normal[2],
        id,
        ...chart.bounds,
        ...chart.darkUV
      ],
      i * rowFloats
    );
  }
  // The unit draw may replace its visibility attributes or mesh for LOD after preparation.
  // Snapshot the template's vertex bindings so a device restore captures the same geometry.
  const bindings: VertexBufferBinding[] = [];
  const elements: VertexElement[] = [];
  const usedBindings = new Map<number, number>();
  for (const e of mesh.vertexElements) {
    if (e.instanceStepRate) continue;
    let index = usedBindings.get(e.bindingIndex);
    if (index === undefined) {
      index = bindings.length;
      usedBindings.set(e.bindingIndex, index);
      bindings.push(mesh.vertexBufferBindings[e.bindingIndex]!);
    }
    elements.push(new VertexElement(e.attribute, e.offset, e.format, index));
  }
  const chartSlot = bindings.length;
  elements.push(
    new VertexElement("masonryCapturePlane", 0, VertexElementFormat.Vector4, chartSlot, 1),
    new VertexElement("masonryCaptureFace", 16, VertexElementFormat.Vector4, chartSlot, 1),
    new VertexElement("masonryCaptureBounds", 32, VertexElementFormat.Vector4, chartSlot, 1),
    new VertexElement("masonryCaptureDark", 48, VertexElementFormat.Vector2, chartSlot, 1)
  );
  const count = vertexCount * unitIDs.length;
  const result = new Buffer(engine, BufferBindFlag.VertexBuffer, count * 8, BufferUsage.Static, false);
  const upload = () => {
    const uniforms = new RendererShaderData(ShaderDataGroup.Renderer);
    uniforms.setInt("masonryCaptureClamp", binding.texture.unbounded ? 0 : 1);
    for (const name of samplers) {
      const texture = material.shaderData.getTexture(name);
      if (texture) uniforms.setTexture("masonryCapture_" + name, texture);
    }
    const chartBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, rows, BufferUsage.Static, false);
    try {
      const simulator = new TransformFeedbackSimulator(engine, 8, count, pass, [capturedUV], "output-only");
      try {
        const streams = [...bindings, new VertexBufferBinding(chartBuffer, rowFloats * 4)];
        if (!simulator.beginUpdate(uniforms, [], streams, elements))
          throw Error("Native wall UV capture failed to compile");
        try {
          simulator.draw(MeshTopology.Points, 0, vertexCount, unitIDs.length);
        } finally {
          simulator.endUpdate();
        }
        result.copyFromBuffer(simulator.readBinding.buffer, 0, 0, count * 8);
      } finally {
        simulator.destroy();
      }
    } finally {
      chartBuffer.destroy();
    }
  };
  try {
    upload();
    return restoreResource(result, upload);
  } catch (error) {
    result.destroy();
    throw error;
  }
}
