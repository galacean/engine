import { expandShaderMacros, type PreprocessorExpressionMacro } from "@galacean/engine-design";
import { BaseToken, type BranchSignature } from "../common/BaseToken";
import { canBranchesOverlap, getBranchCoverage } from "../common/BranchAnalysis";
import { ETokenType } from "../common";
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
      const references: MacroExpansionSyntax["references"][number][] = [];
      const used = new Set<TreeNode>();
      const keywords: number[] = [];
      let hasUnknownEffects = false;
      const lookup = new SymbolInfo("", ESymbolType.FN);
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (tokens[i - 1]?.lexeme === ".") continue;
        const argument = markers.get(token.lexeme);
        let name = token.lexeme;
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
          used.add(argument);
        } else if (token.type === ETokenType.ID) {
          references.push({ name, call: false, functions: [] });
          lookup.set(name, ESymbolType.VAR);
          if (!BuiltinVariable.getVar(name) && !analyzer.symbolTableStack.lookup(lookup, true, state.branch)) {
            hasUnknownEffects = true;
          }
        } else {
          keywords.push(token.type);
        }
      }
      result.push({ branch: state.branch, arguments: Array.from(used), references, keywords, hasUnknownEffects });
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
