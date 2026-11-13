import { Keyword } from "../common/enums/Keyword";
import { BaseToken, EMPTY_BRANCH, type BranchSignature } from "../common/BaseToken";
import { ASTNode, TreeNode } from "../parser/AST";
import { NoneTerminal } from "../parser/GrammarSymbol";
import { ParserUtils } from "../ParserUtils";
import type { ReferenceResolutionSnapshot } from "../parser/ShaderInfo";
import { FnSymbol, VarSymbol } from "../parser/symbolTable";
import type { StructProp } from "../parser/types";
import type { ShaderRange } from "../common/ShaderRange";
import type { ShaderClueIR } from "../ir/ShaderClueIR";
import {
  ShaderCoreInfo,
  ShaderStructRole,
  type BranchCoverageResolver,
  type DeclarationCoexistenceResolver
} from "../ir/ShaderCoreInfo";

/**
 * A definite MRT member contract violation shared by analyzer and compiler.
 * @internal
 */
export interface ShaderMrtOutputIssue {
  /** Offending MRT member. */
  readonly prop: StructProp;
  /** GLES lowering reason the member cannot be lowered consistently. */
  readonly kind: "missing-location" | "invalid-location" | "duplicate-location" | "invalid-type";
}

/**
 * A member owner resolution that a backend cannot lower uniformly.
 * @internal
 */
export interface ShaderStructMemberOwnerIssue {
  /** Call-site range of the unsafe member projection. */
  readonly location: ShaderRange;
  /** GLES lowering reason the member projection is unsafe. */
  readonly kind: "mixed-owner-roles" | "runtime-expanded-io-owner" | "unresolved-owner" | "incompatible-io-member";
  /** Whether branch analysis proves the conflict or cannot decide it. */
  readonly certainty: "definite" | "unknown";
}

/**
 * GLES flattening constraints derived from neutral entry and IO facts. These checks belong to
 * the target contract: another backend may preserve struct values or support other output types.
 * The analyzer shares this policy without loading a compiler or creating a graphics context.
 * @internal
 */
export class GLESShaderInfo {
  readonly mrtOutputIssues: readonly ShaderMrtOutputIssue[];
  readonly invalidMrtReturnLocations: readonly ShaderRange[];
  readonly invalidVaryingReturnLocations: readonly ShaderRange[];
  readonly structMemberOwnerIssues: readonly ShaderStructMemberOwnerIssue[];

  constructor(ir: ShaderClueIR, coreInfo: ShaderCoreInfo) {
    const { io, vertexEntry, fragmentEntry, getDeclarationCoexistence, getBranchCoverage } = coreInfo;
    this.mrtOutputIssues = collectMrtOutputIssues(io.mrtList, getDeclarationCoexistence);
    this.invalidMrtReturnLocations = collectInvalidEntryReturns(fragmentEntry.functions, io.mrtStructs, false);
    this.invalidVaryingReturnLocations = collectInvalidEntryReturns(vertexEntry.functions, io.varyingStructs, true);
    this.structMemberOwnerIssues = collectStructMemberOwnerIssues(
      [...vertexEntry.functions, ...fragmentEntry.functions],
      ir.shaderData.directMemberOwnerReferences,
      ir.shaderData.referenceResolutionSnapshots,
      io.structVariableRoles,
      getBranchCoverage
    );
  }
}

interface OwnerResolution {
  readonly symbols: readonly (VarSymbol | FnSymbol)[];
  readonly fallbackStart: number;
  readonly callSiteBranch: BranchSignature;
}

type ShaderStructOwnerKind = ShaderStructRole | "ordinary";

