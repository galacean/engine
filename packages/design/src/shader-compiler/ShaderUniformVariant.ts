import type { IShaderUniformBlock, IShaderUniformBlockMember } from "./IShaderProgramSource";
import type { IShaderUniformSelection, IShaderUniformVariable } from "./IShaderUniformPlan";
import { shaderConstant, type ShaderConstant } from "./ShaderConstant";
import { createShaderInstancing, type IShaderInstanceLayout, type IShaderInstancingNames } from "./ShaderInstancing";

/** The selected variant requires GLSL to resolve the extent of an opaque or aggregate array. */
export class UnresolvedUniformArrayLength extends Error {
  constructor(
    readonly uniformName: string,
    readonly uniformType: string,
    readonly expression: string
  ) {
    super(`Cannot determine positive array length '${expression}' for ${uniformType} uniform '${uniformName}'.`);
    this.name = "UnresolvedUniformArrayLength";
  }
}

class InvalidUniformDeclaration extends Error {}

export interface IShaderUniformVariant {
  vertexSource: string;
  fragmentSource: string;
  uniformBlocks: IShaderUniformBlock[];
  looseUniforms: IShaderUniformVariable[];
  instanceLayout?: IShaderInstanceLayout;
  instanceOverflow?: boolean;
}

interface Field extends IShaderUniformVariable {
  precision: string;
}
interface Uniform extends Field {
  selected: IShaderUniformSelection;
}
interface Stage {
  source: string;
  uniforms: Uniform[];
  structs: Map<string, Field[]>;
  patches: Map<IShaderUniformSelection, string>;
  prefix: string;
  suffix: string;
  entries: IShaderUniformSelection[];
}
interface Shape {
  alignment: number;
  size: number;
  members: IShaderUniformBlockMember[];
}

const round = (offset: number, alignment: number): number => Math.ceil(offset / alignment) * alignment;
const numeric = /^(?:(?:[iub]?vec)[234]|mat[234](?:x[234])?|bool|float|int|uint)$/;

/** @internal Only aggregate and opaque bounds require enumerable names or texture units. */
export function needsUniformArrayProof(type: string, text: string): boolean {
  return !numeric.test(type) && text.includes("[");
}

/** Offline format selection. Absence of a proof retains the complete instruction-only pass. */
export function supportsUniformArrayPlan(sites: readonly IShaderUniformSelection[]): boolean {
  const limits =
    /^gl_(?:Max(?:VertexAttribs|VertexUniformVectors|VertexOutputVectors|FragmentInputVectors|VertexTextureImageUnits|CombinedTextureImageUnits|TextureImageUnits|FragmentUniformVectors|DrawBuffers|ProgramTexelOffset)|MinProgramTexelOffset)$/;
  const deviceDependent = sites.some(({ text }) => /\bgl_(?:Min|Max)\w+/.test(text));
  if (deviceDependent) {
    // Both ends of the implementation-defined range suffice for positive,
    // monotone integer expressions. Leave other device arithmetic to GLSL.
    for (const { site, text } of sites) {
      const expressions =
        site.kind === "constant"
          ? [text.split("=")[1]?.replace(/;\s*$/, "")]
          : needsUniformArrayProof(site.type, text)
            ? Array.from(text.matchAll(/\[([^\]]*)\]/g), (match) => match[1])
            : [];
      for (const expression of expressions) {
        if (
          !expression ||
          /[^\w\s(),]/.test(expression) ||
          Array.from(expression.matchAll(/\b(\w+)\s*\(/g)).some((match) => !/^(?:min|max|clamp|int)$/.test(match[1]))
        )
          return false;
      }
    }
  }
  // Bound the descriptor allocation even for a nested array product. Larger
  // shaders can still be published and linked using the historical format.
  const maxExpandedLeaves = 16384;
  for (const bound of deviceDependent ? [1, 0x7fffffff] : [1]) {
    const stage = readStage("", sites, (name) =>
      limits.test(name) ? (name === "gl_MinProgramTexelOffset" ? -bound : bound) : undefined
    );
    if (stage instanceof Error) return false;
    const { structs } = stage;
    const counts = new Map<string, number>();
    function leafCount(field: Field): number {
      const members = structs.get(field.type);
      if (!members) return numeric.test(field.type) || /^[iu]?sampler/.test(field.type) ? 1 : Infinity;
      let count = counts.get(field.type);
      if (count === undefined) {
        counts.set(field.type, Infinity);
        count = members.reduce((total, child) => total + leafCount(child), 0);
        counts.set(field.type, count);
      }
      return count * Math.max(1, field.arrayLength);
    }
    if (stage.uniforms.reduce((total, field) => total + leafCount(field), 0) > maxExpandedLeaves) return false;
  }
  return true;
}

