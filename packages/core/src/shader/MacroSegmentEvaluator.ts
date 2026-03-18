/**
 * Runtime evaluator for pre-parsed macro conditional segment trees.
 * This replaces MacroParser.parse() for precompiled shaders,
 * using tree traversal + Map lookups instead of string scanning.
 * @internal
 */
export function evaluateSegmentTree(segments: any[], macros: Map<string, string>): string {
  const parts: string[] = [];

  for (let i = 0, len = segments.length; i < len; i++) {
    const seg = segments[i];
    switch (seg.t) {
      case 0: // text
        parts.push(seg.s);
        break;
      case 1: // conditional
        for (let j = 0, bLen = seg.b.length; j < bLen; j++) {
          const branch = seg.b[j];
          if (branch.c === null || _evalCondition(branch.c, macros)) {
            parts.push(evaluateSegmentTree(branch.b, macros));
            break;
          }
        }
        break;
      case 2: // define
        macros.set(seg.n, seg.v ?? "");
        break;
      case 3: // undef
        macros.delete(seg.n);
        break;
    }
  }

  return parts.join("");
}

/** @internal */
function _evalCondition(cond: any, macros: Map<string, string>): boolean {
  switch (cond.t) {
    case "def":
      return macros.has(cond.m);
    case "ndef":
      return !macros.has(cond.m);
    case "cmp": {
      const val = macros.get(cond.m);
      if (val === undefined) return false;
      const numVal = Number(val) || 0;
      switch (cond.op) {
        case "==":
          return numVal === cond.v;
        case "!=":
          return numVal !== cond.v;
        case ">":
          return numVal > cond.v;
        case "<":
          return numVal < cond.v;
        case ">=":
          return numVal >= cond.v;
        case "<=":
          return numVal <= cond.v;
        default:
          return false;
      }
    }
    case "and":
      return _evalCondition(cond.l, macros) && _evalCondition(cond.r, macros);
    case "or":
      return _evalCondition(cond.l, macros) || _evalCondition(cond.r, macros);
    case "not":
      return !_evalCondition(cond.c, macros);
    case "bool":
      return cond.v;
    default:
      return false;
  }
}
