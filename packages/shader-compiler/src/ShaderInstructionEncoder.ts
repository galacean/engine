import type {
  Condition,
  IShaderUniformSelection,
  IShaderUniformSite,
  PreprocessorExpressionParseResult,
  ShaderInstruction
} from "@galacean/engine-design";
import { needsUniformArrayProof, supportsUniformArrayPlan } from "@galacean/engine-design";
import { ShaderPreprocessorDirective } from "@galacean/engine-core";
import { parsePreprocessorExpression, toPreprocessorCondition } from "@galacean/engine-shader-parser/internal";
import type { DeferredDeclarationOwnership } from "@galacean/engine-shader-parser/internal";

export type { ShaderInstruction } from "@galacean/engine-design";

/**
 * @internal
 */
export class ShaderInstructionEncoder {
  private static readonly _rawStages = new WeakMap<ShaderInstruction[], ShaderInstruction[]>();

  /** Historical hand-authored stages can put preprocessor directives inside one Text instruction. */
  static normalizeRawStage(instructions: ShaderInstruction[]): ShaderInstruction[] {
    if (instructions.length !== 1 || instructions[0][0] !== ShaderPreprocessorDirective.Text) return instructions;
    let stage = ShaderInstructionEncoder._rawStages.get(instructions);
    if (!stage) {
      stage = ShaderInstructionEncoder.parseRawStage(String(instructions[0][1])) ?? instructions;
      ShaderInstructionEncoder._rawStages.set(instructions, stage);
    }
    return stage;
  }