function optionalLength(source: string): [expression: string | undefined, tail: string] | InvalidUniformDeclaration {
  if (!source.startsWith("[")) return [undefined, source];
  let depth = 1;
  for (let i = 1; i < source.length; i++) {
    if (source[i] === "[") depth++;
    if (source[i] === "]" && --depth === 0) return [source.slice(1, i), source.slice(i + 1).trimStart()];
  }
  return new InvalidUniformDeclaration(`Unterminated uniform array declarator '${source}'.`);
}

/** Decode only a single compiler-marked declaration, after its lexical macro environment has been applied. */
function readStage(
  source: string,
  selections: readonly IShaderUniformSelection[],
  deviceConstant?: (name: string) => number | undefined
): Stage | Error {
  const stage: Stage = {
    source,
    uniforms: [],
    structs: new Map(),
    patches: new Map(),
    prefix: "",
    suffix: "",
    entries: []
  };
  const constants = new Map<string, ShaderConstant>();
  const expressions = new Map<string, string>();
  const resolving = new Set<string>();
  function resolveIdentifier(name: string): ShaderConstant | undefined {
    const cached = constants.get(name);
    if (cached) return cached;
    if (resolving.has(name)) return;
    const expression = expressions.get(name);
    let value: ShaderConstant | undefined;
    if (expression) {
      resolving.add(name);
      value = shaderConstant(expression, resolveIdentifier);
      resolving.delete(name);
    } else if (name.startsWith("gl_")) {
      const deviceValue = deviceConstant?.(name);
      if (deviceValue !== undefined) value = { type: "int", values: [deviceValue] };
    }
    if (value) constants.set(name, value);
    return value;
  }
  const defaults = { int: "highp", float: "highp" };
  for (const selected of selections) {
    const { site, text } = selected;
    if (site.kind === "explicitMatrix") continue;
    if (site.kind === "entry") {
      stage.entries.push(selected);
      continue;
    }
    if (site.kind === "precision") {
      const precision = /\bprecision\s+(highp|mediump|lowp)\s+(int|float)\s*;/.exec(text);
      if (precision) defaults[precision[2]] = precision[1];
      continue;
    }
    if (site.kind === "constant") {
      const match = /\bconst\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*=\s*([^;]+)\s*;/.exec(text);
      if (match) expressions.set(match[2], `${match[1]}(${match[3]})`);
      continue;
    }
    // Macro type aliases are deliberately decoded at this point, independent of the
    // source type token recorded by the compiler. Struct declarators may share one type.
    const declaration = /^\s*(?:uniform\s+)?(?:(highp|mediump|lowp)\s+)?([A-Za-z_]\w*)\b\s*([\s\S]*?)\s*;\s*$/.exec(
      text
    );
    if (!declaration) return new InvalidUniformDeclaration(`Cannot reflect selected uniform declaration '${text}'.`);
    const [, qualifier, type, tail] = declaration;
    const typeSpec = optionalLength(tail);
    if (typeSpec instanceof Error) return typeSpec;
    const [typeLength, declarators] = typeSpec;
    for (let remaining = declarators; remaining; ) {
      const match = /^([A-Za-z_]\w*)\s*/.exec(remaining);
      if (!match) return new InvalidUniformDeclaration(`Cannot reflect selected uniform declaration '${text}'.`);
      const variableSpec = optionalLength(remaining.slice(match[0].length));
      if (variableSpec instanceof Error) return variableSpec;
      const [variableLength, rest] = variableSpec;
      if ((typeLength && variableLength) || (rest && !rest.startsWith(",")))
        return new InvalidUniformDeclaration(`Invalid uniform declarator '${text}'.`);
      remaining = rest.slice(1).trimStart();
      const expression = typeLength ?? variableLength;
      const result = expression !== undefined ? shaderConstant(expression, resolveIdentifier)?.values[0] : 0;
      // A numeric uniform array can use its typed glUniform*v upload without
      // knowing the declared upper bound. Opaque/aggregate arrays require names
      // for every element or texture unit, so their size must be concrete.
      const arrayLength =
        expression === undefined ? 0 : result !== undefined && Number.isSafeInteger(result) && result > 0 ? result : -1;
      if (expression !== undefined && arrayLength <= 0 && !numeric.test(type))
        return new UnresolvedUniformArrayLength(match[1], type, expression);
      let precision = qualifier ?? "";
      if (!precision && numeric.test(type) && type !== "bool" && !type.startsWith("bvec")) {
        const category = /^(?:int|uint|ivec|uvec)/.test(type) ? "int" : "float";
        precision = defaults[category];
      }
      const field: Field = { name: match[1], type, precision, arrayLength };
      if (site.kind === "uniform") stage.uniforms.push({ ...field, selected });
      else {
        const members = stage.structs.get(site.structName!);
        if (members) members.push(field);
        else stage.structs.set(site.structName!, [field]);
      }
    }
  }
  return stage;
}

