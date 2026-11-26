/**
 * Converts a recovered building GLSL ES 3.00 `(vertex, fragment)` shader pair
 * (already lowered through `engineShaderSource`) into standard `dev/2.0` ShaderLab
 * source so it compiles cleanly to BOTH GLSL ES 3.00 (`GLES300Visitor`) and WGSL
 * (`WGSLVisitor`) through the single `@galacean/engine-shader-parser` AST.
 *
 * Conversions performed:
 * - Replaces SPIR-V single-shot `do { ... } while(false);` blocks with `for (int _gs_once_N = 0; _gs_once_N < 1; _gs_once_N++) { ... }`
 * - Rewrites global `const T arr[N] = T[](...)` into ShaderLab `const T[N] arr = T[N](...)`
 * - Zero-initializes mutable global scratch variables (`isStatic = true`) so ShaderLab does not treat them as uniforms
 * - Hoists vertex `in` attributes into `struct Attributes` and stage `in`/`out` varyings into `struct Varyings`
 *   (splitting `flat mat3` varyings into three `flat vec3` fields)
 * - Maps fragment color `out vec4` directly to `gl_FragColor`
 * - Deduplicates shared `uniform` declarations across both stages
 * - Prefixes stage-private structs, globals, and functions (`vs_` / `fs_`) to avoid collisions inside one ShaderLab Pass
 */

export interface BuildingShaderLabOptions {
  /** Include `"Masonry/SceneLighting.glsl"` when fragment references scene lighting helpers. */
  includeSceneLighting?: boolean;
}

interface ParsedIO {
  name: string;
  type: string;
  flat: boolean;
  centroid: boolean;
  location?: number;
}

interface ParsedUniform {
  name: string;
  type: string;
  arraySuffix: string;
}

interface StructDef {
  name: string;
  fields: Array<{ type: string; name: string; arrayLen?: number }>;
}

const BUILTIN_IDENTS = new Set([
  "gl_Position",
  "gl_VertexID",
  "gl_InstanceID",
  "gl_PointSize",
  "gl_FragCoord",
  "gl_FrontFacing",
  "gl_PointCoord",
  "gl_FragDepth",
  "gl_FragColor",
  "gl_FragData",
  "masonryResidentSceneLight",
  "masonrySceneFog",
  "masonryFarProxyLight"
]);

/** Replace `do { ... } while (false);` with standard `dev/2.0` `for` loop. */
export function replaceDoWhileFalse(source: string): string {
  let out = source;
  let counter = 0;
  let searchFrom = 0;
  while (true) {
    const match = /\bdo\s*\{/.exec(out.slice(searchFrom));
    if (!match) break;
    const doStart = searchFrom + match.index;
    const braceOpen = doStart + match[0].length - 1;
    let depth = 1;
    let i = braceOpen + 1;
    for (; i < out.length && depth > 0; i++) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}") depth--;
    }
    if (depth !== 0) throw new Error("Unclosed `do { ... }` block in building shader.");
    const braceClose = i - 1;
    const tail = out.slice(braceClose + 1);
    const whileMatch = /^\s*while\s*\(\s*(?:false|0)\s*\)\s*;/.exec(tail);
    if (!whileMatch) {
      throw new Error(`Unsupported \`do { ... } while(...)\` condition: ${tail.slice(0, 40)}`);
    }
    const loopVar = `_gs_once_${counter++}`;
    const body = out.slice(braceOpen, braceClose + 1);
    const replacement = `for (int ${loopVar} = 0; ${loopVar} < 1; ${loopVar}++) ${body}`;
    out = out.slice(0, doStart) + replacement + out.slice(braceClose + 1 + whileMatch[0].length);
    searchFrom = doStart + replacement.length - body.length;
  }
  return out;
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 1;
  for (let i = openIdx + 1; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function zeroExprForType(type: string, structs: ReadonlyMap<string, StructDef>, arrayLen?: number): string {
  if (arrayLen !== undefined) {
    const elem = zeroExprForType(type, structs);
    return `${type}[${arrayLen}](${Array.from({ length: arrayLen }, () => elem).join(", ")})`;
  }
  switch (type) {
    case "float":
      return "0.0";
    case "int":
      return "0";
    case "uint":
      return "0u";
    case "bool":
      return "false";
    case "vec2":
    case "vec3":
    case "vec4":
      return `${type}(0.0)`;
    case "ivec2":
    case "ivec3":
    case "ivec4":
      return `${type}(0)`;
    case "uvec2":
    case "uvec3":
    case "uvec4":
      return `${type}(0u)`;
    case "bvec2":
    case "bvec3":
    case "bvec4":
      return `${type}(false)`;
    case "mat2":
    case "mat3":
    case "mat4":
    case "mat2x2":
    case "mat2x3":
    case "mat2x4":
    case "mat3x2":
    case "mat3x3":
    case "mat3x4":
    case "mat4x2":
    case "mat4x3":
    case "mat4x4":
      return `${type}(0.0)`;
  }
  const s = structs.get(type);
  if (s) {
    return `${type}(${s.fields.map((f) => zeroExprForType(f.type, structs, f.arrayLen)).join(", ")})`;
  }
  return `${type}(0.0)`;
}

/** Rename identifiers only outside preprocessor directives and comments, and never after `.`. */
function renameIdentifiers(src: string, renameMap: ReadonlyMap<string, string>): string {
  if (!renameMap.size) return src;
  return src
    .split("\n")
    .map((line) => {
      if (/^\s*#/.test(line)) {
        const def = /^(\s*#\s*define\s+\w+\s+)(.+)$/.exec(line);
        if (!def) return line;
        return def[1] + renameExprTokens(def[2], renameMap);
      }
      return renameExprTokens(line, renameMap);
    })
    .join("\n");
}

function renameExprTokens(text: string, renameMap: ReadonlyMap<string, string>): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "/" && text[i + 1] === "/") {
      out += text.slice(i);
      break;
    }
    if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const close = end < 0 ? text.length : end + 2;
      out += text.slice(i, close);
      i = close;
      continue;
    }
    const ch = text[i];
    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_") {
      const prevChar = i > 0 ? text[i - 1] : "";
      let j = i + 1;
      while (j < text.length && /\w/.test(text[j])) j++;
      const word = text.slice(i, j);
      if (prevChar !== "." && renameMap.has(word)) {
        out += renameMap.get(word)!;
      } else {
        out += word;
      }
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

