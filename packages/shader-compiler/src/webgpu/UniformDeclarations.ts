import {
  finalizeShaderUniforms,
  shaderConstant,
  type ShaderConstant,
  type IShaderUniformBlock,
  type IShaderUniformSelection,
  type IShaderUniformSite,
  type IShaderUniformVariable
} from "@galacean/engine-design";
import { declarations, matching, tokens } from "./StageInterface";

/** Historical instruction streams predate declaration sites. Inspect their selected
 * top-level declarations once and pass them to exactly the same std140 packer. */
function recoverStage(source: string, findEntry = false): { source: string; sites: IShaderUniformSelection[] } {
  const words = tokens(source);
  const offsets: number[] = [];
  let offset = 0;
  for (const word of words) {
    offsets.push(offset);
    offset += word.length + 1;
  }
  source = words.join(" ");
  const sites: IShaderUniformSelection[] = [];
  function add(kind: IShaderUniformSite["kind"], first: number, last: number, structName?: string) {
    const start = offsets[first],
      end = offsets[last] + words[last].length;
    sites.push({
      site: { kind, instruction: 0, name: "", type: "", structName },
      start,
      end,
      text: source.slice(start, end)
    });
  }
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "{") {
      const end = matching(words, i);
      if (words[start] === "struct") {
        const name = words[start + 1];
        let member = i + 1;
        for (let j = member; j < end; j++)
          if (words[j] === ";") {
            add("structMember", member, j, name);
            member = j + 1;
          }
      }
      if (words[i - 1] === ")") {
        if (findEntry && words[start] === "void" && words[start + 1] === "main") add("entry", start, i);
        start = end + 1;
      }
      i = end;
    } else if (words[i] === ";") {
      const key = words[start];
      if (key === "uniform") add("uniform", start, i);
      else if (key === "const") add("constant", start, i);
      else if (key === "precision") add("precision", start, i);
      start = i + 1;
    }
  }
  return { source, sites };
}

/** Older assets lack marked entry points and uniform names. Reuse the current instance
 * layout so renderer overrides made after initial compilation retain their own record. */
export function recoverLegacyInstancing(
  vertex: string,
  fragment: string,
  explicitBlocks: number,
  maxBlockBytes: number
) {
  const vs = recoverStage(vertex, true);
  const fs = recoverStage(fragment, true);
  const names = new Set((vs.source + " " + fs.source).match(/[A-Za-z_]\w*/g));
  function available(name: string): string {
    for (; names.has(name); ) name += "_";
    return name;
  }
  return finalizeShaderUniforms(vs.source, fs.source, vs.sites, fs.sites, {
    maxBlockBytes,
    maxBindings: 48,
    explicitBlocks,
    instancing: {
      initialize: available("gs_initInstance"),
      index: available("gs_instanceIndex"),
      block: available("RendererInstanceData"),
      struct: available("gs_Instance"),
      instance: available("gs_instanceBuffer")
    }
  });
}

export function recoverUniforms(
  vertex: string,
  fragment: string,
  blocks: readonly IShaderUniformBlock[],
  maxBlockBytes: number
) {
  const vs = recoverStage(vertex),
    fs = recoverStage(fragment);
  return finalizeShaderUniforms(vs.source, fs.source, vs.sites, fs.sites, {
    maxBlockBytes,
    maxBindings: 48,
    explicitBlocks: blocks.length
  });
}

interface Alias {
  name: string;
  arrayIndex?: number;
}

/** Separate opaque struct leaves and constant-indexed sampler arrays into
 * individual bindings. Keep the public ShaderData property path in reflection. */
