import { BaseToken } from "../common/BaseToken";
import { EShaderStage } from "../common/enums/ShaderStage";
import { ASTNode, TreeNode } from "../parser/AST";
import { ESymbolType, FnSymbol, StructSymbol, SymbolInfo, SymbolTable, VarSymbol } from "../parser/symbolTable";
import type { StructProp } from "../parser/types";
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
}

/** A struct assigned incompatible IO roles. The analyzer decides how to diagnose this fact. @internal */
export interface ShaderStructRoleConflict {
  /** Conflicting struct declaration. */
  readonly struct: ASTNode.StructSpecifier;
  /** Roles inferred from the two entry signatures. */
  readonly roles: readonly ShaderStructRole[];
}

/** Backend-required shader input/output facts. @internal */
export interface ShaderIOInfo {
  readonly attributeStructs: readonly ASTNode.StructSpecifier[];
  readonly attributeList: readonly StructProp[];
  readonly varyingStructs: readonly ASTNode.StructSpecifier[];
  readonly varyingList: readonly StructProp[];
  readonly mrtStructs: readonly ASTNode.StructSpecifier[];
  readonly mrtList: readonly StructProp[];
  readonly vertexStructVarMap: Readonly<Record<string, ShaderStructRole>>;
  readonly fragmentStructVarMap: Readonly<Record<string, ShaderStructRole>>;
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
  /** Global preprocessor declarations that backends may reproduce. */
  readonly outerGlobalMacroDeclarations: readonly ASTNode.GlobalDeclaration[];

  /**
   * Derives backend-required facts from a neutral shader IR.
   * @param ir - Neutral shader IR.
   * @param vertexEntry - Vertex entry function name.
   * @param fragmentEntry - Fragment entry function name.
   * @returns Lightweight backend information with no diagnostics.
   */
  static create(ir: ShaderClueIR, vertexEntry: string, fragmentEntry: string): ShaderCoreInfo {
    return new ShaderCoreInfo(ir, vertexEntry, fragmentEntry);
  }

  private constructor(ir: ShaderClueIR, vertexEntry: string, fragmentEntry: string) {
    const symbolTable = ir.shaderData.symbolTable;
    const vertexFunctions = findFunctions(symbolTable, vertexEntry);
    const fragmentFunctions = findFunctions(symbolTable, fragmentEntry);
    this.vertexEntry = { stage: EShaderStage.VERTEX, name: vertexEntry, functions: vertexFunctions };
    this.fragmentEntry = { stage: EShaderStage.FRAGMENT, name: fragmentEntry, functions: fragmentFunctions };

    const mutableIO = createIOInfo();
    collectEntryIO(symbolTable, vertexFunctions, fragmentFunctions, mutableIO);
    this.roleConflicts = removeRoleConflicts(mutableIO);
    const conflictingStructNames = new Set<string>();
    for (const conflict of this.roleConflicts) {
      const name = conflict.struct.ident?.lexeme;
      if (name) conflictingStructNames.add(name);
    }
    deriveStructVariableRoles(symbolTable, vertexFunctions, fragmentFunctions, mutableIO, conflictingStructNames);
    this.io = mutableIO;
    this.outerGlobalMacroDeclarations = ir.shaderData.getOuterGlobalMacroDeclarations();
  }
}

interface MutableShaderIOInfo {
  attributeStructs: ASTNode.StructSpecifier[];
  attributeList: StructProp[];
  varyingStructs: ASTNode.StructSpecifier[];
  varyingList: StructProp[];
  mrtStructs: ASTNode.StructSpecifier[];
  mrtList: StructProp[];
  vertexStructVarMap: Record<string, ShaderStructRole>;
  fragmentStructVarMap: Record<string, ShaderStructRole>;
}

function createIOInfo(): MutableShaderIOInfo {
  return {
    attributeStructs: [],
    attributeList: [],
    varyingStructs: [],
    varyingList: [],
    mrtStructs: [],
    mrtList: [],
    vertexStructVarMap: Object.create(null),
    fragmentStructVarMap: Object.create(null)
  };
}

function findFunctions(symbolTable: SymbolTable<SymbolInfo>, entry: string): FnSymbol[] {
  const lookupSymbol = new SymbolInfo("", null);
  lookupSymbol.set(entry, ESymbolType.FN);
  return <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
}

function findStructs(symbolTable: SymbolTable<SymbolInfo>, name: string): StructSymbol[] {
  const lookupSymbol = new SymbolInfo("", null);
  lookupSymbol.set(name, ESymbolType.STRUCT);
  return <StructSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
}

function appendStructs(
  symbols: readonly StructSymbol[],
  structs: ASTNode.StructSpecifier[],
  props: StructProp[],
  seen: Set<ASTNode.StructSpecifier>
): void {
  for (const symbol of symbols) {
    const node = symbol.astNode;
    if (seen.has(node)) continue;
    seen.add(node);
    structs.push(node);
    props.push(...node.propList);
  }
}

