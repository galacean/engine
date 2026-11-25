/**
 * Optimize SPIR-V-lowered SSBO texture / instance-attribute struct readers in
 * recovered Masonry GLSL ES 3.00 shaders.
 *
 * The raw `.shaderc` assets lower every `ssbo[idx].field` access into a call to
 * `read_<buf>(int(idx)).field`, where `read_<buf>` fetches every 32-bit word of
 * the struct individually (`12–32` separate `texelFetch` + `textureSize` + div/mod
 * calls, or `16` 4-way dynamic-modulo ternary trees for `instanceWords0..3` /
 * `instanceRecord0..3`). Across `original_main()`, the same immutable index is
 * read `8–46` times per invocation (`256–1,440` word ops per shader!), causing
 * severe compile-time blowups on mobile GLSL compilers (e.g. Adreno QGLC taking
 * `1,136 ms` on `roof.shaderc`) and wasted GPU texture fetches.
 *
 * This pass performs two 100% bit-exact, behavior-preserving rewrites:
 * 1. Pack 4-word `uvec4` loads inside every `read_*` function (`stride % 4 == 0`)
 *    and replace `instanceWords0..3`/`instanceRecord0..3` modulo ternaries with
 *    direct component swizzles (`instanceRecord0.x`, ...).
 * 2. Hoist repeated `read_*` calls over immutable stage inputs and SSA locals
 *    inside `original_main()` (iterating to a fixed point so chained indirections
 *    like `read_data(int(read_indirection(int(_54))))` and
 *    `read_roof_colors_ids_1(int(es_h0.wall_slot_id))` are each fetched once).
 */

interface WordReaderInfo {
  readonly kind: "instance" | "texture";
  readonly name: string;
  readonly fullMatch: string;
  readonly prefix?: string; // "instanceWords" | "instanceRecord"
  readonly sampler?: string; // "storage_X_Y"
}

interface StructReaderInfo {
  readonly name: string;
  readonly returnType: string;
  readonly pureInstance: boolean;
}

const LANES = "xyzw";

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLinearWordOffset(expr: string): { stride: number; offset: number } | null {
  let s = expr.trim();
  let offset = 0;
  while (true) {
    while (s.startsWith("(") && s.endsWith(")")) {
      let depth = 0;
      let wraps = true;
      for (let k = 0; k < s.length - 1; k++) {
        if (s[k] === "(") depth++;
        else if (s[k] === ")") depth--;
        if (depth === 0) {
          wraps = false;
          break;
        }
      }
      if (!wraps) break;
      s = s.slice(1, -1).trim();
    }
    const plusMatch = /^(.*)\+\s*(\d+)$/.exec(s);
    if (plusMatch) {
      offset += Number(plusMatch[2]!);
      s = plusMatch[1]!.trim();
      continue;
    }
    const mulMatch = /^i\s*\*\s*(\d+)$/.exec(s);
    if (mulMatch) {
      return { stride: Number(mulMatch[1]!), offset };
    }
    return null;
  }
}

/** Replace every `wordName(<balanced arg>)` call inside `body` using `transform(arg)`. */
function replaceWordCalls(
  body: string,
  wordName: string,
  transform: (arg: string) => string | null
): { text: string; matched: number; total: number } {
  const re = new RegExp(`\\b${escapeRegExp(wordName)}\\(`, "g");
  let out = "";
  let cursor = 0;
  let matched = 0;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    total++;
    const argStart = m.index + m[0].length;
    let depth = 1;
    let pos = argStart;
    while (pos < body.length && depth > 0) {
      const ch = body[pos]!;
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      pos++;
    }
    if (depth !== 0) return { text: body, matched: 0, total };
    const arg = body.slice(argStart, pos - 1);
    const replacement = transform(arg);
    if (replacement === null) return { text: body, matched: 0, total };
    out += body.slice(cursor, m.index) + replacement;
    cursor = pos;
    re.lastIndex = pos;
    matched++;
  }
  out += body.slice(cursor);
  return { text: out, matched, total };
}

