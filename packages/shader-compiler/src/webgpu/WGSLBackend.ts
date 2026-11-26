import type {
  IWebGPUShaderCompiler,
  IWebGPUShaderProgram,
  IWebGPUShaderOptions,
  IWebGPUShaderReflection,
  IWebGPUShaderUniformBlock,
  IWebGPUShaderAttribute
} from "@galacean/engine-design";
import {
  attribute,
  declarations,
  matching,
  padUniformArrays,
  resourceGroup,
  texture,
  tokens,
  uniformBlock,
  instanceBlock,
  type Declaration
} from "./StageInterface";
import { poolSamplerBindings, removeUnusedSamplers } from "./SamplerBindings";
import { flattenUniformResources, recoverUniforms } from "./UniformDeclarations";
import { describeTextureBindings, fitTextureBindings } from "./TextureBindings";
import { translateGLSLToWGSL } from "./ast";
import { ShaderMacroProcessor } from "@galacean/engine-core";
import { ShaderInstructionEncoder } from "../ShaderInstructionEncoder";

type Stage = "vertex" | "fragment";
type Patch = { end: number; text: string };
const samplerType = /^[iu]?sampler(?:2D(?:Array)?|Cube|3D)(?:Shadow)?$/;
const textureType = (type: string): string => type.replace("sampler", "texture");
const vulkanSampler = (type: string): string => (type.endsWith("Shadow") ? "samplerShadow" : "sampler");

/** Native AST-based WGSL backend. Handles stage interfaces, resource reflection,
 * uniform packing, and lowers GLSL ES 3.00 AST directly to WGSL without external WASM. */