  static parseRawStage(source: string): ShaderInstruction[] | undefined {
    if (!/^[ \t]*#[ \t]*(?:if|ifdef|ifndef|define|undef)\b/m.test(source)) return;
    const logicalSource = source
      .replace(/\\(?:\r\n?|\n)/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\r\n]/g, " "));
    return ShaderInstructionEncoder.parse(logicalSource);
  }

  private static _DIRECTIVE_RE = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define|undef)\b(.*)/;
  private static _FUNC_MACRO_RE = /^(\w+)\(([^)]*)\)\s*(.*)/;

  /** Select a pass format before publication, independent of the requesting device or macro set. */
  static supportsUniformPlan(instructions: ShaderInstruction[], sites: IShaderUniformSite[]): boolean {
    const needsProof = sites.some(
      (site) =>
        (site.kind === "uniform" || site.kind === "structMember") &&
        needsUniformArrayProof(site.type, String(instructions[site.instruction][1]))
    );
    if (!needsProof) return true;
    const macroNames = new Set<string>();
    const immutable = new Map<string, string>();
    const selected: IShaderUniformSelection[] = [];
    let depth = 0,
      siteIndex = 0;
    for (let i = 0; i < instructions.length; i++) {
      const instruction = instructions[i];
      const op = instruction[0];
      if (op >= ShaderPreprocessorDirective.IfDef && op <= ShaderPreprocessorDirective.IfExpr) depth++;
      else if (op === ShaderPreprocessorDirective.Endif) depth--;
      else if (op >= ShaderPreprocessorDirective.Define && op <= ShaderPreprocessorDirective.Undef) {
        const name = String(instruction[1]);
        macroNames.add(name);
        if (
          op === ShaderPreprocessorDirective.DefineVal &&
          depth === 0 &&
          /^\s*(?:0[xX][\da-fA-F]+|\d+)[uU]?\s*$/.test(String(instruction[2]))
        )
          immutable.set(name, String(instruction[2]));
        else immutable.delete(name);
      }
      const site = sites[siteIndex];
      if (!site || site.instruction !== i) continue;
      siteIndex++;
      if (site.kind === "entry" || site.kind === "precision" || site.kind === "explicitMatrix") continue;
      // A const under a guard or inherited owner cannot establish an unconditional
      // extent. Repeated const declarations likewise retain driver specialization.
      if (site.kind === "constant" && (depth || op === ShaderPreprocessorDirective.OwnedText)) continue;
      const text = String(instruction[1]).replace(/\b[A-Za-z_]\w*\b/g, (word) =>
        macroNames.has(word) ? (immutable.get(word) ?? "gs_unproved_array_macro") : word
      );
      selected.push({ site, text, start: 0, end: text.length });
    }
    return supportsUniformArrayPlan(selected);
  }

  /** Split a declaration into its own VM text instruction without putting reflection markers in GLSL. */
  static uniformSite(
    text: string,
    kind: IShaderUniformSite["kind"],
    name: string,
    type: string,
    structName = ""
  ): string {
    return `\x01${kind},${name},${type},${structName}\x01${text}\x01/\x01`;
  }

  /**
   * Marks compiler-owned text without placing parser objects in the instruction stream.
   * @param text - Declaration or derived declaration text.
   * @param owner - Neutral declaration identity, if runtime selection is required.
   * @param activate - Whether this is the declaration's original source position.
   * @returns Intermediate source consumed by the instruction encoder.
   * @internal
   */
  static declaration(text: string, owner?: DeferredDeclarationOwnership, activate = true): string {
    if (!owner) return text;
    const activation = activate ? `\0D${owner.id},${owner.group},${owner.sourceScope}\0\n` : "";
    return text ? `${activation}\0T${owner.id}\0\n${text}\n\0E\0\n` : activation;
  }

  /**
   * Marks derived text shared by any selected, reachable declaration without activating an owner.
   * @param text - Shared derived declaration text.
   * @param owners - Declarations that require the text; an empty list never retains it.
   * @returns Intermediate source consumed by the instruction encoder.
   * @internal
   */
  static sharedDeclaration(text: string, owners: readonly DeferredDeclarationOwnership[]): string {
    return text ? `\0T${owners.map((owner) => owner.id).join(",")}\0\n${text}\n\0E\0\n` : "";
  }

  /**
   * Records a declaration dependency for variant-time reachability after ownership selection.
   * @param from - Referencing declaration identity, or zero for a stage root.
   * @param to - Referenced declaration identity.
   * @returns Intermediate source consumed by the instruction encoder.
   * @internal
   */
  static reference(from: number, to: number): string {
    return `\0R${from},${to}\0\n`;
  }

  /**
   * Removes private emission markers from the public source view after instruction encoding.
   * @param source - Encoded intermediate stage source.
   * @returns GLSL source without compiler metadata.
   * @internal
   */
  static source(source: string): string {
    // eslint-disable-next-line no-control-regex -- Both control delimiters belong to the encoder's private annotations.
    return source.replace(/\0[^\0]*\0\n?|\x01[^\x01]*\x01/g, "");
  }

  /**
   * Encodes generated GLSL directives into runtime-selectable instructions.
   * @param glsl - Generated stage source.
   * @param preprocessorExpressions - Parser-owned expression trees keyed by logical directive text.
   * @returns Runtime shader instruction stream.
   * @throws Error when a conditional directive is malformed or has a deterministic evaluation failure.
   * @internal
   */
  static parse(
    glsl: string,
    preprocessorExpressions?: ReadonlyMap<string, PreprocessorExpressionParseResult>,
    sites: IShaderUniformSite[] = []
  ): ShaderInstruction[] {
    const instructions: ShaderInstruction[] = [];
    const length = glsl.length;
    let pos = 0;
    let owners: number[] | undefined;
    const backfillStack: number[][] = [];

    while (pos < length) {
      const directiveStart = ShaderInstructionEncoder._findDirectiveStart(glsl, pos, length);

      if (directiveStart === -1) {
        ShaderInstructionEncoder._pushText(instructions, glsl, pos, length, owners, sites);
        break;
      }

      if (directiveStart > pos) {
        ShaderInstructionEncoder._pushText(instructions, glsl, pos, directiveStart, owners, sites);
      }

      const lineEnd = ShaderInstructionEncoder._findLogicalLineEnd(glsl, directiveStart, length);
      const line = glsl.substring(directiveStart, lineEnd).replace(/\\(?:\r\n|\n|\r)/g, "");
      pos = lineEnd < length ? lineEnd + 1 : length;

      if (line.charCodeAt(0) === 0) {
        const kind = line.charAt(1);
        if (kind === "D") {
          const fields = line.slice(2, -1).split(",").map(Number);
          instructions.push([ShaderPreprocessorDirective.Declaration, fields[0], fields[1], fields[2]]);
        } else if (kind === "R") {
          const fields = line.slice(2, -1).split(",").map(Number);
          instructions.push([ShaderPreprocessorDirective.Reference, fields[0], fields[1]]);
        } else {
          const ids = line.slice(2, -1);
          owners = kind === "T" ? (ids ? ids.split(",").map(Number) : []) : undefined;
        }
        continue;
      }

      const match = ShaderInstructionEncoder._DIRECTIVE_RE.exec(line);
      if (!match) {
        const text = lineEnd < length ? line + "\n" : line;
        ShaderInstructionEncoder._pushText(instructions, text, 0, text.length, owners, sites);
        continue;
      }

      const keyword = match[1];
      const rest = match[2].trim();

      switch (keyword) {
        case "ifdef": {
          const idx = instructions.length;
          instructions.push([ShaderPreprocessorDirective.IfDef, rest, -1]);
          backfillStack.push([idx]);
          break;
        }
        case "ifndef": {
          const idx = instructions.length;
          instructions.push([ShaderPreprocessorDirective.IfNdef, rest, -1]);
          backfillStack.push([idx]);
          break;
        }
        case "if": {
          const cond = ShaderInstructionEncoder._parseCondition(rest, preprocessorExpressions);
          const idx = instructions.length;
          ShaderInstructionEncoder._pushConditionInstruction(instructions, cond);
          backfillStack.push([idx]);
          break;
        }
        case "elif": {
          const stack = backfillStack[backfillStack.length - 1];
          const prevIdx = stack[stack.length - 1];
          const elseIdx = instructions.length;
          instructions.push([ShaderPreprocessorDirective.Else, -1]);
          stack.push(elseIdx);
          ShaderInstructionEncoder._backfillJump(instructions[prevIdx], instructions.length);

          const cond = ShaderInstructionEncoder._parseCondition(rest, preprocessorExpressions);
          const idx = instructions.length;
          ShaderInstructionEncoder._pushConditionInstruction(instructions, cond);
          stack.push(idx);
          break;
        }
        case "else": {
          const stack = backfillStack[backfillStack.length - 1];
          const prevIdx = stack[stack.length - 1];
          const elseIdx = instructions.length;
          instructions.push([ShaderPreprocessorDirective.Else, -1]);
          stack.push(elseIdx);
          ShaderInstructionEncoder._backfillJump(instructions[prevIdx], instructions.length);
          break;
        }
        case "endif": {
          const endifIdx = instructions.length;
          instructions.push([ShaderPreprocessorDirective.Endif]);
          const stack = backfillStack.pop();
          if (stack) {
            const afterEndif = endifIdx + 1;
            for (let j = 0; j < stack.length; j++) {
              const inst = instructions[stack[j]];
              if (inst[0] === ShaderPreprocessorDirective.Else) {
                (inst as [number, number])[1] = afterEndif;
              } else {
                ShaderInstructionEncoder._backfillJump(inst, afterEndif, true);
              }
            }
          }
          break;
        }
        case "define": {
          const funcMatch = ShaderInstructionEncoder._FUNC_MACRO_RE.exec(rest);
          if (funcMatch) {
            const params = funcMatch[2]
              .split(",")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            instructions.push([
              ShaderPreprocessorDirective.DefineFunc,
              funcMatch[1],
              params,
              ShaderInstructionEncoder._stripLineComment(funcMatch[3].trim())
            ]);
          } else {
            const separator = ShaderInstructionEncoder._findInlineWhitespace(rest);
            if (separator === rest.length) {
              instructions.push([ShaderPreprocessorDirective.Define, rest]);
            } else {
              instructions.push([
                ShaderPreprocessorDirective.DefineVal,
                rest.substring(0, separator),
                ShaderInstructionEncoder._stripLineComment(rest.substring(separator + 1).trim())
              ]);
            }
          }
          break;
        }
        case "undef": {
          instructions.push([ShaderPreprocessorDirective.Undef, rest]);
          break;
        }
      }
    }

    return instructions;
  }

  private static _pushConditionInstruction(instructions: ShaderInstruction[], cond: Condition): void {
    if (cond.t === "def") {
      instructions.push([ShaderPreprocessorDirective.IfDef, cond.m, -1]);
    } else if (cond.t === "ndef") {
      instructions.push([ShaderPreprocessorDirective.IfNdef, cond.m, -1]);
    } else if (cond.t === "cmp") {
      instructions.push([ShaderPreprocessorDirective.IfCmp, cond.m, cond.op, cond.v, -1]);
    } else {
      instructions.push([ShaderPreprocessorDirective.IfExpr, cond, -1]);
    }
  }

  private static _parseCondition(
    expression: string,
    preprocessorExpressions?: ReadonlyMap<string, PreprocessorExpressionParseResult>
  ): Condition {
    const result = preprocessorExpressions?.get(expression) ?? parsePreprocessorExpression(expression);
    if ("error" in result) {
      if (!result.error.certain && result.hasExpandableIdentifier) return { t: "deferred", e: expression };
      throw new Error(result.error.message);
    }
    if (result.evaluationError) throw new Error(result.evaluationError);
    const compact = toPreprocessorCondition(result.condition);
    if (compact && !result.hasExpandableIdentifier) return compact;
    return result.hasExpandableIdentifier ? { t: "deferred", e: expression } : result.condition;
  }

  private static _findDirectiveStart(source: string, from: number, length: number): number {
    let i = from;
    while (i < length) {
      let j = i;
      while (j < length) {
        const c = source.charCodeAt(j);
        if (c === 32 /* space */ || c === 9 /* tab */) {
          j++;
        } else {
          break;
        }
      }
      if (j < length && (source.charCodeAt(j) === 35 /* '#' */ || source.charCodeAt(j) === 0)) return i;

      const nl = source.indexOf("\n", i);
      if (nl === -1) break;
      i = nl + 1;
    }
    return -1;
  }

  private static _findLogicalLineEnd(source: string, start: number, length: number): number {
    let lineEnd = source.indexOf("\n", start);
    while (lineEnd !== -1) {
      const beforeBreak = source.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 2 : lineEnd - 1;
      if (beforeBreak < start || source.charCodeAt(beforeBreak) !== 92) return lineEnd;
      lineEnd = source.indexOf("\n", lineEnd + 1);
    }
    return length;
  }

  private static _findInlineWhitespace(source: string): number {
    let index = 0;
    while (index < source.length) {
      const charCode = source.charCodeAt(index);
      if (charCode === 32 /* space */ || charCode === 9 /* tab */) break;
      index++;
    }
    return index;
  }

  private static _pushText(
    instructions: ShaderInstruction[],
    source: string,
    from: number,
    to: number,
    owners: readonly number[] | undefined,
    sites: IShaderUniformSite[]
  ): void {
    source = source.slice(from, to);
    from = 0;
    to = source.length;
    let marker = source.indexOf("\x01", from);
    while (marker >= from && marker < to) {
      ShaderInstructionEncoder._appendText(instructions, source, from, marker, owners, sites);
      const head = source.indexOf("\x01", marker + 1);
      const close = source.indexOf("\x01/\x01", head + 1);
      if (close < 0 || close > to) throw new Error("Shader reflection marker crosses a preprocessor directive.");
      const [kind, name, type, structName] = source.slice(marker + 1, head).split(",");
      const site: IShaderUniformSite = {
        instruction: instructions.length,
        kind: kind as IShaderUniformSite["kind"],
        name,
        type
      };
      if (structName) site.structName = structName;
      sites.push(site);
      let text = source.slice(head + 1, close);
      from = close + 3;
      // Global declaration emitters append their own semicolon outside the AST node.
      if (from < to && source[from] === ";") {
        text += ";";
        from++;
      }
      instructions.push(
        owners === undefined
          ? [ShaderPreprocessorDirective.Text, text]
          : [ShaderPreprocessorDirective.OwnedText, text, ...owners]
      );
      marker = source.indexOf("\x01", from);
    }
    ShaderInstructionEncoder._appendText(instructions, source, from, to, owners, sites);
  }

  private static _appendText(
    instructions: ShaderInstruction[],
    source: string,
    from: number,
    to: number,
    owners: readonly number[] | undefined,
    sites: IShaderUniformSite[]
  ): void {
    if (from >= to) return;
    const last = instructions.length > 0 ? instructions[instructions.length - 1] : null;
    const directive = owners === undefined ? ShaderPreprocessorDirective.Text : ShaderPreprocessorDirective.OwnedText;
    if (
      last &&
      sites[sites.length - 1]?.instruction !== instructions.length - 1 &&
      last[0] === directive &&
      (owners === undefined ||
        (last.length === owners.length + 2 && owners.every((owner, index) => last[index + 2] === owner)))
    ) {
      (last as [number, string])[1] += source.substring(from, to);
    } else {
      instructions.push(
        owners === undefined
          ? [directive, source.substring(from, to)]
          : [directive, source.substring(from, to), ...owners]
      );
    }
  }

  /**
   * Backfill jump offset of an IF/ELIF instruction.
   * When onlyPlaceholder is true, only backfill if the current value is still -1
   */
  private static _backfillJump(inst: ShaderInstruction, target: number, onlyPlaceholder = false): void {
    const directive = inst[0];
    if (directive === ShaderPreprocessorDirective.IfDef || directive === ShaderPreprocessorDirective.IfNdef) {
      if (!onlyPlaceholder || inst[2] === -1) (inst as [number, string, number])[2] = target;
    } else if (directive === ShaderPreprocessorDirective.IfCmp) {
      if (!onlyPlaceholder || inst[4] === -1) (inst as [number, string, string, number, number])[4] = target;
    } else if (directive === ShaderPreprocessorDirective.IfExpr) {
      if (!onlyPlaceholder || inst[2] === -1) (inst as [number, Condition, number])[2] = target;
    }
  }

  private static _stripLineComment(s: string): string {
    const idx = s.indexOf("//");
    return idx >= 0 ? s.substring(0, idx).trimEnd() : s;
  }
}
