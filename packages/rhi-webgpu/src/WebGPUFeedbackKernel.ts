import type { IWebGPUShaderAttribute } from "@galacean/engine-design";
import { WebGPUPrimitive } from "./WebGPUPrimitive";
import type {
  IPlatformFeedbackCompute,
  IPlatformShaderProgram,
  VertexBufferBinding,
  VertexElement
} from "@galacean/engine-core";
import type { WebGPUBuffer } from "./WebGPUBuffer";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import type { WebGPUShaderProgram } from "./WebGPUShaderProgram";

interface GroupCache {
  buffers: WeakMap<GPUBuffer, GroupCache>;
  group?: GPUBindGroup;
}

interface Kernel {
  pipeline: GPUComputePipeline;
  layout: GPUBindGroupLayout;
  groups: GroupCache;
}

/** Vertex fetch addresses are compiled into the compute shader. Elements can be edited in place. */
function elementLayoutKey(elements: readonly VertexElement[]): string {
  let key = "";
  for (const { attribute, bindingIndex, offset, format, instanceStepRate } of elements) {
    key += `${attribute.length}:${attribute},${bindingIndex},${offset},${format},${instanceStepRate};`;
  }
  return key;
}

const workgroupSize = 64;

function entriesForBuffers(
  bindings: readonly GPUBuffer[],
  parameters: GPUBuffer,
  kernel: Kernel,
  device: GPUDevice
): GPUBindGroup {
  let node = kernel.groups;
  for (let i = 0; i <= bindings.length; i++) {
    const resource = i < bindings.length ? bindings[i] : parameters;
    let next = node.buffers.get(resource);
    if (!next) node.buffers.set(resource, (next = { buffers: new WeakMap() }));
    node = next;
  }
  if (!node.group) {
    const entries: GPUBindGroupEntry[] = bindings.map((buffer, binding) => ({ binding, resource: { buffer } }));
    entries.push({ binding: bindings.length, resource: { buffer: parameters, size: 16 } });
    node.group = device.createBindGroup({ layout: kernel.layout, entries });
  }
  return node.group;
}

/** Dispatches the selected particle simulation function over the active slots of the engine's particle ring. */
export class WebGPUFeedbackKernel implements IPlatformFeedbackCompute {
  private _device: GPUDevice;
  private _kernels = new WeakMap<WebGPUShaderProgram, { layoutKey: string; kernel: Kernel }>();
  private _gatherKernel?: Kernel;
  private _kernel: Kernel;
  private _program: WebGPUShaderProgram;
  private _bindings: GPUBuffer[] = [];
  private _gatherBindings: GPUBuffer[] = [];
  private _dummyRead?: GPUBuffer;
  private _page?: GPUBuffer;
  private _pageStart = 0;
  private _serial = -1;
  private _params = new Uint32Array(4);
  private _offset = new Uint32Array(1);

  constructor(private readonly _hardware: WebGPUGraphicDevice) {}