function reflect(
  field: Field,
  structs: Map<string, Field[]>,
  limit: number,
  visiting = new Set<string>()
): Shape | undefined {
  const { name, type, arrayLength } = field;
  if (arrayLength < 0) return;
  if (numeric.test(type)) {
    const matrix = /^mat([234])/.exec(type);
    const components = Number(/vec([234])$/.exec(type)?.[1] ?? 1);
    const size = matrix ? Number(matrix[1]) * 16 : components * 4;
    const arrayStride = arrayLength ? round(size, 16) : 0;
    return {
      alignment: arrayLength || matrix || components >= 3 ? 16 : size,
      size: arrayLength ? arrayStride * arrayLength : size,
      members: [{ name, type, offset: 0, arrayLength, arrayStride, matrixStride: matrix ? 16 : 0 }]
    };
  }
  const fields = structs.get(type);
  if (!fields || visiting.has(type)) return;
  visiting.add(type);
  const leaves: IShaderUniformBlockMember[] = [];
  let end = 0;
  for (const child of fields) {
    const shape = reflect(child, structs, limit, visiting);
    if (!shape) return;
    const offset = round(end, shape.alignment);
    for (const member of shape.members) leaves.push({ ...member, offset: offset + member.offset });
    end = offset + shape.size;
  }
  visiting.delete(type);
  const stride = round(end, 16);
  const size = stride * (arrayLength || 1);
  // Never expand an oversized author-controlled array into thousands of descriptors.
  if (!stride || size > limit) return;
  const members: IShaderUniformBlockMember[] = [];
  for (let i = 0; i < (arrayLength || 1); i++) {
    const root = arrayLength ? `${name}[${i}].` : `${name}.`;
    for (const member of leaves)
      members.push({ ...member, name: root + member.name, offset: i * stride + member.offset });
  }
  return { size, alignment: 16, members };
}

function fieldText(field: Field): string {
  return `${field.precision ? field.precision + " " : ""}${field.type} ${field.name}${field.arrayLength ? `[${field.arrayLength}]` : ""};`;
}

/** Opaque-containing structs retain their GLSL declaration. Walk their compiler-selected
 * members to bind each leaf without querying ACTIVE_UNIFORMS on the graphics driver. */
function reflectLoose(
  field: IShaderUniformVariable,
  structs: Map<string, Field[]>,
  out: Map<string, IShaderUniformVariable>,
  visiting = new Set<string>()
): void {
  const members = structs.get(field.type);
  if (!members) {
    if (!numeric.test(field.type) && !/^[iu]?sampler/.test(field.type))
      throw new Error(`Cannot reflect uniform '${field.name}' of type '${field.type}'.`);
    out.set(field.name, { name: field.name, type: field.type, arrayLength: field.arrayLength });
    return;
  }
  if (visiting.has(field.type)) throw new Error(`Recursive uniform type '${field.type}'.`);
  visiting.add(field.type);
  for (let i = 0; i < (field.arrayLength || 1); i++) {
    const root = field.arrayLength ? `${field.name}[${i}].` : `${field.name}.`;
    for (const member of members) reflectLoose({ ...member, name: root + member.name }, structs, out, visiting);
  }
  visiting.delete(field.type);
}

