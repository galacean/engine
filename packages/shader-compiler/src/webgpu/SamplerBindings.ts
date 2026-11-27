import type { IWebGPUShaderTexture } from "@galacean/engine-design";

/** Drop sampler arguments of helpers that only issue textureLoad/textureDimensions.
 * A texture is still required, but no sampler object or sampler slot is needed. */
export function removeUnusedSamplers(source: string): {
  source: string;
  bindings: Set<string>;
} {
  function splitArguments(text: string): string[] {
    if (!text.trim()) return [];
    const fields: string[] = [];
    let start = 0,
      depth = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(" || ch === "[" || ch === "<") depth++;
      else if (ch === ")" || ch === "]" || ch === ">") depth--;
      else if (ch === "," && !depth) {
        fields.push(text.slice(start, i));
        start = i + 1;
      }
    }
    fields.push(text.slice(start));
    return fields;
  }
  function replaceCalls(text: string, removed: Map<string, Set<number>>): string {
    for (const [name, skip] of removed) {
      const call = new RegExp("\\b" + name + "\\(", "g");
      for (; call.exec(text); ) {
        const start = call.lastIndex;
        let end = start,
          depth = 1;
        for (; end < text.length && depth; end++) {
          if (text[end] === "(") depth++;
          else if (text[end] === ")") depth--;
        }
        const args = splitArguments(text.slice(start, end - 1))
          .filter((_, i) => !skip.has(i))
          .join(",");
        text = text.slice(0, start) + args + text.slice(end - 1);
        call.lastIndex = start + args.length + 1;
      }
    }
    return text;
  }
  interface ParsedFn {
    start: number;
    end: number;
    name: string;
    parameters: string;
    result: string;
    body: string;
  }
  function scanFunctions(text: string): ParsedFn[] {
    const fns: ParsedFn[] = [];
    const header = /\bfn\s+(\w+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = header.exec(text)) !== null) {
      const fnStart = match.index;
      const name = match[1];
      const paramStart = header.lastIndex;
      let p = paramStart;
      let pDepth = 1;
      while (p < text.length && pDepth > 0) {
        if (text[p] === "(") pDepth++;
        else if (text[p] === ")") pDepth--;
        p++;
      }
      if (pDepth !== 0) break;
      const paramEnd = p - 1;
      const braceOpen = text.indexOf("{", p);
      if (braceOpen < 0) break;
      const result = text.slice(p, braceOpen);
      if (result.includes(";")) {
        header.lastIndex = p;
        continue;
      }
      let b = braceOpen + 1;
      let bDepth = 1;
      while (b < text.length && bDepth > 0) {
        if (text[b] === "{") bDepth++;
        else if (text[b] === "}") bDepth--;
        b++;
      }
      if (bDepth !== 0) break;
      fns.push({
        start: fnStart,
        end: b,
        name,
        parameters: text.slice(paramStart, paramEnd),
        result,
        body: text.slice(braceOpen + 1, b - 1)
      });
      header.lastIndex = b;
    }
    return fns;
  }
  // Iterate to fixed point so callees declared after callers also elide unused samplers.
  let changed = true;
  while (changed) {
    changed = false;
    const removed = new Map<string, Set<number>>();
    const fns = scanFunctions(source);
    if (fns.length) {
      const parts: string[] = [];
      let cursor = 0;
      for (const fn of fns) {
        const unused = new Set<number>();
        const fields = splitArguments(fn.parameters);
        fields.forEach((field, index) => {
          const param = /^\s*(\w+):\s*sampler(?:_comparison)?\s*$/.exec(field);
          if (param && !new RegExp("\\b" + param[1] + "\\b").test(fn.body)) unused.add(index);
        });
        if (unused.size) {
          removed.set(fn.name, unused);
          changed = true;
        }
        parts.push(
          source.slice(cursor, fn.start),
          "fn " +
            fn.name +
            "(" +
            fields.filter((_, index) => !unused.has(index)).join(",") +
            ")" +
            fn.result +
            "{" +
            fn.body +
            "}"
        );
        cursor = fn.end;
      }
      parts.push(source.slice(cursor));
      source = parts.join("");
    }
    if (removed.size) {
      const fns2 = scanFunctions(source);
      const parts: string[] = [];
      let cursor = 0;
      for (const fn of fns2) {
        parts.push(
          source.slice(cursor, fn.start),
          "fn " + fn.name + "(" + fn.parameters + ")" + fn.result + "{" + replaceCalls(fn.body, removed) + "}"
        );
        cursor = fn.end;
      }
      parts.push(source.slice(cursor));
      source = parts.join("");
    }
  }
  const bindings = new Set<string>();
  source = source.replace(
    /@group\((\d+)\)\s*@binding\((\d+)\)\s*var (\w+): sampler(?:_comparison)?;/g,
    (declaration, group: string, binding: string, name: string) => {
      const occurrences = source.match(new RegExp("\\b" + name + "\\b", "g"));
      if (occurrences?.length === 1) return "";
      bindings.add(group + ":" + binding);
      return declaration;
    }
  );
  return { source, bindings };
}

/** Keep independent texture views, but use a single sampler binding for identical
 * resolved sampling state inside each bind group. WGSL helper functions still receive
 * their sampler parameter, so filtering, comparison, wrapping and anisotropy survive. */
export function poolSamplerBindings(
  sources: string[],
  textures: IWebGPUShaderTexture[],
  keys?: Readonly<Record<string, string>>
): string[] {
  const pools = new Map<string, number>();
  const targets = new Map<string, number>();
  for (const texture of textures) {
    if (texture.samplerBinding === undefined) continue;
    const { group, samplerType, arrayIndex, name } = texture;
    const property = arrayIndex === undefined ? name : name + "[" + arrayIndex + "]";
    const key = JSON.stringify([
      group,
      samplerType,
      keys?.[property] ?? null,
      texture.arrayMipOffset,
      texture.arrayMipCount
    ]);
    const original = texture.samplerBinding;
    const binding = pools.get(key) ?? original;
    pools.set(key, binding);
    targets.set(group + ":" + original, binding);
    texture.samplerBinding = binding;
  }
  return sources.map((source) => {
    const representative = new Map<string, string>();
    const aliases = new Map<string, string>();
    source = source.replace(
      /@group\((\d+)\)\s*@binding\((\d+)\)\s*var (\w+): (sampler(?:_comparison)?);/g,
      (_, group: string, original: string, name: string, type: string) => {
        const binding = targets.get(group + ":" + original)!;
        const id = group + ":" + binding;
        const first = representative.get(id);
        if (first) {
          aliases.set(name, first);
          return "";
        }
        representative.set(id, name);
        return "@group(" + group + ") @binding(" + binding + ") var " + name + ": " + type + ";";
      }
    );
    return aliases.size ? source.replace(/\b[A-Za-z_]\w*\b/g, (name) => aliases.get(name) ?? name) : source;
  });
}
