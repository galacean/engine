/**
 * @internal
 * Simple #ifdef/#ifndef/#else/#endif resolver based on a macro set.
 * Temporary utility for GLSL platform path — will be removed when GLSL path is deleted.
 */
export function resolveIfdef(source: string, macroSet: { has(name: string): boolean }): string {
  const lines = source.split("\n");
  const result: string[] = [];
  const stack: boolean[] = [true];
  const taken: boolean[] = [false];

  for (let i = 0, n = lines.length; i < n; i++) {
    const trimmed = lines[i].trimStart();

    if (trimmed.startsWith("#ifdef ")) {
      const macro = trimmed.substring(7).trim();
      const active = stack[stack.length - 1] && macroSet.has(macro);
      stack.push(active);
      taken.push(active);
    } else if (trimmed.startsWith("#ifndef ")) {
      const macro = trimmed.substring(8).trim();
      const active = stack[stack.length - 1] && !macroSet.has(macro);
      stack.push(active);
      taken.push(active);
    } else if (trimmed.startsWith("#else")) {
      const parentActive = stack.length > 1 ? stack[stack.length - 2] : true;
      const active = parentActive && !taken[taken.length - 1];
      stack[stack.length - 1] = active;
      if (active) taken[taken.length - 1] = true;
    } else if (trimmed.startsWith("#endif")) {
      if (stack.length > 1) {
        stack.pop();
        taken.pop();
      }
    } else if (stack[stack.length - 1]) {
      result.push(lines[i]);
    }
  }

  return result.join("\n");
}