  bind(
    platformProgram: IPlatformShaderProgram,
    read: VertexBufferBinding,
    write: VertexBufferBinding,
    feedbackElements: readonly VertexElement[],
    inputs: readonly VertexBufferBinding[],
    elements: readonly VertexElement[]
  ): void {
    this._checkDevice();
    const program = (this._program = platformProgram as WebGPUShaderProgram);
    let strides = `${read.stride},${write.stride}`;
    for (const input of inputs) strides += "," + input.stride;
    const layoutKey = `${strides}|${elementLayoutKey(feedbackElements)}|${elementLayoutKey(elements)}`;
    let cached = this._kernels.get(program);
    if (cached?.layoutKey !== layoutKey) {
      const source = feedbackShader(program, read.stride, write.stride, feedbackElements, inputs, elements);
      const kernel = this._createKernel(source, inputs.length + 1, program._groupLayouts.slice(0, 3));
      this._kernels.set(program, (cached = { layoutKey, kernel }));
    }
    this._kernel = cached.kernel;
    if (read.buffer === write.buffer) {
      if (feedbackElements.length) throw new Error("In-place feedback with a read/write dependency is invalid.");
      this._bindings[0] = this._dummyRead ??= this._device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE });
    } else this._bindings[0] = this._storage(read);
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].buffer === write.buffer) throw new Error("Feedback input and output buffers must be distinct.");
      this._bindings[i + 1] = this._storage(inputs[i]);
    }
    this._bindings.length = inputs.length + 2;
    this._bindings[inputs.length + 1] = this._storage(write, true);
  }

  dispatch(first: number, count: number, instances = 1): void {
    if (!count || !instances) return;
    this._params[0] = first;
    this._params[1] = count * instances;
    this._params[2] = count;
    this._run(this._kernel, this._bindings, 3, count * instances, this._program);
  }

  gather(
    parent: VertexBufferBinding,
    child: VertexBufferBinding,
    firstParent: number,
    firstChild: number,
    childrenPerParent: number,
    parentCount: number
  ): void {
    const count = parentCount * childrenPerParent;
    if (!count) return;
    this._checkDevice();
    // The packed trajectory record has position and velocity after its six simulation floats.
    this._gatherKernel ??= this._createKernel(
      `
      @group(0) @binding(0) var<storage, read> parent: array<f32>;
      @group(0) @binding(1) var<storage, read_write> child: array<f32>;
      @group(0) @binding(2) var<uniform> p: vec4u;
      @compute @workgroup_size(${workgroupSize}) fn feedbackStep(@builtin(global_invocation_id) id: vec3u) {
        if (id.x >= p.w) { return; }
        let src = (p.x + id.x / p.z) * ${parent.stride / 4}u + 6u;
        let dst = (p.y + id.x) * ${child.stride / 4}u;
        for (var i = 0u; i < 6u; i++) { child[dst + i] = parent[src + i]; }
      }`,
      1,
      []
    );
    this._params[0] = firstParent;
    this._params[1] = firstChild;
    this._params[2] = childrenPerParent;
    this._params[3] = count;
    this._gatherBindings[0] = this._storage(parent);
    this._gatherBindings[1] = this._storage(child, true);
    this._run(this._gatherKernel, this._gatherBindings, 0, count);
  }

  destroy(): void {
    if (this._dummyRead) this._hardware._retireBuffer(this._dummyRead);
    this._dummyRead = undefined;
    if (this._page) this._hardware._retireBuffer(this._page);
    this._page = undefined;
    this._gatherKernel = undefined;
    this._kernels = new WeakMap();
    this._gatherBindings.length = this._bindings.length = 0;
  }

  private _checkDevice(): void {
    if (this._device === this._hardware.device) return;
    this.destroy();
    this._device = this._hardware.device;
    this._serial = -1;
  }

  private _storage(binding: VertexBufferBinding, write = false): GPUBuffer {
    const buffer = binding.buffer._platformBuffer as WebGPUBuffer;
    if (write) buffer._markShaderWrite();
    buffer._markUsed();
    return buffer._gpuBuffer;
  }

  private _createKernel(code: string, writable: number, prefix: (GPUBindGroupLayout | null)[]): Kernel {
    const device = this._device;
    const entries: GPUBindGroupLayoutEntry[] = [];
    for (let i = 0; i <= writable; i++) {
      entries.push({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: i === writable ? "storage" : "read-only-storage" }
      });
    }
    entries.push({
      binding: writable + 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: 16 }
    });
    const layout = device.createBindGroupLayout({ entries });
    prefix.push(layout);
    const pipeline = device.createComputePipeline({
      label: "Galacean particle feedback",
      layout: device.createPipelineLayout({ bindGroupLayouts: prefix }),
      compute: {
        module: device.createShaderModule({ label: "Galacean particle feedback", code }),
        entryPoint: "feedbackStep"
      }
    });
    return { layout, pipeline, groups: { buffers: new WeakMap() } };
  }

  private _run(
    kernel: Kernel,
    buffers: GPUBuffer[],
    group: number,
    count: number,
    program?: WebGPUShaderProgram
  ): void {
    const device = this._device;
    const alignment = device.limits.minUniformBufferOffsetAlignment;
    if (this._serial !== this._hardware.submissionSerial) {
      this._serial = this._hardware.submissionSerial;
      this._pageStart = 0;
    }
    if (!this._page || this._pageStart + 16 > this._page.size) {
      if (this._page) this._hardware._retireBuffer(this._page);
      this._page = device.createBuffer({
        label: "Particle dispatch ranges",
        size: 64 * alignment,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this._pageStart = 0;
    }
    device.queue.writeBuffer(this._page, this._pageStart, this._params);
    this._offset[0] = this._pageStart;
    this._pageStart += alignment;
    program?._prepareTextures();
    const pass = this._hardware._getCommandEncoder().beginComputePass({ label: "Particle feedback" });
    pass.setPipeline(kernel.pipeline);
    program?._bindGroups(pass, 3);
    pass.setBindGroup(group, entriesForBuffers(buffers, this._page, kernel, device), this._offset, 0, 1);
    pass.dispatchWorkgroups(Math.ceil(count / workgroupSize));
    pass.end();
  }
}

/** Decode the same vertex buffer bytes that a native vertex fetch would present to the shader. */
function feedbackInput(
  input: IWebGPUShaderAttribute,
  element: VertexElement,
  binding: number,
  stride: number,
  slot: string
): string {
  const format = WebGPUPrimitive._vertexFormat(element.format);
  const [, kind, bitWidth, count] = /^(float|sint|uint|snorm|unorm)(8|16|32)(?:x(\d))?$/.exec(format)!;
  const bits = Number(bitWidth);
  const signed = kind === "sint" || kind === "snorm";
  const scalar = input.type === "float" ? "f32" : input.type === "uint" ? "u32" : "i32";
  const channels = Array.from({ length: input.components }, (_, i) => {
    if (i >= Number(count ?? 1)) return scalar + (i === 3 ? "(1)" : "(0)");
    const offset = element.offset + (i * bits) / 8;
    const address = `((${slot}) * ${stride}u + ${offset}u)`;
    const word = `gs_input${binding}[${address} >> 2u]`;
    if (kind === "float") return `${scalar}(bitcast<f32>(${word}))`;
    const raw = signed ? `bitcast<i32>(${word})` : word;
    const value = bits === 32 ? raw : `extractBits(${raw}, (${address} & 3u) * 8u, ${bits}u)`;
    if (kind === "snorm") return `max(f32(${value}) / ${2 ** (bits - 1) - 1}.0, -1.0)`;
    if (kind === "unorm") return `f32(${value}) / ${2 ** bits - 1}.0`;
    return `${scalar}(${value})`;
  });
  return channels.length === 1 ? channels[0] : `vec${channels.length}<${scalar}>(${channels.join(", ")})`;
}

/** Reuse the compiled simulation, including its exact macros and arithmetic. Only its stage IO changes. */
function feedbackShader(
  program: WebGPUShaderProgram,
  readStride: number,
  writeStride: number,
  stateElements: readonly VertexElement[],
  inputs: readonly VertexBufferBinding[],
  elements: readonly VertexElement[]
): string {
  const { vertexSource, vertexEntryPoint, feedbackVaryings } = program._source;
  const { vertexInputs, vertexOutputs } = program.reflection;
  const entry = vertexEntryPoint ?? "main";
  const signature = new RegExp("@vertex\\s+fn\\s+" + entry + "\\s*\\((.*?)\\)\\s*->\\s*(\\w+)\\s*\\{", "s").exec(
    vertexSource
  );
  if (!signature || !feedbackVaryings?.length)
    throw new Error("Particle feedback requires a reflected vertex entry and its ordered output varyings.");
  const outputStruct = new RegExp("struct\\s+" + signature[2] + "\\s*\\{([^}]*)\\}").exec(vertexSource);
  if (!outputStruct) throw new Error("Particle feedback vertex output structure is absent.");
  const fields = new Map<number, string>();
  for (const m of outputStruct[1].matchAll(/@location\((\d+)\)\s+(?:@\w+\([^)]*\)\s+)*(\w+)\s*:/g))
    fields.set(Number(m[1]), m[2]);
  const values: string[] = [];
  for (const arg of signature[1].trim() ? signature[1].split(",") : []) {
    const location = /@location\((\d+)\)/.exec(arg);
    if (!location) {
      if (arg.includes("@builtin(vertex_index)")) values.push("slot");
      else if (arg.includes("@builtin(instance_index)")) values.push("instance");
      else throw new Error("Unsupported feedback builtin: " + arg);
      continue;
    }
    const input = vertexInputs.find((input) => input.location === Number(location[1]));
    if (!input) throw new Error("Missing particle vertex input at " + location[1]);
    const state = stateElements.find((element) => element.attribute === input.name);
    const element = state ?? elements.find((element) => element.attribute === input.name);
    if (!element) throw new Error("Missing feedback vertex element " + input.name);
    const binding = state ? 0 : element.bindingIndex + 1;
    const stride = state ? readStride : inputs[element.bindingIndex].stride;
    const inputSlot = element.instanceStepRate ? "instance / " + element.instanceStepRate + "u" : "slot";
    values.push(feedbackInput(input, element, binding, stride, inputSlot));
  }
  const declarations = Array.from(
    { length: inputs.length + 1 },
    (_, i) => `@group(3) @binding(${i}) var<storage, read> gs_input${i}: array<u32>;`
  );
  const stores: string[] = [];
  let word = 0;
  for (const name of feedbackVaryings) {
    const output = vertexOutputs.find((output) => output.name === name);
    const field = output && fields.get(output.location);
    if (!output || !field) throw new Error("Missing reflected particle output " + name);
    for (let i = 0; i < output.components; i++) {
      const component = output.components === 1 ? "" : "[" + i + "]";
      stores.push(
        `gs_output[outputSlot * ${writeStride / 4}u + ${word++}u] = bitcast<u32>(result.${field}${component});`
      );
    }
  }
  if (word * 4 !== writeStride) throw new Error("Particle feedback output size and destination stride differ.");
  return `${vertexSource.replace(/@vertex\b|@(?:location|builtin|interpolate|invariant)\([^)]*\)/g, "")}
    ${declarations.join("\n")}
    @group(3) @binding(${inputs.length + 1}) var<storage, read_write> gs_output: array<u32>;
    @group(3) @binding(${inputs.length + 2}) var<uniform> gs_range: vec4u;
    @compute @workgroup_size(${workgroupSize}) fn feedbackStep(@builtin(global_invocation_id) id: vec3u) {
      if (id.x >= gs_range.y) { return; }
      let slot = gs_range.x + id.x % gs_range.z;
      let instance = id.x / gs_range.z;
      let outputSlot = gs_range.x + id.x;
      let result = ${entry}(${values.join(", ")});
      ${stores.join("\n")}
    }`;
}
