/**
 * Macro Conditional Segment Tree
 *
 * Build-time: parses CodeGen GLSL output (which contains #if/#ifdef/#ifndef/#elif/#else/#endif)
 * into a tree of segments. This preserves the structural information that would otherwise
 * require runtime character-by-character scanning by MacroParser.
 *
 * Runtime: walks the tree with active macro values, evaluating conditions via Map lookups
 * and concatenating selected text segments. O(k) where k = number of segments,
 * vs O(n) where n = source length for MacroParser.
 */

// ---- Segment Types (compact for JSON serialization) ----

/** Plain text segment */
export interface TextSegment {
  /** type: 0 = text */
  t: 0;
  /** text content */
  s: string;
}

/** Conditional block (#if/#ifdef/#ifndef ... #elif ... #else ... #endif) */
export interface ConditionalSegment {
  /** type: 1 = conditional */
  t: 1;
  /** branches, evaluated in order; first matching branch wins */
  b: ConditionalBranch[];
}

/** #define directive (side effect) */
export interface DefineSegment {
  /** type: 2 = define */
  t: 2;
  /** macro name */
  n: string;
  /** macro value (undefined = no value, just defined) */
  v?: string;
}

/** #undef directive (side effect) */
export interface UndefSegment {
  /** type: 3 = undef */
  t: 3;
  /** macro name */
  n: string;
}

export type Segment = TextSegment | ConditionalSegment | DefineSegment | UndefSegment;

export interface ConditionalBranch {
  /** condition (null = #else branch, always matches) */
  c: Condition | null;
  /** body segments */
  b: Segment[];
}

// ---- Condition Types ----

/** #ifdef MACRO or defined(MACRO) */
export interface DefinedCondition {
  t: "def";
  m: string;
}

/** #ifndef MACRO or !defined(MACRO) */
export interface NotDefinedCondition {
  t: "ndef";
  m: string;
}

/** Comparison: MACRO op value (e.g., SCENE_FOG_MODE > 0) */
export interface CompareCondition {
  t: "cmp";
  m: string;
  op: string;
  v: number;
}

/** Logical AND */
export interface AndCondition {
  t: "and";
  l: Condition;
  r: Condition;
}

/** Logical OR */
export interface OrCondition {
  t: "or";
  l: Condition;
  r: Condition;
}

/** Logical NOT */
export interface NotCondition {
  t: "not";
  c: Condition;
}

/**
 * Constant boolean — produced when Preprocessor-substituted numeric literals
 * appear in conditions (e.g. #define FOO 3 → #if 3 == 3 → always true).
 */
export interface BoolCondition {
  t: "bool";
  v: boolean;
}

export type Condition =
  | DefinedCondition
  | NotDefinedCondition
  | CompareCondition
  | AndCondition
  | OrCondition
  | NotCondition
  | BoolCondition;

// ---- Build-time: Parse GLSL string → Segment tree ----

const DIRECTIVE_REGEX =
  /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define|undef)\b([^\n]*)/gm;

/**
 * Parse a GLSL string (CodeGen output) into a segment tree.
 * This is called at build time during _precompile().
 */
export function parseSegmentTree(glsl: string): Segment[] {
  const ctx = { source: glsl, pos: 0 };
  return parseSegments(ctx, false);
}

interface ParseContext {
  source: string;
  pos: number;
}

function parseSegments(ctx: ParseContext, insideConditional: boolean): Segment[] {
  const segments: Segment[] = [];
  const { source } = ctx;
  const len = source.length;

  while (ctx.pos < len) {
    // Find next preprocessor directive
    const directiveStart = findDirective(source, ctx.pos);

    if (directiveStart === -1) {
      // No more directives, rest is plain text
      const remaining = source.substring(ctx.pos);
      if (remaining) pushText(segments, remaining);
      ctx.pos = len;
      break;
    }

    // Text before directive
    if (directiveStart > ctx.pos) {
      pushText(segments, source.substring(ctx.pos, directiveStart));
    }

    // Parse the directive line
    const lineEnd = source.indexOf("\n", directiveStart);
    const line = lineEnd === -1 ? source.substring(directiveStart) : source.substring(directiveStart, lineEnd);
    ctx.pos = lineEnd === -1 ? len : lineEnd + 1;

    const match = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define|undef)\b(.*)/.exec(line);
    if (!match) {
      // Not a recognized directive, treat as text
      pushText(segments, line + (lineEnd !== -1 ? "\n" : ""));
      continue;
    }

    const keyword = match[1];
    const rest = match[2].trim();

    switch (keyword) {
      case "if":
      case "ifdef":
      case "ifndef": {
        const conditional = parseConditionalBlock(ctx, keyword, rest);
        segments.push(conditional);
        break;
      }
      case "define": {
        const spaceIdx = rest.indexOf(" ");
        if (spaceIdx === -1) {
          segments.push({ t: 2, n: rest });
        } else {
          segments.push({ t: 2, n: rest.substring(0, spaceIdx), v: rest.substring(spaceIdx + 1).trim() });
        }
        break;
      }
      case "undef": {
        segments.push({ t: 3, n: rest });
        break;
      }
      case "elif":
      case "else":
      case "endif": {
        // These terminate the current block — rewind so the caller can see them
        ctx.pos = directiveStart;
        return segments;
      }
    }
  }

  return segments;
}

