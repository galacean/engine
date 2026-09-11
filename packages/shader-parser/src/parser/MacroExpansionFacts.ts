import { expandShaderMacros, type PreprocessorExpressionMacro } from "@galacean/engine-design";
import { BaseToken, type BranchSignature } from "../common/BaseToken";
import { canBranchesOverlap, getBranchCoverage } from "../common/BranchAnalysis";
import { ETokenType, Keyword } from "../common";
import { Lexer } from "../lexer/Lexer";
import type { MacroDefineList } from "../Preprocessor";
import { ParserUtils } from "../ParserUtils";
import { ASTNode, TreeNode } from "./AST";
import { BuiltinFunction, BuiltinVariable } from "./builtin";
import { ESymbolType, FnSymbol, SymbolInfo } from "./symbolTable";
import type SemanticAnalyzer from "./SemanticAnalyzer";
import type { MacroExpansionSyntax } from "./types";

interface MacroEvent {
  readonly offset: number;
  readonly branch: BranchSignature;
  readonly replacement?: PreprocessorExpressionMacro;
}

interface MacroHistory {
  readonly events: Map<string, MacroEvent[]>;
  markerPrefix?: string;
}

// Only AnalyzerLexer records events. The shared runtime AST invokes the optional diagnostic hook.
const histories = new WeakMap<MacroDefineList, MacroHistory>();
const MAX_EXPANSION_ALTERNATIVES = 64;
const WRITE_OPERATORS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|=", "++", "--"]);

/**
 * Retains source-ordered macro mutations separately from the codegen definition catalog.
 * @param definitions - Analyzer request's macro catalog, used only as a lifetime identity.
 * @param name - Macro being changed.
 * @param offset - Mutation offset in preprocessed source.
 * @param branch - Conditional constraints at the mutation.
 * @param body - Replacement text, or undefined for an undefinition.
 * @param parameters - Formal names for a function-like macro.
 * @internal
 */
export function recordMacroSyntaxEvent(
  definitions: MacroDefineList,
  name: string,
  offset: number,
  branch: BranchSignature,
  body?: string,
  parameters?: readonly string[]
): void {
  let history = histories.get(definitions);
  if (!history) histories.set(definitions, (history = { events: new Map() }));
  let events = history.events.get(name);
  if (!events) history.events.set(name, (events = []));
  events.push({ offset, branch, replacement: body === undefined ? undefined : { body, parameters } });
}

interface ExpansionState {
  branch: BranchSignature;
  readonly bindings: Map<string, MacroEvent | undefined>;
}

/**
 * Captures expanded lexical references and arguments without parsing a second shader program.
 * @param node - Macro invocation whose effective syntax is requested.
 * @param analyzer - Binding and macro state for this analysis request.
 * @param source - Preprocessed source used to choose collision-free argument markers.
 * @returns Proven expansion alternatives; unresolved replacements remain unreported.
 * @internal
 */