function packStorageReaders(source: string): { source: string; readers: Map<string, StructReaderInfo> } {
  const wordReaders = new Map<string, WordReaderInfo>();

  // Pattern A: instance attribute words packed into instanceWords0..3 or instanceRecord0..3.
  const instWordRe =
    /uint\s+(word_\w+)\(int\s+p\)\{int\s+q=p%16;return\s+q<4\?(instance(?:Words|Record))0\[q%4\]:q<8\?(?:\2)1\[q%4\]:q<12\?(?:\2)2\[q%4\]:(?:\2)3\[q%4\];\}/g;
  for (const m of source.matchAll(instWordRe)) {
    wordReaders.set(m[1]!, {
      kind: "instance",
      name: m[1]!,
      fullMatch: m[0]!,
      prefix: m[2]!
    });
  }

  // Pattern B: usampler2D SSBO backing texture.
  const texWordRe =
    /uint\s+(word_\w+)\(int\s+p\)\{ivec2\s+sz=textureSize\((\w+),0\);return\s+texelFetch\(\2,ivec2\(\(p\/4\)%sz\.x,\(p\/4\)\/sz\.x\),0\)\[p%4\];\}/g;
  for (const m of source.matchAll(texWordRe)) {
    wordReaders.set(m[1]!, {
      kind: "texture",
      name: m[1]!,
      fullMatch: m[0]!,
      sampler: m[2]!
    });
  }

  const readers = new Map<string, StructReaderInfo>();
  const readFnRe = /\b(\w+)\s+(read_\w+)\(int\s+i\)\{return\s+([^;{}]+);\}/g;

  let out = source.replace(readFnRe, (full, returnType: string, readName: string, body: string) => {
    const suffix = readName.slice("read_".length);
    const wordName = "word_" + suffix;
    const wordInfo = wordReaders.get(wordName);
    if (!wordInfo) {
      readers.set(readName, { name: readName, returnType, pureInstance: false });
      return full;
    }

    if (wordInfo.kind === "instance" && wordInfo.prefix) {
      const res = replaceWordCalls(body, wordName, (arg) => {
        const parsed = parseLinearWordOffset(arg);
        if (!parsed || parsed.stride !== 16 || parsed.offset < 0 || parsed.offset >= 16) return null;
        return `${wordInfo.prefix}${parsed.offset >> 2}.${LANES[parsed.offset & 3]}`;
      });
      if (res.total > 0 && res.matched === res.total) {
        readers.set(readName, { name: readName, returnType, pureInstance: true });
        return `${returnType} ${readName}(int i){return ${res.text};}`;
      }
      readers.set(readName, { name: readName, returnType, pureInstance: false });
      return full;
    }

    if (wordInfo.kind === "texture" && wordInfo.sampler) {
      let stride: number | undefined;
      const texels = new Set<number>();
      const res = replaceWordCalls(body, wordName, (arg) => {
        const parsed = parseLinearWordOffset(arg);
        if (!parsed) return null;
        if (stride === undefined) stride = parsed.stride;
        if (parsed.stride !== stride || parsed.stride < 4 || parsed.stride % 4 !== 0) return null;
        if (parsed.offset < 0 || parsed.offset >= parsed.stride) return null;
        const texel = parsed.offset >> 2;
        texels.add(texel);
        return `es_t${texel}.${LANES[parsed.offset & 3]}`;
      });
      if (res.total > 0 && res.matched === res.total && stride !== undefined && texels.size > 0) {
        const texelsPerElem = stride >> 2;
        const fetches = [...texels]
          .sort((a, b) => a - b)
          .map((t) => {
            const idx = t === 0 ? "es_b" : `(es_b+${t})`;
            return `uvec4 es_t${t}=texelFetch(${wordInfo.sampler},ivec2(${idx}%es_s.x,${idx}/es_s.x),0);`;
          })
          .join("");
        const baseDecl = texelsPerElem === 1 ? "int es_b=i;" : `int es_b=i*${texelsPerElem};`;
        readers.set(readName, { name: readName, returnType, pureInstance: false });
        return `${returnType} ${readName}(int i){ivec2 es_s=textureSize(${wordInfo.sampler},0);${baseDecl}${fetches}return ${res.text};}`;
      }
    }

    readers.set(readName, { name: readName, returnType, pureInstance: false });
    return full;
  });

  // Remove word_* helpers that are no longer referenced anywhere after packing.
  for (const info of wordReaders.values()) {
    const withoutDecl = out.replace(info.fullMatch, "");
    if (!new RegExp(`\\b${escapeRegExp(info.name)}\\b`).test(withoutDecl)) {
      out = withoutDecl;
    }
  }

  return { source: out, readers };
}

function isVariableMutated(scope: string, varName: string, declStart: number, declEnd: number): boolean {
  const withoutDecl = scope.slice(0, declStart) + " ".repeat(Math.max(0, declEnd - declStart)) + scope.slice(declEnd);
  const esc = escapeRegExp(varName);
  // Check assignment operators (but not == or !=), prefix/postfix ++/-- on the variable or any member/index path.
  const assignRe = new RegExp(`\\b${esc}\\b(?:\\.\\w+|\\[[^\\]]*\\])*\\s*(?:=(?!=)|[+\\-*/%&|^]=|<<=|>>=|\\+\\+|--)`);
  const preIncRe = new RegExp(`(?:\\+\\+|--)\\s*${esc}\\b(?:\\.\\w+|\\[[^\\]]*\\])*`);
  return assignRe.test(withoutDecl) || preIncRe.test(withoutDecl);
}

