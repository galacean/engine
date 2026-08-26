import { EShaderStage } from "../common/enums/ShaderStage";
import { Keyword } from "../common/enums/Keyword";
import { BaseToken, type BranchCoverage, type BranchSignature, type DeclarationCoexistence } from "../common/BaseToken";
import { getLexicalDeclarationCoexistence, isLexicalBranchVisibleFrom } from "../common/BranchIdentity";
import { ASTNode, TreeNode } from "../parser/AST";
import { NoneTerminal } from "../parser/GrammarSymbol";
import { ParserUtils } from "../ParserUtils";
import type { RuntimeFallbackReference } from "../parser/ShaderInfo";
import { ESymbolType, FnSymbol, SymbolInfo, SymbolTable, VarSymbol } from "../parser/symbolTable";
import type { StructProp } from "../parser/types";
import type { ShaderRange } from "../common/ShaderRange";
import type { ShaderClueIR } from "./ShaderClueIR";

/** Role a struct type plays in backend stage IO. @internal */
export enum ShaderStructRole {
  Varying = "varying",
  Attribute = "attribute",
  Mrt = "mrt"
}

/** Backend-relevant stage entry and its matching declarations. @internal */
export interface ShaderEntryPointInfo {
  /** Pipeline stage represented by this entry. */
  readonly stage: EShaderStage;
  /** Entry function name from the ShaderLab pass. */
  readonly name: string;
  /** Matching function declarations retained across macro branches. */
  readonly functions: readonly FnSymbol[];
  /** Whether two declarations are proven active under the same macro configuration. */
  readonly hasDefiniteAmbiguity: boolean;
}

/** A struct assigned incompatible IO roles. The analyzer decides how to diagnose this fact. @internal */
export interface ShaderStructRoleConflict {
  /** Conflicting struct declaration. */
  readonly struct: ASTNode.StructSpecifier;
  /** Roles inferred from the two entry signatures. */
  readonly roles: readonly ShaderStructRole[];
}

/** A definite MRT member contract violation shared by analyzer and compiler. @internal */
export interface ShaderMrtOutputIssue {
  /** Offending MRT member. */
  readonly prop: StructProp;
  /** Backend-neutral reason the member cannot be lowered consistently. */
  readonly kind: "missing-location" | "invalid-location" | "duplicate-location" | "invalid-type";
}

/** Backend-required shader input/output facts. @internal */
export interface ShaderIOInfo {
  readonly attributeStructs: readonly ASTNode.StructSpecifier[];
  readonly attributeList: readonly StructProp[];
  readonly varyingStructs: readonly ASTNode.StructSpecifier[];
  readonly varyingList: readonly StructProp[];
  readonly mrtStructs: readonly ASTNode.StructSpecifier[];
  readonly mrtList: readonly StructProp[];
  /** Exact variable identities whose custom structs are lowered as stage interfaces. */
  readonly structVariableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>;
  /** Interface variables reachable from the vertex entry, used for unresolved global macro values. */
  readonly vertexStructVariableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>;
  /** Interface variables reachable from the fragment entry, used for unresolved global macro values. */
  readonly fragmentStructVariableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>;
}

/**
 * Lightweight semantic information required by shader backends.
 *
 * It derives entry and IO facts from `ShaderClueIR` without creating diagnostics or depending on an
 * analyzer. Invalid-role facts are retained separately so emitters can stay deterministic while an
 * analyzer chooses the diagnostic policy.
 * @internal
 */
export class ShaderCoreInfo {
  /** Vertex entry facts. */
  readonly vertexEntry: ShaderEntryPointInfo;
  /** Fragment entry facts. */
  readonly fragmentEntry: ShaderEntryPointInfo;
  /** Valid, unambiguous stage IO consumed by backends. */
  readonly io: ShaderIOInfo;
  /** IO role conflicts excluded from `io`. */
  readonly roleConflicts: readonly ShaderStructRoleConflict[];
  /** Definite MRT member violations that must block backend generation. */
  readonly mrtOutputIssues: readonly ShaderMrtOutputIssue[];
  /** MRT entry returns that cannot be represented by the flattened GLES output contract. */
  readonly invalidMrtReturnLocations: readonly ShaderRange[];
  /** Varying entry returns that cannot be represented by the flattened GLES output contract. */
  readonly invalidVaryingReturnLocations: readonly ShaderRange[];
  /**
   * Member references whose runtime owners mix flattened IO values and ordinary variables.
   */
  readonly ambiguousStructMemberOwnerLocations: readonly ShaderRange[];
  /**
   * Member references that a backend cannot lower safely for every retained macro configuration.
   */
  readonly unlowerableStructMemberOwnerLocations: readonly ShaderRange[];
  /** Global preprocessor declarations that backends may reproduce. */
  readonly outerGlobalMacroDeclarations: readonly ASTNode.GlobalDeclaration[];