function collectStructMemberOwnerIssues(
  entries: readonly FnSymbol[],
  directMemberReferences: readonly ASTNode.VariableIdentifier[],
  snapshots: readonly ReferenceResolutionSnapshot[],
  variableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>,
  getBranchCoverage: BranchCoverageResolver
): ShaderStructMemberOwnerIssue[] {
  const visitedFunctions = new Set<FnSymbol>();
  const reachableFunctions = new Set<ASTNode.FunctionDefinition>();
  const pending = entries.slice();
  while (pending.length) {
    const fn = pending.pop()!;
    if (visitedFunctions.has(fn)) continue;
    visitedFunctions.add(fn);
    reachableFunctions.add(fn.astNode);
    pending.push(...fn.calledFunctions);
  }

  const snapshotsByReference = new Map<ASTNode.VariableIdentifier, ReferenceResolutionSnapshot[]>();
  for (const snapshot of snapshots) {
    let referenceSnapshots = snapshotsByReference.get(snapshot.reference);
    if (!referenceSnapshots) snapshotsByReference.set(snapshot.reference, (referenceSnapshots = []));
    referenceSnapshots.push(snapshot);
  }

  const issues = new Map<ASTNode.VariableIdentifier, OwnerIssue>();
  for (const reference of directMemberReferences) {
    if (!isReferenceReachable(reference, reachableFunctions)) continue;
    const child = reference.children[0];
    const referenceSnapshots = snapshotsByReference
      .get(reference)
      ?.filter(
        (snapshot) =>
          snapshot.replacementMemberOwner === undefined && (child instanceof BaseToken || snapshot.isValueIdentity)
      );
    let resolutions: readonly OwnerResolution[] | undefined;
    if (child instanceof BaseToken) {
      const symbols = reference.resolvedValueSymbols();
      resolutions = referenceSnapshots?.length
        ? referenceSnapshots
        : [
            {
              symbols,
              fallbackStart: symbols.length,
              callSiteBranch: reference._branch
            }
          ];
    } else if (child instanceof ASTNode.MacroCallSymbol || child instanceof ASTNode.MacroCallFunction) {
      resolutions = referenceSnapshots;
    }
    if (resolutions?.length) {
      const hasUnresolvedMacroOwner =
        !(child instanceof BaseToken) && resolutions.some((resolution) => resolution.symbols.length === 0);
      if (hasUnresolvedMacroOwner) {
        recordOwnerIssue(issues, reference, "unresolved-owner", "unknown");
      }
      const member = child instanceof BaseToken || hasUnresolvedMacroOwner ? undefined : findDirectMember(reference);
      if (member) {
        recordOwnerIssue(
          issues,
          reference,
          "incompatible-io-member",
          classifyIOMemberAvailability(member, resolutions, variableRoles, getBranchCoverage)
        );
      }
      recordOwnerIssue(
        issues,
        reference,
        "mixed-owner-roles",
        classifyOwnerResolutions(reference, resolutions, variableRoles, getBranchCoverage)
      );
    }
  }

  // Definition-owned AST identity keeps path-equal replacements in independent macro arms separate
  const replacementOwnerGroups = new Map<
    ASTNode.VariableIdentifier,
    Map<ASTNode.VariableIdentifier, ReferenceResolutionSnapshot[]>
  >();
  for (const snapshot of snapshots) {
    const owner = snapshot.replacementMemberOwner;
    if (owner === undefined || !isReferenceReachable(snapshot.reference, reachableFunctions)) continue;
    let ownerGroups = replacementOwnerGroups.get(snapshot.reference);
    if (!ownerGroups) replacementOwnerGroups.set(snapshot.reference, (ownerGroups = new Map()));
    let group = ownerGroups.get(owner);
    if (!group) ownerGroups.set(owner, (group = []));
    group.push(snapshot);
  }
  for (const [reference, ownerGroups] of replacementOwnerGroups) {
    for (const resolutions of ownerGroups.values()) {
      if (resolutions.some((resolution) => resolution.symbols.length === 0)) {
        recordOwnerIssue(issues, reference, "unresolved-owner", "unknown");
      }
      if (resolutions.some((resolution) => resolution.requiresRuntimeOwnerExpansion)) {
        recordOwnerIssue(
          issues,
          reference,
          "runtime-expanded-io-owner",
          classifyRuntimeExpandedOwner(resolutions, variableRoles, getBranchCoverage)
        );
      }
      recordOwnerIssue(
        issues,
        reference,
        "mixed-owner-roles",
        classifyOwnerResolutions(reference, resolutions, variableRoles, getBranchCoverage)
      );
    }
  }

  return Array.from(issues, ([reference, issue]) => ({ location: reference.location, ...issue }));
}

function isReferenceReachable(
  reference: ASTNode.VariableIdentifier,
  reachableFunctions: ReadonlySet<ASTNode.FunctionDefinition>
): boolean {
  let current = reference.parent;
  while (current) {
    if (current instanceof ASTNode.FunctionDefinition) return reachableFunctions.has(current);
    current = current.parent;
  }
  return false;
}

function findDirectMember(reference: ASTNode.VariableIdentifier): BaseToken | undefined {
  let current = reference.parent;
  while (current) {
    if (current instanceof ASTNode.PostfixExpression && current.children.length === 3) {
      const base = current.children[0];
      const member = current.children[2];
      if (
        base instanceof TreeNode &&
        member instanceof BaseToken &&
        ParserUtils.unwrapBareIdentifier(base, { allowParens: true }) === reference
      ) {
        return member;
      }
    }
    current = current.parent;
  }
  return undefined;
}