/** Find the start of the top-level (depth-0) statement inside `block` containing `offset`,
 * ignoring `;` inside parenthesized headers such as `for (init; cond; step)`. */
function findDepthZeroStatementStart(block: string, offset: number): number {
  let braceDepth = 0;
  let parenDepth = 0;
  let lastBoundary = 0;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < offset; i++) {
    const ch = block[i]!;
    const next = block[i + 1];
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "{") braceDepth++;
    else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0 && parenDepth === 0) lastBoundary = i + 1;
    } else if (ch === ";" && braceDepth === 0 && parenDepth === 0) {
      lastBoundary = i + 1;
    }
  }
  return lastBoundary;
}

/** Compute brace and parenthesis nesting depth at `offset` relative to the start of `block`, skipping comments. */
function nestingDepthAt(block: string, offset: number): { braceDepth: number; parenDepth: number } {
  let braceDepth = 0;
  let parenDepth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < offset; i++) {
    const ch = block[i]!;
    const next = block[i + 1];
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
  }
  return { braceDepth, parenDepth };
}

/** Find the index of the immediately enclosing `{` before `targetOffset`, skipping comments. */
function findEnclosingBlockOpen(source: string, targetOffset: number): number {
  const stack: number[] = [];
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < targetOffset; i++) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "{") stack.push(i);
    else if (ch === "}") stack.pop();
  }
  return stack.length > 0 ? stack[stack.length - 1]! : -1;
}

