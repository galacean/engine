import type { IShaderSource } from "@galacean/engine-design";
import type { Diagnostic, DiagnosticSeverity } from "./Diagnostic";

/** A diagnostic a custom rule may emit; its `code` is namespaced under the rule's name. */
export interface RuleDiagnostic {
  /** Defaults to `"error"`. */
  severity?: DiagnosticSeverity;
  /** Rule-local code; the analyzer prefixes it with `<rule.name>/`. */
  code: string;
  message: string;
  range: Diagnostic["range"];
}

/** Context passed to a custom rule for a single `analyze()` call. */
export interface RuleContext {
  /** Full shader source under analysis. */
  readonly source: string;
  /** Parsed shader structure (name / subShaders / passes), or `undefined` when structure parsing failed. */
  readonly shaderSource: IShaderSource | undefined;
  /** Convert a 0-based source offset to a 1-based line/column position. */
  positionAt(offset: number): Diagnostic["range"]["start"];
  /** Emit a diagnostic; its `code` is namespaced under the rule's name. */
  report(diagnostic: RuleDiagnostic): void;
}

/**
 * A user-registered diagnostic rule, run after the built-in checks on every `analyze()`.
 * Rules see the source text and parsed structure (not the internal AST), so they suit
 * text/structure lint checks (naming, banned constructs, required tags).
 */
export interface CustomRule {
  /** Unique namespace, e.g. `"myteam/no-discard"`; reported codes are prefixed with it. */
  readonly name: string;
  check(context: RuleContext): void;
}