function classifyIOMemberAvailability(
  member: BaseToken,
  resolutions: readonly OwnerResolution[],
  variableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>,
  getBranchCoverage: BranchCoverageResolver
): "definite" | "unknown" | undefined {
  let certainty: "unknown" | undefined;
  for (const resolution of resolutions) {
    const primarySymbols = resolution.symbols.slice(0, resolution.fallbackStart);
    const primaryCoverage = getBranchCoverage(
      primarySymbols.map((symbol) => symbol.branchSignature ?? EMPTY_BRANCH),
      resolution.callSiteBranch
    );
    const retainedSymbols = primaryCoverage === "covered" ? primarySymbols : resolution.symbols;
    for (const symbol of retainedSymbols) {
      if (!(symbol instanceof VarSymbol) || !variableRoles.has(symbol)) continue;
      const ownerBranch = mergeBranchSignatures(resolution.callSiteBranch, symbol.branchSignature ?? EMPTY_BRANCH);
      const memberBranches: BranchSignature[] = [];
      for (const struct of symbol.dataType?.structDeclarations ?? []) {
        for (const prop of struct.propList) {
          if (prop.ident.lexeme !== member.lexeme) continue;
          memberBranches.push(mergeBranchSignatures(ownerBranch, struct._branch, prop.ident.branch));
        }
      }
      const memberCoverage = getBranchCoverage(memberBranches, ownerBranch);
      if (!memberBranches.length || memberCoverage === "uncovered") return "definite";
      if (memberCoverage === "unknown") certainty = "unknown";
    }
  }
  return certainty;
}

function mergeBranchSignatures(...branches: readonly BranchSignature[]): BranchSignature {
  const merged: BranchSignature[number][] = [];
  for (const branch of branches) {
    for (const constraint of branch) {
      if (merged.indexOf(constraint) === -1) merged.push(constraint);
    }
  }
  return merged;
}

function classifyOwnerResolutions(
  reference: ASTNode.VariableIdentifier,
  resolutions: readonly OwnerResolution[],
  variableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>,
  getBranchCoverage: BranchCoverageResolver
): "definite" | "unknown" | undefined {
  const resolutionKinds: ShaderStructOwnerKind[] = [];
  let hasUnknownConflict = false;
  for (const resolution of resolutions) {
    const primaryBranches: BranchSignature[] = [];
    for (let i = 0; i < resolution.fallbackStart; i++) {
      primaryBranches.push(resolution.symbols[i].branchSignature ?? EMPTY_BRANCH);
    }
    const primaryCoverage = getBranchCoverage(primaryBranches, resolution.callSiteBranch);
    const primaryKinds = collectOwnerKinds(resolution.symbols, variableRoles, resolution.fallbackStart);
    const retainedKinds =
      primaryCoverage === "covered" ? primaryKinds : collectOwnerKinds(resolution.symbols, variableRoles);
    if (retainedKinds.size > 1) {
      if (
        (primaryKinds.size > 1 && primaryCoverage === "covered") ||
        (primaryKinds.size <= 1 && primaryCoverage === "uncovered")
      ) {
        return "definite";
      }
      hasUnknownConflict = true;
    }
    for (const kind of retainedKinds) {
      if (resolutionKinds.indexOf(kind) === -1) resolutionKinds.push(kind);
    }
  }
  if (hasUnknownConflict) return "unknown";
  if (resolutionKinds.length <= 1) return undefined;
  const replacementCoverage = getBranchCoverage(
    resolutions.map((resolution) => resolution.callSiteBranch),
    reference._branch
  );
  return replacementCoverage === "covered" ? "definite" : "unknown";
}

function classifyRuntimeExpandedOwner(
  resolutions: readonly OwnerResolution[],
  variableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>,
  getBranchCoverage: BranchCoverageResolver
): "definite" | "unknown" | undefined {
  let hasUnknownIOOwner = false;
  for (const resolution of resolutions) {
    const primarySymbols = resolution.symbols.slice(0, resolution.fallbackStart);
    const primaryCoverage = getBranchCoverage(
      primarySymbols.map((symbol) => symbol.branchSignature ?? EMPTY_BRANCH),
      resolution.callSiteBranch
    );
    const retainedSymbols = primaryCoverage === "covered" ? primarySymbols : resolution.symbols;
    if (!containsStructIORole(retainedSymbols, variableRoles)) continue;
    const retainedCoverage =
      primaryCoverage === "covered"
        ? primaryCoverage
        : getBranchCoverage(
            retainedSymbols.map((symbol) => symbol.branchSignature ?? EMPTY_BRANCH),
            resolution.callSiteBranch
          );
    if (retainedCoverage === "covered") return "definite";
    hasUnknownIOOwner = true;
  }
  return hasUnknownIOOwner ? "unknown" : undefined;
}