export function captureMacroExpansion(
  node: ASTNode.MacroCallSymbol | ASTNode.MacroCallFunction,
  analyzer: SemanticAnalyzer,
  source: string
): readonly MacroExpansionSyntax[] {
  const history = histories.get(analyzer.macroDefineList);
  if (!history) return [];
  if (!history.markerPrefix) {
    let prefix = "__galacean_macro_argument_";
    while (source.includes(prefix)) prefix += "_";
    history.markerPrefix = prefix;
  }
  const argumentList = node instanceof ASTNode.MacroCallFunction ? node.children[2] : undefined;
  const arguments_ = argumentList instanceof ASTNode.FunctionCallParameterList ? argumentList.paramNodes : [];
  const markers = new Map<string, TreeNode>();
  arguments_.forEach((argument, index) => {
    if (argument instanceof TreeNode) markers.set(`${history.markerPrefix}${index}`, argument);
  });
  const invocation =
    node instanceof ASTNode.MacroCallFunction
      ? `${node.macroName}(${Array.from(markers.keys()).join(",")})`
      : node.macroName;
  const pending: ExpansionState[] = [{ branch: node._branch, bindings: new Map() }];
  const result: MacroExpansionSyntax[] = [];
  const fork = {};
  let remaining = MAX_EXPANSION_ALTERNATIVES;
  let unresolved = false;
  while (pending.length && remaining-- > 0) {
    const state = pending.pop()!;
    try {
      const expanded = expandShaderMacros(invocation, (name) => {
        if (markers.has(name)) return;
        if (state.bindings.has(name)) return state.bindings.get(name)?.replacement;
        const events = history.events.get(name) ?? [];
        const choices: MacroEvent[] = [];
        const later: MacroEvent[] = [];
        for (let i = events.length - 1; i >= 0; i--) {
          const event = events[i];
          if (event.offset > node.location.start.index || !canBranchesOverlap(state.branch, event.branch)) continue;
          const branch = combine(state.branch, event.branch);
          // If a later mutation may intervene, the older replacement is not a proven invocation fact.
          if (!later.some((candidate) => canBranchesOverlap(branch, candidate.branch))) choices.push(event);
          else if (
            getBranchCoverage(
              later.map((candidate) => candidate.branch),
              branch
            ) !== "covered"
          ) {
            unresolved = true;
          }
          later.push(event);
        }
        if (choices.length > 1) {
          for (const choice of choices) {
            if (pending.length >= MAX_EXPANSION_ALTERNATIVES) break;
            pending.push({
              branch: combine(state.branch, choice.branch),
              bindings: new Map(state.bindings).set(name, choice)
            });
          }
          throw fork;
        }
        const choice = choices[0];
        state.bindings.set(name, choice);
        if (choice) state.branch = combine(state.branch, choice.branch);
        return choice?.replacement;
      });
      if (expanded.error) {
        unresolved = true;
        continue;
      }
      const tokens = Array.from(new Lexer(expanded.source, Object.create(null)).tokenize());
      const bracketEnds = new Map<number, number>();
      const brackets: number[] = [];
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].lexeme === "[") brackets.push(i);
        else if (tokens[i].lexeme === "]" && brackets.length) bracketEnds.set(brackets.pop()!, i + 1);
      }
      const references: MacroExpansionSyntax["references"][number][] = [];
      const used = new Set<TreeNode>();
      const keywords: number[] = [];
      const writtenTargets: (string | TreeNode)[] = [];
      const projectedWrites = new Set<number>();
      let valueTarget: string | TreeNode | undefined;
      let hasUnknownEffects = false;
      const lookup = new SymbolInfo("", ESymbolType.FN);
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (tokens[i - 1]?.lexeme === ".") continue;
        const argument = markers.get(token.lexeme);
        const suffix = targetSuffix(tokens, i, bracketEnds);
        let name = token.lexeme;
        if (token.type === ETokenType.ID && tokens[i + 1]?.lexeme !== "(") {
          lookup.set(name, ESymbolType.VAR);
          const variable = analyzer.symbolTableStack.lookup(lookup, true, state.branch);
          const builtin = variable ? undefined : BuiltinVariable.getVar(name);
          const target = argument ?? builtin?.semantic ?? name;
          if (suffix.start === 0 && suffix.end === tokens.length) valueTarget = target;
          const after = tokens[suffix.end]?.lexeme;
          const before = tokens[suffix.start - 1]?.lexeme;
          if (WRITE_OPERATORS.has(after)) {
            writtenTargets.push(target);
            projectedWrites.add(suffix.end);
          }
          if (before === "++" || before === "--") {
            writtenTargets.push(target);
            projectedWrites.add(suffix.start - 1);
          }
        }
        if (argument && tokens[i + 1]?.lexeme === "(") {
          const identifier = ParserUtils.unwrapBareIdentifier(argument, { allowParens: true });
          const child = identifier?.children[0];
          name = child instanceof BaseToken ? child.lexeme : "";
        }
        if (token.type === ETokenType.ID && tokens[i + 1]?.lexeme === "(") {
          lookup.set(name, ESymbolType.FN);
          const candidates = analyzer.symbolTableStack.lookupAll(lookup, true, [], state.branch);
          const functions = candidates.filter((symbol): symbol is FnSymbol => symbol instanceof FnSymbol);
          if (BuiltinFunction.isExist(name) || functions.length) {
            references.push({ name, call: true, functions: functions.length === 1 ? functions : [] });
            if (functions.length > 1) hasUnknownEffects = true;
            if (
              functions.some((fn) =>
                fn.astNode.protoType.parameterList?.some((parameter) => {
                  const declaration = parameter.astNode;
                  return (
                    declaration instanceof ASTNode.ParameterDeclaration &&
                    (ParserUtils.hasQualifier(declaration, Keyword.OUT) ||
                      ParserUtils.hasQualifier(declaration, Keyword.INOUT))
                  );
                })
              )
            ) {
              // The lexical call projection does not bind output parameters to actual targets.
              hasUnknownEffects = true;
            }
          } else {
            lookup.set(name, ESymbolType.STRUCT);
            if (!analyzer.symbolTableStack.lookup(lookup, true, state.branch)) {
              // An unresolved callee may be a runtime macro that discards every argument.
              hasUnknownEffects = true;
              let depth = 0;
              do {
                const current = tokens[++i]?.lexeme;
                if (current === "(") depth++;
                if (current === ")") depth--;
              } while (i + 1 < tokens.length && depth > 0);
              continue;
            }
          }
        } else if (argument) {
          const identifier = suffix.indexed
            ? ParserUtils.unwrapBareIdentifier(argument, { allowParens: true })
            : undefined;
          const child = identifier?.children[0];
          if (identifier?.builtinSemantic !== undefined && child instanceof BaseToken) {
            references.push({
              name: child.lexeme,
              call: false,
              functions: [],
              builtinSemantic: identifier.builtinSemantic,
              indexed: true
            });
          } else {
            used.add(argument);
          }
        } else if (token.type === ETokenType.ID) {
          lookup.set(name, ESymbolType.VAR);
          const variable = analyzer.symbolTableStack.lookup(lookup, true, state.branch);
          const builtin = variable ? undefined : BuiltinVariable.getVar(name);
          references.push({
            name,
            call: false,
            functions: [],
            builtinSemantic: builtin?.semantic,
            indexed: suffix.indexed
          });
          if (!builtin && !variable) {
            hasUnknownEffects = true;
          }
        } else {
          keywords.push(token.type);
        }
      }
      // The token projection only proves simple assignment targets. An unrecognized mutation
      // cannot be treated as evidence that a shader output is definitely unwritten.
      if (tokens.some((token, index) => WRITE_OPERATORS.has(token.lexeme) && !projectedWrites.has(index))) {
        hasUnknownEffects = true;
      }
      result.push({
        branch: state.branch,
        arguments: Array.from(used),
        references,
        keywords,
        writtenTargets,
        valueTarget,
        hasUnknownEffects
      });
    } catch (error) {
      if (error !== fork) throw error;
    }
  }
  if (unresolved || pending.length) {
    result.push({ branch: node._branch, arguments: [], references: [], keywords: [], hasUnknownEffects: true });
  }
  return result;
}

function combine(left: BranchSignature, right: BranchSignature): BranchSignature {
  return left.concat(right.filter((constraint) => !left.includes(constraint)));
}

// Recognize only an identifier's postfix target suffix. This is a lexical projection, not a
// second expression parser; unsupported shapes leave their write operator unresolved above.
function targetSuffix(
  tokens: readonly BaseToken[],
  index: number,
  bracketEnds: ReadonlyMap<number, number>
): { start: number; end: number; indexed: boolean } {
  let start = index;
  let end = index + 1;
  let indexed = false;
  while (end < tokens.length) {
    if (tokens[end].lexeme === "." && tokens[end + 1]?.type === ETokenType.ID) {
      end += 2;
    } else if (tokens[end].lexeme === "[") {
      const next = bracketEnds.get(end);
      if (next === undefined) break;
      indexed = true;
      end = next;
    } else if (tokens[end].lexeme === ")" && tokens[start - 1]?.lexeme === "(") {
      start--;
      end++;
    } else {
      break;
    }
  }
  return { start, end, indexed };
}
