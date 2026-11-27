import type { IWebGPUShaderOptions, IWebGPUShaderReflection, IWebGPUShaderTexture } from "@galacean/engine-design";

interface View {
  group: number;
  binding: number;
  layer?: Layer;
}
interface Layer {
  index: number;
  offset?: number;
  levels?: number;
}

const propertyName = (t: IWebGPUShaderTexture): string =>
  t.arrayIndex === undefined ? t.name : t.name + "[" + t.arrayIndex + "]";

export function describeTextureBindings(textures: IWebGPUShaderTexture[], options: IWebGPUShaderOptions): string {
  return textures
    .map((t) => {
      const name = propertyName(t),
        e = options.textureExtents?.[name];
      return e ? `${name} (${e.width}x${e.height}, ${e.format}, ${e.mipCount} mips)` : name;
    })
    .join(", ");
}

/** Count texture views independently of samplers. First alias identical texture
 * objects, then layer compatible 2D material textures only if still necessary. */
export function fitTextureBindings(
  modules: string[],
  reflection: IWebGPUShaderReflection,
  options: IWebGPUShaderOptions
): string[] {
  const limit = options.maxTexturesPerStage ?? 16;
  const textures = reflection.textures;
  const count = (bit: number) =>
    new Set(textures.filter((t) => t.visibility & bit).map((t) => t.group + ":" + t.textureBinding)).size;
  if (count(1) <= limit && count(2) <= limit) return modules;
  reflection.requiresTextureKeys = true;
  const views = new Map<string, View>();
  const identity = new Map<string, number>();
  const compatible = new Map<string, IWebGPUShaderTexture[]>();
  const original = new Map<IWebGPUShaderTexture, number>();
  // textureGather always reads physical level zero and has no explicit mip operand.
  const gather = modules.some((module) => /\btextureGather(?:Compare)?\(/.test(module));
  for (const t of textures) {
    original.set(t, t.textureBinding);
    const property = t.arrayIndex === undefined ? t.name : t.name + "[" + t.arrayIndex + "]";
    const key = options.textureKeys?.[property];
    if (key !== undefined) {
      const id = JSON.stringify([t.group, t.sampleType, t.viewDimension, key]);
      t.textureBinding = identity.get(id) ?? t.textureBinding;
      identity.set(id, t.textureBinding);
    }
    if (
      t.group !== 2 ||
      t.viewDimension !== "2d" ||
      (t.sampleType !== "float" && t.sampleType !== "unfilterable-float")
    )
      continue;
    const stack = options.textureArrayKeys?.[property] ?? (options.textureKeys === undefined ? "offline" : undefined);
    if (stack === undefined) continue;
    const extent = options.textureExtents?.[property];
    const id = JSON.stringify([t.group, t.sampleType, stack, gather ? extent?.width : undefined]);
    const group = compatible.get(id) ?? [];
    group.push(t);
    compatible.set(id, group);
  }
  for (const candidates of Array.from(compatible.values()).sort((a, b) => b.length - a.length)) {
    if (count(1) <= limit && count(2) <= limit) break;
    const slots = new Map<number, number>();
    for (const t of candidates) if (!slots.has(t.textureBinding)) slots.set(t.textureBinding, slots.size);
    if (slots.size < 2) continue;
    const binding = candidates[0].textureBinding;
    let width = 0,
      physicalLevels = 0;
    for (const t of candidates) width = Math.max(width, options.textureExtents?.[propertyName(t)]?.width ?? 0);
    if (width)
      for (const t of candidates) {
        const e = options.textureExtents![propertyName(t)];
        physicalLevels = Math.max(physicalLevels, Math.log2(width / e.width) + e.mipCount);
      }
    for (const t of candidates) {
      t.arrayLayer = slots.get(t.textureBinding)!;
      t.textureBinding = binding;
      t.viewDimension = "2d-array";
      const e = options.textureExtents?.[propertyName(t)];
      if (e && (e.width !== width || e.mipCount !== physicalLevels)) {
        t.arrayMipOffset = Math.log2(width / e.width);
        if (!Number.isInteger(t.arrayMipOffset))
          throw new Error("Texture array widths must be related by a power of two.");
        t.arrayMipCount = e.mipCount;
      }
    }
  }
  for (const bit of [1, 2]) {
    const n = count(bit);
    if (n > limit)
      throw new Error(
        `WebGPU ${bit === 1 ? "vertex" : "fragment"} stage needs ${n} sampled textures after view sharing; device limit is ${limit}. Resources: ${describeTextureBindings(
          textures.filter((t) => t.visibility & bit),
          options
        )}.`
      );
  }
  for (const t of textures)
    views.set(t.group + ":" + original.get(t), {
      group: t.group,
      binding: t.textureBinding,
      layer:
        t.arrayLayer === undefined
          ? undefined
          : { index: t.arrayLayer, offset: t.arrayMipOffset, levels: t.arrayMipCount }
    });
  return modules.map((source) => rewriteViews(source, views));
}

function closing(text: string, open: number, end: string): number {
  let depth = 1;
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === text[open]) depth++;
    else if (text[i] === end && !--depth) return i;
  }
  throw new Error("Unclosed native shader expression.");
}