export class WGSLBackend implements Pick<IWebGPUShaderCompiler, "compileWebGPUVariant"> {
  constructor(private readonly translate: (source: string, stage: Stage) => string = translateGLSLToWGSL) {}
  compileWebGPUVariant(
    vertexSource: string,
    fragmentSource: string,
    options: IWebGPUShaderOptions = {}
  ): IWebGPUShaderProgram {
    // Legacy passes may place an entire raw GLSL stage in one Text instruction.
    // Resolve its directives before tokenization loses the preprocessor line boundaries.
    const expand = (source: string) => {
      const stage = ShaderInstructionEncoder.parseRawStage(source);
      return stage ? ShaderMacroProcessor.evaluate(stage, ShaderMacroProcessor._defaultWebGPUMacros) : source;
    };
    vertexSource = expand(vertexSource);
    fragmentSource = expand(fragmentSource);
    let stages = [tokens(vertexSource), tokens(fragmentSource)];
    let decls = stages.map(declarations);
    let aliases = new Map<string, { name: string; arrayIndex?: number }>();
    if (
      decls.some((stage) => stage.some((d) => d.qualifier === "uniform" && (!samplerType.test(d.type) || d.extent)))
    ) {
      const existing = options.uniformBlocks ?? [];
      const size = options.maxUniformBlockBytes ?? 65536;
      let recovered = recoverUniforms(vertexSource, fragmentSource, existing, size);
      const lowered = flattenUniformResources(stages, recovered.looseUniforms);
      if (lowered.aliases.size) {
        aliases = lowered.aliases;
        recovered = recoverUniforms(lowered.sources[0], lowered.sources[1], existing, size);
      }
      stages = [tokens(recovered.vertexSource), tokens(recovered.fragmentSource)];
      decls = stages.map(declarations);
      options = { ...options, uniformBlocks: [...(options.uniformBlocks ?? []), ...recovered.uniformBlocks] };
    }
    const groupBinding = [0, 0, 0, 0];
    const reflection: IWebGPUShaderReflection = {
      uniformBlocks: [],
      textures: [],
      vertexInputs: [],
      vertexOutputs: [],
      fragmentOutputs: []
    };
    const locations = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
    const interfaceOf = (s: number, d: Declaration) =>
      s === 0 && d.qualifier === "in" ? 0 : s === 1 && d.qualifier === "out" ? 2 : 1;
    // Reserve explicit locations before assigning implicit ones. A later fragment
    // input can fix the location of an earlier, implicitly located vertex output.
    const occupied = [new Set<number>(), new Set<number>(), new Set<number>()];
    for (let s = 0; s < 2; s++)
      for (const d of decls[s]) {
        if (d.location === undefined || (d.qualifier !== "in" && d.qualifier !== "out")) continue;
        const idx = interfaceOf(s, d);
        locations[idx].set(d.name, d.location);
        occupied[idx].add(d.location);
      }
    for (let s = 0; s < 2; s++)
      for (const d of decls[s]) {
        const visibility = 1 << s;
        if (d.qualifier === "block") {
          const existing = reflection.uniformBlocks.find((b) => b.bindingName === d.name);
          if (existing) {
            existing.visibility |= visibility;
            continue;
          }
          const block = options.uniformBlocks?.find((b) => (b.bindingName ?? b.name) === d.name);
          const isInstance = d.name === options.instanceBindingName;
          if (!block && !isInstance) throw new Error(`Missing std140 reflection for uniform block '${d.name}'.`);
          const name = block?.name ?? "Instance",
            group =
              name === "Scene" ? 0 : name === "Camera" ? 1 : name === "Instance" && !options.computeFeedback ? 3 : 2;
          const autoIndex = options.uniformBlocks?.filter((b) => b.name === "Auto").indexOf(block!) ?? 0;
          reflection.uniformBlocks.push({
            name,
            group,
            binding: groupBinding[group]++,
            bindingName: d.name,
            visibility,
            physicalBinding: name === "Instance" ? 0 : name === "Scene" ? 1 : name === "Camera" ? 2 : 3 + autoIndex,
            byteLength: block?.byteLength ?? options.instanceByteLength ?? 0,
            members: block?.members ?? []
          });
        } else if (d.qualifier === "uniform" && samplerType.test(d.type)) {
          const existing = reflection.textures.find((t) => t.name === d.name);
          if (existing) {
            existing.visibility |= visibility;
            continue;
          }
          const alias = aliases.get(d.name);
          const property = alias?.name ?? d.name;
          const textureKey = alias?.arrayIndex === undefined ? property : property + "[" + alias.arrayIndex + "]";
          const group = resourceGroup(property, options.computeFeedback);
          reflection.textures.push({
            ...texture(textureKey, d.type, group, groupBinding[group], visibility, options),
            name: d.name
          });
          groupBinding[group] += 2;
        } else if (d.qualifier === "in" || d.qualifier === "out") {
          const idx = interfaceOf(s, d);
          const map = locations[idx];
          let loc = map.get(d.name);
          if (loc === undefined) {
            loc = 0;
            for (; occupied[idx].has(loc); ) loc++;
            occupied[idx].add(loc);
            map.set(d.name, loc);
          }
          if (idx === 0) {
            const a = attribute(d, loc);
            a.type = options.vertexInputTypes?.[d.name] ?? a.type;
            reflection.vertexInputs.push(a);
          } else if (s === 0 && idx === 1) reflection.vertexOutputs.push(attribute(d, loc));
          else if (idx === 2) reflection.fragmentOutputs.push(loc);
        }
      }
    const sources = stages.map((stage, s) =>
      removeUnusedSamplers(this._generate(stage, s === 0 ? "vertex" : "fragment", decls[s], reflection, locations))
    );
    for (const texture of reflection.textures) {
      const alias = aliases.get(texture.name);
      if (alias) Object.assign(texture, alias);
      const binding = texture.group + ":" + texture.samplerBinding;
      const stages = (sources[0].bindings.has(binding) ? 1 : 0) | (sources[1].bindings.has(binding) ? 2 : 0);
      if (stages) texture.samplerVisibility = stages;
      else {
        delete texture.samplerBinding;
        delete texture.samplerType;
        if (texture.sampleType === "float") texture.sampleType = "unfilterable-float";
      }
    }
    if (aliases.size)
      for (const block of reflection.uniformBlocks) {
        block.members = block.members.map((m) => (aliases.has(m.name) ? { ...m, name: aliases.get(m.name)!.name } : m));
      }
    let modules = sources.map((s) => s.source);
    modules = fitTextureBindings(modules, reflection, options);
    const samplerLimit = options.maxSamplersPerStage ?? 16;
    for (const stage of [1, 2]) {
      if (reflection.textures.filter((t) => (t.samplerVisibility ?? 0) & stage).length > samplerLimit)
        reflection.requiresSamplerKeys = true;
    }
    if (reflection.requiresSamplerKeys) {
      modules = poolSamplerBindings(modules, reflection.textures, options.samplerKeys);
      for (const stage of [1, 2]) {
        const unique = new Set(
          reflection.textures
            .filter((t) => (t.samplerVisibility ?? 0) & stage)
            .map((t) => t.group + ":" + t.samplerBinding)
        );
        if (unique.size > samplerLimit)
          throw new Error(
            `WebGPU ${stage === 1 ? "vertex" : "fragment"} stage needs ${unique.size} distinct sampler bindings, exceeding the sampler limit of ${samplerLimit}. Resources: ${describeTextureBindings(
              reflection.textures.filter((t) => (t.samplerVisibility ?? 0) & stage),
              options
            )}.`
          );
      }
    }
    return {
      vertex: modules[0],
      fragment: modules[1],
      vertexEntryPoint: "main",
      fragmentEntryPoint: "main",
      reflection
    };
  }
  private _generate(
    t: string[],
    stage: Stage,
    globals: Declaration[],
    reflection: IWebGPUShaderReflection,
    locations: Map<string, number>[],
    directArrays = true
  ): string {
    const patches = new Map<number, Patch>();
    const init: string[] = [];
    const padded: { block: IWebGPUShaderUniformBlock; count: number }[] = [];
    let generated = "gs_wgpu_";
    for (; t.some((name) => name.startsWith(generated)); ) generated += "x";
    const samplerTypes = new Map<string, string>();
    const set = (i: number, end: number, text: string) => patches.set(i, { end, text });
    for (const d of globals) {
      if (d.qualifier === "block") {
        const b = reflection.uniformBlocks.find((b) => b.bindingName === d.name)!;
        if (b.name === "Instance") {
          const result = instanceBlock(t, d, b, generated);
          set(d.start, d.end, result.source);
          result.reads.forEach((patch, index) => patches.set(index, patch));
          continue;
        }
        const result = uniformBlock(t, d, b, reflection.uniformBlocks.indexOf(b), generated, directArrays);
        set(d.start, d.end, result.source);
        if (result.initialize) init.push(result.initialize);
        if (result.paddedArrays) padded.push({ block: b, count: result.paddedArrays });
      } else if (d.qualifier === "uniform" && samplerType.test(d.type)) {
        const binding = reflection.textures.find((b) => b.name === d.name)!;
        samplerTypes.set(d.name, d.type);
        set(
          d.start,
          d.end,
          `layout(set=${binding.group},binding=${binding.textureBinding}) uniform ${textureType(d.type)} ${generated}tex_${d.name}; layout(set=${binding.group},binding=${binding.samplerBinding}) uniform ${vulkanSampler(d.type)} ${generated}samp_${d.name};`
        );
      } else if (d.qualifier === "in" || d.qualifier === "out") {
        const attr =
          stage === "vertex" && d.qualifier === "in"
            ? reflection.vertexInputs.find((a) => a.name === d.name)
            : undefined;
        const index = attr ? 0 : stage === "fragment" && d.qualifier === "out" ? 2 : 1;
        const begin = t.slice(d.start, d.end).indexOf(d.qualifier) + d.start;
        const flat = t.slice(d.start, begin).includes("flat") ? "flat " : "";
        const prefix = `layout(location=${locations[index].get(d.name)}) ${flat}`;
        if (attr && attr.type !== attribute(d, attr.location).type) {
          const type = this._shaderInputType(attr);
          set(d.start, d.end, `${prefix}in ${type} ${generated}vertex_${d.name}; ${d.type} ${d.name};`);
          init.push(`${d.name}=${d.type}(${generated}vertex_${d.name});`);
        } else set(d.start, d.end, prefix + t.slice(begin, d.end).join(" "));
      }
    }
    // GLSL ES permits passing a combined sampler to a helper. Vulkan and WGSL
    // express the pair as two formal parameters and two call arguments.
    const functionSamplers = new Map<string, Map<number, string>>();
    const definitions = new Set<number>();
    for (let i = 1; i < t.length; i++)
      if (t[i] === "(" && /^[A-Za-z_]\w*$/.test(t[i - 1])) {
        const end = matching(t, i);
        if (
          t[end + 1] !== "{" &&
          !(t[end + 1] === ";" && /^(?:void|float|int|bool|uint|[biu]?vec[234]|mat[234])$/.test(t[i - 2]))
        )
          continue;
        const name = t[i - 1];
        if (["if", "while", "for", "switch"].includes(name)) continue;
        definitions.add(i);
        const slots = functionSamplers.get(name) ?? new Map<number, string>();
        let n = 0;
        for (let j = i + 1; j < end; j++) {
          if (t[j] === ",") n++;
          if (samplerType.test(t[j]) && /^\w+$/.test(t[j + 1])) {
            const key = t[j + 1],
              type = t[j];
            slots.set(n, type);
            samplerTypes.set(key, type);
            set(
              j,
              j + 2,
              `${textureType(type)} ${generated}tex_${key}, ${vulkanSampler(type)} ${generated}samp_${key}`
            );
            j++;
          }
        }
        if (slots.size) functionSamplers.set(name, slots);
        if (name === "main") set(i - 1, i, generated + "main");
      }
    for (let i = 1; i < t.length; i++)
      if (t[i] === "(" && !definitions.has(i)) {
        const fn = t[i - 1];
        const slots = functionSamplers.get(fn);
        if (!slots && !/^(?:texture\w*|texelFetch\w*)$/.test(fn)) continue;
        const end = matching(t, i);
        // GLSL samples the base mip for implicit LOD outside a fragment shader.
        // WGSL requires an explicit level for the equivalent vertex/feedback operation.
        const vertexSample = stage === "vertex" && /^(?:texture|textureProj)(?:Offset)?$/.test(fn);
        if (vertexSample) {
          set(
            i - 1,
            i,
            fn.replace(/(Offset)?$/, (_, offset) => "Lod" + (offset ?? ""))
          );
          if (!fn.endsWith("Offset")) set(end, end + 1, ", 0.0)");
        }
        let slot = 0;
        for (let j = i + 1; j < end; j++) {
          if (t[j] === "(" || t[j] === "[") {
            j = matching(t, j);
            continue;
          }
          if (t[j] === ",") {
            slot++;
            if (vertexSample && slot === 2 && fn.endsWith("Offset")) set(j, j + 1, ", 0.0,");
            continue;
          }
          const key = t[j],
            type = samplerTypes.get(key);
          if (!type) continue;
          if (slots?.has(slot)) set(j, j + 1, `${generated}tex_${key},${generated}samp_${key}`);
          else if (!slots && slot === 0) set(j, j + 1, `${type}(${generated}tex_${key},${generated}samp_${key})`);
        }
      }
    const body: string[] = [];
    const closeNegative = new Map<number, number>();
    for (let i = 0; i < t.length; ) {
      const p = patches.get(i);
      if (p) {
        body.push(p.text);
        i = p.end;
        continue;
      }
      let v = t[i];
      if (v === "precision") {
        const end = t.indexOf(";", i);
        i = end < 0 ? t.length : end + 1;
        continue;
      }
      if (v === "dFdy" && t[i + 1] === "(") {
        body.push("(-");
        const e = matching(t, i + 1);
        closeNegative.set(e, (closeNegative.get(e) ?? 0) + 1);
      }
      if (v === "gl_VertexID") v = "int(gl_VertexIndex)";
      else if (v === "gl_InstanceID") v = "int(gl_InstanceIndex)";
      body.push(v);
      if (closeNegative.has(i)) body.push(")".repeat(closeNegative.get(i)!));
      i++;
    }
    const source = `#version 450\n${body.join(" ")}\nvoid main(){${init.join("\n")}${generated}main();${stage === "vertex" ? "gl_Position.z = 0.5 * (gl_Position.z + gl_Position.w);" : ""}}`;
    // Preserve each declarator's own extent when lowering comma-separated
    // arrays. The GLSL frontend otherwise propagates the first array's type.
    const clean = source
      .replace(/\b(?:lowp|mediump|highp)\b/g, "")
      .replace(/\b(\w+)\s+((?:\w+\s*\[[^\]]+\]\s*,\s*)+\w+\s*\[[^\]]+\])\s*;/g, (_, type: string, names: string) =>
        names
          .split(",")
          .map((name) => `${type} ${name.trim()};`)
          .join(" ")
      );
    let module = this.translate(clean, stage);
    for (const { block, count } of padded) {
      const compatible = padUniformArrays(module, block, count);
      if (!compatible) return this._generate(t, stage, globals, reflection, locations, false);
      module = compatible;
    }
    return "diagnostic(off, derivative_uniformity);\n" + module;
  }
  private _shaderInputType(a: IWebGPUShaderAttribute): string {
    return a.components === 1
      ? a.type === "uint"
        ? "uint"
        : a.type === "sint"
          ? "int"
          : "float"
      : (a.type === "uint" ? "u" : a.type === "sint" ? "i" : "") + "vec" + a.components;
  }
}