  /**
   * Derives backend-required facts from a neutral shader IR.
   * @param ir - Neutral shader IR.
   * @param vertexEntry - Vertex entry function name.
   * @param fragmentEntry - Fragment entry function name.
   * @param getDeclarationCoexistence - Optional full macro-proof function for authoring/offline validation.
   * @param getBranchCoverage - Optional full coverage proof for conditional runtime owners.
   * @returns Lightweight backend information with no diagnostics.
   */
  static create(
    ir: ShaderClueIR,
    vertexEntry: string,
    fragmentEntry: string,
    getDeclarationCoexistence: DeclarationCoexistenceResolver = getLexicalDeclarationCoexistence,
    getBranchCoverage: BranchCoverageResolver = getRuntimeBranchCoverage
  ): ShaderCoreInfo {
    return new ShaderCoreInfo(ir, vertexEntry, fragmentEntry, getDeclarationCoexistence, getBranchCoverage);
  }

  private constructor(
    ir: ShaderClueIR,
    vertexEntry: string,
    fragmentEntry: string,
    getDeclarationCoexistence: DeclarationCoexistenceResolver,
    getBranchCoverage: BranchCoverageResolver
  ) {
    const symbolTable = ir.shaderData.symbolTable;
    const vertexFunctions = findFunctions(symbolTable, vertexEntry);
    const fragmentFunctions = findFunctions(symbolTable, fragmentEntry);
    this.vertexEntry = createEntryPointInfo(
      EShaderStage.VERTEX,
      vertexEntry,
      vertexFunctions,
      getDeclarationCoexistence
    );
    this.fragmentEntry = createEntryPointInfo(
      EShaderStage.FRAGMENT,
      fragmentEntry,
      fragmentFunctions,
      getDeclarationCoexistence
    );

    const mutableIO = createIOInfo();
    collectEntryIO(vertexFunctions, fragmentFunctions, mutableIO);
    this.roleConflicts = removeRoleConflicts(mutableIO);
    this.mrtOutputIssues = collectMrtOutputIssues(mutableIO.mrtList, getDeclarationCoexistence);
    this.invalidMrtReturnLocations = collectInvalidMrtReturns(fragmentFunctions, mutableIO.mrtStructs);
    this.invalidVaryingReturnLocations = collectInvalidVaryingReturns(vertexFunctions, mutableIO.varyingStructs);
    deriveStructVariableRoles(symbolTable, vertexFunctions, fragmentFunctions, mutableIO);
    const ownerFacts = collectStructMemberOwnerFacts(
      [...vertexFunctions, ...fragmentFunctions],
      ir.shaderData.runtimeFallbackReferences,
      mutableIO.structVariableRoles,
      getBranchCoverage
    );
    this.ambiguousStructMemberOwnerLocations = ownerFacts.ambiguousLocations;
    this.unlowerableStructMemberOwnerLocations = ownerFacts.unlowerableLocations;
    this.io = mutableIO;
    this.outerGlobalMacroDeclarations = ir.shaderData.getOuterGlobalMacroDeclarations();
  }
}