interface StrippedStage {
  body: string;
  ins: ParsedIO[];
  outs: ParsedIO[];
  uniforms: ParsedUniform[];
  structs: Map<string, StructDef>;
  localFnNames: Set<string>;
  localGlobalDecls: Array<{ name: string; type: string; arrayLen?: number; hasInit: boolean }>;
  defineAliases: Map<string, string>;
}

function stripAndScanStage(raw: string): StrippedStage {
  let src = replaceDoWhileFalse(raw).replace(/\bfor\s*\(\s*;\s*;\s*\)/g, "for (; true; )");
  src = src
    .replace(/^[ \t]*#version[^\n]*\n?/gm, "")
    .replace(/^[ \t]*precision\s+(?:highp|mediump|lowp)\s+\w+\s*;\s*\n?/gm, "");

  // Normalize global `const T name[N] = T[](...)` or `const T name[N] = T[N](...)`
  // into ShaderLab `const T[N] name = T[N](...)`
  src = src.replace(
    /^([ \t]*const\s+(?:(?:highp|mediump|lowp)\s+)?)([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]\s*=\s*([A-Za-z_]\w*)\s*\[\s*(\d*)\s*\]\s*\(/gm,
    (_, prefix: string, type: string, name: string, count: string, ctorType: string) =>
      `${prefix}${type}[${count}] ${name} = ${ctorType}[${count}](`
  );

  const ins: ParsedIO[] = [];
  const outs: ParsedIO[] = [];
  const uniforms: ParsedUniform[] = [];
  const defineAliases = new Map<string, string>();

  src = src.replace(
    /^[ \t]*#define[ \t]+([A-Za-z_]\w*)[ \t]+((?:u?int)\([A-Za-z_]\w*\))[ \t]*\n?/gm,
    (_, alias: string, expr: string) => {
      defineAliases.set(alias, expr);
      return "";
    }
  );

  // Split multiple top-level `in`/`out`/`uniform` declarations packed on a single line
  // (e.g. `flat out float a; flat out vec3 b;` injected by entrance shader patches).
  src = src.replace(/;\s*(?=(?:layout\s*\(|(?:flat|smooth|centroid|invariant)\s+)*(?:in|out|uniform)\b)/g, ";\n");

  src = src.replace(
    /^[ \t]*(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?((?:(?:flat|smooth|centroid|invariant)\s+)*)(in|out)\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*;/gm,
    (_, locStr: string | undefined, quals: string, dir: string, type: string, name: string) => {
      const entry: ParsedIO = {
        name,
        type,
        flat: /\bflat\b/.test(quals),
        centroid: /\bcentroid\b/.test(quals),
        location: locStr !== undefined ? Number(locStr) : undefined
      };
      if (dir === "in") ins.push(entry);
      else outs.push(entry);
      return "";
    }
  );

  src = src.replace(
    /^[ \t]*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([^;]+);/gm,
    (_, type: string, declList: string) => {
      for (const part of declList.split(",")) {
        const m = /^\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*$/.exec(part);
        if (m) {
          uniforms.push({ name: m[1], type, arraySuffix: m[2] ?? "" });
        }
      }
      return "";
    }
  );

  const structs = new Map<string, StructDef>();
  const localFnNames = new Set<string>();
  const localGlobalDecls: StrippedStage["localGlobalDecls"] = [];

  // Walk top-level statements at brace depth 0 and rewrite uninitialized mutable globals to zero-initialized static globals
  const outChunks: string[] = [];
  let cursor = 0;
  let i = 0;
  let stmtStart = 0;
  let depth = 0;
  const len = src.length;

  while (i < len) {
    if (depth === 0 && (i === 0 || src[i - 1] === "\n")) {
      let k = i;
      while (k < len && (src[k] === " " || src[k] === "\t")) k++;
      if (src[k] === "#") {
        const nl = src.indexOf("\n", k);
        i = nl < 0 ? len : nl + 1;
        stmtStart = i;
        continue;
      }
    }
    if (src[i] === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i + 2);
      i = nl < 0 ? len : nl + 1;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? len : end + 2;
      continue;
    }
    if (src[i] === "{") {
      if (depth === 0) {
        const header = src.slice(stmtStart, i).trim();
        const close = findMatchingBrace(src, i);
        if (close < 0) break;
        const structM = /^struct\s+([A-Za-z_]\w*)$/.exec(header);
        if (structM) {
          const sName = structM[1];
          const sBody = src.slice(i + 1, close);
          const fields: StructDef["fields"] = [];
          for (const part of sBody.split(";")) {
            const fm =
              /^\s*(?:(?:highp|mediump|lowp)\s+)?([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(?:\s*\[\s*(\d+)\s*\])?\s*$/.exec(
                part.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
              );
            if (fm) {
              fields.push({ type: fm[1], name: fm[2], arrayLen: fm[3] ? Number(fm[3]) : undefined });
            }
          }
          structs.set(sName, { name: sName, fields });
        } else {
          const fnM = /([A-Za-z_]\w*)\s*\([^)]*\)\s*$/.exec(header);
          if (fnM && !["if", "for", "while", "switch"].includes(fnM[1])) {
            localFnNames.add(fnM[1]);
          }
        }
        i = close + 1;
        if (structM) {
          while (i < len && /\s/.test(src[i])) i++;
          if (src[i] === ";") i++;
        }
        stmtStart = i;
        continue;
      }
      depth++;
    } else if (src[i] === "}") {
      depth = Math.max(0, depth - 1);
    } else if (src[i] === ";" && depth === 0) {
      const rawStmt = src.slice(stmtStart, i);
      const stmt = rawStmt.trim();
      if (stmt && !stmt.startsWith("struct ")) {
        const isProto = /\)\s*$/.test(stmt) && !stmt.includes("=");
        if (!isProto) {
          const hasInit = stmt.includes("=");
          const cleaned = stmt.replace(/^(?:const\s+)?(?:(?:highp|mediump|lowp)\s+)?/, "");
          const varM = /^([A-Za-z_]\w*)(?:\s*\[\s*(\d+)\s*\])?\s+([A-Za-z_]\w*)(?:\s*\[\s*(\d+)\s*\])?/.exec(cleaned);
          if (varM) {
            const type = varM[1];
            const name = varM[3];
            const arrayLen = varM[2] ? Number(varM[2]) : varM[4] ? Number(varM[4]) : undefined;
            localGlobalDecls.push({ name, type, arrayLen, hasInit });
            if (!hasInit) {
              // Add constant zero-initializer so ShaderLab marks this global `isStatic = true` (writable scratch global)
              const zero = zeroExprForType(type, structs, arrayLen);
              const typeDecl = arrayLen !== undefined ? `${type}[${arrayLen}]` : type;
              outChunks.push(src.slice(cursor, stmtStart), `\n${typeDecl} ${name} = ${zero};`);
              cursor = i + 1;
            }
          }
        }
      }
      stmtStart = i + 1;
    }
    i++;
  }
  outChunks.push(src.slice(cursor));

  return {
    body: outChunks.join(""),
    ins,
    outs,
    uniforms,
    structs,
    localFnNames,
    localGlobalDecls,
    defineAliases
  };
}

export function buildingGLSLToShaderLab(
  shaderName: string,
  vertexGLSL: string,
  fragmentGLSL: string,
  options: BuildingShaderLabOptions = {}
): string {
  const vs = stripAndScanStage(vertexGLSL);
  const fs = stripAndScanStage(fragmentGLSL);

  const needsSceneLighting =
    options.includeSceneLighting ??
    (/\bmasonryResidentSceneLight\b|\bmasonrySceneFog\b/.test(fragmentGLSL) ||
      /\bmasonryResidentSceneLight\b|\bmasonrySceneFog\b/.test(vertexGLSL));

  // Uniforms already declared by `#include "Masonry/SceneLighting.glsl"` (Camera, Scene, Transform)
  const builtinLightingUniforms = new Set(
    needsSceneLighting
      ? [
          "camera_Position",
          "camera_ViewMat",
          "camera_ProjMat",
          "camera_VPMat",
          "camera_Forward",
          "camera_ProjectionParams",
          "scene_FogColor",
          "scene_FogParams",
          "renderer_ModelMat",
          "renderer_NormalMat",
          "renderer_MVPMat",
          "renderer_MVMat",
          "renderer_Layer"
        ]
      : []
  );

  const uniformMap = new Map<string, ParsedUniform>();
  for (const u of [...vs.uniforms, ...fs.uniforms]) {
    if (builtinLightingUniforms.has(u.name)) continue;
    if (!uniformMap.has(u.name)) uniformMap.set(u.name, u);
  }
  if (!needsSceneLighting && /\brenderer_MVPMat\b/.test(vertexGLSL) && !uniformMap.has("renderer_MVPMat")) {
    uniformMap.set("renderer_MVPMat", { name: "renderer_MVPMat", type: "mat4", arraySuffix: "" });
  }
  if (!needsSceneLighting && /\bcamera_Position\b/.test(fragmentGLSL) && !uniformMap.has("camera_Position")) {
    uniformMap.set("camera_Position", { name: "camera_Position", type: "vec3", arraySuffix: "" });
  }

  const sortedAttrs = vs.ins.slice().sort((a, b) => (a.location ?? 999) - (b.location ?? 999));

  // Inter-stage varyings (`struct Varyings`) — union of VS outs and FS ins, splitting `flat mat3` into 3 `flat vec3`
  const varyingMap = new Map<string, ParsedIO>();
  for (const v of [...vs.outs, ...fs.ins]) {
    const existing = varyingMap.get(v.name);
    if (!existing) varyingMap.set(v.name, { ...v });
    else {
      existing.flat = existing.flat || v.flat;
      existing.centroid = existing.centroid || v.centroid;
    }
  }
  const matVaryings: Array<{ name: string; cols: number; localVs: string; localFs: string }> = [];
  const varyingFields: string[] = [];
  for (const v of varyingMap.values()) {
    const matM = /^mat([234])$/.exec(v.type);
    if (matM) {
      const cols = Number(matM[1]);
      matVaryings.push({ name: v.name, cols, localVs: `vs_${v.name}`, localFs: `fs_${v.name}` });
      for (let c = 0; c < cols; c++) {
        varyingFields.push(`  ${v.flat ? "flat " : ""}vec${cols} ${v.name}_col${c};`);
      }
    } else {
      const isInt = /^(?:int|uint|[iu]vec[234])$/.test(v.type);
      const flat = v.flat || isInt ? "flat " : "";
      const centroid = !flat && v.centroid ? "centroid " : "";
      varyingFields.push(`  ${flat}${centroid}${v.type} ${v.name};`);
    }
  }

  // Scratch static variables for every varying output in VS (zero-initialized -> writable in any VS helper,
  // copied into local `Varyings _gs_vout` inside `vert()`)
  const vsVaryingScratch: Array<{ name: string; type: string; scratch: string }> = [];
  for (const v of varyingMap.values()) {
    if (matVaryings.some((m) => m.name === v.name)) continue;
    vsVaryingScratch.push({ name: v.name, type: v.type, scratch: `vs_out_${v.name}` });
  }

  const fragOutName = fs.outs[0]?.name;

  // Build VS rename map
  const vsRename = new Map<string, string>();
  for (const name of vs.structs.keys()) if (!BUILTIN_IDENTS.has(name)) vsRename.set(name, `vs_${name}`);
  for (const name of vs.localFnNames) if (!BUILTIN_IDENTS.has(name)) vsRename.set(name, `vs_${name}`);
  for (const g of vs.localGlobalDecls) {
    if (!BUILTIN_IDENTS.has(g.name) && !uniformMap.has(g.name)) vsRename.set(g.name, `vs_${g.name}`);
  }
  for (const a of sortedAttrs) {
    vsRename.set(a.name, `gs_attr.${a.name}`);
  }
  for (const [alias, expr] of vs.defineAliases) {
    const expanded = renameExprTokens(expr, vsRename);
    vsRename.set(alias, `(${expanded})`);
  }
  for (const v of varyingMap.values()) {
    const mat = matVaryings.find((m) => m.name === v.name);
    if (mat) vsRename.set(v.name, mat.localVs);
    else vsRename.set(v.name, `vs_out_${v.name}`);
  }

  // Build FS rename map
  const fsRename = new Map<string, string>();
  for (const name of fs.structs.keys()) if (!BUILTIN_IDENTS.has(name)) fsRename.set(name, `fs_${name}`);
  for (const name of fs.localFnNames) if (!BUILTIN_IDENTS.has(name)) fsRename.set(name, `fs_${name}`);
  for (const g of fs.localGlobalDecls) {
    if (!BUILTIN_IDENTS.has(g.name) && !uniformMap.has(g.name)) fsRename.set(g.name, `fs_${g.name}`);
  }
  for (const v of varyingMap.values()) {
    const mat = matVaryings.find((m) => m.name === v.name);
    if (mat) fsRename.set(v.name, mat.localFs);
    else fsRename.set(v.name, `gs_vin.${v.name}`);
  }
  if (fragOutName) {
    fsRename.set(fragOutName, "gl_FragColor");
  }

  const vsBody = renameIdentifiers(vs.body, vsRename).trim();
  const fsBody = renameIdentifiers(fs.body, fsRename).trim();

  const sections: string[] = [];
  sections.push(`Shader "${shaderName}" {`);
  sections.push(`  SubShader "Default" {`);
  sections.push(`    Pass "Forward" {`);
  sections.push(`      VertexShader = vert;`);
  sections.push(`      FragmentShader = frag;`);
  if (needsSceneLighting) {
    sections.push(`      #include "Masonry/SceneLighting.glsl"`);
  }
  sections.push("");

  for (const u of uniformMap.values()) {
    sections.push(`      ${u.type} ${u.name}${u.arraySuffix};`);
  }
  sections.push("");

  if (sortedAttrs.length) {
    sections.push("      struct BuildingAttributes {");
    for (const a of sortedAttrs) {
      sections.push(`        ${a.type} ${a.name};`);
    }
    sections.push("      };");
    sections.push("      BuildingAttributes gs_attr;");
    sections.push("");
  }
  if (varyingFields.length) {
    sections.push("      struct BuildingVaryings {");
    for (const f of varyingFields) sections.push(`      ${f}`);
    sections.push("      };");
    sections.push("      BuildingVaryings gs_vin;");
    sections.push("");
  }

  // Zero-initialized static scratch globals for vertex varying writes
  for (const s of vsVaryingScratch) {
    sections.push(`      ${s.type} ${s.scratch} = ${zeroExprForType(s.type, new Map())};`);
  }
  for (const m of matVaryings) {
    sections.push(`      mat${m.cols} ${m.localVs} = mat${m.cols}(0.0);`);
    sections.push(`      mat${m.cols} ${m.localFs} = mat${m.cols}(0.0);`);
  }

  // Vertex stage body + entry (BuildingAttributes read via global `gs_attr`; BuildingVaryings returned as local `_gs_vout`)
  sections.push("      // --- Vertex Stage ---");
  sections.push(vsBody);
  sections.push("");
  const vertSig = varyingFields.length ? "BuildingVaryings vert()" : "void vert()";
  sections.push(`      ${vertSig} {`);
  sections.push("        vs_main();");
  if (varyingFields.length) {
    sections.push("        BuildingVaryings _gs_vout;");
    for (const s of vsVaryingScratch) {
      sections.push(`        _gs_vout.${s.name} = ${s.scratch};`);
    }
    for (const m of matVaryings) {
      for (let c = 0; c < m.cols; c++) {
        sections.push(`        _gs_vout.${m.name}_col${c} = ${m.localVs}[${c}];`);
      }
    }
    sections.push("        return _gs_vout;");
  }
  sections.push("      }");
  sections.push("");

  // Fragment stage body + entry (Varyings read via global `gs_vin`)
  sections.push("      // --- Fragment Stage ---");
  sections.push(fsBody);
  sections.push("");
  sections.push("      void frag() {");
  for (const m of matVaryings) {
    for (let c = 0; c < m.cols; c++) {
      sections.push(`        ${m.localFs}[${c}] = gs_vin.${m.name}_col${c};`);
    }
  }
  sections.push("        fs_main();");
  sections.push("      }");

  sections.push("    }");
  sections.push("  }");
  sections.push("}");

  return sections.join("\n") + "\n";
}
