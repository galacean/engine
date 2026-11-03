/** Bounded glob matching for virtual paths (no native filesystem or shell). */
export function compileProjectGlob(pattern: string): (path: string) => boolean {
  if (
    !pattern ||
    pattern.length > 240 ||
    /[\0\r\n\\]/.test(pattern) ||
    pattern.startsWith("!") ||
    pattern.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid glob pattern");
  const expand = (value: string): string[] => {
    const start = value.indexOf("{");
    if (start < 0) {
      if (value.includes("}")) throw new Error("Invalid glob braces");
      return [value];
    }
    const end = value.indexOf("}", start);
    if (end < 0 || value.slice(start + 1, end).includes("{")) throw new Error("Invalid glob braces");
    const choices = value.slice(start + 1, end).split(",");
    if (choices.length < 2 || choices.some((choice) => !choice)) throw new Error("Invalid glob alternatives");
    const rest = expand(value.slice(end + 1));
    if (choices.length * rest.length > 64) throw new Error("Too many glob alternatives");
    return choices.flatMap((choice) => rest.map((suffix) => value.slice(0, start) + choice + suffix));
  };
  const segment = (value: string) => {
    const tokens: (string | RegExp)[] = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== "[") {
        tokens.push(value[i]);
        continue;
      }
      const end = value.indexOf("]", i + 1);
      if (end < 0 || end === i + 1) throw new Error("Invalid glob character class");
      const body = value.slice(i + 1, end).replace(/^!/, "^");
      tokens.push(new RegExp(`^[${body}]$`, "u"));
      i = end;
    }
    return (text: string) => {
      let positions = new Set([0]);
      for (const token of tokens) {
        const next = new Set<number>();
        if (token === "*") {
          const first = Math.min(...positions);
          for (let i = first; i <= text.length; i++) next.add(i);
        } else
          for (const i of positions) {
            if (
              i < text.length &&
              (token === "?" || (typeof token === "string" ? text[i] === token : token.test(text[i])))
            )
              next.add(i + 1);
          }
        positions = next;
      }
      return positions.has(text.length);
    };
  };
  const alternatives = expand(pattern).map((value) => {
    const parts = value.split("/");
    const matchers = parts.map((part) => (part === "**" ? null : segment(part)));
    return (path: string) => {
      const names = path.split("/");
      if (parts.length === 1) return parts[0] === "**" || matchers[0]!(names.at(-1)!);
      let positions = new Set([0]);
      for (const matcher of matchers) {
        const next = new Set<number>();
        if (!matcher) {
          const first = Math.min(...positions);
          for (let i = first; i <= names.length; i++) next.add(i);
        } else for (const i of positions) if (i < names.length && matcher(names[i])) next.add(i + 1);
        positions = next;
      }
      return positions.has(names.length);
    };
  });
  return (path) => alternatives.some((match) => match(path));
}
