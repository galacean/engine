// Offline source cleanup. The Engine compiler decides which functions are used;
// runtime shader generation and the shared Water libraries remain unchanged.
const mask = (source) =>
  source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"/g, (value) => value.replace(/[^\n]/g, " "));
const tokens = (source) =>
  mask(source)
    .match(/[A-Za-z_]\w*|\d+(?:\.\d*)?|[^\s]/g)
    ?.join(" ") ?? "";

function apply(source, edits) {
  for (const { start, end } of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, start) + source.slice(end);
  return source;
}

function functions(content) {
  const text = mask(content),
    result = [];
  const pattern = /^[\t ]*(?:(?:lowp|mediump|highp)\s+)?\w+[\t ]+(\w+)\s*\([^{};]*\)\s*\{/gm;
  for (const match of text.matchAll(pattern)) {
    let end = match.index + match[0].length,
      depth = 1;
    while (depth && end < text.length) {
      const char = text[end++];
      if (char === "{") depth++;
      else if (char === "}") depth--;
    }
    if (depth) throw new Error(`Unclosed generated Water function: ${match[1]}`);
    if (text[end] === "\n") end++;
    result.push({ name: match[1], start: match.index, end });
  }
  return result;
}

function headerGuardsOnly(content, index) {
  const conditions = [];
  for (const match of content.slice(0, index).matchAll(/^[\t ]*#(if|ifdef|ifndef|else|elif|endif)\b([^\n]*)/gm)) {
    if (match[1] === "endif") conditions.pop();
    else if (match[1] === "else" || match[1] === "elif") conditions[conditions.length - 1] = false;
    else conditions.push(match[1] === "ifndef" && /^WATER_\w+_INCLUDED$/.test(match[2].trim()));
  }
  return conditions.every(Boolean);
}

export function cleanWaterShaderSource(source, compiler) {
  // Each Pass is a separate program. Only deduplicate complete, identical leaf
  // include guards inside that program, never across Passes or shader assets.
  const duplicateEdits = [];
  const guarded =
    /^[\t ]*#ifndef[\t ]+(WATER_\w+_INCLUDED)[\t ]*\n[\t ]*#define[\t ]+\1[\t ]*\n(?:(?!^[\t ]*#)[\s\S])*?^[\t ]*#endif[\t ]*(?:\n|$)/gm;
  for (const sub of compiler._parseShaderSource(source).subShaders)
    for (const pass of sub.passes) {
      const seen = new Set();
      for (const statement of pass.pendingContents)
        for (const match of statement.content.matchAll(guarded)) {
          // A feature branch might skip the first copy. In that case the later copy
          // remains necessary even when its text matches exactly.
          if (!headerGuardsOnly(statement.content, match.index)) continue;
          if (new RegExp(`#undef\\s+${match[1]}\\b`).test(pass.contents)) continue;
          const key = tokens(match[0]);
          if (seen.has(key))
            duplicateEdits.push({
              start: statement.range.start.index + match.index,
              end: statement.range.start.index + match.index + match[0].length
            });
          else seen.add(key);
        }
    }
  source = apply(source, duplicateEdits);

  const unusedEdits = [];
  for (const sub of compiler._parseShaderSource(source).subShaders)
    for (const pass of sub.passes) {
      const used = new Set([pass.vertexEntry, pass.fragmentEntry]);
      for (const backend of [0, 1]) {
        const program = compiler._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          backend,
          "shaders://root/"
        );
        if (!program) throw new Error(`Cannot clean generated Water Pass '${sub.name}/${pass.name}'.`);
        for (const name of (program.vertex + "\n" + program.fragment).match(/[A-Za-z_]\w*/g) ?? []) used.add(name);
      }
      for (const statement of pass.pendingContents)
        for (const fn of functions(statement.content)) {
          if (!used.has(fn.name))
            unusedEdits.push({
              start: statement.range.start.index + fn.start,
              end: statement.range.start.index + fn.end
            });
        }
    }
  return apply(source, unusedEdits);
}
