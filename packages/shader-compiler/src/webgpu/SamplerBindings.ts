import type { IWebGPUShaderTexture } from "@galacean/engine-design";

/** Naga emits one WGSL function per overload and declares callees before callers.
 * Drop sampler arguments of helpers that only issue textureLoad/textureDimensions.
 * A texture is still required, but no sampler object or sampler slot is needed. */
export function removeUnusedSamplers(source: string): {
  source: string;
  bindings: Set<string>;
} {
  const removed = new Map<string, Set<number>>();
  function splitArguments(text: string): string[] {
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
  function replaceCalls(text: string): string {
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
  // Naga prints a closing function brace at column zero; nested control flow
  // and expression statements are indented inside the function.
  source = source.replace(
    /\bfn (\w+)\(([^()]*)\)([^{}]*)\{([\s\S]*?\n)\}/g,
    (_, name: string, parameters: string, result: string, body: string) => {
      body = replaceCalls(body);
      const unused = new Set<number>();
      const fields = splitArguments(parameters);
      fields.forEach((field, index) => {
        const param = /^\s*(\w+):\s*sampler(?:_comparison)?\s*$/.exec(field);
        if (param && !new RegExp("\\b" + param[1] + "\\b").test(body)) unused.add(index);
      });
      if (unused.size) removed.set(name, unused);
      return (
        "fn " + name + "(" + fields.filter((_, index) => !unused.has(index)).join(",") + ")" + result + "{" + body + "}"
      );
    }
  );
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