function containsStructIORole(
  symbols: readonly (VarSymbol | FnSymbol)[],
  variableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>
): boolean {
  return symbols.some((symbol) => symbol instanceof VarSymbol && variableRoles.has(symbol));
}

function collectOwnerKinds(
  symbols: readonly (VarSymbol | FnSymbol)[],
  variableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>,
  end = symbols.length
): Set<ShaderStructOwnerKind> {
  const kinds = new Set<ShaderStructOwnerKind>();
  for (let i = 0; i < end; i++) {
    const symbol = symbols[i];
    if (symbol instanceof VarSymbol) kinds.add(variableRoles.get(symbol) ?? "ordinary");
  }
  return kinds;
}

interface OwnerIssue {
  readonly kind: ShaderStructMemberOwnerIssue["kind"];
  readonly certainty: ShaderStructMemberOwnerIssue["certainty"];
}

function recordOwnerIssue(
  issues: Map<ASTNode.VariableIdentifier, OwnerIssue>,
  reference: ASTNode.VariableIdentifier,
  kind: ShaderStructMemberOwnerIssue["kind"],
  certainty: "definite" | "unknown" | undefined
): void {
  if (!certainty) return;
  const existing = issues.get(reference);
  if (!existing || (existing.certainty === "unknown" && certainty === "definite")) {
    issues.set(reference, { kind, certainty });
  }
}

function collectInvalidEntryReturns(
  functions: readonly FnSymbol[],
  ioStructs: readonly ASTNode.StructSpecifier[],
  allowFunctionResult: boolean
): ShaderRange[] {
  const locations: ShaderRange[] = [];
  for (const fn of functions) {
    const returnStructs = fn.astNode.protoType.returnType.typeSpecifier.structDeclarations;
    if (!returnStructs.some((struct) => ioStructs.includes(struct))) continue;
    collectInvalidReturnsInNode(fn.astNode.statements, returnStructs, allowFunctionResult, locations);
  }
  return locations;
}

function collectInvalidReturnsInNode(
  node: TreeNode,
  returnStructs: readonly ASTNode.StructSpecifier[],
  allowFunctionResult: boolean,
  out: ShaderRange[]
): void {
  if (node instanceof ASTNode.JumpStatement && node.children.length === 3) {
    const expression = node.children[1];
    if (!(expression instanceof TreeNode) || !isEntryReturnExpression(expression, returnStructs, allowFunctionResult)) {
      out.push(node.location);
    }
    return;
  }
  for (const child of node.children) {
    if (child instanceof TreeNode) collectInvalidReturnsInNode(child, returnStructs, allowFunctionResult, out);
  }
}

function isEntryReturnExpression(
  expression: TreeNode,
  returnStructs: readonly ASTNode.StructSpecifier[],
  allowFunctionResult: boolean
): boolean {
  const variable = ParserUtils.unwrapBareIdentifier(expression, { allowParens: true });
  const symbols = variable?.resolvedValueSymbols() ?? [];
  if (
    symbols.length > 0 &&
    symbols.every(
      (symbol) =>
        symbol instanceof VarSymbol &&
        symbol.dataType?.structDeclarations.some((struct) => returnStructs.includes(struct))
    )
  )
    return true;
  if (!allowFunctionResult) return false;
  const call = ParserUtils.unwrapNodeByType<ASTNode.FunctionCall>(expression, NoneTerminal.function_call);
  const generic = call?.children[0] as ASTNode.FunctionCallGeneric | undefined;
  return (
    generic?.fnSymbol instanceof FnSymbol &&
    generic.fnSymbol.dataType?.structDeclarations.some((struct) => returnStructs.includes(struct)) === true
  );
}

function collectMrtOutputIssues(
  props: readonly StructProp[],
  getDeclarationCoexistence: DeclarationCoexistenceResolver
): ShaderMrtOutputIssue[] {
  const issues: ShaderMrtOutputIssue[] = [];
  const occupiedLocations = new Map<number, StructProp[]>();
  for (const prop of props) {
    if (prop.typeInfo.type !== Keyword.VEC4) {
      issues.push({ prop, kind: "invalid-type" });
    }
    const location = prop.mrtIndex;
    if (location === undefined) {
      issues.push({ prop, kind: "missing-location" });
    } else if (!Number.isInteger(location) || location < 0) {
      issues.push({ prop, kind: "invalid-location" });
    } else if (
      occupiedLocations
        .get(location)
        ?.some((existing) => getDeclarationCoexistence(existing.ident.branch, prop.ident.branch) === "coexist")
    ) {
      issues.push({ prop, kind: "duplicate-location" });
    } else {
      const occupants = occupiedLocations.get(location) ?? [];
      occupants.push(prop);
      occupiedLocations.set(location, occupants);
    }
  }
  return issues;
}