function parseConditionalBlock(ctx: ParseContext, keyword: string, conditionStr: string): ConditionalSegment {
  const branches: ConditionalBranch[] = [];

  // First branch
  const cond = parseConditionFromDirective(keyword, conditionStr);
  const body = parseSegments(ctx, true);
  branches.push({ c: cond, b: body });

  // Parse subsequent #elif / #else / #endif
  const { source } = ctx;
  const len = source.length;

  while (ctx.pos < len) {
    const directiveStart = findDirective(source, ctx.pos);
    if (directiveStart === -1) break;

    const lineEnd = source.indexOf("\n", directiveStart);
    const line = lineEnd === -1 ? source.substring(directiveStart) : source.substring(directiveStart, lineEnd);
    ctx.pos = lineEnd === -1 ? len : lineEnd + 1;

    const match = /^[ \t]*#[ \t]*(elif|else|endif)\b(.*)/.exec(line);
    if (!match) break;

    const kw = match[1];
    const rest = match[2].trim();

    if (kw === "endif") {
      break;
    } else if (kw === "else") {
      const elseBody = parseSegments(ctx, true);
      branches.push({ c: null, b: elseBody });
      // After #else body, expect #endif
      skipEndif(ctx);
      break;
    } else if (kw === "elif") {
      const elifCond = parseConditionString(rest);
      const elifBody = parseSegments(ctx, true);
      branches.push({ c: elifCond, b: elifBody });
    }
  }

  return { t: 1, b: branches };
}

function skipEndif(ctx: ParseContext): void {
  const { source } = ctx;
  const directiveStart = findDirective(source, ctx.pos);
  if (directiveStart === -1) return;
  const lineEnd = source.indexOf("\n", directiveStart);
  const line = lineEnd === -1 ? source.substring(directiveStart) : source.substring(directiveStart, lineEnd);
  if (/^[ \t]*#[ \t]*endif\b/.test(line)) {
    ctx.pos = lineEnd === -1 ? source.length : lineEnd + 1;
  }
}

function findDirective(source: string, from: number): number {
  // Find next line starting with # (possibly preceded by whitespace)
  let i = from;
  const len = source.length;
  // If we're at start of line or after newline, check current position
  while (i < len) {
    // Skip to start of a line
    if (i === from || source.charCodeAt(i - 1) === 10) {
      // Skip whitespace
      let j = i;
      while (j < len && (source.charCodeAt(j) === 32 || source.charCodeAt(j) === 9)) j++;
      if (j < len && source.charCodeAt(j) === 35) {
        // # found
        return i;
      }
    }
    // Advance to next line
    const nl = source.indexOf("\n", i);
    if (nl === -1) break;
    i = nl + 1;
  }
  return -1;
}

function parseConditionFromDirective(keyword: string, condStr: string): Condition {
  if (keyword === "ifdef") {
    return { t: "def", m: condStr.trim() };
  } else if (keyword === "ifndef") {
    return { t: "ndef", m: condStr.trim() };
  } else {
    // "if" keyword: parse the condition expression string
    return parseConditionString(condStr);
  }
}

// ---- Condition expression parser ----

function parseConditionString(expr: string): Condition {
  const ctx = { s: expr.trim(), i: 0 };
  return parseOr(ctx);
}

interface ExprCtx {
  s: string;
  i: number;
}

function skipWs(ctx: ExprCtx): void {
  while (ctx.i < ctx.s.length && (ctx.s[ctx.i] === " " || ctx.s[ctx.i] === "\t")) ctx.i++;
}

function parseOr(ctx: ExprCtx): Condition {
  let left = parseAnd(ctx);
  skipWs(ctx);
  while (ctx.i < ctx.s.length - 1 && ctx.s[ctx.i] === "|" && ctx.s[ctx.i + 1] === "|") {
    ctx.i += 2;
    skipWs(ctx);
    const right = parseAnd(ctx);
    left = { t: "or", l: left, r: right };
    skipWs(ctx);
  }
  return left;
}

function parseAnd(ctx: ExprCtx): Condition {
  let left = parseUnary(ctx);
  skipWs(ctx);
  while (ctx.i < ctx.s.length - 1 && ctx.s[ctx.i] === "&" && ctx.s[ctx.i + 1] === "&") {
    ctx.i += 2;
    skipWs(ctx);
    const right = parseUnary(ctx);
    left = { t: "and", l: left, r: right };
    skipWs(ctx);
  }
  return left;
}

function parseUnary(ctx: ExprCtx): Condition {
  skipWs(ctx);
  if (ctx.s[ctx.i] === "!") {
    ctx.i++;
    skipWs(ctx);
    const operand = parsePrimary(ctx);
    return { t: "not", c: operand };
  }
  return parsePrimary(ctx);
}