function argumentsOf(text: string): string[] {
  if (!text.trim()) return [];
  const args: string[] = [];
  let start = 0,
    depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "<") depth++;
    else if (c === ")" || c === "]" || c === ">") depth--;
    else if (c === "," && !depth) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(text.slice(start).trim());
  return args;
}

interface FunctionBody {
  name: string;
  start: number;
  end: number;
  parameters: string[];
  result: string;
  body: string;
}

function rewriteViews(source: string, views: Map<string, View>): string {
  const primary = new Map<string, string>(),
    aliases = new Map<string, string>(),
    layers = new Map<string, Layer>();
  source = source.replace(
    /@group\((\d+)\)\s*@binding\((\d+)\)\s*var (\w+): (texture_[\w<>]+);/g,
    (declaration, g: string, b: string, name: string, type: string) => {
      const view = views.get(g + ":" + b);
      if (!view) return declaration;
      const key = view.group + ":" + view.binding;
      if (view.layer !== undefined) {
        layers.set(name, view.layer);
        type = type.replace("texture_2d<", "texture_2d_array<");
      }
      const first = primary.get(key);
      if (first) {
        aliases.set(name, first);
        return "";
      }
      primary.set(key, name);
      return `@group(${g}) @binding(${view.binding}) var ${name}: ${type};`;
    }
  );
  function replaceAliases(text: string): string {
    return aliases.size ? text.replace(/\b[A-Za-z_]\w*\b/g, (name) => aliases.get(name) ?? name) : text;
  }
  if (!layers.size) return replaceAliases(source);
  const functions = new Map<string, FunctionBody>(),
    compiled = new Map<string, string>();
  const pattern = /\bfn (\w+)\(/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const close = closing(source, pattern.lastIndex - 1, ")"),
      open = source.indexOf("{", close),
      end = closing(source, open, "}");
    functions.set(match[1], {
      name: match[1],
      start: match.index,
      end: end + 1,
      parameters: argumentsOf(source.slice(pattern.lastIndex, close)),
      result: source.slice(close + 1, open),
      body: source.slice(open + 1, end)
    });
    pattern.lastIndex = end + 1;
  }
  let prefix = "gs_layer_";
  for (; source.includes(prefix); ) prefix += "x";
  function transform(body: string, visible: Map<string, Layer>): string {
    const calls = /\b(\w+)\(/g;
    let start = 0,
      out = "";
    for (let call = calls.exec(body); call; call = calls.exec(body)) {
      const name = call[1];
      if (!functions.has(name) && !name.startsWith("texture")) continue;
      const end = closing(body, calls.lastIndex - 1, ")");
      const args = argumentsOf(body.slice(calls.lastIndex, end));
      const promoted = args.map((a) => visible.get(a));
      let target = name;
      const rewritten = args.map((a) => transform(a, visible));
      let literal: string | undefined;
      if (functions.has(name) && promoted.some((layer) => layer !== undefined)) {
        target = specialize(functions.get(name)!, promoted);
      } else if (name.startsWith("texture")) {
        const position = promoted.findIndex((layer) => layer !== undefined);
        if (position >= 0) {
          const layer = promoted[position]!,
            offset = layer.offset ?? 0;
          if (name === "textureNumLevels" && layer.levels !== undefined) literal = layer.levels + "u";
          if (name === "textureDimensions" && offset)
            rewritten[1] = rewritten[1] ? "(" + rewritten[1] + " + " + offset + ")" : String(offset);
          if (name === "textureLoad" && offset) rewritten[2] = "(" + rewritten[2] + " + " + offset + ")";
          if (name === "textureSampleLevel" && layer.levels !== undefined)
            rewritten[3] = "(clamp(" + rewritten[3] + ",0.0," + (layer.levels - 1) + ".0) + " + offset + ".0)";
          if (/^(?:textureSample|textureGather|textureLoad)/.test(name))
            rewritten.splice(position + (name === "textureLoad" ? 2 : 3), 0, layer.index + "i");
        }
      }
      out += body.slice(start, call.index) + (literal ?? target + "(" + rewritten.join(", ") + ")");
      calls.lastIndex = start = end + 1;
    }
    return out + body.slice(start);
  }
  function specialize(f: FunctionBody, signature: (Layer | undefined)[]): string {
    const name = signature.length
      ? prefix +
        f.name +
        "_" +
        signature.map((n) => (n ? n.index + "m" + (n.offset ?? 0) + "n" + (n.levels ?? 0) : "x")).join("_")
      : f.name;
    if (compiled.has(name)) return name;
    const visible = new Map(layers);
    const parameters = f.parameters.map((param, i) => {
      const layer = signature[i];
      if (layer === undefined) return param;
      const argument = /^(\w+)\s*:/.exec(param)![1];
      visible.set(argument, layer);
      return param.replace("texture_2d<", "texture_2d_array<");
    });
    const body = transform(f.body, visible);
    compiled.set(name, `fn ${name}(${parameters.join(", ")})${f.result}{${body}}`);
    return name;
  }
  // Leave entry point annotations and their parameter annotations at their
  // original positions. Ordinary overloads can be shared by multiple callers.
  let start = 0,
    out = "";
  for (const f of functions.values()) {
    specialize(f, []);
    out += source.slice(start, f.start) + compiled.get(f.name);
    start = f.end;
  }
  out += source.slice(start);
  for (const [name, fn] of compiled) if (!functions.has(name)) out += "\n" + fn + "\n";
  return replaceAliases(out);
}
