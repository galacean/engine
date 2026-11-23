import { matching } from "./StageInterface";

/** Naga's WGSL writer only supports empty fallthrough cases. Its GLSL frontend
 * marks even a returning case as fallthrough unless it ends in a literal break.
 * Keep the GLSL switch (and its scope, selector evaluation and continue target).
 * For an actual fallthrough, append the following statements inside a fresh
 * scope up to the next terminating arm. Only affected functions are touched. */
export function lowerReturningSwitches(words: string[]): boolean {
  if (!words.includes("switch") || !words.includes("return")) return false;
  let changed = false;
  let unused = "gs_switch_unreachable";
  for (; words.includes(unused); ) unused += "_";
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== "{") continue;
    let close = matching(words, i);
    if (words[i - 1] === ")") {
      let modified = false;
      for (let j = close - 1; j > i; j--) {
        if (words[j] !== "switch") continue;
        const open = matching(words, j + 1) + 1;
        const end = matching(words, open);
        const body = lowerCases(words.slice(open + 1, end));
        if (body) {
          const length = end - open - 1;
          words.splice(open + 1, length, ...body);
          close += body.length - length;
          modified = true;
        }
      }
      if (modified) {
        changed = true;
        // The validator cannot prove the literal-true guards return on every
        // path. Falling off a non-void GLSL function already has undefined value.
        if (!endsWithTransfer(words.slice(i + 1, close))) {
          let params = i - 2,
            depth = 1;
          for (; depth && params >= 0; params--) {
            if (words[params] === ")") depth++;
            if (words[params] === "(") depth--;
          }
          let start = params - 1;
          for (; words[start] === "]"; start--) {
            start = words.lastIndexOf("[", start);
          }
          if (words[start] !== "void") {
            const fallback = [...words.slice(start, params), unused, ";", "return", unused, ";"];
            words.splice(close, 0, ...fallback);
            close += fallback.length;
          }
        }
      }
    }
    i = close;
  }
  return changed;
}

function endsWithTransfer(body: string[]): boolean {
  let previous = "{";
  for (let i = 0; i < body.length; i++) {
    const word = body[i];
    const standalone = previous === "{" || previous === "}" || previous === ";";
    if (standalone && /^(?:break|continue|return|discard)$/.test(word)) return true;
    if (word === "(" || word === "[" || word === "{") {
      const close = matching(body, i);
      if (word === "{" && standalone && endsWithTransfer(body.slice(i + 1, close))) return true;
      i = close;
    }
    previous = body[i];
  }
  return false;
}

function lowerCases(words: string[]): string[] | undefined {
  if (!words.includes("return")) return;
  const arms: { label: string[]; body: string[]; exits: boolean }[] = [];
  let start = 0;
  for (let i = 0; i <= words.length; i++) {
    if (words[i] === "{" || words[i] === "(" || words[i] === "[") i = matching(words, i);
    else if (i === words.length || words[i] === "case" || words[i] === "default") {
      if (arms.length) {
        const arm = arms[arms.length - 1];
        arm.body = words.slice(start, i);
        arm.exits = endsWithTransfer(arm.body);
      }
      if (i === words.length) break;
      const begin = i;
      let ternary = 0;
      for (i++; i < words.length; i++) {
        if (words[i] === "?") ternary++;
        else if (words[i] === ":") {
          if (!ternary) break;
          ternary--;
        }
      }
      arms.push({ label: words.slice(begin, i + 1), body: [], exits: false });
      start = i + 1;
    }
  }
  // The frontend already handles a conditional return followed by a plain break.
  if (
    arms.every(
      ({ body }) =>
        !body.length ||
        (body[body.length - 2] === "break" && (body.length === 2 || [";", "}"].includes(body[body.length - 3])))
    )
  )
    return;
  const result: string[] = [];
  for (let i = 0; i < arms.length; i++) {
    result.push(...arms[i].label);
    if (!arms[i].body.length && i + 1 < arms.length) continue;
    let scopes = 0;
    for (let j = i; j < arms.length; j++) {
      const { body, exits } = arms[j];
      if (j !== i) {
        result.push("{");
        scopes++;
      }
      for (let k = 0; k < body.length; k++) {
        if (body[k] === "switch") {
          const close = matching(body, matching(body, k + 1) + 1);
          result.push(...body.slice(k, close + 1));
          k = close;
        } else if (/^(?:break|continue|discard|return)$/.test(body[k])) {
          // As a compound statement this also preserves dangling else associations.
          result.push("{", "if", "(", "true", ")");
          for (; k < body.length && body[k] !== ";"; k++) result.push(body[k]);
          result.push(";", "}");
        } else result.push(body[k]);
      }
      if (exits) break;
    }
    for (let scope = 0; scope < scopes; scope++) result.push("}");
    result.push("break", ";");
  }
  return result;
}
