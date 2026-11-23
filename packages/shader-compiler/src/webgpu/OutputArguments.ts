/** GLSL out/inout parameters use copy-in/copy-out. Naga already emits a temporary
 * for multi-component swizzles, but passes a scalar vector lane by address, which
 * WGSL forbids. Its IR emits each function call as a separate statement and saves
 * mutable index operands in let bindings before the call. Reuse those operands on
 * writeback so nested calls, conditional execution and indexing keep their order. */
export function lowerOutputArguments(source: string): string {
  if (!source.includes("(&")) return source;
  const functions = new Set<string>();
  for (const signature of source.matchAll(/\bfn (\w+)\([^\n]*\bptr<function,/g)) functions.add(signature[1]);
  let prefix = "gs_output_arg";
  while (source.includes(prefix)) prefix += "_";
  let next = 0;
  return source.replace(/^([ \t]*)(?:let \w+[^\n]*? = )?(\w+)\([^\n]*\(&[^\n]*;$/gm, (line, indent, name) => {
    if (!functions.has(name)) return line;
    const before: string[] = [];
    const after: string[] = [];
    const call: string[] = [];
    const seen = new Set<string>();
    let start = 0;
    for (let index = line.indexOf("(&"); index >= 0; index = line.indexOf("(&", start)) {
      let end = index + 2;
      let depth = 1;
      for (; end < line.length && depth; end++) {
        if (line[end] === "(") depth++;
        else if (line[end] === ")") depth--;
      }
      const target = line.slice(index + 2, end - 1);
      call.push(line.slice(start, index));
      // WGSL alias analysis treats fields from one struct as the same root.
      // Copy subobjects, and repeated whole variables, using GLSL value/result semantics.
      if (/(?:\.\w+|\])$/.test(target) || seen.has(target)) {
        const local = prefix + next++;
        before.push(indent + "var " + local + " = " + target + ";");
        call.push("(&" + local + ")");
        after.push(indent + target + " = " + local + ";");
      } else {
        call.push(line.slice(index, end));
      }
      seen.add(target);
      start = end;
    }
    if (!before.length) return line;
    call.push(line.slice(start));
    return [...before, call.join(""), ...after].join("\n");
  });
}