function collectStructMemberOwnerFacts(
  entries: readonly FnSymbol[],
  references: readonly RuntimeFallbackReference[],
  variableRoles: ReadonlyMap<VarSymbol, ShaderStructRole>,
  getBranchCoverage: BranchCoverageResolver
): { ambiguousLocations: ShaderRange[]; unlowerableLocations: ShaderRange[] } {
  const ambiguousLocations: ShaderRange[] = [];
  const unlowerableLocations: ShaderRange[] = [];
  const ambiguousReferences = new Set<ASTNode.VariableIdentifier>();
  const unlowerableReferences = new Set<ASTNode.VariableIdentifier>();
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
  const primaryBranches: BranchSignature[] = [];
  for (const fallbackReference of references) {
    const { reference, symbols, fallbackStart } = fallbackReference;
    if (!isReachableStructMemberReference(reference, reachableFunctions)) continue;
    primaryBranches.length = 0;
    for (let i = 0; i < fallbackStart; i++) primaryBranches.push(symbols[i].branchSignature);
    const coverage = getBranchCoverage(primaryBranches, reference._branch);
    if (coverage === "covered") continue;

    let resolvedRole: ShaderStructRole | undefined;
    let hasOrdinaryOwner = false;
    let hasRoleConflict = false;
    for (const symbol of symbols) {
      if (!(symbol instanceof VarSymbol)) continue;
      const role = variableRoles.get(symbol);
      if (!role) {
        hasOrdinaryOwner = true;
      } else if (resolvedRole && resolvedRole !== role) {
        hasRoleConflict = true;
      } else {
        resolvedRole = role;
      }
    }
    if (hasRoleConflict || (resolvedRole && hasOrdinaryOwner)) {
      if (!unlowerableReferences.has(reference)) {
        unlowerableReferences.add(reference);
        unlowerableLocations.push(reference.location);
      }
      if (coverage === "uncovered" && !ambiguousReferences.has(reference)) {
        ambiguousReferences.add(reference);
        ambiguousLocations.push(reference.location);
      }
    }
  }
  return { ambiguousLocations, unlowerableLocations };
}

function isReachableStructMemberReference(
  reference: ASTNode.VariableIdentifier,
  reachableFunctions: ReadonlySet<ASTNode.FunctionDefinition>
): boolean {
  let isStructMember = false;
  let current = reference.parent;
  while (current) {
    if (
      current instanceof ASTNode.PostfixExpression &&
      current.children.length === 3 &&
      current.children[2] instanceof BaseToken &&
      ParserUtils.unwrapBareIdentifier(current.children[0] as TreeNode, { allowParens: true }) === reference
    ) {
      isStructMember = true;
    }
    if (current instanceof ASTNode.FunctionDefinition) return isStructMember && reachableFunctions.has(current);
    current = current.parent;
  }
  return false;
}

type DeclarationCoexistenceResolver = (earlier: BranchSignature, later: BranchSignature) => DeclarationCoexistence;
type BranchCoverageResolver = (
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
) => BranchCoverage;

function getRuntimeBranchCoverage(
  candidates: readonly BranchSignature[],
  callSiteBranch: BranchSignature
): BranchCoverage {
  for (let i = 0; i < candidates.length; i++) {
    if (isLexicalBranchVisibleFrom(candidates[i], callSiteBranch)) return "covered";
  }
  return "unknown";
}

function collectInvalidVaryingReturns(
  vertexFunctions: readonly FnSymbol[],
  varyingStructs: readonly ASTNode.StructSpecifier[]
): ShaderRange[] {
  const locations: ShaderRange[] = [];
  for (const fn of vertexFunctions) {
    const returnStructs = fn.astNode.protoType.returnType.typeSpecifier.structDeclarations;
    if (!returnStructs.some((struct) => varyingStructs.includes(struct))) continue;
    collectInvalidVaryingReturnsInNode(fn.astNode.statements, returnStructs, locations);
  }
  return locations;
}

function collectInvalidVaryingReturnsInNode(
  node: TreeNode,
  returnStructs: readonly ASTNode.StructSpecifier[],
  out: ShaderRange[]
): void {
  if (node instanceof ASTNode.JumpStatement && node.children.length === 3) {
    const expression = node.children[1];
    if (!(expression instanceof TreeNode) || !isVaryingReturnExpression(expression, returnStructs)) {
      out.push(node.location);
    }
    return;
  }
  for (const child of node.children) {
    if (child instanceof TreeNode) collectInvalidVaryingReturnsInNode(child, returnStructs, out);
  }
}