function parsePrimary(ctx: ExprCtx): Condition {
  skipWs(ctx);

  // Parenthesized expression
  if (ctx.s[ctx.i] === "(") {
    ctx.i++;
    skipWs(ctx);
    const inner = parseOr(ctx);
    skipWs(ctx);
    if (ctx.s[ctx.i] === ")") ctx.i++;
    return inner;
  }

  // defined(MACRO) or defined MACRO
  if (ctx.s.substring(ctx.i, ctx.i + 7) === "defined") {
    ctx.i += 7;
    skipWs(ctx);
    const hasParen = ctx.s[ctx.i] === "(";
    if (hasParen) ctx.i++;
    skipWs(ctx);
    const name = scanIdentifier(ctx);
    skipWs(ctx);
    if (hasParen && ctx.s[ctx.i] === ")") ctx.i++;
    return { t: "def", m: name };
  }

  // Numeric literal — produced by Preprocessor substitution (e.g. #define FOO 3 → #if 3 == 2)
  if (ctx.i < ctx.s.length && /[0-9]/.test(ctx.s[ctx.i])) {
    const lhsNum = scanNumber(ctx);
    skipWs(ctx);
    const op = scanOp(ctx);
    if (op) {
      skipWs(ctx);
      const rhsNum = scanNumber(ctx);
      return { t: "bool", v: evalNumOp(lhsNum, op, rhsNum) };
    }
    return { t: "bool", v: lhsNum !== 0 };
  }

  // Identifier — could be a comparison (MACRO > value) or just defined check
  const name = scanIdentifier(ctx);
  if (!name) {
    // Unknown token: treat as always-false placeholder
    return { t: "bool", v: false };
  }
  skipWs(ctx);

  // Check for comparison operator
  const op = scanOp(ctx);

  if (op) {
    skipWs(ctx);
    const value = scanNumber(ctx);
    return { t: "cmp", m: name, op, v: value };
  }

  // Just an identifier — treat as defined check
  return { t: "def", m: name };
}

function scanIdentifier(ctx: ExprCtx): string {
  const start = ctx.i;
  while (ctx.i < ctx.s.length && /[a-zA-Z0-9_]/.test(ctx.s[ctx.i])) ctx.i++;
  return ctx.s.substring(start, ctx.i);
}

function scanNumber(ctx: ExprCtx): number {
  const start = ctx.i;
  if (ctx.s[ctx.i] === "-") ctx.i++;
  while (ctx.i < ctx.s.length && /[0-9.]/.test(ctx.s[ctx.i])) ctx.i++;
  return Number(ctx.s.substring(start, ctx.i)) || 0;
}

/** Scan a comparison/equality operator (==, !=, >=, <=, >, <) at current position. */
function scanOp(ctx: ExprCtx): string {
  const c = ctx.s[ctx.i];
  const c2 = ctx.i + 1 < ctx.s.length ? ctx.s[ctx.i + 1] : "";
  if (c === "=" && c2 === "=") { ctx.i += 2; return "=="; }
  if (c === "!" && c2 === "=") { ctx.i += 2; return "!="; }
  if (c === ">" && c2 === "=") { ctx.i += 2; return ">="; }
  if (c === "<" && c2 === "=") { ctx.i += 2; return "<="; }
  if (c === ">") { ctx.i++; return ">"; }
  if (c === "<") { ctx.i++; return "<"; }
  return "";
}

/** Evaluate a numeric comparison. Used to constant-fold Preprocessor-substituted literals. */
function evalNumOp(lhs: number, op: string, rhs: number): boolean {
  switch (op) {
    case "==": return lhs === rhs;
    case "!=": return lhs !== rhs;
    case ">":  return lhs > rhs;
    case "<":  return lhs < rhs;
    case ">=": return lhs >= rhs;
    case "<=": return lhs <= rhs;
    default:   return false;
  }
}

function pushText(segments: Segment[], text: string): void {
  if (!text) return;
  const last = segments.length > 0 ? segments[segments.length - 1] : null;
  if (last && last.t === 0) {
    // Merge adjacent text segments
    last.s += text;
  } else {
    segments.push({ t: 0, s: text });
  }
}

// ---- Runtime: Evaluate segment tree → final GLSL string ----

/**
 * Evaluate a segment tree with active macros.
 * Called at runtime to replace MacroParser.parse().
 * @param segments - Pre-parsed segment tree from .gsb
 * @param macros - Active runtime macros { name → value }
 * @returns Final GLSL string with all conditionals resolved
 */
export function evaluateSegmentTree(segments: Segment[], macros: Map<string, string>): string {
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
          if (branch.c === null || evalCondition(branch.c, macros)) {
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

function evalCondition(cond: Condition, macros: Map<string, string>): boolean {
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
      return evalCondition(cond.l, macros) && evalCondition(cond.r, macros);
    case "or":
      return evalCondition(cond.l, macros) || evalCondition(cond.r, macros);
    case "not":
      return !evalCondition(cond.c, macros);
    case "bool":
      return cond.v;
  }
}