/** Check whether `firstPos` is unconditionally evaluated when execution reaches the statement at `stmtStart`. */
function isUnconditionalInStatement(block: string, stmtStart: number, firstPos: number): boolean {
  const prefix = block
    .slice(stmtStart, firstPos)
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
    .trimStart();
  if (/^(?:else|for|while)\b/.test(prefix)) return false;
  if (/(?:&&|\|\||\?)/.test(prefix)) return false;
  if (/^if\s*\(/.test(prefix)) {
    // Safe only while still inside the `if (...)` condition itself (before the matching `)`).
    const openParen = prefix.indexOf("(");
    let depth = 0;
    for (let i = openParen; i < prefix.length; i++) {
      if (prefix[i] === "(") depth++;
      else if (prefix[i] === ")") {
        depth--;
        if (depth === 0) return false; // `firstPos` is in the conditional body after `)`
      }
    }
    return depth > 0;
  }
  return true;
}

/** Hoist repeated `read_*(int(var))` / `read_*(int(var.field))` expressions inside a block body. */
function hoistBlockReads(
  blockBody: string,
  candidateVars: ReadonlyArray<{ name: string; declEnd: number }>,
  readers: ReadonlyMap<string, StructReaderInfo>,
  counter: { next: number }
): { body: string; changed: boolean } {
  let body = blockBody;
  let changed = false;

  for (const { name, declEnd } of candidateVars) {
    if (declEnd > body.length) continue;
    const esc = escapeRegExp(name);
    // Match read_FN(int(var)) or read_FN(int(var.field)) or read_FN(var)
    const exprRe = new RegExp(`\\b(read_\\w+)\\((?:int\\(${esc}(?:\\.\\w+)?\\)|${esc})\\)`, "g");
    const groups = new Map<string, { readName: string; positions: number[] }>();
    exprRe.lastIndex = declEnd;
    let m: RegExpExecArray | null;
    while ((m = exprRe.exec(body)) !== null) {
      const readName = m[1]!;
      if (!readers.has(readName)) continue;
      const expr = m[0]!;
      let entry = groups.get(expr);
      if (!entry) {
        entry = { readName, positions: [] };
        groups.set(expr, entry);
      }
      entry.positions.push(m.index);
    }

    for (const [expr, info] of groups) {
      if (info.positions.length < 2) continue;
      const reader = readers.get(info.readName)!;
      const firstPos = info.positions[0]!;
      const firstNesting = nestingDepthAt(body, firstPos);
      const insertPos = Math.max(declEnd, findDepthZeroStatementStart(body, firstPos));
      const insertNesting = nestingDepthAt(body, insertPos);
      // Never insert inside a parenthesized header (e.g. `for (init; cond; step)`) or before `else`.
      if (insertNesting.braceDepth !== 0 || insertNesting.parenDepth !== 0) continue;
      if (/^else\b/.test(body.slice(insertPos).trimStart())) continue;
      // For texture-backed reads, only hoist when the first occurrence is unconditional at depth 0
      // (so we never hoist a texelFetch past a guard, short-circuit, discard, or loop break).
      // Pure instance-attribute readers (no texelFetch) are always safe to hoist at the enclosing
      // depth-0 statement before the first occurrence (provided insertPos is a valid statement boundary).
      if (
        !reader.pureInstance &&
        (firstNesting.braceDepth !== 0 || !isUnconditionalInStatement(body, insertPos, firstPos))
      ) {
        continue;
      }

      const tempName = `es_h${counter.next++}`;
      const decl = `\n${reader.returnType} ${tempName}=${expr};`;

      const prefix = body.slice(0, insertPos);
      const replaceRe = new RegExp(`\\b${escapeRegExp(expr)}`, "g");
      const suffix = body.slice(insertPos).replace(replaceRe, tempName);
      body = prefix + decl + suffix;
      changed = true;
      // Re-scan in outer round since string offsets shifted.
      return { body, changed: true };
    }
  }

  return { body, changed };
}

function hoistRedundantStorageReads(source: string, readers: ReadonlyMap<string, StructReaderInfo>): string {
  if (readers.size === 0) return source;
  const mainMatch = /\bvoid\s+original_main\s*\(\s*\)\s*\{/.exec(source);
  if (!mainMatch) return source;
  const mainOpen = mainMatch.index + mainMatch[0].length - 1;
  const mainClose = findMatchingBrace(source, mainOpen);
  if (mainClose < 0) return source;

  const header = source.slice(0, mainOpen);
  // Read-only stage inputs (flat in uint v6; etc.)
  const stageInputs: string[] = [];
  for (const m of header.matchAll(/\b(?:flat\s+)?in\s+(?:highp\s+|mediump\s+|lowp\s+)?(?:uint|int)\s+(\w+)\s*;/g)) {
    stageInputs.push(m[1]!);
  }

  let mainBody = source.slice(mainOpen + 1, mainClose);
  const counter = { next: 0 };

  // Iterate to fixed point (max 12 hoists per shader is plenty for chained reads).
  for (let iter = 0; iter < 12; iter++) {
    let anyChanged = false;

    // 1. Top-level stage inputs + top-level immutable local declarations in original_main().
    const topCandidates: Array<{ name: string; declEnd: number }> = [];
    for (const v of stageInputs) {
      if (!isVariableMutated(mainBody, v, 0, 0)) {
        topCandidates.push({ name: v, declEnd: 0 });
      }
    }
    const localDeclRe = /\b(?:uint|int|\w+_natural)\s+(\w+)\s*=\s*[^;{}]+;/g;
    for (const m of mainBody.matchAll(localDeclRe)) {
      const varName = m[1]!;
      const start = m.index!;
      const end = start + m[0]!.length;
      const depth = nestingDepthAt(mainBody, start);
      if (depth.braceDepth !== 0 || depth.parenDepth !== 0) continue;
      if (isVariableMutated(mainBody, varName, start, end)) continue;
      topCandidates.push({ name: varName, declEnd: end });
    }

    const topRes = hoistBlockReads(mainBody, topCandidates, readers, counter);
    if (topRes.changed) {
      mainBody = topRes.body;
      anyChanged = true;
      continue;
    }

    // 2. Inner loop / block immutable local declarations (e.g. `int _1329 = ...;` inside dormer `for (;;)`).
    for (const m of mainBody.matchAll(localDeclRe)) {
      const varName = m[1]!;
      const start = m.index!;
      const end = start + m[0]!.length;
      const depth = nestingDepthAt(mainBody, start);
      if (depth.braceDepth === 0 || depth.parenDepth !== 0) continue;
      const blockOpen = findEnclosingBlockOpen(mainBody, start);
      if (blockOpen < 0) continue;
      const blockClose = findMatchingBrace(mainBody, blockOpen);
      if (blockClose < 0) continue;
      const inner = mainBody.slice(blockOpen + 1, blockClose);
      const relStart = start - (blockOpen + 1);
      const relEnd = end - (blockOpen + 1);
      if (isVariableMutated(inner, varName, relStart, relEnd)) continue;
      const innerRes = hoistBlockReads(inner, [{ name: varName, declEnd: relEnd }], readers, counter);
      if (innerRes.changed) {
        mainBody = mainBody.slice(0, blockOpen + 1) + innerRes.body + mainBody.slice(blockClose);
        anyChanged = true;
        break;
      }
    }

    if (!anyChanged) break;
  }

  return source.slice(0, mainOpen + 1) + mainBody + source.slice(mainClose);
}

/** Materialize a standalone flat string so V8 ConsString ropes and SlicedString parents
 * created by iterative slice+concat passes are not retained on the JS heap. */
export function flattenShaderSource(source: string): string {
  if (!source) return source;
  const flat = " " + source;
  return flat.indexOf("\u0000") === -1 ? flat.slice(1) : flat.slice(1, flat.length);
}

export function optimizeStorageReads(source: string): string {
  if (!source.includes("word_") && !source.includes("read_")) return source;
  const { source: packed, readers } = packStorageReaders(source);
  return flattenShaderSource(hoistRedundantStorageReads(packed, readers));
}