function isVaryingReturnExpression(expression: TreeNode, returnStructs: readonly ASTNode.StructSpecifier[]): boolean {
  const variable = ParserUtils.unwrapBareIdentifier(expression, { allowParens: true });
  const symbols = variable?.resolvedValueSymbols() ?? [];
  if (
    symbols.length > 0 &&
    symbols.every(
      (symbol) =>
        symbol instanceof VarSymbol &&
        symbol.dataType?.structDeclarations.some((struct) => returnStructs.includes(struct))
    )
  ) {
    return true;
  }

  const call = ParserUtils.unwrapNodeByType<ASTNode.FunctionCall>(expression, NoneTerminal.function_call);
  const generic = call?.children[0] as ASTNode.FunctionCallGeneric | undefined;
  return (
    generic?.fnSymbol instanceof FnSymbol &&
    generic.fnSymbol.dataType?.structDeclarations.some((struct) => returnStructs.includes(struct)) === true
  );
}

function collectInvalidMrtReturns(
  fragmentFunctions: readonly FnSymbol[],
  mrtStructs: readonly ASTNode.StructSpecifier[]
): ShaderRange[] {
  const locations: ShaderRange[] = [];
  for (const fn of fragmentFunctions) {
    const returnStructs = fn.astNode.protoType.returnType.typeSpecifier.structDeclarations;
    if (!returnStructs.some((struct) => mrtStructs.includes(struct))) continue;
    collectInvalidMrtReturnsInNode(fn.astNode.statements, returnStructs, locations);
  }
  return locations;
}