function collectEntryIO(
  symbolTable: SymbolTable<SymbolInfo>,
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
      appendStructs(findStructs(symbolTable, proto.returnType.type), io.varyingStructs, io.varyingList, varyingStructs);
    }
    const attributeType = proto.parameterList?.[0]?.typeInfo.type;
    if (typeof attributeType === "string") {
      appendStructs(findStructs(symbolTable, attributeType), io.attributeStructs, io.attributeList, attributeStructs);
    }
  }

  for (const fn of fragmentFunctions) {
    const returnType = fn.astNode.protoType.returnType.type;
    if (typeof returnType === "string") {
      appendStructs(findStructs(symbolTable, returnType), io.mrtStructs, io.mrtList, mrtStructs);
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
  for (const [struct, structRoles] of roles) {
    if (structRoles.length > 1) {
      conflicts.push({ struct, roles: structRoles });
      conflictingStructs.add(struct);
    }
  }
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
  io: MutableShaderIOInfo,
  excludedStructNames: ReadonlySet<string>
): void {
  const structRoles: Record<string, ShaderStructRole> = Object.create(null);
  registerEntryStructRoles(
    vertexFunctions,
    ShaderStructRole.Attribute,
    ShaderStructRole.Varying,
    structRoles,
    excludedStructNames
  );
  registerEntryStructRoles(
    fragmentFunctions,
    ShaderStructRole.Varying,
    ShaderStructRole.Mrt,
    structRoles,
    excludedStructNames
  );
  populateStageVariables(io.vertexStructVarMap, vertexFunctions, structRoles);
  populateStageVariables(io.fragmentStructVarMap, fragmentFunctions, structRoles);

  symbolTable.forEach((symbol) => {
    if (symbol.type !== ESymbolType.VAR || !(symbol instanceof VarSymbol) || !symbol.isGlobalVariable) return;
    registerVariableRole(io.vertexStructVarMap, symbol.dataType?.typeLexeme, symbol.ident, structRoles);
    registerVariableRole(io.fragmentStructVarMap, symbol.dataType?.typeLexeme, symbol.ident, structRoles);
  });
}

function registerEntryStructRoles(
  functions: readonly FnSymbol[],
  parameterRole: ShaderStructRole,
  returnRole: ShaderStructRole,
  roles: Record<string, ShaderStructRole>,
  excludedStructNames: ReadonlySet<string>
): void {
  for (const fn of functions) {
    const proto = fn.astNode.protoType;
    const firstParameter = proto.parameterList?.[0];
    if (
      firstParameter &&
      typeof firstParameter.typeInfo.type === "string" &&
      !excludedStructNames.has(firstParameter.typeInfo.typeLexeme)
    ) {
      roles[firstParameter.typeInfo.typeLexeme] = parameterRole;
    }
    if (typeof proto.returnType.type === "string" && !excludedStructNames.has(proto.returnType.type)) {
      roles[proto.returnType.type] = returnRole;
    }
  }
}

function populateStageVariables(
  target: Record<string, ShaderStructRole>,
  functions: readonly FnSymbol[],
  roles: Record<string, ShaderStructRole>
): void {
  for (const fn of functions) {
    const parameters = fn.astNode.protoType.parameterList;
    if (parameters) {
      for (const parameter of parameters) {
        if (parameter.ident && typeof parameter.typeInfo.type === "string") {
          registerVariableRole(target, parameter.typeInfo.typeLexeme, parameter.ident.lexeme, roles);
        }
      }
    }
    walkLocalVariables(target, fn.astNode.statements, roles);
  }
}

function walkLocalVariables(
  target: Record<string, ShaderStructRole>,
  node: TreeNode,
  roles: Record<string, ShaderStructRole>
): void {
  for (const child of node.children) {
    if (child instanceof ASTNode.InitDeclaratorList) {
      const typeLexeme = child.typeInfo?.typeLexeme;
      const role = typeLexeme && roles[typeLexeme];
      if (role) appendLocalVariableNames(target, child, role);
    } else if (child instanceof TreeNode) {
      walkLocalVariables(target, child, roles);
    }
  }
}

function appendLocalVariableNames(
  target: Record<string, ShaderStructRole>,
  node: ASTNode.InitDeclaratorList,
  role: ShaderStructRole
): void {
  const children = node.children;
  if (children.length === 1) {
    const declarationChildren = (children[0] as ASTNode.SingleDeclaration).children;
    if (declarationChildren.length >= 2 && declarationChildren[1] instanceof BaseToken) {
      target[declarationChildren[1].lexeme] = role;
    }
  } else if (children.length >= 3) {
    const previous = children[0];
    if (previous instanceof ASTNode.InitDeclaratorList) appendLocalVariableNames(target, previous, role);
    if (children[2] instanceof BaseToken) target[children[2].lexeme] = role;
  }
}

function registerVariableRole(
  target: Record<string, ShaderStructRole>,
  typeLexeme: string | undefined,
  variableName: string,
  roles: Record<string, ShaderStructRole>
): void {
  if (!typeLexeme) return;
  const role = roles[typeLexeme];
  if (role) target[variableName] = role;
}
