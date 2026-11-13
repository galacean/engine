import { TypeAny } from "../common/types";
import { Keyword } from "../common/enums/Keyword";
import type { SymbolTable } from "../common/SymbolTable";
import { ASTNode } from "../parser/AST";
import { ESymbolType, FnSymbol, type SymbolInfo } from "../parser/symbolTable";
import { proveInheritanceBranchesCover } from "../preprocessor/PreprocessorCondition";

/** Variant-time ownership of a declaration whose static inheritance coverage remains unknown. @internal */
export interface DeferredDeclarationOwnership {
  /** Unique declaration identity within the parsed pass. */
  readonly id: number;
  /** Exact declaration family resolved together at variant selection. */
  readonly group: number;
  /** ShaderLab inheritance layer; larger values take precedence. */
  readonly sourceScope: number;
}

/** Request-owned inheritance facts derived from the completed symbol table. @internal */
export interface ShaderDeclarationOwnershipInfo {
  /** Declarations requiring variant-time ownership selection. */
  readonly declarations: ReadonlyMap<SymbolInfo, DeferredDeclarationOwnership>;
  /** Candidates with unresolved signatures or known conflicts that variant-time selection must not hide. */
  readonly unsupported: readonly SymbolInfo[];
  /** Coverage of each inherited declaration by all strictly matching narrower candidates. */
  readonly coverage: ReadonlyMap<SymbolInfo, boolean | undefined>;
}

/**
 * Derives deferred declaration families without treating wildcard overload compatibility as identity.
 * @param symbolTable - Completed global symbol table, after known inheritance coverage has been removed.
 * @returns Ownership facts that share the lifetime of the parsed pass.
 * @internal
 */
export function createShaderDeclarationOwnership(symbolTable: SymbolTable<SymbolInfo>): ShaderDeclarationOwnershipInfo {
  const groups = new Map<string, SymbolInfo[]>();
  const names = new Map<string, SymbolInfo[]>();
  const keys = new Map<SymbolInfo, string | undefined>();
  symbolTable.forEach((symbol) => {
    if (!symbol.astNode) return;
    const name = JSON.stringify([symbol.type, symbol.ident]);
    const candidates = names.get(name) ?? [];
    candidates.push(symbol);
    names.set(name, candidates);
    const key = declarationKey(symbol);
    keys.set(symbol, key);
    if (key === undefined) return;
    const group = groups.get(key) ?? [];
    group.push(symbol);
    groups.set(key, group);
  });

  const declarations = new Map<SymbolInfo, DeferredDeclarationOwnership>();
  const coverage = new Map<SymbolInfo, boolean | undefined>();
  const unsupported = new Set<SymbolInfo>();
  let groupId = 0;
  for (const group of groups.values()) {
    let deferred = false;
    for (const earlier of group) {
      const narrower = group.filter((candidate) => candidate.sourceScope > earlier.sourceScope);
      if (!narrower.length) continue;
      const proof = proveInheritanceBranchesCover(
        narrower.map((candidate) => candidate.branchSignature),
        earlier.branchSignature
      );
      coverage.set(earlier, proof);
      deferred ||= proof === undefined;
    }
    if (!deferred) continue;
    groupId++;
    for (const symbol of group) {
      declarations.set(symbol, { id: declarations.size + 1, group: groupId, sourceScope: symbol.sourceScope });
      if (coverage.get(symbol) !== false) continue;
      for (const narrower of group) {
        if (narrower.sourceScope <= symbol.sourceScope) continue;
        // A counterexample to coverage by no alternatives proves that both guards can be active.
        if (proveInheritanceBranchesCover([], symbol.branchSignature.concat(narrower.branchSignature)) === false) {
          unsupported.add(symbol);
          unsupported.add(narrower);
        }
      }
    }
  }

  for (const candidates of names.values()) {
    if (!candidates.some((candidate) => keys.get(candidate) === undefined)) continue;
    for (const earlier of candidates) {
      const narrower = candidates.filter(
        (candidate) => candidate.sourceScope > earlier.sourceScope && candidate.equal(earlier)
      );
      if (!narrower.length || (keys.get(earlier) !== undefined && narrower.every((candidate) => keys.get(candidate))))
        continue;
      if (
        proveInheritanceBranchesCover(
          narrower.map((candidate) => candidate.branchSignature),
          earlier.branchSignature
        ) === undefined
      ) {
        unsupported.add(earlier);
        for (const candidate of narrower) unsupported.add(candidate);
      }
    }
  }
  return { declarations, unsupported: Array.from(unsupported), coverage };
}

/**
 * Tests whether one cross-scope conflict is specifically deferred, preserving known partial-coverage errors.
 * @param facts - Ownership facts from the completed table.
 * @param left - One surviving declaration.
 * @param right - Another surviving declaration.
 * @returns Whether variant-time selection replaces static coexistence rejection for this pair.
 * @internal
 */
export function isDeferredDeclarationPair(
  facts: ShaderDeclarationOwnershipInfo,
  left: SymbolInfo,
  right: SymbolInfo
): boolean {
  if (left.sourceScope === right.sourceScope) return false;
  const group = facts.declarations.get(left)?.group;
  if (group === undefined || facts.declarations.get(right)?.group !== group) return false;
  const earlier = left.sourceScope < right.sourceScope ? left : right;
  return facts.coverage.has(earlier) && facts.coverage.get(earlier) === undefined;
}

function declarationKey(symbol: SymbolInfo): string | undefined {
  if (symbol.type !== ESymbolType.FN) return JSON.stringify([symbol.type, symbol.ident]);
  if (!(symbol instanceof FnSymbol)) return;
  const parameters = symbol.astNode.protoType.parameterList ?? [];
  const signature: (readonly [number | string, number | string | null])[] = [];
  for (const parameter of parameters) {
    const type = parameter.typeInfo;
    if (!type || type.type === TypeAny) return;
    if (type.type === Keyword.VOID && parameters.length === 1 && !type.arraySpecifier) continue;
    const array = type.arraySpecifier;
    let shape: number | string | null = null;
    if (array) {
      if (array.children.some((child) => child instanceof ASTNode.ArraySpecifier)) return;
      if (array.children.length === 2) shape = "unsized";
      else if (array.size !== undefined) shape = array.size;
      else return;
    }
    signature.push([type.type, shape]);
  }
  return JSON.stringify([symbol.type, symbol.ident, signature]);
}