function collectInvalidMrtReturnsInNode(
  node: TreeNode,
  returnStructs: readonly ASTNode.StructSpecifier[],
  out: ShaderRange[]
): void {
  if (node instanceof ASTNode.JumpStatement && node.children.length === 3) {
    const expression = node.children[1];
    const variable =
      expression instanceof TreeNode ? ParserUtils.unwrapBareIdentifier(expression, { allowParens: true }) : undefined;
    const symbols = variable?.resolvedValueSymbols() ?? [];
    const valid =
      symbols.length > 0 &&
      symbols.every(
        (symbol) =>
          symbol instanceof VarSymbol &&
          symbol.dataType?.structDeclarations.some((struct) => returnStructs.includes(struct))
      );
    if (!valid) out.push(node.location);
    return;
  }
  for (const child of node.children) {
    if (child instanceof TreeNode) collectInvalidMrtReturnsInNode(child, returnStructs, out);
  }
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

interface MutableShaderIOInfo {
  attributeStructs: ASTNode.StructSpecifier[];
  attributeList: StructProp[];
  varyingStructs: ASTNode.StructSpecifier[];
  varyingList: StructProp[];
  mrtStructs: ASTNode.StructSpecifier[];
  mrtList: StructProp[];
  structVariableRoles: Map<VarSymbol, ShaderStructRole>;
  vertexStructVariableRoles: Map<VarSymbol, ShaderStructRole>;
  fragmentStructVariableRoles: Map<VarSymbol, ShaderStructRole>;
}

function createIOInfo(): MutableShaderIOInfo {
  return {
    attributeStructs: [],
    attributeList: [],
    varyingStructs: [],
    varyingList: [],
    mrtStructs: [],
    mrtList: [],
    structVariableRoles: new Map(),
    vertexStructVariableRoles: new Map(),
    fragmentStructVariableRoles: new Map()
  };
}

function findFunctions(symbolTable: SymbolTable<SymbolInfo>, entry: string): FnSymbol[] {
  const lookupSymbol = new SymbolInfo("", null);
  lookupSymbol.set(entry, ESymbolType.FN);
  const functions = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
  functions.sort((left, right) => left.astNode.location.start.index - right.astNode.location.start.index);
  return functions;
}

function createEntryPointInfo(
  stage: EShaderStage,
  name: string,
  functions: readonly FnSymbol[],
  getDeclarationCoexistence: DeclarationCoexistenceResolver
): ShaderEntryPointInfo {
  let hasDefiniteAmbiguity = false;
  for (let i = 0, n = functions.length; i < n && !hasDefiniteAmbiguity; i++) {
    for (let j = i + 1; j < n; j++) {
      if (getDeclarationCoexistence(functions[i].branchSignature, functions[j].branchSignature) === "coexist") {
        hasDefiniteAmbiguity = true;
        break;
      }
    }
  }
  return { stage, name, functions, hasDefiniteAmbiguity };
}

function appendStructs(
  declarations: readonly ASTNode.StructSpecifier[],
  structs: ASTNode.StructSpecifier[],
  props: StructProp[],
  seen: Set<ASTNode.StructSpecifier>
): void {
  for (const node of declarations) {
    if (seen.has(node)) continue;
    seen.add(node);
    structs.push(node);
    props.push(...node.propList);
  }
}

function collectEntryIO(
  vertexFunctions: readonly FnSymbol[],
  fragmentFunctions: readonly FnSymbol[],
  io: MutableShaderIOInfo
): void {
  const attributeStructs = new Set<ASTNode.StructSpecifier>();
  const varyingStructs = new Set<ASTNode.StructSpecifier>();
  const mrtStructs = new Set<ASTNode.StructSpecifier>();
  for (const fn of vertexFunctions) {
    const proto = fn.astNode.protoType;
    if (typeof proto.returnType.type === "string") {
      appendStructs(
        proto.returnType.typeSpecifier.structDeclarations,
        io.varyingStructs,
        io.varyingList,
        varyingStructs
      );
    }
    const attributeType = proto.parameterList?.[0]?.typeInfo.type;
    if (typeof attributeType === "string") {
      appendStructs(
        proto.parameterList![0].typeInfo.structDeclarations,
        io.attributeStructs,
        io.attributeList,
        attributeStructs
      );
    }
  }

  for (const fn of fragmentFunctions) {
    const returnType = fn.astNode.protoType.returnType.type;
    if (typeof returnType === "string") {
      appendStructs(
        fn.astNode.protoType.returnType.typeSpecifier.structDeclarations,
        io.mrtStructs,
        io.mrtList,
        mrtStructs
      );
    }
  }
}

function removeRoleConflicts(io: MutableShaderIOInfo): ShaderStructRoleConflict[] {
  const roles = new Map<ASTNode.StructSpecifier, ShaderStructRole[]>();
  const register = (nodes: readonly ASTNode.StructSpecifier[], role: ShaderStructRole): void => {
    for (const node of nodes) {
      const nodeRoles = roles.get(node) ?? [];
      if (nodeRoles.indexOf(role) === -1) nodeRoles.push(role);
      roles.set(node, nodeRoles);
    }
  };
  register(io.attributeStructs, ShaderStructRole.Attribute);
  register(io.varyingStructs, ShaderStructRole.Varying);
  register(io.mrtStructs, ShaderStructRole.Mrt);

  const conflicts: ShaderStructRoleConflict[] = [];
  const conflictingStructs = new Set<ASTNode.StructSpecifier>();
  roles.forEach((structRoles, struct) => {
    if (structRoles.length > 1) {
      conflicts.push({ struct, roles: structRoles });
      conflictingStructs.add(struct);
    }
  });
  if (!conflictingStructs.size) return conflicts;

  const droppedProps = new Set<StructProp>();
  const filterStructs = (structs: ASTNode.StructSpecifier[]): void => {
    for (let index = structs.length - 1; index >= 0; index--) {
      if (conflictingStructs.has(structs[index])) {
        for (const prop of structs[index].propList) droppedProps.add(prop);
        structs.splice(index, 1);
      }
    }
  };
  filterStructs(io.attributeStructs);
  filterStructs(io.varyingStructs);
  filterStructs(io.mrtStructs);
  const filterProps = (props: StructProp[]): void => {
    for (let index = props.length - 1; index >= 0; index--) {
      if (droppedProps.has(props[index])) props.splice(index, 1);
    }
  };
  filterProps(io.attributeList);
  filterProps(io.varyingList);
  filterProps(io.mrtList);
  return conflicts;
}

function deriveStructVariableRoles(
  symbolTable: SymbolTable<SymbolInfo>,
  vertexFunctions: readonly FnSymbol[],
  fragmentFunctions: readonly FnSymbol[],
  io: MutableShaderIOInfo
): void {
  const structRoles = new Map<ASTNode.StructSpecifier, ShaderStructRole>();
  registerStructRoles(structRoles, io.attributeStructs, ShaderStructRole.Attribute);
  registerStructRoles(structRoles, io.varyingStructs, ShaderStructRole.Varying);
  registerStructRoles(structRoles, io.mrtStructs, ShaderStructRole.Mrt);

  const functionFacts = new Map<FnSymbol, FunctionRoleFacts>();
  symbolTable.forEach((symbol) => {
    if (symbol instanceof FnSymbol) {
      functionFacts.set(symbol, collectFunctionRoleFacts(symbol, structRoles, io.structVariableRoles));
    } else if (symbol instanceof VarSymbol && symbol.isGlobalVariable) {
      registerVariableRole(io.structVariableRoles, symbol, structRoles);
      registerVariableRole(io.vertexStructVariableRoles, symbol, structRoles);
      registerVariableRole(io.fragmentStructVariableRoles, symbol, structRoles);
    }
  });

  populateReachableFunctionVariables(io.vertexStructVariableRoles, vertexFunctions, functionFacts);
  populateReachableFunctionVariables(io.fragmentStructVariableRoles, fragmentFunctions, functionFacts);
}

interface VariableRoleFact {
  readonly variable: VarSymbol;
  readonly role: ShaderStructRole;
}

interface FunctionRoleFacts {
  readonly variables: readonly VariableRoleFact[];
  readonly callees: readonly FnSymbol[];
}

function populateReachableFunctionVariables(
  target: Map<VarSymbol, ShaderStructRole>,
  entries: readonly FnSymbol[],
  functionFacts: ReadonlyMap<FnSymbol, FunctionRoleFacts>
): void {
  const visited = new Set<FnSymbol>();
  const pending = entries.slice();
  while (pending.length) {
    const fn = pending.pop()!;
    if (visited.has(fn)) continue;
    visited.add(fn);
    const facts = functionFacts.get(fn);
    if (!facts) continue;
    for (const { variable, role } of facts.variables) target.set(variable, role);
    pending.push(...facts.callees);
  }
}

function collectFunctionRoleFacts(
  fn: FnSymbol,
  roles: ReadonlyMap<ASTNode.StructSpecifier, ShaderStructRole>,
  allVariableRoles: Map<VarSymbol, ShaderStructRole>
): FunctionRoleFacts {
  const variables: VariableRoleFact[] = [];
  const callees: FnSymbol[] = [];
  const register = (variable: VarSymbol): void => {
    const role = resolveVariableRole(variable, roles);
    if (!role) return;
    variables.push({ variable, role });
    allVariableRoles.set(variable, role);
  };
  const parameters = fn.astNode.protoType.parameterList;
  if (parameters) {
    for (const parameter of parameters) {
      const parameterNode = parameter.astNode;
      if (parameterNode instanceof ASTNode.ParameterDeclaration && parameterNode.symbol) {
        register(parameterNode.symbol);
      }
    }
  }
  for (const variable of fn.localVariables) register(variable);
  callees.push(...fn.calledFunctions);
  return { variables, callees };
}

function registerStructRoles(
  roles: Map<ASTNode.StructSpecifier, ShaderStructRole>,
  structs: readonly ASTNode.StructSpecifier[],
  role: ShaderStructRole
): void {
  for (const struct of structs) roles.set(struct, role);
}

function registerVariableRole(
  target: Map<VarSymbol, ShaderStructRole>,
  variable: VarSymbol,
  roles: ReadonlyMap<ASTNode.StructSpecifier, ShaderStructRole>
): void {
  const role = resolveVariableRole(variable, roles);
  if (role) target.set(variable, role);
}

function resolveVariableRole(
  variable: VarSymbol,
  roles: ReadonlyMap<ASTNode.StructSpecifier, ShaderStructRole>
): ShaderStructRole | undefined {
  let resolvedRole: ShaderStructRole | undefined;
  for (const declaration of variable.dataType?.structDeclarations ?? []) {
    const role = roles.get(declaration);
    if (!role || (resolvedRole && resolvedRole !== role)) return;
    resolvedRole = role;
  }
  return resolvedRole;
}