function assemble(stage: Stage): string {
  const chunks = [stage.prefix];
  let end = 0;
  for (const [selected, replacement] of Array.from(stage.patches).sort(([a], [b]) => a.start - b.start)) {
    chunks.push(stage.source.slice(end, selected.start), replacement);
    end = selected.end;
  }
  chunks.push(stage.source.slice(end), stage.suffix);
  return chunks.join("");
}

/**
 * Link-time specialization of marked ShaderLab declarations. Whole numeric structs stay
 * at their source declaration, after all struct definitions they depend upon.
 */
export function finalizeShaderUniforms(
  vertexSource: string,
  fragmentSource: string,
  vertexSites: readonly IShaderUniformSelection[],
  fragmentSites: readonly IShaderUniformSelection[],
  options: {
    maxBlockBytes: number;
    maxBindings: number;
    maxVertexBlocks?: number;
    maxFragmentBlocks?: number;
    explicitBlocks?: number;
    resolveConstant?: (name: string) => number | undefined;
    instancing?: IShaderInstancingNames;
  }
): IShaderUniformVariant {
  const vertex = readStage(vertexSource, vertexSites, options.resolveConstant);
  if (vertex instanceof Error) throw vertex;
  const fragment = readStage(fragmentSource, fragmentSites, options.resolveConstant);
  if (fragment instanceof Error) throw fragment;
  const stages = [vertex, fragment];
  const { maxBlockBytes, maxBindings } = options;
  const blocks: IShaderUniformBlock[] = [];
  const loose = new Map<string, IShaderUniformVariable>();
  const generated =
    options.instancing && createShaderInstancing(options.instancing, vertex.uniforms, fragment.uniforms, maxBlockBytes);
  if (options.instancing && !generated)
    return { vertexSource, fragmentSource, uniformBlocks: [], looseUniforms: [], instanceOverflow: true };
  if (generated) {
    vertex.prefix = generated.vertexPrefix;
    fragment.prefix = generated.fragmentPrefix;
    vertex.suffix = generated.vertexSuffix;
    fragment.suffix = generated.fragmentSuffix;
    for (const stage of stages) {
      for (const entry of stage.entries)
        stage.patches.set(entry, `${entry.text}\n${options.instancing!.initialize}();`);
    }
  }
  const byName = new Map<string, { stage: Stage; uniform: Uniform }[]>();
  for (const stage of stages) {
    for (const uniform of stage.uniforms) {
      const entries = byName.get(uniform.name);
      if (entries) entries.push({ stage, uniform });
      else byName.set(uniform.name, [{ stage, uniform }]);
    }
  }
  const vertexNames = new Set(vertexSource.match(/[A-Za-z_]\w*/g));
  const fragmentNames = new Set(fragmentSource.match(/[A-Za-z_]\w*/g));
  let nextName = 0;
  interface Page {
    block: IShaderUniformBlock;
    fields: Field[];
    stages: Set<Stage>;
  }
  const openPages = new Map<number, Page>();
  const pages: Page[] = [];
  const reserved = (options.explicitBlocks ?? 0) + (generated ? 1 : 0);
  let vertexBlocks = reserved;
  let fragmentBlocks = reserved;
  function newBlock(mask: number): IShaderUniformBlock {
    let bindingName = `gs_Auto_${nextName++}`;
    for (; vertexNames.has(bindingName) || fragmentNames.has(bindingName); ) bindingName = `gs_Auto_${nextName++}`;
    const block: IShaderUniformBlock = { name: "Auto", bindingName, byteLength: 0, members: [] };
    blocks.push(block);
    if (mask & 1) vertexBlocks++;
    if (mask & 2) fragmentBlocks++;
    return block;
  }
  for (const entries of byName.values()) {
    const { stage, uniform } = entries[0];
    const { name, type, arrayLength } = uniform;
    if (
      entries.some(
        (entry) =>
          entry.uniform.type !== type ||
          entry.uniform.arrayLength !== arrayLength ||
          entry.uniform.precision !== uniform.precision
      )
    ) {
      // Preserve the driver's normal diagnostics for incompatible cross-stage uniforms.
      reflectLoose(uniform, stage.structs, loose);
      continue;
    }
    if (generated?.claimed.has(name)) {
      for (const entry of entries) entry.stage.patches.set(entry.uniform.selected, fieldText(entry.uniform));
      continue;
    }
    const shape = reflect(uniform, stage.structs, maxBlockBytes);
    const struct = stage.structs.has(type);
    const mask = entries.reduce((mask, item) => mask | (item.stage === vertex ? 1 : 2), 0);
    let page = openPages.get(mask);
    let offset = page ? round(page.block.byteLength, shape?.alignment ?? 16) : 0;
    const needsBlock = struct || !page || round(offset + (shape?.size ?? 0), 16) > maxBlockBytes;
    // A single loose array may exceed MAX_UNIFORM_BLOCK_SIZE, or a valid GL struct
    // may contain opaque samplers. Such declarations retain their original bindings.
    const atLimit =
      blocks.length >= Math.max(0, maxBindings - 3) ||
      (mask & 1 && vertexBlocks >= (options.maxVertexBlocks ?? maxBindings)) ||
      (mask & 2 && fragmentBlocks >= (options.maxFragmentBlocks ?? maxBindings));
    if (!shape || round(shape.size, 16) > maxBlockBytes || (needsBlock && atLimit)) {
      reflectLoose(uniform, stage.structs, loose);
      continue;
    }
    if (struct) {
      const block = newBlock(mask);
      block.members = shape.members;
      block.byteLength = shape.size;
      const text = `layout(std140) uniform ${block.bindingName} { ${fieldText(uniform)} };`;
      for (const entry of entries) entry.stage.patches.set(entry.uniform.selected, text);
    } else {
      if (needsBlock) {
        page = { block: newBlock(mask), fields: [], stages: new Set() };
        pages.push(page);
        openPages.set(mask, page);
        offset = 0;
      }
      const block = page!.block;
      block.members.push({ ...shape.members[0], offset });
      block.byteLength = offset + shape.size;
      page!.fields.push(uniform);
      for (const entry of entries) {
        page!.stages.add(entry.stage);
        entry.stage.patches.set(entry.uniform.selected, "");
      }
    }
  }
  // Two private numeric blocks can share one upload and range binding when neither
  // introduces an identifier already used by the other stage. Each stage keeps the
  // same number of blocks. Starting the second layout at a 16-byte boundary
  // preserves each member's std140 alignment, including vec3/scalar packing.
  for (const page of pages) {
    if (page.stages.size !== 1 || !page.stages.has(vertex) || page.fields.some((f) => fragmentNames.has(f.name)))
      continue;
    const offset = page.block.byteLength;
    // GLSL must place the second layout exactly at this boundary.
    if (offset % 16 !== 0) continue;
    const other = pages.find(
      (p) =>
        p.stages.size === 1 &&
        p.stages.has(fragment) &&
        offset + round(p.block.byteLength, 16) <= maxBlockBytes &&
        !p.fields.some((f) => vertexNames.has(f.name))
    );
    if (!other) continue;
    page.fields.push(...other.fields);
    for (const member of other.block.members) page.block.members.push({ ...member, offset: offset + member.offset });
    page.block.byteLength = offset + other.block.byteLength;
    page.stages.add(fragment);
    other.stages.clear();
    blocks.splice(blocks.indexOf(other.block), 1);
  }
  for (const { block, fields, stages } of pages) {
    if (!stages.size) continue;
    block.byteLength = round(block.byteLength, 16);
    const text = `layout(std140) uniform ${block.bindingName} {\n${fields.map(fieldText).join("\n")}\n};\n`;
    for (const stage of stages) stage.prefix += text;
  }
  return {
    vertexSource: assemble(vertex),
    fragmentSource: assemble(fragment),
    uniformBlocks: blocks,
    looseUniforms: Array.from(loose.values()),
    instanceLayout: generated?.layout
  };
}