export function flattenUniformResources(stages: string[][], fields: readonly IShaderUniformVariable[]) {
  const aliases = new Map<string, Alias>();
  const fieldNames = new Map<string, string>();
  const identifiers = new Set(stages.flat());
  const sources = stages.map((stage) => {
    const decls = declarations(stage);
    const groups = new Map<
      string,
      { fields: Map<string, IShaderUniformVariable>; names: Map<string, string>; declaration: number }
    >();
    const patches = new Map<number, { end: number; text: string }>();
    const constants = new Map<string, ShaderConstant>();
    for (const match of stage
      .join(" ")
      .matchAll(/\bconst\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*=\s*([^;]+)\s*;/g)) {
      const value = shaderConstant(match[1] + "(" + match[3] + ")", (name) => constants.get(name));
      if (value) constants.set(match[2], value);
    }
    let serial = 0;
    for (const decl of decls) {
      if (decl.qualifier !== "uniform") continue;
      const selected = fields.filter(
        (f) =>
          f.name.startsWith(decl.name + ".") ||
          f.name.startsWith(decl.name + "[") ||
          (f.name === decl.name && f.arrayLength > 0 && /sampler/.test(f.type))
      );
      if (!selected.length) continue;
      groups.set(decl.name, {
        fields: new Map(selected.map((f) => [f.name, f])),
        names: new Map(),
        declaration: decl.start
      });
      patches.set(decl.start, { end: decl.end, text: "" });
    }
    if (!groups.size) return stage.join(" ");
    for (let i = 0; i < stage.length; i++) {
      const patch = patches.get(i);
      if (patch) {
        i = patch.end - 1;
        continue;
      }
      const group = groups.get(stage[i]);
      if (!group || stage[i - 1] === ".") continue;
      let path = stage[i],
        end = i + 1;
      let field = group.fields.get(path);
      let index: number | undefined;
      for (; !field || (/sampler/.test(field.type) && field.arrayLength && index === undefined); ) {
        if (stage[end] === ".") {
          path += "." + stage[end + 1];
          end += 2;
          field = group.fields.get(path);
          continue;
        }
        if (stage[end] === "[") {
          const close = matching(stage, end);
          const value = shaderConstant(stage.slice(end + 1, close).join(" "), (name) => constants.get(name))?.values[0];
          if (!Number.isSafeInteger(value))
            throw new Error("Sampler array index must be a constant integral expression: " + path);
          if (field) {
            if (value! < 0 || value! >= field.arrayLength)
              throw new Error("Sampler array index is out of bounds: " + path + "[" + value + "]");
            index = value;
          }
          path += "[" + value + "]";
          field ??= group.fields.get(path);
          end = close + 1;
          continue;
        }
        throw new Error("Expected a selected uniform resource member: " + path);
      }
      let name = group.names.get(path);
      if (!name) {
        name = fieldNames.get(path);
        if (!name) {
          name = "gs_resource_" + serial++;
          for (; identifiers.has(name); ) name = "gs_resource_" + serial++;
          identifiers.add(name);
          fieldNames.set(path, name);
          aliases.set(name, index === undefined ? { name: field.name } : { name: field.name, arrayIndex: index });
        }
        group.names.set(path, name);
        patches.get(group.declaration)!.text +=
          "uniform " +
          field.type +
          " " +
          name +
          (index === undefined && field.arrayLength ? "[" + field.arrayLength + "]" : "") +
          "; ";
      }
      patches.set(i, { end, text: name });
      i = end - 1;
    }
    const result: string[] = [];
    for (let i = 0; i < stage.length; ) {
      const patch = patches.get(i);
      if (patch) {
        result.push(patch.text);
        i = patch.end;
      } else result.push(stage[i++]);
    }
    // Opaque GLSL struct members have been lowered into separate bindings.
    // The remaining type may still be declared and used for its numeric fields.
    return result.join(" ").replace(/\bstruct (\w+) \{([^{}]*)\}/g, (_, name: string, body: string) => {
      const members = body.replace(/(?:\b(?:lowp|mediump|highp)\s+)?\b[iu]?sampler\w*\s+[^;]+;/g, "");
      return "struct " + name + " { " + (members.trim() || "float gs_unused;") + " }";
    });
  });
  return { sources, aliases };
}
