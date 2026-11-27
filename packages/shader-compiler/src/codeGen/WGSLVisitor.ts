import type {
  IComputeProgramSource,
  IShaderInfo,
  IShaderInstancingNames,
  IShaderUniformBlock
} from "@galacean/engine-design";
import type { IPoolElement } from "@galacean/engine-core";
import {
  ASTNode,
  BaseToken,
  EShaderStage,
  ESymbolType,
  ETokenType,
  FnSymbol,
  GSError,
  GSErrorName,
  Keyword,
  ParserUtils,
  ShaderBuiltinSemantic,
  ShaderData,
  ShaderStructRole,
  StructSymbol,
  TreeNode,
  TypeAny,
  VarSymbol,
  getLexicalDeclarationCoexistence,
  mapExpandedShaderError,
  canInheritanceBranchesCover,
  type BranchSignature,
  type DeferredDeclarationOwnership,
  type NodeChild,
  type ParamDirection,
  type ShaderClueIR,
  type ShaderCoreInfo,
  type ShaderEntryPointInfo,
  type StructProp,
  type SymbolType
} from "@galacean/engine-shader-parser/internal";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { ICodeSegment } from "./types";
import type { ShaderBackend } from "../ShaderBackend";
import { ShaderInstructionEncoder } from "../ShaderInstructionEncoder";
import {
  ATOMIC_BUILTINS,
  BARRIER_BUILTINS,
  formatFloatLiteral,
  formatUintLiteral,
  galaceanTypeToBase,
  GLSL_BUILTIN_INT_LIMITS,
  glslBaseToWGSL,
  glslTypeToWGSL,
  IMAGE_BUILTINS,
  inferBinaryType,
  inferBuiltinReturnType,
  isImageType,
  isIntegerType,
  isSamplerType,
  isScalarType,
  isValidSwizzle,
  makeMatrixType,
  makeVectorType,
  matrixDims,
  normalizeStorageFormat,
  normalizeSwizzle,
  samplerToWGSLSampler,
  samplerToWGSLTexture,
  scalarFamily,
  TEXTURE_BUILTINS,
  typeKey,
  vectorSize,
  WGSL_RESERVED,
  WT_BOOL,
  WT_FLOAT,
  WT_INT,
  WT_IVEC2,
  WT_UINT,
  WT_UNKNOWN,
  WT_UVEC3,
  WT_VEC2,
  WT_VEC3,
  WT_VEC4,
  WT_VOID,
  type WGSLTypeDesc
} from "./WGSLTypes";

interface WGSLFnInfo {
  symbol: FnSymbol;
  wgslName: string;
  returnType: WGSLTypeDesc;
  params: Array<{
    name: string;
    wgslName: string;
    type: WGSLTypeDesc;
    direction: "in" | "out" | "inout";
    isSampler: boolean;
    mutated: boolean;
  }>;
}

interface EmittedExpr {
  code: string;
  type: WGSLTypeDesc;
  /** When the expression resolves to a combined sampler variable/param, holds its separated `(tex, samp)` identifiers. */
  samplerPair?: { tex: string; samp: string; samplerType: string };
}

/**
 * Single-AST WGSL code generator — peer of `GLES300Visitor`.
 *
 * Consumes `ShaderClueIR` + `ShaderCoreInfo` directly from `@galacean/engine-shader-parser`
 * (zero secondary AST / parser) and emits WGSL with `#if`/`#ifdef`/`#define` directives intact
 * for `ShaderInstructionEncoder` + `ShaderMacroProcessor`, plus lightweight declaration-site
 * metadata comments consumed by the runtime WGSL binding linker.
 *
 * @internal
 */
export class WGSLVisitor extends CodeGenVisitor implements ShaderBackend, IPoolElement {
  private readonly _globalNames = new Set<string>();
  private _vertexOutputNames?: Record<string, string>;
  private _uniformBlocks?: Set<IShaderUniformBlock>;
  private readonly _uniformStructs = new Set<ASTNode.StructSpecifier>();
  private readonly _fragmentVaryingProps = new Set<StructProp>();
  private readonly _globalInputs = new Map<EShaderStage, VarSymbol[]>();
  private readonly _inputHelperBodies = new Map<TreeNode, string>();
  private readonly _inputHelperGroups = new Map<number, { name: string; fallback: DeferredDeclarationOwnership }>();
  private _globalCodeArray: ICodeSegment[] = [];
  private readonly _structCodeSegments = new Map<ASTNode.StructSpecifier, ICodeSegment>();
  private readonly _variableCodeSegments = new Map<ASTNode.VariableDeclaration, ICodeSegment>();
  private readonly _declarationOwners = new Map<TreeNode, DeferredDeclarationOwnership>();
  private readonly _declarationReferences = new Map<number, Set<number>>();
  private _currentDeclaration?: TreeNode;
  private _sourceIR?: ShaderClueIR;
  private _outerMacroDeclarations: readonly ASTNode.GlobalDeclaration[] = [];

  // Stage-local WGSL emission state
  private readonly _typeMacroAliases = new Map<string, string>();
  private readonly _identMacroAliases = new Map<string, string>();
  private readonly _structNameMap = new Map<string, string>();
  private readonly _structDeclMap = new Map<string, ASTNode.StructSpecifier>();
  private readonly _fnInfoByAst = new Map<ASTNode.FunctionDefinition, WGSLFnInfo>();
  private readonly _fnInfoByName = new Map<string, WGSLFnInfo[]>();
  private readonly _uboMemberToBlock = new Map<VarSymbol, { blockVar: string; field: string; type: WGSLTypeDesc }>();
  private readonly _uboMemberByName = new Map<string, { blockVar: string; field: string; type: WGSLTypeDesc }>();
  private readonly _ssboMemberToBlock = new Map<VarSymbol, { blockVar: string; field: string; type: WGSLTypeDesc }>();
  private readonly _ssboMemberByName = new Map<string, { blockVar: string; field: string; type: WGSLTypeDesc }>();
  private readonly _storageTexBySym = new Map<
    VarSymbol,
    { wgslName: string; base: string; format: string; access: string }
  >();
  private readonly _storageTexByName = new Map<
    string,
    { wgslName: string; base: string; format: string; access: string }
  >();
  private readonly _sharedVarBySym = new Map<VarSymbol, { wgslName: string; type: WGSLTypeDesc }>();
  private readonly _looseUniformName = new Map<VarSymbol, string>();
  private readonly _looseUniformByName = new Map<string, { wgslName: string; type: WGSLTypeDesc }>();
  private readonly _samplerGlobalPair = new Map<VarSymbol, { tex: string; samp: string; samplerType: string }>();
  private readonly _samplerGlobalByName = new Map<string, { tex: string; samp: string; samplerType: string }>();
  private readonly _localVarNames = new Map<
    VarSymbol,
    {
      wgslName: string;
      type: WGSLTypeDesc;
      isPtr?: boolean;
      samplerPair?: { tex: string; samp: string; samplerType: string };
    }
  >();
  private readonly _helpers = new Map<string, string>();
  private readonly _usedBuiltins = new Set<string>();
  private readonly _outputDeclarations = new Map<
    string,
    { text: string; owners: Map<number, DeferredDeclarationOwnership>; unconditional: boolean }
  >();
  private _fragDataArrayRequired = false;
  private readonly _fragDataIndices = new Map<ASTNode.PostfixExpression, number>();
  private readonly _scannedFragmentFunctions = new Set<ShaderEntryPointInfo["functions"][number]>();
  private _globalInitStmts: string[] = [];
  private _hoistQueue: string[] = [];
  private _tempCounter = 0;
  private _currentFnInfo?: WGSLFnInfo;
  private _inMacroDefineBody = false;

  reset(): void {
    this._globalCodeArray.length = 0;
    this._structCodeSegments.clear();
    this._variableCodeSegments.clear();
    this._declarationReferences.clear();
    this._inputHelperBodies.clear();
    this._inputHelperGroups.clear();
    this._currentDeclaration = undefined;
    this._helpers.clear();
    this._usedBuiltins.clear();
    this._outputDeclarations.clear();
    this._fragDataArrayRequired = false;
    this._fragDataIndices.clear();
    this._scannedFragmentFunctions.clear();
    this._globalInitStmts.length = 0;
    this._hoistQueue.length = 0;
    this._tempCounter = 0;
    this._currentFnInfo = undefined;
    this._localVarNames.clear();
  }

  dispose(): void {
    this.context.reset();
    this.context.names.reset();
    this._globalNames.clear();
    this._vertexOutputNames = undefined;
    this._typeMacroAliases.clear();
    this._identMacroAliases.clear();
    this._structNameMap.clear();
    this._structDeclMap.clear();
    this._fnInfoByAst.clear();
    this._fnInfoByName.clear();
    this._uboMemberToBlock.clear();
    this._uboMemberByName.clear();
    this._ssboMemberToBlock.clear();
    this._ssboMemberByName.clear();
    this._storageTexBySym.clear();
    this._storageTexByName.clear();
    this._sharedVarBySym.clear();
    this._looseUniformName.clear();
    this._looseUniformByName.clear();
    this._samplerGlobalPair.clear();
    this._samplerGlobalByName.clear();
    this.reset();
  }

  private _freshTemp(prefix: string): string {
    return `${prefix}_${this._tempCounter++}`;
  }

  private _safeWGSLIdent(name: string, keyPrefix = "id"): string {
    if (!WGSL_RESERVED.has(name) && !name.startsWith("__") && !name.startsWith("gs_")) {
      return name;
    }
    return this.context.names.allocate(`${keyPrefix}:${name}`, `gs_${name}`);
  }

  private _safeFieldName(name: string): string {
    if (!WGSL_RESERVED.has(name) && !name.startsWith("__")) return name;
    return `gs_f_${name}`;
  }

  private _wgslType(t: WGSLTypeDesc): string {
    if (this._structDeclMap.has(t.base)) {
      this.context.referenceGlobal(t.base, ESymbolType.STRUCT);
    }
    return glslTypeToWGSL(t, this._structNameMap);
  }

  private _typeFromSymbolType(typeInfo?: {
    type: any;
    typeLexeme: string;
    arraySpecifier?: ASTNode.ArraySpecifier;
    structDeclarations?: readonly ASTNode.StructSpecifier[];
  }): WGSLTypeDesc {
    if (!typeInfo) return WT_UNKNOWN;
    let base = galaceanTypeToBase(typeInfo.type);
    if (base === "unknown" && typeInfo.typeLexeme) {
      base = this._typeMacroAliases.get(typeInfo.typeLexeme) ?? typeInfo.typeLexeme;
    }
    const arraySize = typeInfo.arraySpecifier ? this._arrayExtentString(typeInfo.arraySpecifier) : undefined;
    return arraySize !== undefined ? { base, arraySize } : { base };
  }

  private _arrayExtentString(spec: ASTNode.ArraySpecifier): string {
    if (spec.children.length === 2) return "";
    if (spec.size !== undefined) return String(spec.size);
    const expr = spec.children[1];
    if (expr instanceof TreeNode) return this._emitNode(expr).code;
    return expr instanceof BaseToken ? expr.lexeme : "";
  }

  // ---------------------------------------------------------------------------
  // Top-level entry (`ShaderBackend.generate`)
  // ---------------------------------------------------------------------------

  generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo): IShaderInfo {
    this.context.reset();
    this.context.names.reset();
    this._globalNames.clear();
    this._vertexOutputNames = undefined;
    this._typeMacroAliases.clear();
    this._identMacroAliases.clear();
    this._structNameMap.clear();
    this._structDeclMap.clear();
    this._fnInfoByAst.clear();
    this._fnInfoByName.clear();
    this._uboMemberToBlock.clear();
    this._uboMemberByName.clear();
    this._ssboMemberToBlock.clear();
    this._ssboMemberByName.clear();
    this._storageTexBySym.clear();
    this._storageTexByName.clear();
    this._sharedVarBySym.clear();
    this._looseUniformName.clear();
    this._looseUniformByName.clear();
    this._samplerGlobalPair.clear();
    this._samplerGlobalByName.clear();
    this.reset();

    const node = ir.program;
    const shaderData = node.shaderData;
    const context = this.context;
    context._passSymbolTable = shaderData.symbolTable;
    for (const name of ir.source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      context.names.reserve(name);
    }
    shaderData.symbolTable.forEach((symbol) => this._globalNames.add(symbol.ident));

    const outerGlobalMacroDeclarations = coreInfo.outerGlobalMacroDeclarations;
    const { io } = coreInfo;
    context.attributeStructs.push(...io.attributeStructs);
    context.attributeList.push(...io.attributeList);
    context.varyingStructs.push(...io.varyingStructs);
    context.varyingList.push(...io.varyingList);
    context.mrtStructs.push(...io.mrtStructs);
    context.mrtList.push(...io.mrtList);
    context.registerStructTypes(ShaderStructRole.Attribute, io.attributeStructs);
    context.registerStructTypes(ShaderStructRole.Varying, io.varyingStructs);
    context.registerStructTypes(ShaderStructRole.Mrt, io.mrtStructs);
    io.structVariableRoles.forEach((role, variable) => context.registerStructVar(variable, role));
    io.vertexStructVariableRoles.forEach((role, variable) =>
      context.registerStructVar(variable, role, EShaderStage.VERTEX)
    );
    io.fragmentStructVariableRoles.forEach((role, variable) =>
      context.registerStructVar(variable, role, EShaderStage.FRAGMENT)
    );

    // Collect simple object-like type and function-name `#define` aliases from BOTH raw source
    // and `#include`-expanded AST macro declarations (e.g. `#define FxaaTex sampler2D`,
    // `#define FUNCTION_CLEAR_COAT_LOBE clearCoatLobe`, `#define GROUND_TerrainAlphamapAtlas material_TerrainAlphamapAtlas`).
    this._typeMacroAliases.clear();
    this._identMacroAliases.clear();
    const recordMacroAlias = (macroName: string, target: string) => {
      if (
        /^(?:void|bool|int|uint|float|[iub]?vec[234]|mat[234](?:x[234])?|[iu]?sampler(?:2D(?:Array)?|Cube|3D)(?:Shadow)?)$/.test(
          target
        )
      ) {
        this._typeMacroAliases.set(macroName, target);
      } else {
        this._identMacroAliases.set(macroName, target);
      }
    };
    for (const m of ir.source.matchAll(/^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)[ \t]+([A-Za-z_]\w*)[ \t]*$/gm)) {
      recordMacroAlias(m[1], m[2]);
    }
    const scanMacroAliases = (node: TreeNode | BaseToken) => {
      if (node instanceof BaseToken) {
        const m = /^\s*#\s*define\s+([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*$/.exec(node.lexeme);
        if (m) recordMacroAlias(m[1], m[2]);
        return;
      }
      if (node instanceof ASTNode.MacroDefine && !node.isFunction && node.valueExpression) {
        const bare = ParserUtils.unwrapBareIdentifier(node.valueExpression, { allowParens: false });
        const tok = bare?.children[0];
        if (tok instanceof BaseToken && /^[A-Za-z_]\w*$/.test(tok.lexeme)) {
          recordMacroAlias(node.macroName, tok.lexeme);
        }
        return;
      }
      for (const ch of node.children) scanMacroAliases(ch);
    };
    for (const decl of outerGlobalMacroDeclarations) scanMacroAliases(decl);

    // Pre-register structs, functions (overload mangling), and uniform symbols across the pass
    this._preScanPassSymbols(shaderData, coreInfo);

    shaderData.symbolTable.forEach((symbol) => {
      if (
        symbol instanceof VarSymbol &&
        symbol.isUniform &&
        symbol.astNode instanceof ASTNode.VariableDeclaration &&
        !context.getStructVarRole([symbol])
      ) {
        for (const struct of symbol.astNode.type.typeSpecifier.structDeclarations) this._uniformStructs.add(struct);
      }
    });
    for (const struct of this._uniformStructs) {
      for (const member of struct.propList) {
        for (const nested of member.typeInfo.structDeclarations) this._uniformStructs.add(nested);
      }
    }

    this._globalInputs.clear();
    for (const [stage, variables] of [
      [EShaderStage.VERTEX, io.vertexStructVariableRoles],
      [EShaderStage.FRAGMENT, io.fragmentStructVariableRoles]
    ] as const) {
      const inputRole = stage === EShaderStage.VERTEX ? ShaderStructRole.Attribute : ShaderStructRole.Varying;
      this._globalInputs.set(
        stage,
        Array.from(variables)
          .filter(([variable, role]) => role === inputRole && variable.astNode instanceof ASTNode.VariableDeclaration)
          .map(([variable]) => variable)
      );
    }

    this._sourceIR = ir;
    this._outerMacroDeclarations = outerGlobalMacroDeclarations;
    try {
      coreInfo.deferredDeclarationOwnership.forEach((owner, symbol) =>
        this._declarationOwners.set(symbol.astNode!, owner)
      );
      let nextInputOwner = 0;
      for (const owner of this._declarationOwners.values())
        nextInputOwner = Math.max(nextInputOwner, owner.id, owner.group);
      for (const variables of this._globalInputs.values()) {
        for (const variable of variables) {
          if (this._declarationOwners.has(variable.astNode!)) continue;
          const id = ++nextInputOwner;
          this._declarationOwners.set(variable.astNode!, { id, group: id, sourceScope: variable.sourceScope });
        }
      }
      if (this._declarationOwners.size) {
        let nextId = nextInputOwner;
        let nextGroup = nextInputOwner;
        shaderData.symbolTable.forEach((symbol) => {
          if (symbol.astNode && !this._declarationOwners.has(symbol.astNode)) {
            this._declarationOwners.set(symbol.astNode, {
              id: ++nextId,
              group: ++nextGroup,
              sourceScope: symbol.sourceScope
            });
          }
        });
        context.onReferenceGlobal = (symbols) => {
          const from = this.currentDeclarationOwner?.id ?? 0;
          for (const symbol of symbols) this._referenceDeclaration(from, symbol.astNode!);
        };
        const propDeclarations = new Map<StructProp, ASTNode.StructSpecifier>();
        for (const struct of [...io.attributeStructs, ...io.varyingStructs, ...io.mrtStructs]) {
          for (const prop of struct.propList) propDeclarations.set(prop, struct);
        }
        context.onReferenceStructProps = (props) => {
          const from = this.currentDeclarationOwner?.id ?? 0;
          for (const prop of props) {
            const decl = propDeclarations.get(prop);
            if (decl) this._referenceDeclaration(from, decl);
          }
        };
      }
      if (coreInfo.unsupportedDeferredDeclarations.length) {
        throw mapExpandedShaderError(
          new GSError(
            GSErrorName.CompilationError,
            "Deferred inheritance requires exact signatures and cannot resolve a known partial-coverage conflict.",
            coreInfo.unsupportedDeferredDeclarations[0].astNode!.location,
            ir.source,
            undefined,
            "UnsupportedDeferredDeclaration"
          ),
          ir.source,
          ir.sourceMap
        );
      }

      this._fragmentVaryingProps.clear();
      const fragment = this._fragmentMain(coreInfo.fragmentEntry, shaderData, outerGlobalMacroDeclarations);
      const vertex = this._vertexMain(coreInfo.vertexEntry, shaderData, outerGlobalMacroDeclarations);

      return {
        vertex,
        fragment,
        vertexOutputNames: this._vertexOutputNames,
        uniformPlan: { vertex: [], fragment: [], instancing: this._instancingNames() },
        uniformBlocks:
          this._uniformBlocks &&
          Array.from(this._uniformBlocks, (layout) => ({ ...layout, bindingName: this._uniformBlockName(layout) }))
      };
    } finally {
      this._sourceIR = undefined;
      this._uniformBlocks = undefined;
      this._uniformStructs.clear();
      this._outerMacroDeclarations = [];
      this._globalInputs.clear();
      this._declarationOwners.clear();
      context.onReferenceGlobal = undefined;
      context.onReferenceStructProps = undefined;
      this._fragmentVaryingProps.clear();
      this._globalNames.clear();
      this._vertexOutputNames = undefined;
      context.reset();
      context.names.reset();
    }
  }

  /** Generate raw WGSL compute stage code directly from the single ShaderLab IR (zero secondary AST). */
  generateCompute(
    ir: ShaderClueIR,
    coreInfo: ShaderCoreInfo,
    workgroupSize: readonly [number, number, number]
  ): IComputeProgramSource {
    if (!coreInfo.computeEntry) {
      throw new Error("ComputeShader IR is missing compute entry point.");
    }
    this.context.reset();
    this.context.names.reset();
    this._globalNames.clear();
    this._vertexOutputNames = undefined;
    this._typeMacroAliases.clear();
    this._identMacroAliases.clear();
    this._structNameMap.clear();
    this._structDeclMap.clear();
    this._fnInfoByAst.clear();
    this._fnInfoByName.clear();
    this._uboMemberToBlock.clear();
    this._uboMemberByName.clear();
    this._ssboMemberToBlock.clear();
    this._ssboMemberByName.clear();
    this._storageTexBySym.clear();
    this._storageTexByName.clear();
    this._sharedVarBySym.clear();
    this._looseUniformName.clear();
    this._looseUniformByName.clear();
    this._samplerGlobalPair.clear();
    this._samplerGlobalByName.clear();
    this.reset();

    const node = ir.program;
    const shaderData = node.shaderData;
    const context = this.context;
    context._passSymbolTable = shaderData.symbolTable;
    for (const name of ir.source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      context.names.reserve(name);
    }
    shaderData.symbolTable.forEach((symbol) => this._globalNames.add(symbol.ident));

    const outerGlobalMacroDeclarations = coreInfo.outerGlobalMacroDeclarations;
    this._typeMacroAliases.clear();
    this._identMacroAliases.clear();
    const recordMacroAlias = (macroName: string, target: string) => {
      if (
        /^(?:void|bool|int|uint|float|[iub]?vec[234]|mat[234](?:x[234])?|[iu]?sampler(?:2D(?:Array)?|Cube|3D)(?:Shadow)?|[iu]?image2D|atomic_(?:uint|int))$/.test(
          target
        )
      ) {
        this._typeMacroAliases.set(macroName, target);
      } else {
        this._identMacroAliases.set(macroName, target);
      }
    };
    for (const m of ir.source.matchAll(/^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)[ \t]+([A-Za-z_]\w*)[ \t]*$/gm)) {
      recordMacroAlias(m[1], m[2]);
    }
    const scanMacroAliases = (cur: TreeNode | BaseToken) => {
      if (cur instanceof BaseToken) {
        const m = /^\s*#\s*define\s+([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*$/.exec(cur.lexeme);
        if (m) recordMacroAlias(m[1], m[2]);
        return;
      }
      if (cur instanceof ASTNode.MacroDefine && !cur.isFunction && cur.valueExpression) {
        const bare = ParserUtils.unwrapBareIdentifier(cur.valueExpression, { allowParens: false });
        const tok = bare?.children[0];
        if (tok instanceof BaseToken && /^[A-Za-z_]\w*$/.test(tok.lexeme)) {
          recordMacroAlias(cur.macroName, tok.lexeme);
        }
        return;
      }
      for (const ch of cur.children) scanMacroAliases(ch);
    };
    for (const decl of outerGlobalMacroDeclarations) scanMacroAliases(decl);

    this._preScanPassSymbols(shaderData, coreInfo);

    shaderData.symbolTable.forEach((symbol) => {
      if (
        symbol instanceof VarSymbol &&
        symbol.isUniform &&
        symbol.astNode instanceof ASTNode.VariableDeclaration &&
        !symbol.astNode.storageBlock &&
        !symbol.astNode.isShared
      ) {
        for (const struct of symbol.astNode.type.typeSpecifier.structDeclarations) this._uniformStructs.add(struct);
      }
    });
    for (const struct of this._uniformStructs) {
      for (const member of struct.propList) {
        for (const nested of member.typeInfo.structDeclarations) this._uniformStructs.add(nested);
      }
    }

    this._sourceIR = ir;
    this._outerMacroDeclarations = outerGlobalMacroDeclarations;
    try {
      coreInfo.deferredDeclarationOwnership.forEach((owner, symbol) =>
        this._declarationOwners.set(symbol.astNode!, owner)
      );
      if (this._declarationOwners.size) {
        let nextId = 0;
        let nextGroup = 0;
        for (const owner of this._declarationOwners.values()) {
          nextId = Math.max(nextId, owner.id);
          nextGroup = Math.max(nextGroup, owner.group);
        }
        shaderData.symbolTable.forEach((symbol) => {
          if (symbol.astNode && !this._declarationOwners.has(symbol.astNode)) {
            this._declarationOwners.set(symbol.astNode, {
              id: ++nextId,
              group: ++nextGroup,
              sourceScope: symbol.sourceScope
            });
          }
        });
        context.onReferenceGlobal = (symbols) => {
          const from = this.currentDeclarationOwner?.id ?? 0;
          for (const symbol of symbols) this._referenceDeclaration(from, symbol.astNode!);
        };
      }

      const compute = this._computeMain(coreInfo.computeEntry, shaderData, outerGlobalMacroDeclarations);
      return {
        compute,
        workgroupSize: [workgroupSize[0], workgroupSize[1], workgroupSize[2]],
        uniformBlocks:
          this._uniformBlocks &&
          Array.from(this._uniformBlocks, (layout) => ({ ...layout, bindingName: this._uniformBlockName(layout) }))
      };
    } finally {
      this._sourceIR = undefined;
      this._uniformBlocks = undefined;
      this._uniformStructs.clear();
      this._outerMacroDeclarations = [];
      this._globalInputs.clear();
      this._declarationOwners.clear();
      context.onReferenceGlobal = undefined;
      context.onReferenceStructProps = undefined;
      this._fragmentVaryingProps.clear();
      this._globalNames.clear();
      this._vertexOutputNames = undefined;
      context.reset();
      context.names.reset();
    }
  }

  private _preScanPassSymbols(data: ShaderData, coreInfo: ShaderCoreInfo): void {
    // 1. Structs
    data.symbolTable.forEach((sym) => {
      if (sym instanceof StructSymbol && sym.astNode.ident) {
        const name = sym.astNode.ident.lexeme;
        this._structDeclMap.set(name, sym.astNode);
        this._structNameMap.set(name, this._safeWGSLIdent(name, "struct"));
      }
    });

    // 2. Uniform block members
    if (data.uniformBlocks) {
      for (const block of data.uniformBlocks) {
        const blockVar = this._uniformBlockName(block.layout);
        for (let i = 0; i < block.members.length; i++) {
          const memberDecl = block.members[i];
          const sym = memberDecl.declarator.symbol;
          const meta = block.layout.members[i];
          const entry = {
            blockVar,
            field: this._safeFieldName(meta.name),
            type: meta.arrayLength ? { base: meta.type, arraySize: String(meta.arrayLength) } : { base: meta.type }
          };
          this._uboMemberToBlock.set(sym, entry);
          this._uboMemberByName.set(meta.name, entry);
        }
      }
    }

    // 2b. Storage block members (`storage Name { ... };` / `readonly storage Name { ... };`)
    if (data.storageBlocks) {
      for (const block of data.storageBlocks) {
        const blockVar = this._storageBlockName(block);
        for (const memberDecl of block.members) {
          const sym = memberDecl.declarator.symbol;
          const t = this._typeFromSymbolType(memberDecl.declarator.typeInfo);
          const entry = {
            blockVar,
            field: this._safeFieldName(memberDecl.declarator.identifier.lexeme),
            type: t
          };
          this._ssboMemberToBlock.set(sym, entry);
          this._ssboMemberByName.set(memberDecl.declarator.identifier.lexeme, entry);
        }
      }
    }

    // 3. Global variables (workgroup shared, storage textures, loose uniforms & combined samplers)
    data.symbolTable.forEach((sym) => {
      if (!(sym instanceof VarSymbol) || !sym.isGlobalVariable) return;
      if (this._uboMemberToBlock.has(sym) || this._ssboMemberToBlock.has(sym)) return;
      if (this.context.getStructVarRole([sym])) return;
      const t = this._typeFromSymbolType(sym.dataType);
      const declNode = sym.astNode instanceof ASTNode.VariableDeclaration ? sym.astNode : undefined;
      if (declNode?.isShared) {
        const wgslName = this._safeWGSLIdent(sym.ident, "shared");
        this._sharedVarBySym.set(sym, { wgslName, type: t });
        return;
      }
      if (isImageType(t.base)) {
        const wgslName = `gs_stex_${sym.ident}`;
        const format = normalizeStorageFormat(declNode?.storageFormat ?? "rgba8unorm");
        const access =
          declNode?.storageAccess === "read-only"
            ? "read"
            : declNode?.storageAccess === "read-write"
              ? "read_write"
              : "write";
        const entry = { wgslName, base: t.base, format, access };
        this._storageTexBySym.set(sym, entry);
        this._storageTexByName.set(sym.ident, entry);
        return;
      }
      if (sym.isUniform) {
        if (isSamplerType(t.base)) {
          const safe = sym.ident;
          const pair = {
            tex: `gs_wgpu_tex_${safe}`,
            samp: `gs_wgpu_samp_${safe}`,
            samplerType: t.base
          };
          this._samplerGlobalPair.set(sym, pair);
          this._samplerGlobalByName.set(sym.ident, pair);
        } else {
          const wgslName = `gs_u_${sym.ident}`;
          this._looseUniformName.set(sym, wgslName);
          this._looseUniformByName.set(sym.ident, { wgslName, type: t });
        }
      }
    });

    // 4. Functions (detect overloads & mutated params)
    const fnSymbolsByName = new Map<string, FnSymbol[]>();
    data.symbolTable.forEach((sym) => {
      if (sym instanceof FnSymbol) {
        let list = fnSymbolsByName.get(sym.ident);
        if (!list) fnSymbolsByName.set(sym.ident, (list = []));
        list.push(sym);
      }
    });

    for (const [name, list] of fnSymbolsByName) {
      // Distinct parameter signature count determines whether overload mangling is needed.
      // Same-signature declarations in mutually exclusive `#ifdef` branches MUST keep the same WGSL name!
      const sigKeys = new Set<string>();
      for (const fn of list) {
        const key = (fn.astNode.protoType.parameterList ?? [])
          .filter((p) => p.typeInfo)
          .map((p) => typeKey(this._typeFromSymbolType(p.typeInfo)))
          .join(",");
        sigKeys.add(key);
      }
      const needsMangle = sigKeys.size > 1;
      const entryNames = new Set(
        [coreInfo.vertexEntry?.name, coreInfo.fragmentEntry?.name, coreInfo.computeEntry?.name].filter(
          (n): n is string => !!n
        )
      );
      const infos: WGSLFnInfo[] = [];

      for (const fn of list) {
        const proto = fn.astNode.protoType;
        const returnType = this._typeFromSymbolType({
          type: proto.returnType.type,
          typeLexeme: proto.returnType.typeSpecifier.lexeme,
          arraySpecifier: proto.returnType.typeSpecifier.arraySpecifier,
          structDeclarations: proto.returnType.typeSpecifier.structDeclarations
        });

        const paramList = proto.parameterList ?? [];
        const mutatedParams = this._findMutatedParamNames(fn.astNode.statements);
        const params: WGSLFnInfo["params"] = [];
        const addParamDecl = (decl: ASTNode.ParameterDeclaration) => {
          if (!decl.ident || !decl.typeInfo) return;
          const pType = this._typeFromSymbolType(decl.typeInfo);
          const dir = decl.direction ?? "in";
          const isSamp = isSamplerType(pType.base);
          const pWgsl = this._safeWGSLIdent(decl.ident.lexeme, "param");
          params.push({
            name: decl.ident.lexeme,
            wgslName: pWgsl,
            type: pType,
            direction: dir,
            isSampler: isSamp,
            mutated: dir === "in" && !isSamp && mutatedParams.has(decl.ident.lexeme)
          });
        };
        const collectMacroParams = (node: TreeNode | BaseToken) => {
          if (node instanceof ASTNode.ParameterDeclaration) {
            addParamDecl(node);
            return;
          }
          if (node instanceof TreeNode) {
            for (const ch of node.children) collectMacroParams(ch);
          }
        };
        for (const p of paramList) {
          if (p.astNode instanceof ASTNode.MacroParamBlock) {
            collectMacroParams(p.astNode);
            continue;
          }
          if (!p.ident || !p.typeInfo) continue;
          const pType = this._typeFromSymbolType(p.typeInfo);
          const dir = p.direction ?? (p.astNode instanceof ASTNode.ParameterDeclaration ? p.astNode.direction : "in");
          const isSamp = isSamplerType(pType.base);
          const pWgsl = this._safeWGSLIdent(p.ident.lexeme, "param");
          params.push({
            name: p.ident.lexeme,
            wgslName: pWgsl,
            type: pType,
            direction: dir,
            isSampler: isSamp,
            mutated: dir === "in" && !isSamp && mutatedParams.has(p.ident.lexeme)
          });
        }

        let wgslName: string;
        if (name === "main" && entryNames.has("main")) {
          wgslName = this.context.names.allocate("entry-main", "gs_entry_main");
        } else if (needsMangle) {
          const suffix = params.map((p) => typeKey(p.type).replace(/[^A-Za-z0-9_]/g, "_")).join("_") || "void";
          wgslName = `${this._safeWGSLIdent(name, "fn")}__${suffix}`;
        } else {
          wgslName = this._safeWGSLIdent(name, "fn");
        }

        const info: WGSLFnInfo = { symbol: fn, wgslName, returnType, params };
        this._fnInfoByAst.set(fn.astNode, info);
        infos.push(info);
      }
      this._fnInfoByName.set(name, infos);
    }
  }

  private _findMutatedParamNames(node: TreeNode | undefined): Set<string> {
    const mutated = new Set<string>();
    if (!node) return mutated;
    const walk = (n: TreeNode) => {
      if (n instanceof ASTNode.AssignmentExpression && n.children.length === 3) {
        this._collectRootIdent(n.children[0], mutated);
      } else if (n instanceof ASTNode.UnaryExpression && n.children.length === 2) {
        const op = n.children[0];
        if (op instanceof BaseToken && (op.lexeme === "++" || op.lexeme === "--")) {
          this._collectRootIdent(n.children[1], mutated);
        }
      } else if (n instanceof ASTNode.PostfixExpression && n.children.length === 2) {
        const op = n.children[1];
        if (op instanceof BaseToken && (op.lexeme === "++" || op.lexeme === "--")) {
          this._collectRootIdent(n.children[0], mutated);
        }
      } else if (n instanceof ASTNode.FunctionCallGeneric && n.children.length === 4) {
        // Conservatively mark any argument passed to an out/inout parameter of a user function
        const fnIdent = (n.children[0] as ASTNode.FunctionIdentifier).lexeme;
        const candidates = this._fnInfoByName.get(fnIdent);
        const paramList = n.children[2];
        if (candidates && paramList instanceof ASTNode.FunctionCallParameterList) {
          for (const c of candidates) {
            c.params.forEach((p, idx) => {
              if (p.direction !== "in" && paramList.paramNodes[idx] instanceof TreeNode) {
                this._collectRootIdent(paramList.paramNodes[idx], mutated);
              }
            });
          }
        }
      }
      for (const ch of n.children) {
        if (ch instanceof TreeNode) walk(ch);
      }
    };
    walk(node);
    return mutated;
  }

  private _collectRootIdent(node: NodeChild, out: Set<string>): void {
    if (node instanceof BaseToken) return;
    if (node instanceof ASTNode.VariableIdentifier && node.children[0] instanceof BaseToken) {
      out.add(node.children[0].lexeme);
      return;
    }
    if (node instanceof ASTNode.PostfixExpression) {
      this._collectRootIdent(node.children[0], out);
      return;
    }
    if (node instanceof ASTNode.PrimaryExpression && node.children.length === 3) {
      this._collectRootIdent(node.children[1], out);
      return;
    }
    if (node.children.length === 1) {
      this._collectRootIdent(node.children[0], out);
    }
  }

  private _vertexMain(
    entryInfo: ShaderEntryPointInfo,
    data: ShaderData,
    outerGlobalMacroDeclarations: readonly ASTNode.GlobalDeclaration[]
  ): string {
    const context = this.context;
    context.stage = EShaderStage.VERTEX;
    context.stageEntry = entryInfo.name;
    for (const prop of this._fragmentVaryingProps) context.referenceVarying(prop.ident);

    this._preRegisterGlobalMacroRefs(outerGlobalMacroDeclarations);

    const globalCodeArray = this._globalCodeArray;
    context.referenceGlobal(entryInfo.name, ESymbolType.FN);

    this._referenceInterfaceDependencies([...context.attributeStructs, ...context.varyingStructs]);
    this._initializeGlobalInputs();
    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.attributeStructs, globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroDeclarations, globalCodeArray);
    this._emitOtherGlobals(data, globalCodeArray);
    this._emitDeclarationReferences(globalCodeArray);

    const globalCode = this._assembleStage(globalCodeArray);
    context.reset(false);
    this.reset();
    return globalCode;
  }

  private _fragmentMain(
    entryInfo: ShaderEntryPointInfo,
    data: ShaderData,
    outerGlobalMacroDeclarations: readonly ASTNode.GlobalDeclaration[]
  ): string {
    const context = this.context;
    context.stage = EShaderStage.FRAGMENT;
    context.stageEntry = entryInfo.name;
    this._prepareFragment(entryInfo, outerGlobalMacroDeclarations);
    this._preRegisterGlobalMacroRefs(outerGlobalMacroDeclarations);

    const globalCodeArray = this._globalCodeArray;
    context.referenceGlobal(entryInfo.name, ESymbolType.FN);

    this._referenceInterfaceDependencies([...context.varyingStructs, ...context.mrtStructs]);
    this._initializeGlobalInputs();
    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getCustomStruct(context.mrtStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroDeclarations, globalCodeArray);
    this._emitOtherGlobals(data, globalCodeArray);
    this._emitDeclarationReferences(globalCodeArray);

    const globalCode = this._assembleStage(globalCodeArray);
    for (const props of Object.values(context._referencedVaryingList)) {
      for (const prop of props) this._fragmentVaryingProps.add(prop);
    }
    context.reset(false);
    this.reset();
    return globalCode;
  }

  private _computeMain(
    entryInfo: ShaderEntryPointInfo,
    data: ShaderData,
    outerGlobalMacroDeclarations: readonly ASTNode.GlobalDeclaration[]
  ): string {
    const context = this.context;
    context.stage = EShaderStage.COMPUTE;
    context.stageEntry = entryInfo.name;
    this._preRegisterGlobalMacroRefs(outerGlobalMacroDeclarations);

    const globalCodeArray = this._globalCodeArray;
    context.referenceGlobal(entryInfo.name, ESymbolType.FN);

    this._getGlobalSymbol(globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroDeclarations, globalCodeArray);
    this._emitOtherGlobals(data, globalCodeArray);
    this._emitDeclarationReferences(globalCodeArray);

    const globalCode = this._assembleStage(globalCodeArray);
    context.reset(false);
    this.reset();
    return globalCode;
  }

  private _assembleStage(out: ICodeSegment[]): string {
    const sorted = out
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .filter(Boolean);
    const builtins = this._emitBuiltinPrivates();
    const helpers = Array.from(this._helpers.values());
    const prefix = [builtins, ...helpers].filter(Boolean);
    return [...prefix, ...sorted].join("\n");
  }

  private _emitBuiltinPrivates(): string {
    const lines: string[] = [];
    if (this.context.stage === EShaderStage.VERTEX) {
      lines.push("/*@gs_builtin position*/");
      lines.push("var<private> gs_gl_Position: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);");
      if (this._usedBuiltins.has("vertex_index")) {
        lines.push("/*@gs_builtin vertex_index*/");
        lines.push("var<private> gs_gl_VertexIndex: u32;");
      }
      if (this._usedBuiltins.has("instance_index")) {
        lines.push("/*@gs_builtin instance_index*/");
        lines.push("var<private> gs_gl_InstanceIndex: u32;");
      }
      if (this._usedBuiltins.has("point_size")) {
        lines.push("var<private> gs_gl_PointSize: f32 = 1.0;");
      }
    } else if (this.context.stage === EShaderStage.COMPUTE) {
      if (this._usedBuiltins.has("global_invocation_id")) {
        lines.push("/*@gs_builtin global_invocation_id*/");
        lines.push("var<private> gs_gl_GlobalInvocationID: vec3<u32>;");
      }
      if (this._usedBuiltins.has("local_invocation_id")) {
        lines.push("/*@gs_builtin local_invocation_id*/");
        lines.push("var<private> gs_gl_LocalInvocationID: vec3<u32>;");
      }
      if (this._usedBuiltins.has("workgroup_id")) {
        lines.push("/*@gs_builtin workgroup_id*/");
        lines.push("var<private> gs_gl_WorkGroupID: vec3<u32>;");
      }
      if (this._usedBuiltins.has("num_workgroups")) {
        lines.push("/*@gs_builtin num_workgroups*/");
        lines.push("var<private> gs_gl_NumWorkGroups: vec3<u32>;");
      }
      if (this._usedBuiltins.has("local_invocation_index")) {
        lines.push("/*@gs_builtin local_invocation_index*/");
        lines.push("var<private> gs_gl_LocalInvocationIndex: u32;");
      }
    } else {
      if (this._usedBuiltins.has("frag_coord")) {
        lines.push("/*@gs_builtin frag_coord*/");
        lines.push("var<private> gs_gl_FragCoord: vec4<f32>;");
      }
      if (this._usedBuiltins.has("front_facing")) {
        lines.push("/*@gs_builtin front_facing*/");
        lines.push("var<private> gs_gl_FrontFacing: bool;");
      }
      if (this._usedBuiltins.has("frag_depth")) {
        lines.push("/*@gs_builtin frag_depth*/");
        lines.push("var<private> gs_gl_FragDepth: f32;");
      }
      if (this._usedBuiltins.has("point_coord")) {
        lines.push("var<private> gs_gl_PointCoord: vec2<f32> = vec2<f32>(0.5, 0.5);");
      }
    }
    return lines.join("\n");
  }

  private _emitOtherGlobals(data: ShaderData, out: ICodeSegment[]): void {
    if (data.uniformBlocks) {
      for (const block of data.uniformBlocks) {
        if (block.parent?.parent instanceof ASTNode.GLShaderProgram) {
          const text = this._uniformBlockCode(block);
          if (text) out.push({ text, index: block.location.start.index });
        }
      }
    }
    if (data.storageBlocks) {
      for (const block of data.storageBlocks) {
        if (block.parent?.parent instanceof ASTNode.GLShaderProgram) {
          const text = this._storageBlockCode(block);
          if (text) out.push({ text, index: block.location.start.index });
        }
      }
      this._flushPendingStructs(out);
    }
    for (const { name, fallback } of this._inputHelperGroups.values()) {
      out.push({
        text:
          ShaderInstructionEncoder.declaration(`fn ${name}() {}`, fallback) +
          ShaderInstructionEncoder.reference(0, fallback.id),
        index: -1
      });
    }
    for (const output of this._outputDeclarations.values()) {
      out.push({
        text: output.unconditional
          ? output.text
          : ShaderInstructionEncoder.sharedDeclaration(output.text, Array.from(output.owners.values())),
        index: -1
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Stage Interface (Attributes / Varyings / MRT)
  // ---------------------------------------------------------------------------

  override getAttributeProp(prop: StructProp): string {
    const t = this._typeFromSymbolType(prop.typeInfo);
    const wgslT = this._wgslType(t);
    const wire = this._attributeWireName(prop.ident.lexeme);
    return `/*@gs_in name=${prop.ident.lexeme} var=${wire} glslType=${t.base} flat=0 centroid=0*/\nvar<private> ${wire}: ${wgslT};`;
  }

  override getVaryingProp(prop: StructProp): string {
    const t = this._typeFromSymbolType(prop.typeInfo);
    const wgslT = this._wgslType(t);
    const wire = this.interfaceName(prop, ShaderStructRole.Varying);
    const flat = prop.isFlat || isIntegerType(t) ? 1 : 0;
    const centroid = prop.isCentroid ? 1 : 0;
    const kind = this.context.stage === EShaderStage.FRAGMENT ? "gs_in" : "gs_out";
    return `/*@${kind} name=${wire} var=${wire} glslType=${t.base} flat=${flat} centroid=${centroid}*/\nvar<private> ${wire}: ${wgslT};`;
  }

  override getMRTProp(prop: StructProp): string {
    const index = prop.mrtIndex!;
    if (!prop.isInMacroBranch) {
      this._registerFragDataVariable(index);
      return "";
    }
    const id = -(index + 1);
    const owner = { id, group: id, sourceScope: 0 };
    this._registerFragDataVariable(index, owner);
    return (
      ShaderInstructionEncoder.declaration("", owner) +
      ShaderInstructionEncoder.reference(this.currentDeclarationOwner?.id ?? 0, id)
    );
  }

  private _attributeWireName(name: string): string {
    return this.context.names.allocate(`attr-wire:${name}`, `gs_in_${name}`);
  }

  protected interfaceName(prop: StructProp, role: ShaderStructRole): string {
    const context = this.context;
    const name = prop.ident.lexeme;
    const isOutput = role === ShaderStructRole.Mrt;
    const sameName = (item: StructProp) => item.ident.lexeme === name;
    const conflicts =
      WGSL_RESERVED.has(name) ||
      this._globalNames.has(name) ||
      (!isOutput && (context.attributeList.some(sameName) || context.mrtList.some(sameName)));
    const key = `${isOutput ? "output" : "varying"}:${name}`;
    const generated = conflicts ? context.names.allocate(key, `gs_v_${name}`) : name;
    if (!isOutput && context.stage === EShaderStage.VERTEX && generated !== name) {
      (this._vertexOutputNames ??= Object.create(null))[name] = generated;
    }
    return generated;
  }

  private _interfaceTypeName(struct: ASTNode.StructSpecifier): string {
    const name = struct.ident!.lexeme;
    return this._structNameMap.get(name) ?? this._safeWGSLIdent(name, "struct");
  }

  private _transferName(struct: ASTNode.StructSpecifier, read: boolean): string {
    return this.context.names.allocate(
      `${read ? "read" : "write"}:${struct.ident!.lexeme}`,
      `gs_${read ? "read" : "write"}_${struct.ident!.lexeme}`
    );
  }

  private _fragmentColorName(): string {
    return this.context.names.allocate("fragment-output", "gs_output_color");
  }

  private _fragmentDataVariableName(index: number): string {
    return index === 0
      ? this._fragmentColorName()
      : this.context.names.allocate(`fragment-output:${index}`, `gs_output_color_${index}`);
  }

  private _registerOutput(name: string, text: string, owner = this.currentDeclarationOwner): void {
    let output = this._outputDeclarations.get(name);
    if (!output) this._outputDeclarations.set(name, (output = { text, owners: new Map(), unconditional: false }));
    if (owner) output.owners.set(owner.id, owner);
    else output.unconditional = true;
  }

  private _registerFragColorVariable(): string {
    const name = this._fragmentColorName();
    this._registerOutput(name, `/*@gs_mrt loc=0 var=${name} glslType=vec4*/\nvar<private> ${name}: vec4<f32>;`);
    return name;
  }

  private _registerFragDataVariable(index: number, owner = this.currentDeclarationOwner): string {
    const name = this._fragmentDataVariableName(index);
    this._registerOutput(
      name,
      `/*@gs_mrt loc=${index} var=${name} glslType=vec4*/\nvar<private> ${name}: vec4<f32>;`,
      owner
    );
    return name;
  }

  private _prepareFragment(
    entryInfo: ShaderEntryPointInfo,
    outerGlobalMacroStatements: readonly ASTNode.GlobalDeclaration[]
  ): void {
    const pending = entryInfo.functions.slice();
    while (pending.length) {
      const fn = pending.pop()!;
      if (this._scannedFragmentFunctions.has(fn)) continue;
      this._scannedFragmentFunctions.add(fn);
      this._scanFragmentOutputs(fn.astNode);
      pending.push(...fn.calledFunctions);
    }
    for (const macro of outerGlobalMacroStatements) this._scanFragmentOutputs(macro);
  }

  private _scanFragmentOutputs(node: TreeNode): void {
    if (node instanceof ASTNode.PostfixExpression && node.children.length === 4) {
      const base = node.children[0];
      const index = node.children[2];
      if (
        base instanceof TreeNode &&
        index instanceof TreeNode &&
        ParserUtils.unwrapBareIdentifier(base, { allowParens: true })?.builtinSemantic ===
          ShaderBuiltinSemantic.FragmentOutputArray
      ) {
        const value = ParserUtils.constIntegerValue(index);
        if (value === undefined || value < 0) this._fragDataArrayRequired = true;
        else this._fragDataIndices.set(node, value);
        this._scanFragmentOutputs(index);
        return;
      }
    }
    if (
      node instanceof ASTNode.VariableIdentifier &&
      node.builtinSemantic === ShaderBuiltinSemantic.FragmentOutputArray
    ) {
      this._fragDataArrayRequired = true;
      return;
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) this._scanFragmentOutputs(child);
    }
  }

  // ---------------------------------------------------------------------------
  // Structs & Uniform Blocks & Global Variables
  // ---------------------------------------------------------------------------

  override visitStructSpecifier(node: ASTNode.StructSpecifier): string {
    const context = this.context;
    const role = context.getStructRole([node]);
    const typeName = this._interfaceTypeName(node);

    const memberCode = (emit: (prop: StructProp) => string) => {
      const segments: ICodeSegment[] = node.macroExpressions.map((item) => ({
        text: item instanceof BaseToken ? item.lexeme : item.codeGen(this),
        index: item.location.start.index
      }));
      for (const prop of node.propList) {
        segments.push({ text: emit(prop), index: prop.ident.location.start.index });
      }
      return segments
        .sort((a, b) => a.index - b.index)
        .map((item) => item.text)
        .filter(Boolean)
        .join("\n");
    };

    const emitField = (prop: StructProp) => {
      const t = this._typeFromSymbolType(prop.typeInfo);
      if (isSamplerType(t.base)) return ""; // Opaque samplers in structs are flattened into bindings
      const fieldName = this._safeFieldName(prop.ident.lexeme);
      return `  ${fieldName}: ${this._wgslType(t)},`;
    };

    const buildStructDef = (): string => {
      const nonSamplerProps = node.propList.filter((p) => !isSamplerType(this._typeFromSymbolType(p.typeInfo).base));
      if (nonSamplerProps.length && !node.macroExpressions.length) {
        return `struct ${typeName} {\n${memberCode(emitField)}\n}`;
      }
      const hasFields = context.names.allocate(node, `${typeName}_has_fields`);
      const padding = context.names.allocate("empty-struct-member", "gs_pad");
      const body = memberCode((prop) => {
        const line = emitField(prop);
        return line ? `${line}\n#define ${hasFields}\n` : "";
      });
      return `#undef ${hasFields}\nstruct ${typeName} {\n${body}\n#ifndef ${hasFields}\n  ${padding}: f32,\n#endif\n}\n#undef ${hasFields}\n`;
    };

    if (!role) {
      // Emit struct metadata comment if used as a uniform struct so linker knows its fields
      const structDef = buildStructDef();
      if (this._uniformStructs.has(node)) {
        const metaFields = node.propList.map((p) => {
          const t = this._typeFromSymbolType(p.typeInfo);
          return `${p.ident.lexeme}:${t.base}${t.arraySize !== undefined ? `[${t.arraySize}]` : ""}`;
        });
        return `/*@gs_struct name=${node.ident!.lexeme} wgsl=${typeName} fields=${metaFields.join(",")}*/\n${structDef}`;
      }
      return structDef;
    }

    const structCode = buildStructDef();
    const references =
      role === ShaderStructRole.Attribute
        ? context._referencedAttributeList
        : role === ShaderStructRole.Varying
          ? context._referencedVaryingList
          : context._referencedMRTList;
    const used = (prop: StructProp) => !!references[prop.ident.lexeme]?.includes(prop);

    const declarations = memberCode((prop) =>
      !used(prop)
        ? ""
        : role === ShaderStructRole.Attribute
          ? this.getAttributeProp(prop)
          : role === ShaderStructRole.Varying
            ? this.getVaryingProp(prop)
            : (this.getMRTProp(prop) ?? "")
    );
    const read =
      role === ShaderStructRole.Attribute ||
      (role === ShaderStructRole.Varying && context.stage === EShaderStage.FRAGMENT);
    const value = context.names.allocate("interface-value", "gs_io_val");
    const assignments = memberCode((prop) => {
      if (!used(prop)) return "";
      const wire =
        role === ShaderStructRole.Attribute
          ? this._attributeWireName(prop.ident.lexeme)
          : role === ShaderStructRole.Mrt
            ? this._fragmentDataVariableName(prop.mrtIndex!)
            : this.interfaceName(prop, role);
      const member = `${value}.${this._safeFieldName(prop.ident.lexeme)}`;
      return read ? `  ${member} = ${wire};` : `  ${wire} = ${member};`;
    });

    const transfer = read
      ? `fn ${this._transferName(node, true)}() -> ${typeName} {\n  var ${value}: ${typeName};\n${assignments}\n  return ${value};\n}`
      : `fn ${this._transferName(node, false)}(${value}: ${typeName}) {\n${assignments}\n}`;
    return `${structCode}\n${declarations}\n${transfer}`;
  }

  private _uniformBlockName(layout: IShaderUniformBlock): string {
    return this.context.names.allocate(layout, `gs_${layout.name}`);
  }

  private _uniformBlockCode(block: ASTNode.UniformBlock): string {
    const referenced = block.members.filter((member) =>
      this.context._referencedGlobalSymbols.has(member.declarator.symbol)
    );
    if (!referenced.length) return "";
    const layout = block.layout;
    (this._uniformBlocks ??= new Set()).add(layout);
    const bindingName = this._uniformBlockName(layout);
    const blockType = `${bindingName}_Block`;
    const fields = layout.members.map(({ name, type, arrayLength }) => {
      const fName = this._safeFieldName(name);
      const t: WGSLTypeDesc = arrayLength ? { base: type, arraySize: String(arrayLength) } : { base: type };
      return `  ${fName}: ${this._wgslType(t)},`;
    });
    const text =
      `/*@gs_ubo name=${layout.name} binding=${bindingName} type=${blockType} byteLength=${layout.byteLength}*/\n` +
      `struct ${blockType} {\n${fields.join("\n")}\n}\n` +
      `var<uniform> ${bindingName}: ${blockType};`;
    if (this._declarationOwners.size) {
      const owners = referenced.map((member) => this._declarationOwners.get(member)!);
      return (
        owners.map((owner) => ShaderInstructionEncoder.declaration("", owner)).join("") +
        ShaderInstructionEncoder.sharedDeclaration(text, owners)
      );
    }
    return text;
  }

  visitUniformBlock(): string {
    return "";
  }

  private _storageBlockName(block: ASTNode.StorageBlock): string {
    return this.context.names.allocate(block, `gs_ssbo_${block.name}`);
  }

  private _storageBlockCode(block: ASTNode.StorageBlock): string {
    const referenced = block.members.filter((member) =>
      this.context._referencedGlobalSymbols.has(member.declarator.symbol)
    );
    if (!referenced.length) return "";
    const bindingName = this._storageBlockName(block);
    const blockType = `${bindingName}_Block`;
    const access = block.readonly ? "read" : "read_write";
    const fields = block.members.map((member) => {
      const fName = this._safeFieldName(member.declarator.identifier.lexeme);
      const t = this._typeFromSymbolType(member.declarator.typeInfo);
      return `  ${fName}: ${this._wgslType(t)},`;
    });
    const text =
      `/*@gs_ssbo name=${block.name} binding=${bindingName} type=${blockType} access=${access}*/\n` +
      `struct ${blockType} {\n${fields.join("\n")}\n}\n` +
      `var<storage, ${access}> ${bindingName}: ${blockType};`;
    if (this._declarationOwners.size) {
      const owners = referenced.map((member) => this._declarationOwners.get(member)!);
      return (
        owners.map((owner) => ShaderInstructionEncoder.declaration("", owner)).join("") +
        ShaderInstructionEncoder.sharedDeclaration(text, owners)
      );
    }
    return text;
  }

  private _flushPendingStructs(out: ICodeSegment[]): void {
    for (const sm of this.context._referencedGlobalSymbols) {
      if (!(sm.astNode instanceof ASTNode.StructSpecifier)) continue;
      if (this._structCodeSegments.has(sm.astNode) || sm.isInMacroBranch) continue;
      this._currentDeclaration = sm.astNode;
      const codeGenResult = sm.astNode.codeGen(this);
      this._currentDeclaration = undefined;
      if (!codeGenResult) continue;
      const segment = {
        text: this._declaration(codeGenResult, sm.astNode),
        index: sm.astNode.location.start.index
      };
      out.push(segment);
      this._structCodeSegments.set(sm.astNode, segment);
    }
  }

  visitStorageBlock(): string {
    return "";
  }

  visitStorageTextureDeclaration(): string {
    return "";
  }

  visitPrecisionSpecifier(): string {
    return "";
  }

  override visitGlobalVariableDeclaration(node: ASTNode.VariableDeclaration): string {
    const { identifier, typeInfo, initializer, isConst, symbol } = node.declarator;
    const t = this._typeFromSymbolType(typeInfo);

    // Stage IO global variable (e.g. `Attributes v;` at global scope)
    const ioRole = this.context.getStructVarRole([symbol]);
    if (ioRole) {
      const wgslName = this._safeWGSLIdent(identifier.lexeme, "var");
      return `var<private> ${wgslName}: ${this._wgslType(t)};`;
    }

    // Workgroup shared memory (`shared T name[N];`)
    if (node.isShared) {
      const wgslName = this._sharedVarBySym.get(symbol)?.wgslName ?? this._safeWGSLIdent(identifier.lexeme, "shared");
      return `var<workgroup> ${wgslName}: ${this._wgslType(t)};`;
    }

    // Storage texture (`layout(rgba8unorm) writeonly image2D name;`)
    if (isImageType(t.base)) {
      const info = this._storageTexBySym.get(symbol) ?? {
        wgslName: `gs_stex_${identifier.lexeme}`,
        base: t.base,
        format: normalizeStorageFormat(node.storageFormat ?? "rgba8unorm"),
        access:
          node.storageAccess === "read-only" ? "read" : node.storageAccess === "read-write" ? "read_write" : "write"
      };
      return (
        `/*@gs_stex name=${identifier.lexeme} var=${info.wgslName} format=${info.format} access=${info.access}*/\n` +
        `var ${info.wgslName}: texture_storage_2d<${info.format}, ${info.access}>;`
      );
    }

    // Combined sampler uniform
    if (symbol.isUniform && isSamplerType(t.base)) {
      const pair = this._samplerGlobalPair.get(symbol) ?? {
        tex: `gs_wgpu_tex_${identifier.lexeme}`,
        samp: `gs_wgpu_samp_${identifier.lexeme}`,
        samplerType: t.base
      };
      const arrAttr = t.arraySize !== undefined ? ` array=${t.arraySize}` : "";
      return (
        `/*@gs_sampler name=${identifier.lexeme} type=${t.base} tex=${pair.tex} samp=${pair.samp}${arrAttr}*/\n` +
        `var ${pair.tex}: ${samplerToWGSLTexture(t.base)};\n` +
        `var ${pair.samp}: ${samplerToWGSLSampler(t.base)};`
      );
    }

    // Loose numeric / struct uniform
    if (symbol.isUniform) {
      const wgslName = this._looseUniformName.get(symbol) ?? `gs_u_${identifier.lexeme}`;
      const arrAttr = t.arraySize !== undefined ? ` array=${t.arraySize}` : "";
      return (
        `/*@gs_uniform name=${identifier.lexeme} var=${wgslName} glslType=${t.base}${arrAttr}*/\n` +
        `var<private> ${wgslName}: ${this._wgslType(t)};`
      );
    }

    // Module-scope const or static global variable with initializer
    const wgslName = this._safeWGSLIdent(identifier.lexeme, "gvar");
    const wgslT = this._wgslType(t);
    if (initializer) {
      const initCode = this._emitInitializer(initializer, t);
      if (isConst && this._isSimpleConstExpr(initializer)) {
        return `const ${wgslName}: ${wgslT} = ${initCode};`;
      }
      if (isConst) {
        this._globalInitStmts.push(`  ${wgslName} = ${initCode};`);
        return `var<private> ${wgslName}: ${wgslT};`;
      }
      if (this._isSimpleConstExpr(initializer)) {
        return `var<private> ${wgslName}: ${wgslT} = ${initCode};`;
      }
      this._globalInitStmts.push(`  ${wgslName} = ${initCode};`);
      return `var<private> ${wgslName}: ${wgslT};`;
    }
    return `var<private> ${wgslName}: ${wgslT};`;
  }

  // ---------------------------------------------------------------------------
  // Functions & Entry Points
  // ---------------------------------------------------------------------------

  override visitFunctionDefinition(fnNode: ASTNode.FunctionDefinition): string {
    const info = this._fnInfoByAst.get(fnNode);
    const isEntry = fnNode.protoType.ident.lexeme === this.context.stageEntry;
    const prevFn = this._currentFnInfo;
    this._currentFnInfo = info;

    // Register parameters into local var table
    const paramList = fnNode.protoType.parameterList ?? [];
    const addedParams: VarSymbol[] = [];
    const wgslParamSegments: Array<{ text: string; raw?: boolean }> = [];
    const prologue: string[] = [];

    const registerAndEmitParamDecl = (
      ident: BaseToken,
      typeInfo: SymbolType,
      direction: ParamDirection,
      decl?: ASTNode.ParameterDeclaration
    ): string => {
      const pInfo = info?.params.find((x) => x.name === ident.lexeme);
      const t = pInfo?.type ?? this._typeFromSymbolType(typeInfo);
      const dir = pInfo?.direction ?? direction;
      const isSamp = isSamplerType(t.base);
      const pWgsl = pInfo?.wgslName ?? this._safeWGSLIdent(ident.lexeme, "param");

      if (isSamp) {
        const tex = `${pWgsl}_tex`;
        const samp = `${pWgsl}_samp`;
        if (decl?.symbol) {
          this._localVarNames.set(decl.symbol, {
            wgslName: tex,
            type: t,
            samplerPair: { tex, samp, samplerType: t.base }
          });
          addedParams.push(decl.symbol);
        }
        return `${tex}: ${samplerToWGSLTexture(t.base)}, ${samp}: ${samplerToWGSLSampler(t.base)}`;
      }
      if (dir === "out" || dir === "inout") {
        const ptrName = `${pWgsl}_ptr`;
        if (decl?.symbol) {
          this._localVarNames.set(decl.symbol, { wgslName: ptrName, type: t, isPtr: true });
          addedParams.push(decl.symbol);
        }
        return `${ptrName}: ptr<function, ${this._wgslType(t)}>`;
      }
      if (pInfo?.mutated) {
        const paramRaw = `${pWgsl}_param`;
        prologue.push(`  var ${pWgsl}: ${this._wgslType(t)} = ${paramRaw};`);
        if (decl?.symbol) {
          this._localVarNames.set(decl.symbol, { wgslName: pWgsl, type: t });
          addedParams.push(decl.symbol);
        }
        return `${paramRaw}: ${this._wgslType(t)}`;
      }
      if (decl?.symbol) {
        this._localVarNames.set(decl.symbol, { wgslName: pWgsl, type: t });
        addedParams.push(decl.symbol);
      }
      return `${pWgsl}: ${this._wgslType(t)}`;
    };

    const emitMacroParamNode = (node: TreeNode | BaseToken): string => {
      if (node instanceof BaseToken) return node.lexeme;
      if (node instanceof ASTNode.ParameterDeclaration) {
        return node.ident && node.typeInfo
          ? registerAndEmitParamDecl(node.ident, node.typeInfo, node.direction, node)
          : "";
      }
      if (
        node instanceof ASTNode.MacroPushContext ||
        node instanceof ASTNode.MacroPopContext ||
        node instanceof ASTNode.MacroElifExpression ||
        node instanceof ASTNode.MacroElseExpression
      ) {
        return node.codeGen(this);
      }
      return node.children.map((ch) => emitMacroParamNode(ch)).join(" ");
    };

    for (let i = 0; i < paramList.length; i++) {
      const p = paramList[i];
      if (p.astNode instanceof ASTNode.MacroParamBlock) {
        wgslParamSegments.push({ text: emitMacroParamNode(p.astNode), raw: true });
        continue;
      }
      if (!p.ident || !p.typeInfo) continue;
      const decl = p.astNode instanceof ASTNode.ParameterDeclaration ? p.astNode : undefined;
      wgslParamSegments.push({
        text: registerAndEmitParamDecl(p.ident, p.typeInfo, p.direction ?? "in", decl)
      });
    }

    const retType =
      info?.returnType ??
      this._typeFromSymbolType({
        type: fnNode.protoType.returnType.type,
        typeLexeme: fnNode.protoType.returnType.typeSpecifier.lexeme,
        arraySpecifier: fnNode.protoType.returnType.typeSpecifier.arraySpecifier
      });
    const fnName = info?.wgslName ?? this._safeWGSLIdent(fnNode.protoType.ident.lexeme, "fn");
    const retSuffix = retType.base !== "void" ? ` -> ${this._wgslType(retType)}` : "";

    const bodyText = this._emitCompoundBody(fnNode.statements);
    for (const s of addedParams) this._localVarNames.delete(s);
    this._currentFnInfo = prevFn;

    let paramSigStr = "";
    for (let i = 0; i < wgslParamSegments.length; i++) {
      const seg = wgslParamSegments[i];
      if (i > 0 && !seg.raw) paramSigStr += ", ";
      else if (i > 0 && seg.raw) paramSigStr += "\n";
      paramSigStr += seg.text;
    }
    const definition = `fn ${fnName}(${paramSigStr})${retSuffix} {\n${[...prologue, bodyText].filter(Boolean).join("\n")}\n}`;

    if (!isEntry) return definition;

    // Emit stage entry wrapper with `/*@gs_entry_begin*/ ... /*@gs_entry_end*/` markers for linker
    const args: string[] = [];
    const paramSetup: string[] = [];
    for (const p of paramList) {
      if (!p.ident || !p.typeInfo) continue;
      const paramStruct = p.typeInfo.structDeclarations[0];
      if (paramStruct) {
        const argName = this.context.names.allocate(p, `gs_arg_${p.ident.lexeme}`);
        paramSetup.push(`  let ${argName} = ${this._transferName(paramStruct, true)}();`);
        args.push(argName);
      }
    }

    const retStruct = fnNode.protoType.returnType.typeSpecifier.structDeclarations[0];
    const callExpr = `${fnName}(${args.join(", ")})`;
    let callStmt: string;
    if (retStruct && this.context.getStructRole([retStruct])) {
      callStmt = `  ${this._transferName(retStruct, false)}(${callExpr});`;
    } else if (this.context.stage === EShaderStage.FRAGMENT && fnNode.protoType.returnType.type === Keyword.VEC4) {
      const outName = this._registerFragColorVariable();
      callStmt = `  ${outName} = ${callExpr};`;
    } else {
      callStmt = `  ${callExpr};`;
    }

    const globalInputs = this._initializeGlobalInputs();
    const zRemap =
      this.context.stage === EShaderStage.VERTEX
        ? ["  gs_gl_Position.z = (gs_gl_Position.z + gs_gl_Position.w) * 0.5;"]
        : [];
    const entryLines = [...this._globalInitStmts, ...globalInputs, ...paramSetup, callStmt, ...zRemap];
    return `${definition}\n/*@gs_entry_begin*/\n${entryLines.join("\n")}\n/*@gs_entry_end*/`;
  }

  private _initializeGlobalInputs(): string[] {
    const calls = new Set<string>();
    for (const variable of this._globalInputs.get(this.context.stage) ?? []) {
      this.context.referenceGlobal(variable.ident, ESymbolType.VAR);
      const struct = variable.dataType!.structDeclarations[0];
      const owner = this._declarationOwners.get(variable.astNode!)!;
      this._referenceDeclaration(owner.id, struct);
      let group = this._inputHelperGroups.get(owner.group);
      if (!group) {
        let nextId = 0;
        for (const declaration of this._declarationOwners.values()) nextId = Math.max(nextId, declaration.id);
        for (const helper of this._inputHelperGroups.values()) nextId = Math.max(nextId, helper.fallback.id);
        const fallback = { id: nextId + 1, group: owner.group, sourceScope: -1 };
        const name = this.context.names.allocate(`input-initializer:${owner.group}`, `gs_init_${variable.ident}`);
        this._inputHelperGroups.set(owner.group, (group = { name, fallback }));
      }
      const target = this._safeWGSLIdent(variable.ident, "var");
      this._inputHelperBodies.set(
        variable.astNode!,
        `fn ${group.name}() { ${target} = ${this._transferName(struct, true)}(); }`
      );
      calls.add(`  ${group.name}();`);
    }
    return Array.from(calls);
  }

  // ---------------------------------------------------------------------------
  // Statements
  // ---------------------------------------------------------------------------

  private _withHoist(fn: () => string): string {
    const saved = this._hoistQueue;
    this._hoistQueue = [];
    const main = fn();
    const hoisted = this._hoistQueue;
    this._hoistQueue = saved;
    if (!hoisted.length) return main;
    return [...hoisted, main].filter(Boolean).join("\n");
  }

  private _emitCompoundBody(node: TreeNode): string {
    const children = node.children;
    if (children.length <= 2) return "";
    return children[1] instanceof TreeNode ? children[1].codeGen(this) : "";
  }

  visitCompoundStatement(node: ASTNode.CompoundStatement): string {
    return `{\n${this._emitCompoundBody(node)}\n}`;
  }

  visitCompoundStatementNoScope(node: ASTNode.CompoundStatementNoScope): string {
    return `{\n${this._emitCompoundBody(node)}\n}`;
  }

  override visitStatementList(node: ASTNode.StatementList): string {
    const children = node.children;
    if (children.length === 1) return children[0] instanceof TreeNode ? children[0].codeGen(this) : "";
    const left = children[0] instanceof TreeNode ? children[0].codeGen(this) : "";
    const right = children[1] instanceof TreeNode ? children[1].codeGen(this) : "";
    return left && right ? `${left}\n${right}` : left || right;
  }

  override visitDeclaration(node: ASTNode.Declaration): string {
    const first = node.children[0];
    if (first instanceof ASTNode.FunctionProtoType) return ""; // WGSL needs no forward function declarations
    if (first instanceof ASTNode.PrecisionSpecifier) return "";
    if (first instanceof ASTNode.InitDeclaratorList) return first.codeGen(this);
    return "";
  }

  visitInitDeclaratorList(node: ASTNode.InitDeclaratorList): string {
    const decls: ASTNode.VariableDeclaratorInfo[] = [];
    const collect = (n: ASTNode.InitDeclaratorList) => {
      if (n.children.length === 1) {
        const single = n.children[0] as ASTNode.SingleDeclaration;
        if (single.declarator) decls.push(single.declarator);
      } else {
        collect(n.children[0] as ASTNode.InitDeclaratorList);
        if (n.declarator) decls.push(n.declarator);
      }
    };
    collect(node);
    const lines: string[] = [];
    for (const d of decls) {
      lines.push(this._emitLocalDeclarator(d));
    }
    return lines.filter(Boolean).join("\n");
  }

  override visitSingleDeclaration(node: ASTNode.SingleDeclaration): string {
    return node.declarator ? this._emitLocalDeclarator(node.declarator) : "";
  }

  private _emitLocalDeclarator(d: ASTNode.VariableDeclaratorInfo): string {
    const t = this._typeFromSymbolType(d.typeInfo);
    const wgslName = this._safeWGSLIdent(d.identifier.lexeme, "lvar");
    if (d.symbol) {
      this._localVarNames.set(d.symbol, { wgslName, type: t });
    }
    const wgslT = this._wgslType(t);
    return this._withHoist(() => {
      if (d.initializer) {
        const initCode = this._emitInitializer(d.initializer, t);
        if (d.isConst && this._isSimpleConstExpr(d.initializer)) {
          return `  const ${wgslName}: ${wgslT} = ${initCode};`;
        }
        return `  var ${wgslName}: ${wgslT} = ${initCode};`;
      }
      return `  var ${wgslName}: ${wgslT};`;
    });
  }

  visitExpressionStatement(node: ASTNode.ExpressionStatement): string {
    if (node.children.length === 1) return ""; // empty `;`
    return this._withHoist(() => {
      const expr = node.children[0] as ASTNode.Expression;
      return this._emitExprAsStmt(expr);
    });
  }

  private _emitExprAsStmt(expr: TreeNode): string {
    const unwrapped = this._unwrapSingle(expr);
    // Direct assignment statement
    if (unwrapped instanceof ASTNode.AssignmentExpression && unwrapped.children.length === 3) {
      return this._emitAssignmentStmt(unwrapped);
    }
    // Standalone prefix/postfix ++/--
    if (unwrapped instanceof ASTNode.UnaryExpression && unwrapped.children.length === 2) {
      const op = unwrapped.children[0];
      if (op instanceof BaseToken && (op.lexeme === "++" || op.lexeme === "--")) {
        const target = this._emitLValue(unwrapped.children[1] as TreeNode);
        const step = this._incStep(this._inferType(unwrapped.children[1] as TreeNode));
        return `  ${target} ${op.lexeme === "++" ? "+=" : "-="} ${step};`;
      }
    }
    if (unwrapped instanceof ASTNode.PostfixExpression && unwrapped.children.length === 2) {
      const op = unwrapped.children[1];
      if (op instanceof BaseToken && (op.lexeme === "++" || op.lexeme === "--")) {
        const target = this._emitLValue(unwrapped.children[0] as TreeNode);
        const step = this._incStep(this._inferType(unwrapped.children[0] as TreeNode));
        return `  ${target} ${op.lexeme === "++" ? "+=" : "-="} ${step};`;
      }
    }
    // Comma expression statement
    if (unwrapped instanceof ASTNode.Expression && unwrapped.children.length === 3) {
      const a = this._emitExprAsStmt(unwrapped.children[0] as TreeNode);
      const b = this._emitExprAsStmt(unwrapped.children[2] as TreeNode);
      return [a, b].filter(Boolean).join("\n");
    }
    // Void or value-discarded function call (or macro-aliased function call)
    if (unwrapped instanceof ASTNode.MacroCallFunction) {
      const res = this._emitMacroCallFunction(unwrapped, true);
      if (!res.code) return "";
      return res.type.base === "void" ? `  ${res.code};` : `  _ = ${res.code};`;
    }
    if (unwrapped instanceof ASTNode.FunctionCallGeneric || unwrapped instanceof ASTNode.FunctionCall) {
      const callNode =
        unwrapped instanceof ASTNode.FunctionCall ? (unwrapped.children[0] as ASTNode.FunctionCallGeneric) : unwrapped;
      const res = this._emitCallGeneric(callNode, true);
      if (!res.code) return "";
      return res.type.base === "void" ? `  ${res.code};` : `  _ = ${res.code};`;
    }
    const res = this._emitNode(expr);
    if (!res.code) return "";
    return res.type.base === "void" ? `  ${res.code};` : `  _ = ${res.code};`;
  }

  visitSelectionStatement(node: ASTNode.SelectionStatement): string {
    // IF '(' expression ')' statement [ELSE statement]
    const condExpr = node.children[2] as TreeNode;
    const thenStmt = node.children[4] as TreeNode;
    const elseStmt = node.children.length === 7 ? (node.children[6] as TreeNode) : undefined;
    return this._withHoist(() => {
      const cond = this._emitNode(condExpr).code;
      const thenBody = this._ensureBracedStmt(thenStmt);
      if (!elseStmt) return `  if (${cond}) ${thenBody}`;
      const elseUnwrapped = this._unwrapStatement(elseStmt);
      if (elseUnwrapped instanceof ASTNode.SelectionStatement) {
        return `  if (${cond}) ${thenBody} else ${elseUnwrapped.codeGen(this).trimStart()}`;
      }
      return `  if (${cond}) ${thenBody} else ${this._ensureBracedStmt(elseStmt)}`;
    });
  }

  private _unwrapStatement(node: TreeNode): TreeNode {
    if (node instanceof ASTNode.Statement || node instanceof ASTNode.SimpleStatement) {
      if (node.children.length === 1 && node.children[0] instanceof TreeNode) {
        return this._unwrapStatement(node.children[0]);
      }
    }
    return node;
  }

  private _ensureBracedStmt(stmt: TreeNode): string {
    const inner = this._unwrapStatement(stmt);
    if (inner instanceof ASTNode.CompoundStatement || inner instanceof ASTNode.CompoundStatementNoScope) {
      return `{\n${this._emitCompoundBody(inner)}\n  }`;
    }
    return `{\n${stmt.codeGen(this)}\n  }`;
  }

  visitIterationStatement(node: ASTNode.IterationStatement): string {
    const head = node.children[0] as BaseToken;
    if (head.type === Keyword.WHILE) {
      // WHILE '(' condition ')' statement
      const condNode = node.children[2] as ASTNode.Condition;
      const bodyNode = node.children[4] as TreeNode;
      const saved = this._hoistQueue;
      this._hoistQueue = [];
      const condCode = this._emitCondition(condNode);
      const condHoists = this._hoistQueue;
      this._hoistQueue = saved;
      const bodyCode = this._ensureBracedStmt(bodyNode);
      if (!condHoists.length) {
        return `  while (${condCode}) ${bodyCode}`;
      }
      return `  loop {\n${condHoists.join("\n")}\n    if (!(${condCode})) { break; }\n${this._emitStmtInner(bodyNode)}\n  }`;
    }

    // FOR '(' for_init_statement for_rest_statement ')' statement
    const initNode = node.children[2] as ASTNode.ForInitStatement;
    const restNode = node.children[3] as ASTNode.ForRestStatement;
    const bodyNode = node.children[5] as TreeNode;

    const initChild = initNode.children[0] as TreeNode;
    let initStr = "";
    let initHoisted = false;
    const outerLines: string[] = [];

    if (initChild instanceof ASTNode.Declaration && initChild.children[0] instanceof ASTNode.InitDeclaratorList) {
      const initText = initChild.children[0].codeGen(this).trim();
      if (initText && !initText.includes("\n")) {
        initStr = initText.replace(/;\s*$/, "");
      } else if (initText) {
        outerLines.push(initText);
        initHoisted = true;
      }
    } else if (initChild instanceof ASTNode.ExpressionStatement && initChild.children.length > 1) {
      const initText = initChild.codeGen(this).trim();
      if (initText && !initText.includes("\n")) {
        initStr = initText.replace(/;\s*$/, "");
      } else if (initText) {
        outerLines.push(initText);
        initHoisted = true;
      }
    }

    const condOpt = restNode.children[0] as ASTNode.ConditionOpt;
    const stepExpr = restNode.children.length === 3 ? (restNode.children[2] as TreeNode) : undefined;

    let condStr = "";
    let condHoists: string[] = [];
    if (condOpt.children.length === 1) {
      const saved = this._hoistQueue;
      this._hoistQueue = [];
      condStr = this._emitCondition(condOpt.children[0] as ASTNode.Condition);
      condHoists = this._hoistQueue;
      this._hoistQueue = saved;
    }

    let stepStr = "";
    let stepLines = "";
    if (stepExpr) {
      const emittedStep = this._withHoist(() => this._emitExprAsStmt(stepExpr)).trim();
      if (emittedStep && !emittedStep.includes("\n")) {
        stepStr = emittedStep.replace(/;\s*$/, "");
      } else {
        stepLines = emittedStep;
      }
    }

    let loopCode: string;
    if (!condHoists.length && !stepLines) {
      loopCode = `  for (${initStr}; ${condStr}; ${stepStr}) ${this._ensureBracedStmt(bodyNode)}`;
    } else {
      const header: string[] = [];
      if (condStr) {
        header.push(...condHoists);
        header.push(`    if (!(${condStr})) { break; }`);
      }
      const contBody = stepLines || (stepStr ? `    ${stepStr};` : "");
      const cont = contBody ? `    continuing {\n${contBody}\n    }` : "";
      loopCode = `  loop {\n${[...header, this._emitStmtInner(bodyNode), cont].filter(Boolean).join("\n")}\n  }`;
    }

    if (initHoisted) {
      return `  {\n${outerLines.join("\n")}\n${loopCode}\n  }`;
    }
    return loopCode;
  }

  private _emitStmtInner(stmt: TreeNode): string {
    const inner = this._unwrapStatement(stmt);
    if (inner instanceof ASTNode.CompoundStatement || inner instanceof ASTNode.CompoundStatementNoScope) {
      return this._emitCompoundBody(inner);
    }
    return stmt.codeGen(this);
  }

  private _emitCondition(cond: ASTNode.Condition): string {
    if (cond.children.length === 1) {
      return this._emitNode(cond.children[0] as TreeNode).code;
    }
    // `fully_specified_type id '=' initializer`
    const ft = cond.children[0] as ASTNode.FullySpecifiedType;
    const id = cond.children[1] as BaseToken;
    const init = cond.children[3] as ASTNode.Initializer;
    const t = this._typeFromSymbolType({ type: ft.type, typeLexeme: ft.typeSpecifier.lexeme });
    const name = this._safeWGSLIdent(id.lexeme, "cond");
    this._hoistQueue.push(`  var ${name}: ${this._wgslType(t)} = ${this._emitInitializer(init, t)};`);
    return t.base === "bool" ? name : `(${name} != ${this._zeroLiteral(t)})`;
  }

  override visitJumpStatement(node: ASTNode.JumpStatement): string {
    const kw = node.children[0] as BaseToken;
    switch (kw.type) {
      case Keyword.BREAK:
        return "  break;";
      case Keyword.CONTINUE:
        return "  continue;";
      case Keyword.DISCARD:
        return "  discard;";
      case Keyword.RETURN: {
        if (node.children.length === 2) return "  return;";
        return this._withHoist(() => {
          const val = this._emitNode(node.children[1] as TreeNode);
          const expected = this._currentFnInfo?.returnType;
          const coerced = expected && expected.base !== "void" ? this._coerceExpr(val, expected) : val.code;
          return `  return ${coerced};`;
        });
      }
      default:
        return super.visitJumpStatement(node);
    }
  }

  // ---------------------------------------------------------------------------
  // Expressions
  // ---------------------------------------------------------------------------

  visitExpression(node: ASTNode.Expression): string {
    return this._emitNode(node).code;
  }

  visitAssignmentExpression(node: ASTNode.AssignmentExpression): string {
    return this._emitNode(node).code;
  }

  visitConditionalExpression(node: ASTNode.ConditionalExpression): string {
    return this._emitNode(node).code;
  }

  visitBinaryExpression(node: ASTNode.ExpressionAstNode): string {
    return this._emitNode(node).code;
  }

  visitUnaryExpression(node: ASTNode.UnaryExpression): string {
    return this._emitNode(node).code;
  }

  visitPrimaryExpression(node: ASTNode.PrimaryExpression): string {
    return this._emitNode(node).code;
  }

  override visitPostfixExpression(node: ASTNode.PostfixExpression): string {
    return this._emitNode(node).code;
  }

  override visitFunctionCall(node: ASTNode.FunctionCall): string {
    return this._emitNode(node).code;
  }

  visitFunctionCallGeneric(node: ASTNode.FunctionCallGeneric): string {
    return this._emitNode(node).code;
  }

  override visitVariableIdentifier(node: ASTNode.VariableIdentifier): string {
    return this._emitNode(node).code;
  }

  override visitMacroDefine(node: ASTNode.MacroDefine): string {
    // Handle `saturate(a)` / `FxaaSat(x)` -> native WGSL `saturate(...)`
    if (node.isFunction && (node.macroName === "saturate" || node.macroName === "FxaaSat")) {
      const paramsToken = node.children[2] as BaseToken;
      const params = ParserUtils.parseMacroParamList(paramsToken.lexeme);
      if (params.length === 1) return `\n#define ${node.macroName}(${params[0]}) saturate(${params[0]})\n`;
    }
    if (node.isFunction && node.macroName === "INVERSE_MAT") {
      const paramsToken = node.children[2] as BaseToken;
      const params = ParserUtils.parseMacroParamList(paramsToken.lexeme);
      if (params.length === 1) {
        const helper = this._ensureInverseHelper(4);
        return `\n#define ${node.macroName}(${params[0]}) ${helper}(${params[0]})\n`;
      }
    }
    // Skip FxaaTexTop/FxaaTexOff macro definition rewrite — handled directly in `visitMacroCallFunction`
    if (node.isFunction && (node.macroName === "FxaaTexTop" || node.macroName === "FxaaTexOff")) {
      return "";
    }
    if (!node.isFunction && node.valueExpression) {
      const alias = ParserUtils.unwrapBareIdentifier(node.valueExpression, { allowParens: false });
      const token = alias?.children[0];
      if (alias && token instanceof BaseToken && !alias.resolvedSymbols().length) {
        const mapped = this._mapOpaqueTypeOrBuiltinAlias(token.lexeme);
        if (mapped) return `\n#define ${node.macroName} ${mapped}\n`;
      }
    }
    const prev = this._inMacroDefineBody;
    this._inMacroDefineBody = true;
    try {
      const paramsStr = node.isFunction ? (node.children[2] as BaseToken).lexeme : "";
      if (!node.isFunction && node.valueExpression) {
        const val = this._emitNode(node.valueExpression);
        if (val.samplerPair) {
          return `\n#define ${node.macroName} ${val.samplerPair.tex}\n#define gs_wgpu_smp_${node.macroName} ${val.samplerPair.samp}\n`;
        }
        return `\n#define ${node.macroName} ${val.code}\n`;
      }
      const valStr = node.valueExpression ? this._emitNode(node.valueExpression).code : "";
      return `\n#define ${node.macroName}${paramsStr} ${valStr}\n`;
    } finally {
      this._inMacroDefineBody = prev;
    }
  }

  override visitMacroCallFunction(node: ASTNode.MacroCallFunction): string {
    return this._emitMacroCallFunction(node, false).code;
  }

  private _emitMacroCallFunction(node: ASTNode.MacroCallFunction, isStatement: boolean): EmittedExpr {
    const paramList = node.children[2];
    const params = paramList instanceof ASTNode.FunctionCallParameterList ? paramList.paramNodes : [];
    const argNodes = params.filter((p): p is TreeNode => p instanceof TreeNode);

    // FXAA texture sampling macros taking a sampler parameter
    if (node.macroName === "FxaaTexTop" && argNodes.length === 2) {
      const s = this._emitNode(argNodes[0]);
      const p = this._emitNode(argNodes[1]);
      if (s.samplerPair) {
        return {
          code: `textureSampleLevel(${s.samplerPair.tex}, ${s.samplerPair.samp}, ${p.code}, 0.0)`,
          type: WT_VEC4
        };
      }
    }
    if (node.macroName === "FxaaTexOff" && argNodes.length === 4) {
      const s = this._emitNode(argNodes[0]);
      const p = this._emitNode(argNodes[1]);
      const o = this._emitNode(argNodes[2]);
      if (s.samplerPair) {
        return {
          code: `textureSampleLevel(${s.samplerPair.tex}, ${s.samplerPair.samp}, ${p.code}, 0.0, ${o.code})`,
          type: WT_VEC4
        };
      }
    }
    if (node.macroName === "INVERSE_MAT" && argNodes.length === 1) {
      const arg = this._emitNode(argNodes[0]);
      const n = (matrixDims(arg.type)?.cols ?? 4) as 2 | 3 | 4;
      return { code: `${this._ensureInverseHelper(n)}(${arg.code})`, type: arg.type };
    }
    // Function-name macro alias (e.g. `FUNCTION_CLEAR_COAT_LOBE` -> `clearCoatLobe`, `FUNCTION_DIFFUSE_LOBE` -> `diffuseLobe`)
    const fnAlias = this._identMacroAliases.get(node.macroName);
    if (fnAlias) {
      const overloads = this._fnInfoByName.get(fnAlias);
      if (overloads?.length) {
        return this._emitUserFunctionCall(
          undefined,
          overloads,
          argNodes,
          isStatement,
          overloads.length === 1 ? node.macroName : undefined
        );
      }
    }
    // Type-alias macro used as constructor (e.g. `FxaaFloat3(0.299, 0.587, 0.114)`)
    const typeAlias = this._typeMacroAliases.get(node.macroName);
    if (typeAlias && /^(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?)$/.test(typeAlias)) {
      return this._emitTypeConstructor(typeAlias, argNodes);
    }
    const emittedArgs = argNodes.map((a) => this._emitNode(a).code);
    return { code: `${node.macroName}(${emittedArgs.join(", ")})`, type: this._inferType(node) };
  }

  private _translateOpaqueDefineLexeme(lexeme: string): string {
    // Handle `#define FxaaFloat float`, `#define FxaaFloat2 vec2`, `#define FxaaTex sampler2D`, etc.
    const m = /^(\s*#\s*define\s+)([A-Za-z_]\w*)([ \t]+)(.+?)(\s*)$/.exec(lexeme);
    if (!m) return lexeme;
    const [, head, name, sp, body, tail] = m;
    const trimmed = body.trim();
    const mapped = this._mapOpaqueTypeOrBuiltinAlias(trimmed);
    if (mapped) return `${head}${name}${sp}${mapped}${tail}`;
    return lexeme;
  }

  private _mapOpaqueTypeOrBuiltinAlias(token: string): string | undefined {
    const wgsl = glslBaseToWGSL(token);
    if (wgsl !== token) return wgsl;
    if (token === "sampler2D") return "texture_2d<f32>";
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Core typed expression emitter (single AST traversal)
  // ---------------------------------------------------------------------------

  private _unwrapSingle(node: TreeNode): TreeNode {
    let cur = node;
    while (
      cur.children.length === 1 &&
      cur.children[0] instanceof TreeNode &&
      !(cur instanceof ASTNode.VariableIdentifier) &&
      !(cur instanceof ASTNode.FunctionCallGeneric) &&
      !(cur instanceof ASTNode.MacroCallFunction) &&
      !(cur instanceof ASTNode.MacroCallSymbol)
    ) {
      cur = cur.children[0];
    }
    return cur;
  }

  private _emitNode(node: TreeNode): EmittedExpr {
    const n = this._unwrapSingle(node);

    // 1. VariableIdentifier
    if (n instanceof ASTNode.VariableIdentifier) {
      return this._emitVarIdent(n);
    }

    // 2. PrimaryExpression (literal or parenthesized expression)
    if (n instanceof ASTNode.PrimaryExpression) {
      if (n.children.length === 3) {
        const inner = this._emitNode(n.children[1] as TreeNode);
        return { code: `(${inner.code})`, type: inner.type, samplerPair: inner.samplerPair };
      }
      const tok = n.children[0];
      if (tok instanceof BaseToken) {
        if (tok.type === ETokenType.FLOAT_CONSTANT) {
          return { code: formatFloatLiteral(tok.lexeme), type: WT_FLOAT };
        }
        if (tok.type === ETokenType.INT_CONSTANT) {
          if (tok.lexeme.endsWith("u") || tok.lexeme.endsWith("U")) {
            return { code: formatUintLiteral(tok.lexeme), type: WT_UINT };
          }
          return { code: tok.lexeme, type: WT_INT };
        }
        if (tok.type === Keyword.True || tok.type === Keyword.False) {
          return { code: tok.lexeme, type: WT_BOOL };
        }
        return { code: tok.lexeme, type: WT_UNKNOWN };
      }
      return this._emitNode(tok as TreeNode);
    }

    // 3. MacroCallFunction / MacroCallSymbol
    if (n instanceof ASTNode.MacroCallFunction) {
      return this._emitMacroCallFunction(n, false);
    }
    if (n instanceof ASTNode.MacroCallSymbol) {
      const tok = n.children[0] as BaseToken;
      const aliased = this._identMacroAliases.get(tok.lexeme);
      if (aliased) {
        const aliasSamp = this._samplerGlobalByName.get(aliased);
        if (aliasSamp) {
          return {
            code: tok.lexeme,
            type: { base: aliasSamp.samplerType },
            samplerPair: {
              tex: tok.lexeme,
              samp: `gs_wgpu_smp_${tok.lexeme}`,
              samplerType: aliasSamp.samplerType
            }
          };
        }
        const aliasLoose = this._looseUniformByName.get(aliased);
        if (aliasLoose) return { code: tok.lexeme, type: aliasLoose.type };
        const aliasUbo = this._uboMemberByName.get(aliased);
        if (aliasUbo) return { code: tok.lexeme, type: aliasUbo.type };
      }
      return { code: tok.lexeme, type: this._inferType(n) };
    }

    // 4. FunctionCallGeneric
    if (n instanceof ASTNode.FunctionCallGeneric) {
      return this._emitCallGeneric(n, false);
    }

    // 5. PostfixExpression
    if (n instanceof ASTNode.PostfixExpression) {
      return this._emitPostfix(n);
    }

    // 6. UnaryExpression
    if (n instanceof ASTNode.UnaryExpression) {
      return this._emitUnary(n);
    }

    // 7. Binary expressions
    if (
      n.children.length === 3 &&
      (n instanceof ASTNode.MultiplicativeExpression ||
        n instanceof ASTNode.AdditiveExpression ||
        n instanceof ASTNode.ShiftExpression ||
        n instanceof ASTNode.RelationalExpression ||
        n instanceof ASTNode.EqualityExpression ||
        n instanceof ASTNode.AndExpression ||
        n instanceof ASTNode.ExclusiveOrExpression ||
        n instanceof ASTNode.InclusiveOrExpression ||
        n instanceof ASTNode.LogicalAndExpression ||
        n instanceof ASTNode.LogicalXorExpression ||
        n instanceof ASTNode.LogicalOrExpression)
    ) {
      const op = (n.children[1] as BaseToken).lexeme;
      const left = this._emitNode(n.children[0] as TreeNode);
      const rightNode = n.children[2] as TreeNode;
      const right = this._emitNode(rightNode);
      return this._emitBinaryOp(op, left, right, rightNode);
    }

    // 8. ConditionalExpression (`cond ? thenExpr : elseExpr`)
    if (n instanceof ASTNode.ConditionalExpression && n.children.length === 5) {
      return this._emitTernary(n.children[0] as TreeNode, n.children[2] as TreeNode, n.children[4] as TreeNode);
    }

    // 9. AssignmentExpression (in expression position!)
    if (n instanceof ASTNode.AssignmentExpression && n.children.length === 3) {
      const stmt = this._emitAssignmentStmt(n);
      if (stmt) this._hoistQueue.push(stmt);
      return this._emitNode(n.children[0] as TreeNode);
    }

    // 10. Comma Expression (`a, b`)
    if (n instanceof ASTNode.Expression && n.children.length === 3) {
      const lhsStmt = this._emitExprAsStmt(n.children[0] as TreeNode);
      if (lhsStmt) this._hoistQueue.push(lhsStmt);
      return this._emitNode(n.children[2] as TreeNode);
    }

    // 11. Initializer / InitializerList
    if (n instanceof ASTNode.Initializer) {
      return this._emitNode(n.children[0] as TreeNode);
    }

    return { code: this.defaultCodeGen(n.children), type: this._inferType(n) };
  }

  private _emitVarIdent(node: ASTNode.VariableIdentifier): EmittedExpr {
    for (const name of node.referenceGlobalSymbolNames) {
      this.context.referenceGlobal(name, ESymbolType.Any);
    }
    for (const sym of node.resolvedSymbols()) {
      if (sym instanceof FnSymbol) this.referenceFunction(sym, node.location.start.index, node._branch);
    }

    // Builtin variables via `ShaderBuiltinSemantic`
    const child = node.children[0];
    const rawName = child instanceof BaseToken ? child.lexeme : "";
    if (node.builtinSemantic !== undefined) {
      switch (node.builtinSemantic) {
        case ShaderBuiltinSemantic.VertexPosition:
          return { code: "gs_gl_Position", type: WT_VEC4 };
        case ShaderBuiltinSemantic.VertexID:
          this._usedBuiltins.add("vertex_index");
          return { code: "i32(gs_gl_VertexIndex)", type: WT_INT };
        case ShaderBuiltinSemantic.InstanceID:
          this._usedBuiltins.add("instance_index");
          return { code: "i32(gs_gl_InstanceIndex)", type: WT_INT };
        case ShaderBuiltinSemantic.PointSize:
          this._usedBuiltins.add("point_size");
          return { code: "gs_gl_PointSize", type: WT_FLOAT };
        case ShaderBuiltinSemantic.FragCoord:
          this._usedBuiltins.add("frag_coord");
          return { code: "gs_gl_FragCoord", type: WT_VEC4 };
        case ShaderBuiltinSemantic.FrontFacing:
          this._usedBuiltins.add("front_facing");
          return { code: "gs_gl_FrontFacing", type: WT_BOOL };
        case ShaderBuiltinSemantic.PointCoord:
          this._usedBuiltins.add("point_coord");
          return { code: "gs_gl_PointCoord", type: WT_VEC2 };
        case ShaderBuiltinSemantic.FragmentDepth:
          this._usedBuiltins.add("frag_depth");
          return { code: "gs_gl_FragDepth", type: WT_FLOAT };
        case ShaderBuiltinSemantic.FragmentOutput0: {
          const outName = this._registerFragColorVariable();
          return { code: outName, type: WT_VEC4 };
        }
        case ShaderBuiltinSemantic.BuiltinLimit: {
          const val = GLSL_BUILTIN_INT_LIMITS[rawName];
          if (val !== undefined) return { code: `${val}i`, type: WT_INT };
          break;
        }
        case ShaderBuiltinSemantic.GlobalInvocationID:
          this._usedBuiltins.add("global_invocation_id");
          return { code: "gs_gl_GlobalInvocationID", type: WT_UVEC3 };
        case ShaderBuiltinSemantic.LocalInvocationID:
          this._usedBuiltins.add("local_invocation_id");
          return { code: "gs_gl_LocalInvocationID", type: WT_UVEC3 };
        case ShaderBuiltinSemantic.WorkGroupID:
          this._usedBuiltins.add("workgroup_id");
          return { code: "gs_gl_WorkGroupID", type: WT_UVEC3 };
        case ShaderBuiltinSemantic.NumWorkGroups:
          this._usedBuiltins.add("num_workgroups");
          return { code: "gs_gl_NumWorkGroups", type: WT_UVEC3 };
        case ShaderBuiltinSemantic.LocalInvocationIndex:
          this._usedBuiltins.add("local_invocation_index");
          return { code: "gs_gl_LocalInvocationIndex", type: WT_UINT };
      }
    }

    if (child instanceof ASTNode.MacroCallFunction || child instanceof ASTNode.MacroCallSymbol) {
      return this._emitNode(child);
    }

    // Resolved variable symbol
    const symbols = node.resolvedValueSymbols();
    const sym = symbols[0];
    if (sym instanceof VarSymbol) {
      // 1. Local variable or function parameter
      const local = this._localVarNames.get(sym);
      if (local) {
        if (local.samplerPair) {
          return { code: local.wgslName, type: local.type, samplerPair: local.samplerPair };
        }
        return { code: local.isPtr ? `(*${local.wgslName})` : local.wgslName, type: local.type };
      }
      // 2. Explicit UBO member (`Scene` / `Camera`)
      const ubo = this._uboMemberToBlock.get(sym);
      if (ubo) {
        return { code: `${ubo.blockVar}.${ubo.field}`, type: ubo.type };
      }
      // 2b. Storage block member (SSBO)
      const ssbo = this._ssboMemberToBlock.get(sym);
      if (ssbo) {
        return { code: `${ssbo.blockVar}.${ssbo.field}`, type: ssbo.type };
      }
      // 2c. Storage texture (`image2D`)
      const stex = this._storageTexBySym.get(sym);
      if (stex) {
        return { code: stex.wgslName, type: { base: stex.base } };
      }
      // 2d. Workgroup shared variable (`shared`)
      const shared = this._sharedVarBySym.get(sym);
      if (shared) {
        return { code: shared.wgslName, type: shared.type };
      }
      // 3. Global combined sampler uniform
      const samp = this._samplerGlobalPair.get(sym);
      if (samp) {
        return { code: samp.tex, type: { base: samp.samplerType }, samplerPair: samp };
      }
      // 4. Loose numeric/struct uniform
      const loose = this._looseUniformName.get(sym);
      if (loose) {
        return { code: loose, type: this._typeFromSymbolType(sym.dataType) };
      }
      // 5. Global static/const or IO struct var
      const t = this._typeFromSymbolType(sym.dataType);
      const isIO = !!this.context.getStructVarRole([sym]);
      const wgslName = this._safeWGSLIdent(sym.ident, isIO ? "var" : sym.isGlobalVariable ? "gvar" : "lvar");
      return { code: wgslName, type: t };
    }

    // Macro-expanded or unresolved identifier (e.g. `#define` appearing before uniform declaration
    // or object-like `#define` aliasing a sampler/uniform across `#ifdef` branches)
    const aliased = this._identMacroAliases.get(rawName);
    if (aliased) {
      const aliasSamp = this._samplerGlobalByName.get(aliased);
      if (aliasSamp) {
        return {
          code: rawName,
          type: { base: aliasSamp.samplerType },
          samplerPair: {
            tex: rawName,
            samp: `gs_wgpu_smp_${rawName}`,
            samplerType: aliasSamp.samplerType
          }
        };
      }
      const aliasLoose = this._looseUniformByName.get(aliased);
      if (aliasLoose) return { code: rawName, type: aliasLoose.type };
      const aliasUbo = this._uboMemberByName.get(aliased);
      if (aliasUbo) return { code: rawName, type: aliasUbo.type };
      const aliasSsbo = this._ssboMemberByName.get(aliased);
      if (aliasSsbo) return { code: rawName, type: aliasSsbo.type };
    }
    const uboByName = this._uboMemberByName.get(rawName);
    if (uboByName) {
      this.context.referenceGlobal(rawName, ESymbolType.VAR);
      return { code: `${uboByName.blockVar}.${uboByName.field}`, type: uboByName.type };
    }
    const ssboByName = this._ssboMemberByName.get(rawName);
    if (ssboByName) {
      this.context.referenceGlobal(rawName, ESymbolType.VAR);
      return { code: `${ssboByName.blockVar}.${ssboByName.field}`, type: ssboByName.type };
    }
    const stexByName = this._storageTexByName.get(rawName);
    if (stexByName) {
      this.context.referenceGlobal(rawName, ESymbolType.VAR);
      return { code: stexByName.wgslName, type: { base: stexByName.base } };
    }
    const sampByName = this._samplerGlobalByName.get(rawName);
    if (sampByName) {
      this.context.referenceGlobal(rawName, ESymbolType.VAR);
      return { code: sampByName.tex, type: { base: sampByName.samplerType }, samplerPair: sampByName };
    }
    const looseByName = this._looseUniformByName.get(rawName);
    if (looseByName) {
      this.context.referenceGlobal(rawName, ESymbolType.VAR);
      return { code: looseByName.wgslName, type: looseByName.type };
    }
    const t = { base: galaceanTypeToBase(node.typeInfo) };
    return { code: rawName, type: t };
  }

  private _emitPostfix(node: ASTNode.PostfixExpression): EmittedExpr {
    const children = node.children;
    // `gl_FragData[i]` specialized output
    if (!this._fragDataArrayRequired) {
      const idx = this._fragDataIndices.get(node);
      if (idx !== undefined) {
        const outName = this._registerFragDataVariable(idx);
        return { code: outName, type: WT_VEC4 };
      }
    }

    // Postfix `++` / `--`
    if (children.length === 2 && children[1] instanceof BaseToken) {
      const op = children[1].lexeme;
      const objNode = children[0] as TreeNode;
      const target = this._emitLValue(objNode);
      const t = this._inferType(objNode);
      const tmp = this._freshTemp("gs_post");
      this._hoistQueue.push(`  let ${tmp} = ${target};`);
      this._hoistQueue.push(`  ${target} ${op === "++" ? "+=" : "-="} ${this._incStep(t)};`);
      return { code: tmp, type: t };
    }

    // Member access or method call: `obj.field` / `obj.length()`
    if (children.length === 3) {
      const postExpr = children[0] as ASTNode.PostfixExpression;
      const prop = children[2];

      // Method call `.length()`
      if (prop instanceof ASTNode.FunctionCall) {
        const call = prop.children[0] as ASTNode.FunctionCallGeneric;
        const method = (call.children[0] as ASTNode.FunctionIdentifier).lexeme;
        if (method === "length") {
          const objType = this._inferType(postExpr);
          if (objType.arraySize === "")
            return { code: `i32(arrayLength(&${this._emitLValue(postExpr)}))`, type: WT_INT };
          if (objType.arraySize) return { code: `i32(${objType.arraySize})`, type: WT_INT };
          const vn = vectorSize(objType);
          if (vn > 0) return { code: `${vn}i`, type: WT_INT };
          const md = matrixDims(objType);
          if (md) return { code: `${md.cols}i`, type: WT_INT };
        }
        throw new Error(`Unsupported GLSL method call '.${method}()' in WGSLVisitor.`);
      }

      if (prop instanceof BaseToken) {
        // Register stage-interface struct prop references (Attribute / Varying / MRT)
        let role: ShaderStructRole | undefined;
        const directRoot = ParserUtils.unwrapBareIdentifier(postExpr, { allowParens: true });
        if (directRoot) {
          const symbols = directRoot.resolvedValueSymbols();
          const unresolvedName = ParserUtils.extractDirectIdentLexeme(postExpr);
          role = symbols.length
            ? this.context.getStructVarRole(symbols)
            : unresolvedName
              ? this.context.getUnresolvedStructVarRole(unresolvedName)
              : undefined;
        }
        if (!directRoot) role = this.context.getStructRole(node.resolvedMemberOwners);
        if (role) {
          if (role === ShaderStructRole.Attribute) this.context.referenceAttribute(prop);
          else if (role === ShaderStructRole.Varying) this.context.referenceVarying(prop);
          else this.context.referenceMRTProp(prop);
        }

        const obj = this._emitNode(postExpr);
        const structAst = this._structDeclMap.get(obj.type.base);
        if (structAst && obj.type.arraySize === undefined) {
          const found = structAst.propList.find((p) => p.ident.lexeme === prop.lexeme);
          if (found) {
            const fType = this._typeFromSymbolType(found.typeInfo);
            // Opaque sampler field inside a uniform struct -> flattened resource pair
            if (isSamplerType(fType.base)) {
              const basePath = `${obj.code.replace(/^gs_u_/, "")}.${prop.lexeme}`;
              return {
                code: `gs_wgpu_tex_${basePath.replace(/\./g, "_")}`,
                type: fType,
                samplerPair: {
                  tex: `gs_wgpu_tex_${basePath.replace(/\./g, "_")}`,
                  samp: `gs_wgpu_samp_${basePath.replace(/\./g, "_")}`,
                  samplerType: fType.base
                }
              };
            }
            return { code: `${obj.code}.${this._safeFieldName(prop.lexeme)}`, type: fType };
          }
        }
        // Vector swizzle
        if (vectorSize(obj.type) > 0 && isValidSwizzle(prop.lexeme)) {
          const fam = scalarFamily(obj.type) ?? "float";
          const swiz = normalizeSwizzle(prop.lexeme);
          return { code: `${obj.code}.${swiz}`, type: makeVectorType(fam, swiz.length) };
        }
        return { code: `${obj.code}.${this._safeFieldName(prop.lexeme)}`, type: this._inferType(node) };
      }
    }

    // Indexing: `obj[index]`
    if (children.length === 4) {
      const obj = this._emitNode(children[0] as TreeNode);
      const idx = this._emitNode(children[2] as TreeNode);
      // Constant-indexed sampler array: `material_images[1]` or `material_layer.images[INDEX]`
      if (obj.samplerPair) {
        const constVal = ParserUtils.constIntegerValue(children[2] as TreeNode);
        const idxStr = constVal !== undefined ? String(constVal) : idx.code.trim().replace(/[^A-Za-z0-9_]/g, "");
        return {
          code: `${obj.samplerPair.tex}_${idxStr}`,
          type: { base: obj.samplerPair.samplerType },
          samplerPair: {
            tex: `${obj.samplerPair.tex}_${idxStr}`,
            samp: `${obj.samplerPair.samp}_${idxStr}`,
            samplerType: obj.samplerPair.samplerType
          }
        };
      }
      let elemType: WGSLTypeDesc = WT_UNKNOWN;
      if (obj.type.arraySize !== undefined) {
        elemType = { base: obj.type.base };
      } else {
        const m = matrixDims(obj.type);
        if (m) elemType = makeVectorType("float", m.rows);
        else if (vectorSize(obj.type) > 0) elemType = { base: scalarFamily(obj.type) ?? "float" };
      }
      return { code: `${obj.code}[${idx.code}]`, type: elemType };
    }

    return this._emitNode(children[0] as TreeNode);
  }

  private _emitUnary(node: ASTNode.UnaryExpression): EmittedExpr {
    if (node.children.length === 1) return this._emitNode(node.children[0] as TreeNode);
    const opChild = node.children[0];
    const op = opChild instanceof BaseToken ? opChild.lexeme : (opChild.children[0] as BaseToken).lexeme;
    const targetNode = node.children[1] as TreeNode;

    if (op === "++" || op === "--") {
      const target = this._emitLValue(targetNode);
      const t = this._inferType(targetNode);
      this._hoistQueue.push(`  ${target} ${op === "++" ? "+=" : "-="} ${this._incStep(t)};`);
      return { code: target, type: t };
    }
    const inner = this._emitNode(targetNode);
    if (op === "+") return inner;
    if (op === "-" && matrixDims(inner.type)) {
      return { code: `(${inner.code} * -1.0)`, type: inner.type };
    }
    return { code: `(${op}${inner.code})`, type: inner.type };
  }

  private _emitBinaryOp(op: string, left: EmittedExpr, right: EmittedExpr, rightNode?: TreeNode): EmittedExpr {
    if (op === "^^") {
      return { code: `((${left.code}) != (${right.code}))`, type: WT_BOOL };
    }
    if (op === "==" || op === "!=") {
      if (vectorSize(left.type) > 0 || vectorSize(right.type) > 0) {
        const fn = op === "==" ? "all" : "any";
        return { code: `${fn}((${left.code}) ${op} (${right.code}))`, type: WT_BOOL };
      }
      const lm = matrixDims(left.type);
      if (lm) {
        const cmp = Array.from(
          { length: lm.cols },
          (_, c) => `all((${left.code})[${c}] == (${right.code})[${c}])`
        ).join(" && ");
        return { code: op === "==" ? `(${cmp})` : `!(${cmp})`, type: WT_BOOL };
      }
      if (left.type.arraySize && /^\d+$/.test(left.type.arraySize)) {
        const count = Number(left.type.arraySize);
        const elemType: WGSLTypeDesc = { base: left.type.base };
        const cmp = Array.from(
          { length: count },
          (_, i) =>
            this._emitBinaryOp(
              "==",
              { code: `(${left.code})[${i}]`, type: elemType },
              { code: `(${right.code})[${i}]`, type: elemType }
            ).code
        ).join(" && ");
        return { code: op === "==" ? `(${cmp})` : `!(${cmp})`, type: WT_BOOL };
      }
      const sAst = this._structDeclMap.get(left.type.base);
      if (sAst && left.type.arraySize === undefined) {
        const cmp = sAst.propList
          .filter((p) => !isSamplerType(this._typeFromSymbolType(p.typeInfo).base))
          .map((p) => {
            const ft = this._typeFromSymbolType(p.typeInfo);
            const fn = this._safeFieldName(p.ident.lexeme);
            return this._emitBinaryOp(
              "==",
              { code: `(${left.code}).${fn}`, type: ft },
              { code: `(${right.code}).${fn}`, type: ft }
            ).code;
          })
          .join(" && ");
        return { code: op === "==" ? `(${cmp})` : `!(${cmp})`, type: WT_BOOL };
      }
      return { code: `((${left.code}) ${op} (${right.code}))`, type: WT_BOOL };
    }
    if (op === "&" || op === "|" || op === "^") {
      const target = vectorSize(left.type) >= vectorSize(right.type) ? left.type : right.type;
      return {
        code: `((${this._broadcastToMatch(left, target)}) ${op} (${this._broadcastToMatch(right, target)}))`,
        type: target
      };
    }
    if (op === "<<" || op === ">>") {
      return { code: `((${left.code}) ${op} (${this._coerceShiftRhs(right, left.type, rightNode)}))`, type: left.type };
    }
    if (op === "/" && matrixDims(left.type) && isScalarType(right.type)) {
      return { code: `((${left.code}) * (1.0 / (${right.code})))`, type: left.type };
    }
    const resType = inferBinaryType(op, left.type, right.type);
    return { code: `((${left.code}) ${op} (${right.code}))`, type: resType };
  }

  private _emitTernary(condNode: TreeNode, thenNode: TreeNode, elseNode: TreeNode): EmittedExpr {
    const cond = this._emitNode(condNode);
    const thenType = this._inferType(thenNode);
    const elseType = this._inferType(elseNode);
    const resType = thenType.base !== "unknown" ? thenType : elseType;
    const canSelect =
      (isScalarType(resType) || vectorSize(resType) > 0) &&
      !this._hasSideEffects(thenNode) &&
      !this._hasSideEffects(elseNode);
    if (canSelect) {
      const tVal = this._emitNode(thenNode);
      const eVal = this._emitNode(elseNode);
      const tCode = this._coerceExpr(tVal, resType);
      const eCode = this._coerceExpr(eVal, resType);
      return { code: `select(${eCode}, ${tCode}, ${cond.code})`, type: resType };
    }
    const tmp = this._freshTemp("gs_sel");
    const saved = this._hoistQueue;
    this._hoistQueue = [];
    const tVal = this._emitNode(thenNode);
    const tHoists = this._hoistQueue;
    this._hoistQueue = [];
    const eVal = this._emitNode(elseNode);
    const eHoists = this._hoistQueue;
    this._hoistQueue = saved;
    const finalType = tVal.type.base !== "unknown" ? tVal.type : eVal.type;
    this._hoistQueue.push(
      `  var ${tmp}: ${this._wgslType(finalType)};\n` +
        `  if (${cond.code}) {\n${[...tHoists, `    ${tmp} = ${this._coerceExpr(tVal, finalType)};`].join("\n")}\n  } else {\n${[...eHoists, `    ${tmp} = ${this._coerceExpr(eVal, finalType)};`].join("\n")}\n  }`
    );
    return { code: tmp, type: finalType };
  }

  private _emitAssignmentStmt(node: ASTNode.AssignmentExpression): string {
    const lhsNode = this._unwrapSingle(node.children[0] as TreeNode);
    const op = ((node.children[1] as ASTNode.AssignmentOperator).children[0] as BaseToken).lexeme;
    const rhsNode = node.children[2] as TreeNode;

    // Multi-component swizzle assignment: `v.xyz = expr;` or `v.xy += expr;`
    if (
      lhsNode instanceof ASTNode.PostfixExpression &&
      lhsNode.children.length === 3 &&
      lhsNode.children[2] instanceof BaseToken &&
      isValidSwizzle(lhsNode.children[2].lexeme) &&
      lhsNode.children[2].lexeme.length >= 2
    ) {
      const objType = this._inferType(lhsNode.children[0] as TreeNode);
      if (vectorSize(objType) > 0) {
        const swiz = normalizeSwizzle(lhsNode.children[2].lexeme);
        const fam = scalarFamily(objType) ?? "float";
        const swizType = makeVectorType(fam, swiz.length);
        const base = this._emitLValue(lhsNode.children[0] as TreeNode);
        const rhs = this._emitNode(rhsNode);
        let valCode: string;
        if (op === "=") {
          valCode = this._broadcastToMatch(rhs, swizType);
        } else {
          const binOp = op.slice(0, -1);
          valCode = this._emitBinaryOp(binOp, { code: `${base}.${swiz}`, type: swizType }, rhs, rhsNode).code;
        }
        const tmp = this._freshTemp("gs_swz");
        const lines = [`  let ${tmp}: ${this._wgslType(swizType)} = ${valCode};`];
        for (let k = 0; k < swiz.length; k++) {
          lines.push(`  ${base}.${swiz[k]} = ${tmp}.${"xyzw"[k]};`);
        }
        return lines.join("\n");
      }
    }

    const lhs = this._emitLValue(lhsNode);
    const lhsType = this._inferType(lhsNode);
    const rhs = this._emitNode(rhsNode);

    if (op === "=") {
      return `  ${lhs} = ${this._coerceExpr(rhs, lhsType)};`;
    }
    if (op === "<<=" || op === ">>=") {
      return `  ${lhs} ${op} ${this._coerceShiftRhs(rhs, lhsType, rhsNode)};`;
    }
    if (op === "&=" || op === "|=" || op === "^=") {
      return `  ${lhs} ${op} ${this._broadcastToMatch(rhs, lhsType)};`;
    }
    if (op === "/=" && matrixDims(lhsType) && isScalarType(rhs.type)) {
      return `  ${lhs} = (${lhs}) * (1.0 / (${rhs.code}));`;
    }
    return `  ${lhs} ${op} ${this._coerceExpr(rhs, lhsType)};`;
  }

  private _emitLValue(node: TreeNode): string {
    const n = this._unwrapSingle(node);
    if (n instanceof ASTNode.PrimaryExpression && n.children.length === 3) {
      return this._emitLValue(n.children[1] as TreeNode);
    }
    if (n instanceof ASTNode.PostfixExpression && n.children.length === 4) {
      const base = this._emitLValue(n.children[0] as TreeNode);
      const idx = this._emitNode(n.children[2] as TreeNode);
      if (this._hasSideEffects(n.children[2] as TreeNode)) {
        const tmp = this._freshTemp("gs_idx");
        this._hoistQueue.push(`  let ${tmp} = ${idx.code};`);
        return `${base}[${tmp}]`;
      }
      return `${base}[${idx.code}]`;
    }
    if (n instanceof ASTNode.PostfixExpression && n.children.length === 3 && n.children[2] instanceof BaseToken) {
      const base = this._emitLValue(n.children[0] as TreeNode);
      const prop = n.children[2];
      // Also register interface references on write (e.g., `o.uv = ...`)
      const directRoot = ParserUtils.unwrapBareIdentifier(n.children[0] as ASTNode.PostfixExpression, {
        allowParens: true
      });
      let role: ShaderStructRole | undefined;
      if (directRoot) {
        const syms = directRoot.resolvedValueSymbols();
        role = syms.length ? this.context.getStructVarRole(syms) : undefined;
      }
      if (!directRoot) role = this.context.getStructRole(n.resolvedMemberOwners);
      if (role) {
        if (role === ShaderStructRole.Attribute) this.context.referenceAttribute(prop);
        else if (role === ShaderStructRole.Varying) this.context.referenceVarying(prop);
        else this.context.referenceMRTProp(prop);
      }
      const objType = this._inferType(n.children[0] as TreeNode);
      if (vectorSize(objType) > 0 && isValidSwizzle(prop.lexeme)) {
        return `${base}.${normalizeSwizzle(prop.lexeme)}`;
      }
      return `${base}.${this._safeFieldName(prop.lexeme)}`;
    }
    return this._emitNode(n).code;
  }

  // ---------------------------------------------------------------------------
  // Function Calls, Constructors & Builtins
  // ---------------------------------------------------------------------------

  private _emitCallGeneric(node: ASTNode.FunctionCallGeneric, isStatement: boolean): EmittedExpr {
    if (node.fnSymbol instanceof FnSymbol) {
      const syms = node.fnSymbols?.length ? node.fnSymbols : [node.fnSymbol];
      for (const s of syms) this.referenceFunction(s, node.location.start.index, node._branch);
    }

    const fnIdent = node.children[0] as ASTNode.FunctionIdentifier;
    const typeSpec = fnIdent.children[0] as ASTNode.TypeSpecifier;
    const callee = fnIdent.lexeme;
    const argNodes: TreeNode[] = [];
    if (node.children.length === 4 && node.children[2] instanceof ASTNode.FunctionCallParameterList) {
      for (const p of node.children[2].paramNodes) {
        if (p instanceof TreeNode) argNodes.push(p);
      }
    }

    // 1. Array constructor: `vec2[3](...)` / `float[](...)`
    if (typeSpec.arraySpecifier) {
      const count = this._arrayExtentString(typeSpec.arraySpecifier) || String(argNodes.length);
      const elemType: WGSLTypeDesc = { base: callee };
      const arrType: WGSLTypeDesc = { base: callee, arraySize: count };
      const args = argNodes.map((a) => this._coerceExpr(this._emitNode(a), elemType));
      return { code: `${this._wgslType(arrType)}(${args.join(", ")})`, type: arrType };
    }

    // 2. Texture builtins
    if (TEXTURE_BUILTINS.has(callee)) {
      return this._emitTextureBuiltin(callee, argNodes);
    }

    // 2b. Compute barriers, storage textures, and atomics
    if (BARRIER_BUILTINS.has(callee)) {
      return this._emitBarrierBuiltin(callee);
    }
    if (IMAGE_BUILTINS.has(callee)) {
      return this._emitImageBuiltin(callee, argNodes);
    }
    if (ATOMIC_BUILTINS.has(callee)) {
      return this._emitAtomicBuiltin(callee, argNodes);
    }

    // 3. Struct constructor
    const structAst = this._structDeclMap.get(callee);
    if (structAst && !(node.fnSymbol instanceof FnSymbol)) {
      this.context.referenceGlobal(callee, ESymbolType.STRUCT);
      const nonSamplerProps = structAst.propList.filter(
        (p) => !isSamplerType(this._typeFromSymbolType(p.typeInfo).base)
      );
      const args = argNodes.map((a, i) => {
        const ft = nonSamplerProps[i] ? this._typeFromSymbolType(nonSamplerProps[i].typeInfo) : WT_UNKNOWN;
        return this._coerceExpr(this._emitNode(a), ft);
      });
      return { code: `${this._structNameMap.get(callee) ?? callee}(${args.join(", ")})`, type: { base: callee } };
    }

    // 4. Scalar / Vector / Matrix constructors
    if (/^(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?)$/.test(callee)) {
      return this._emitTypeConstructor(callee, argNodes);
    }

    // 5. User-defined function
    const overloads = this._fnInfoByName.get(callee);
    if (overloads?.length) {
      return this._emitUserFunctionCall(node, overloads, argNodes, isStatement);
    }

    // 6. Standard GLSL builtin
    return this._emitStandardBuiltin(callee, argNodes);
  }

  private _emitTypeConstructor(target: string, argNodes: TreeNode[]): EmittedExpr {
    const targetType: WGSLTypeDesc = { base: target };
    const args = argNodes.map((a) => this._emitNode(a));

    if (isScalarType(targetType)) {
      const wScalar = glslBaseToWGSL(target);
      if (!args.length) return { code: `${wScalar}(0)`, type: targetType };
      const a0 = args[0];
      if (vectorSize(a0.type) > 0) return { code: `${wScalar}((${a0.code}).x)`, type: targetType };
      if (matrixDims(a0.type)) return { code: `${wScalar}((${a0.code})[0][0])`, type: targetType };
      return { code: `${wScalar}(${a0.code})`, type: targetType };
    }

    const targetVecN = vectorSize(targetType);
    if (targetVecN > 0) {
      const wVec = glslBaseToWGSL(target);
      const targetFam = scalarFamily(targetType)!;
      const wScalar = glslBaseToWGSL(targetFam);
      if (!args.length) return { code: `${wVec}()`, type: targetType };
      if (args.length === 1) {
        const a0 = args[0];
        const srcN = vectorSize(a0.type);
        if (srcN > targetVecN) {
          return { code: `${wVec}((${a0.code}).${"xyzw".slice(0, targetVecN)})`, type: targetType };
        }
        if (srcN === targetVecN) {
          return scalarFamily(a0.type) === targetFam
            ? { code: a0.code, type: targetType }
            : { code: `${wVec}(${a0.code})`, type: targetType };
        }
        if (isScalarType(a0.type)) {
          return {
            code: `${wVec}(${scalarFamily(a0.type) === targetFam ? a0.code : `${wScalar}(${a0.code})`})`,
            type: targetType
          };
        }
        if (a0.type.base === "unknown") {
          return { code: `${wVec}(${a0.code})`, type: targetType };
        }
      }
      const converted = args.map((a) => {
        const af = scalarFamily(a.type);
        if (af && af !== targetFam) {
          const an = vectorSize(a.type);
          return an > 0 ? `vec${an}<${wScalar}>(${a.code})` : `${wScalar}(${a.code})`;
        }
        return a.code;
      });
      return { code: `${wVec}(${converted.join(", ")})`, type: targetType };
    }

    const dims = matrixDims(targetType)!;
    const wMat = glslBaseToWGSL(target);
    if (!args.length) return { code: `${wMat}()`, type: targetType };
    if (args.length === 1) {
      const a0 = args[0];
      const srcMat = matrixDims(a0.type);
      if (srcMat) {
        if (srcMat.cols === dims.cols && srcMat.rows === dims.rows) return { code: a0.code, type: targetType };
        return {
          code: `${this._ensureMatFromMatHelper(dims.cols, dims.rows, srcMat.cols, srcMat.rows)}(${a0.code})`,
          type: targetType
        };
      }
      const trimmed = a0.code.trim();
      if (/^(?:0(?:\.0+)?f?|f32\(0(?:\.0+)?f?\))$/.test(trimmed)) {
        return { code: `${wMat}()`, type: targetType };
      }
      if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?f?$/.test(trimmed)) {
        const sLit = trimmed.endsWith("f") || trimmed.includes(".") || /[eE]/.test(trimmed) ? trimmed : `${trimmed}.0`;
        const colExprs = Array.from({ length: dims.cols }, (_, c) => {
          const elems = Array.from({ length: dims.rows }, (_, r) => (c === r ? sLit : "0.0")).join(", ");
          return `vec${dims.rows}<f32>(${elems})`;
        }).join(", ");
        return { code: `${wMat}(${colExprs})`, type: targetType };
      }
      return { code: `${this._ensureMatDiagHelper(dims.cols, dims.rows)}(f32(${a0.code}))`, type: targetType };
    }

    const allColVecs = args.length === dims.cols && args.every((a) => vectorSize(a.type) === dims.rows);
    const allScalars = args.length === dims.cols * dims.rows && args.every((a) => isScalarType(a.type));
    if (allColVecs || allScalars) {
      return { code: `${wMat}(${args.map((a) => a.code).join(", ")})`, type: targetType };
    }
    const lanes: string[] = [];
    for (const a of args) {
      const n = vectorSize(a.type);
      if (n > 0) {
        const tmp = this._freshTemp("gs_mc");
        this._hoistQueue.push(`  let ${tmp} = ${a.code};`);
        for (let k = 0; k < n; k++) lanes.push(`f32(${tmp}.${"xyzw"[k]})`);
      } else {
        lanes.push(`f32(${a.code})`);
      }
    }
    return { code: `${wMat}(${lanes.slice(0, dims.cols * dims.rows).join(", ")})`, type: targetType };
  }

  private _emitUserFunctionCall(
    node: ASTNode.FunctionCallGeneric | undefined,
    overloads: WGSLFnInfo[],
    argNodes: TreeNode[],
    isStatement: boolean,
    calleeOverride?: string
  ): EmittedExpr {
    let sig: WGSLFnInfo | undefined;
    if (overloads.length > 1) {
      const argTypes = argNodes.map((a) => this._inferType(a));
      sig =
        overloads.find(
          (o) =>
            o.params.length === argNodes.length && o.params.every((p, i) => typeKey(p.type) === typeKey(argTypes[i]))
        ) ??
        overloads.find(
          (o) =>
            o.params.length === argNodes.length &&
            o.params.every((p, i) => argTypes[i].base === "unknown" || typeKey(p.type) === typeKey(argTypes[i]))
        );
    }
    if (!sig && node?.fnSymbol instanceof FnSymbol) {
      sig = this._fnInfoByAst.get(node.fnSymbol.astNode);
    }
    if (!sig) {
      sig = overloads.find((o) => o.params.length === argNodes.length) ?? overloads[0];
    }

    const emittedCallee = calleeOverride ?? sig.wgslName;
    const emitMacroCallArgNode = (n: TreeNode | BaseToken, paramCursor: { idx: number }): string => {
      if (n instanceof BaseToken) return n.lexeme;
      if (
        n instanceof ASTNode.MacroPushContext ||
        n instanceof ASTNode.MacroPopContext ||
        n instanceof ASTNode.MacroElifExpression ||
        n instanceof ASTNode.MacroElseExpression
      ) {
        return n.codeGen(this);
      }
      if (n instanceof ASTNode.AssignmentExpression) {
        const p = sig!.params[paramCursor.idx++];
        if (p && p.direction !== "in") {
          const target = this._emitLValue(this._unwrapSingle(n));
          return `&${target}`;
        }
        const a = this._emitNode(n);
        if (p?.isSampler && a.samplerPair) return `${a.samplerPair.tex}, ${a.samplerPair.samp}`;
        return this._coerceExpr(a, p?.type);
      }
      return n.children.map((ch) => emitMacroCallArgNode(ch, paramCursor)).join(" ");
    };
    const joinCallArgs = (segs: Array<{ text: string; raw?: boolean }>): string => {
      let out = "";
      for (let k = 0; k < segs.length; k++) {
        if (k > 0 && !segs[k].raw) out += ", ";
        else if (k > 0 && segs[k].raw) out += "\n";
        out += segs[k].text;
      }
      return out;
    };

    const hasOutParams = sig.params.some((p) => p.direction !== "in");
    if (!hasOutParams) {
      const callArgSegs: Array<{ text: string; raw?: boolean }> = [];
      const cursor = { idx: 0 };
      for (let i = 0; i < argNodes.length; i++) {
        if (argNodes[i] instanceof ASTNode.MacroCallArgBlock) {
          callArgSegs.push({ text: emitMacroCallArgNode(argNodes[i], cursor), raw: true });
          continue;
        }
        const p = sig.params[cursor.idx++];
        const a = this._emitNode(argNodes[i]);
        if (p?.isSampler && a.samplerPair) {
          callArgSegs.push({ text: a.samplerPair.tex }, { text: a.samplerPair.samp });
        } else {
          callArgSegs.push({ text: this._coerceExpr(a, p?.type) });
        }
      }
      return { code: `${emittedCallee}(${joinCallArgs(callArgSegs)})`, type: sig.returnType };
    }

    // Copy-in / copy-out lowering for `out`/`inout`
    const callArgSegs: Array<{ text: string; raw?: boolean }> = [];
    const writebacks: string[] = [];
    const cursor = { idx: 0 };
    for (let i = 0; i < argNodes.length; i++) {
      if (argNodes[i] instanceof ASTNode.MacroCallArgBlock) {
        callArgSegs.push({ text: emitMacroCallArgNode(argNodes[i], cursor), raw: true });
        continue;
      }
      const p = sig.params[cursor.idx++];
      const argNode = this._unwrapSingle(argNodes[i]);
      if (!p || p.direction === "in") {
        const a = this._emitNode(argNode);
        if (p?.isSampler && a.samplerPair) callArgSegs.push({ text: a.samplerPair.tex }, { text: a.samplerPair.samp });
        else callArgSegs.push({ text: this._coerceExpr(a, p?.type) });
        continue;
      }

      const tmp = this._freshTemp("gs_oa");
      const wType = this._wgslType(p.type);
      if (
        argNode instanceof ASTNode.PostfixExpression &&
        argNode.children.length === 3 &&
        argNode.children[2] instanceof BaseToken &&
        isValidSwizzle(argNode.children[2].lexeme) &&
        argNode.children[2].lexeme.length >= 2 &&
        vectorSize(this._inferType(argNode.children[0] as TreeNode)) > 0
      ) {
        const base = this._emitLValue(argNode.children[0] as TreeNode);
        const swiz = normalizeSwizzle(argNode.children[2].lexeme);
        this._hoistQueue.push(
          p.direction === "inout" ? `  var ${tmp}: ${wType} = ${base}.${swiz};` : `  var ${tmp}: ${wType};`
        );
        callArgSegs.push({ text: `&${tmp}` });
        for (let k = 0; k < swiz.length; k++) {
          writebacks.push(`  ${base}.${swiz[k]} = ${tmp}.${"xyzw"[k]};`);
        }
      } else {
        const target = this._emitLValue(argNode);
        this._hoistQueue.push(
          p.direction === "inout" ? `  var ${tmp}: ${wType} = ${target};` : `  var ${tmp}: ${wType};`
        );
        callArgSegs.push({ text: `&${tmp}` });
        writebacks.push(`  ${target} = ${tmp};`);
      }
    }

    const callCode = `${emittedCallee}(${joinCallArgs(callArgSegs)})`;
    if (isStatement || sig.returnType.base === "void") {
      this._hoistQueue.push(`  ${callCode};`);
      for (const wb of writebacks) this._hoistQueue.push(wb);
      return { code: "", type: WT_VOID };
    }
    const retTmp = this._freshTemp("gs_or");
    this._hoistQueue.push(`  let ${retTmp} = ${callCode};`);
    for (const wb of writebacks) this._hoistQueue.push(wb);
    return { code: retTmp, type: sig.returnType };
  }

  private _emitStandardBuiltin(name: string, argNodes: TreeNode[]): EmittedExpr {
    const args = argNodes.map((a) => this._emitNode(a));
    const retType = inferBuiltinReturnType(
      name,
      args.map((a) => a.type)
    );

    switch (name) {
      case "inversesqrt":
        return { code: `inverseSqrt(${args[0].code})`, type: retType };
      case "atan":
        return args.length === 2
          ? { code: `atan2(${args[0].code}, ${args[1].code})`, type: retType }
          : { code: `atan(${args[0].code})`, type: retType };
      case "dFdx":
        return { code: `dpdx(${args[0].code})`, type: retType };
      case "dFdy":
        // WebGPU framebuffer Y points downward vs GLSL upward — negate dFdy to preserve GLSL derivative orientation
        return { code: `(-dpdy(${args[0].code}))`, type: retType };
      case "fwidth":
        return { code: `fwidth(${args[0].code})`, type: retType };
      case "roundEven":
        return { code: `round(${args[0].code})`, type: retType };
      case "faceforward":
        return { code: `faceForward(${args.map((a) => a.code).join(", ")})`, type: retType };
      case "mod": {
        const x = args[0];
        const yArg = args[1];
        const modType = x.type.base !== "unknown" ? x.type : yArg.type.base !== "unknown" ? yArg.type : WT_FLOAT;
        const xCode =
          vectorSize(modType) > 0 && x.type.base === "unknown"
            ? `${glslBaseToWGSL(modType.base)}(${x.code})`
            : this._broadcastToMatch(x, modType);
        const yCode =
          vectorSize(modType) > 0 && yArg.type.base === "unknown"
            ? `${glslBaseToWGSL(modType.base)}(${yArg.code})`
            : this._broadcastToMatch(yArg, modType);
        return { code: `${this._ensureModHelper(modType)}(${xCode}, ${yCode})`, type: modType };
      }
      case "min":
      case "max": {
        const target = vectorSize(args[0].type) >= vectorSize(args[1].type) ? args[0].type : args[1].type;
        return {
          code: `${name}(${this._broadcastToMatch(args[0], target)}, ${this._broadcastToMatch(args[1], target)})`,
          type: target
        };
      }
      case "clamp": {
        const target = args[0].type;
        return {
          code: `clamp(${args[0].code}, ${this._broadcastToMatch(args[1], target)}, ${this._broadcastToMatch(args[2], target)})`,
          type: target
        };
      }
      case "step": {
        const target = args[1].type;
        return { code: `step(${this._broadcastToMatch(args[0], target)}, ${args[1].code})`, type: target };
      }
      case "smoothstep": {
        const target = args[2].type;
        return {
          code: `smoothstep(${this._broadcastToMatch(args[0], target)}, ${this._broadcastToMatch(args[1], target)}, ${args[2].code})`,
          type: target
        };
      }
      case "pow": {
        const target = args[0].type;
        return { code: `pow(${args[0].code}, ${this._broadcastToMatch(args[1], target)})`, type: target };
      }
      case "mix":
        if (scalarFamily(args[2].type) === "bool") {
          return { code: `select(${args[0].code}, ${args[1].code}, ${args[2].code})`, type: args[0].type };
        }
        return { code: `mix(${args[0].code}, ${args[1].code}, ${args[2].code})`, type: args[0].type };
      case "lessThan":
        return { code: `((${args[0].code}) < (${args[1].code}))`, type: retType };
      case "lessThanEqual":
        return { code: `((${args[0].code}) <= (${args[1].code}))`, type: retType };
      case "greaterThan":
        return { code: `((${args[0].code}) > (${args[1].code}))`, type: retType };
      case "greaterThanEqual":
        return { code: `((${args[0].code}) >= (${args[1].code}))`, type: retType };
      case "equal":
        return { code: `((${args[0].code}) == (${args[1].code}))`, type: retType };
      case "notEqual":
        return { code: `((${args[0].code}) != (${args[1].code}))`, type: retType };
      case "not":
        return { code: `(!(${args[0].code}))`, type: retType };
      case "isnan":
        return { code: `((${args[0].code}) != (${args[0].code}))`, type: retType };
      case "isinf": {
        const a0 = args[0];
        const infBound =
          vectorSize(a0.type) > 0 ? `vec${vectorSize(a0.type)}<f32>(0x1.fffffep+127f)` : `0x1.fffffep+127f`;
        return { code: `(abs(${a0.code}) > ${infBound})`, type: retType };
      }
      case "floatBitsToUint":
      case "floatBitsToInt":
      case "uintBitsToFloat":
      case "intBitsToFloat":
        return { code: `bitcast<${glslBaseToWGSL(retType.base)}>(${args[0].code})`, type: retType };
      case "packSnorm2x16":
        return { code: `pack2x16snorm(${args[0].code})`, type: WT_UINT };
      case "unpackSnorm2x16":
        return { code: `unpack2x16snorm(${args[0].code})`, type: WT_VEC2 };
      case "packUnorm2x16":
        return { code: `pack2x16unorm(${args[0].code})`, type: WT_UINT };
      case "unpackUnorm2x16":
        return { code: `unpack2x16unorm(${args[0].code})`, type: WT_VEC2 };
      case "packHalf2x16":
        return { code: `pack2x16float(${args[0].code})`, type: WT_UINT };
      case "unpackHalf2x16":
        return { code: `unpack2x16float(${args[0].code})`, type: WT_VEC2 };
      case "inverse": {
        const n = (matrixDims(args[0].type)?.cols ?? 4) as 2 | 3 | 4;
        return { code: `${this._ensureInverseHelper(n)}(${args[0].code})`, type: args[0].type };
      }
      case "matrixCompMult": {
        const dims = matrixDims(args[0].type)!;
        return {
          code: `${this._ensureMatrixCompMultHelper(dims.cols, dims.rows)}(${args[0].code}, ${args[1].code})`,
          type: args[0].type
        };
      }
      case "outerProduct": {
        const r = vectorSize(args[0].type);
        const c = vectorSize(args[1].type);
        return {
          code: `${this._ensureOuterProductHelper(r, c)}(${args[0].code}, ${args[1].code})`,
          type: makeMatrixType(c, r)
        };
      }
      default:
        return { code: `${name}(${args.map((a) => a.code).join(", ")})`, type: retType };
    }
  }

  private _emitTextureBuiltin(fn: string, argNodes: TreeNode[]): EmittedExpr {
    const sArg = this._emitNode(argNodes[0]);
    const samplerType = sArg.samplerPair?.samplerType ?? sArg.type.base;
    const texCode = sArg.samplerPair?.tex ?? sArg.code;
    const sampCode = sArg.samplerPair?.samp ?? sArg.code;
    const isShadow = samplerType.endsWith("Shadow");
    const isArray = samplerType.includes("Array");
    const isCube = samplerType.includes("Cube");
    const is3D = samplerType.includes("3D");
    const isInt = samplerType.startsWith("i");
    const isUint = samplerType.startsWith("u");
    const isVertex = this.context.stage === EShaderStage.VERTEX || this.context.stage === EShaderStage.COMPUTE;
    const sampleRet: WGSLTypeDesc = isShadow
      ? WT_FLOAT
      : isInt
        ? { base: "ivec4" }
        : isUint
          ? { base: "uvec4" }
          : WT_VEC4;
    const rest = argNodes.slice(1).map((a) => this._emitNode(a));

    if (fn === "textureSize") {
      const lod = rest[0] ? `, ${rest[0].code}` : "";
      if (is3D) return { code: `vec3<i32>(textureDimensions(${texCode}${lod}))`, type: { base: "ivec3" } };
      if (isArray) {
        return {
          code: `vec3<i32>(vec2<i32>(textureDimensions(${texCode}${lod})), i32(textureNumLayers(${texCode})))`,
          type: { base: "ivec3" }
        };
      }
      return { code: `vec2<i32>(textureDimensions(${texCode}${lod}))`, type: { base: "ivec2" } };
    }

    if (fn === "texelFetch" || fn === "texelFetchOffset") {
      const coord = rest[0].code;
      const lod = rest[1].code;
      const offset = rest[2]?.code;
      if (isArray) {
        const tmp = this._freshTemp("gs_tc");
        this._hoistQueue.push(`  let ${tmp} = ${coord};`);
        const xy = offset ? `(${tmp}.xy + ${offset})` : `${tmp}.xy`;
        return { code: `textureLoad(${texCode}, ${xy}, ${tmp}.z, ${lod})`, type: sampleRet };
      }
      const p = offset ? `(${coord} + ${offset})` : coord;
      return { code: `textureLoad(${texCode}, ${p}, ${lod})`, type: sampleRet };
    }

    const splitCoord = (coord: EmittedExpr): { uv: string; extra?: string } => {
      if (isShadow && isCube) {
        const tmp = this._freshTemp("gs_sc");
        this._hoistQueue.push(`  let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xyz`, extra: `${tmp}.w` };
      }
      if (isShadow && !isArray) {
        const tmp = this._freshTemp("gs_sc");
        this._hoistQueue.push(`  let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xy`, extra: `${tmp}.z` };
      }
      if (isArray && isShadow) {
        const tmp = this._freshTemp("gs_sc");
        this._hoistQueue.push(`  let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xy`, extra: `i32(round(${tmp}.z)), ${tmp}.w` };
      }
      if (isArray) {
        const tmp = this._freshTemp("gs_tc");
        this._hoistQueue.push(`  let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xy`, extra: `i32(round(${tmp}.z))` };
      }
      return { uv: coord.code };
    };

    if (fn.includes("Proj")) {
      const p = rest[0];
      const tmp = this._freshTemp("gs_tp");
      this._hoistQueue.push(`  let ${tmp} = ${p.code};`);
      const denom = vectorSize(p.type) === 3 ? `${tmp}.z` : `${tmp}.w`;
      const uv = is3D ? `(${tmp}.xyz / ${denom})` : `(${tmp}.xy / ${denom})`;
      const cmp = isShadow ? `, (${tmp}.z / ${tmp}.w)` : "";
      const hasLod = fn.includes("Lod");
      const hasGrad = fn.includes("Grad");
      const hasOffset = fn.includes("Offset");
      if (isShadow) {
        const offIdx = hasGrad ? 3 : hasLod ? 2 : 1;
        const off = hasOffset && rest[offIdx] ? `, ${rest[offIdx].code}` : "";
        const wgslFn = hasLod || isVertex ? "textureSampleCompareLevel" : "textureSampleCompare";
        return { code: `${wgslFn}(${texCode}, ${sampCode}, ${uv}${cmp}${off})`, type: WT_FLOAT };
      }
      if (hasLod) {
        const off = hasOffset ? `, ${rest[2].code}` : "";
        return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${uv}, ${rest[1].code}${off})`, type: sampleRet };
      }
      if (hasGrad) {
        const off = hasOffset ? `, ${rest[3].code}` : "";
        return {
          code: `textureSampleGrad(${texCode}, ${sampCode}, ${uv}, ${rest[1].code}, ${rest[2].code}${off})`,
          type: sampleRet
        };
      }
      const off = hasOffset ? `, ${rest[1].code}` : "";
      const bias = rest[hasOffset ? 2 : 1];
      if (bias)
        return { code: `textureSampleBias(${texCode}, ${sampCode}, ${uv}, ${bias.code}${off})`, type: sampleRet };
      if (isVertex) return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${uv}, 0.0${off})`, type: sampleRet };
      return { code: `textureSample(${texCode}, ${sampCode}, ${uv}${off})`, type: sampleRet };
    }

    if (fn.includes("Lod")) {
      const { uv, extra } = splitCoord(rest[0]);
      const off = fn.endsWith("Offset") ? `, ${rest[2].code}` : "";
      if (isShadow) {
        return { code: `textureSampleCompareLevel(${texCode}, ${sampCode}, ${uv}, ${extra}${off})`, type: WT_FLOAT };
      }
      const mid = extra ? `${uv}, ${extra}` : uv;
      return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${mid}, ${rest[1].code}${off})`, type: sampleRet };
    }

    if (fn.includes("Grad")) {
      const { uv, extra } = splitCoord(rest[0]);
      const off = fn.endsWith("Offset") ? `, ${rest[3].code}` : "";
      if (isShadow) {
        const wgslFn = isVertex ? "textureSampleCompareLevel" : "textureSampleCompare";
        return { code: `${wgslFn}(${texCode}, ${sampCode}, ${uv}, ${extra}${off})`, type: WT_FLOAT };
      }
      const mid = extra ? `${uv}, ${extra}` : uv;
      return {
        code: `textureSampleGrad(${texCode}, ${sampCode}, ${mid}, ${rest[1].code}, ${rest[2].code}${off})`,
        type: sampleRet
      };
    }

    const { uv, extra } = splitCoord(rest[0]);
    const isOffset = fn === "textureOffset";
    const off = isOffset ? `, ${rest[1].code}` : "";
    const bias = rest[isOffset ? 2 : 1];
    if (isShadow) {
      const wgslFn = isVertex ? "textureSampleCompareLevel" : "textureSampleCompare";
      return { code: `${wgslFn}(${texCode}, ${sampCode}, ${uv}, ${extra}${off})`, type: WT_FLOAT };
    }
    const mid = extra ? `${uv}, ${extra}` : uv;
    if (bias)
      return { code: `textureSampleBias(${texCode}, ${sampCode}, ${mid}, ${bias.code}${off})`, type: sampleRet };
    if (isVertex) return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${mid}, 0.0${off})`, type: sampleRet };
    return { code: `textureSample(${texCode}, ${sampCode}, ${mid}${off})`, type: sampleRet };
  }

  private _emitBarrierBuiltin(callee: string): EmittedExpr {
    switch (callee) {
      case "storageBarrier":
      case "memoryBarrierBuffer":
      case "memoryBarrier":
        return { code: "storageBarrier()", type: WT_VOID };
      case "textureBarrier":
      case "memoryBarrierImage":
        return { code: "textureBarrier()", type: WT_VOID };
      default:
        return { code: "workgroupBarrier()", type: WT_VOID };
    }
  }

  private _emitImageBuiltin(callee: string, argNodes: TreeNode[]): EmittedExpr {
    const img = this._emitNode(argNodes[0]);
    if (callee === "imageSize") {
      return { code: `vec2<i32>(textureDimensions(${img.code}))`, type: WT_IVEC2 };
    }
    const coord = this._emitNode(argNodes[1]);
    if (callee === "imageStore") {
      const val = this._emitNode(argNodes[2]);
      return { code: `textureStore(${img.code}, ${coord.code}, ${val.code})`, type: WT_VOID };
    }
    const retType: WGSLTypeDesc =
      img.type.base === "iimage2D" ? { base: "ivec4" } : img.type.base === "uimage2D" ? { base: "uvec4" } : WT_VEC4;
    return { code: `textureLoad(${img.code}, ${coord.code})`, type: retType };
  }

  private _emitAtomicBuiltin(callee: string, argNodes: TreeNode[]): EmittedExpr {
    const targetNode = argNodes[0];
    const ptr = `&${this._emitLValue(targetNode)}`;
    const targetType = this._inferType(targetNode);
    const scalarType = targetType.base === "atomic_int" || targetType.base === "int" ? WT_INT : WT_UINT;
    if (callee === "atomicLoad") {
      return { code: `atomicLoad(${ptr})`, type: scalarType };
    }
    if (callee === "atomicStore") {
      const val = this._emitNode(argNodes[1]);
      return { code: `atomicStore(${ptr}, ${this._coerceExpr(val, scalarType)})`, type: WT_VOID };
    }
    if (callee === "atomicCompSwap") {
      const cmp = this._emitNode(argNodes[1]);
      const val = this._emitNode(argNodes[2]);
      return {
        code: `atomicCompareExchangeWeak(${ptr}, ${this._coerceExpr(cmp, scalarType)}, ${this._coerceExpr(val, scalarType)}).old_value`,
        type: scalarType
      };
    }
    if (callee === "atomicCompareExchangeWeak") {
      const cmp = this._emitNode(argNodes[1]);
      const val = this._emitNode(argNodes[2]);
      return {
        code: `atomicCompareExchangeWeak(${ptr}, ${this._coerceExpr(cmp, scalarType)}, ${this._coerceExpr(val, scalarType)})`,
        type: WT_UNKNOWN
      };
    }
    const val = this._emitNode(argNodes[1]);
    return { code: `${callee}(${ptr}, ${this._coerceExpr(val, scalarType)})`, type: scalarType };
  }

  // ---------------------------------------------------------------------------
  // Initializer, Coercion, Type Inference & Helpers
  // ---------------------------------------------------------------------------

  private _emitInitializer(init: ASTNode.Initializer, targetType: WGSLTypeDesc): string {
    if (init.children.length === 3 && init.children[1] instanceof ASTNode.InitializerList) {
      const elems: ASTNode.Initializer[] = [];
      const collect = (list: ASTNode.InitializerList) => {
        if (list.children.length === 1) elems.push(list.children[0] as ASTNode.Initializer);
        else {
          collect(list.children[0] as ASTNode.InitializerList);
          elems.push(list.children[2] as ASTNode.Initializer);
        }
      };
      collect(init.children[1]);
      if (targetType.arraySize !== undefined) {
        const elemType: WGSLTypeDesc = { base: targetType.base };
        return `${this._wgslType(targetType)}(${elems.map((e) => this._emitInitializer(e, elemType)).join(", ")})`;
      }
      const sAst = this._structDeclMap.get(targetType.base);
      if (sAst) {
        const fields = sAst.propList.filter((p) => !isSamplerType(this._typeFromSymbolType(p.typeInfo).base));
        return `${this._structNameMap.get(targetType.base) ?? targetType.base}(${elems
          .map((e, i) =>
            this._emitInitializer(e, fields[i] ? this._typeFromSymbolType(fields[i].typeInfo) : WT_UNKNOWN)
          )
          .join(", ")})`;
      }
      const m = matrixDims(targetType);
      if (m) {
        const colType = makeVectorType("float", m.rows);
        return `${this._wgslType(targetType)}(${elems.map((e) => this._emitInitializer(e, colType)).join(", ")})`;
      }
      const vn = vectorSize(targetType);
      if (vn > 0) {
        const elemType: WGSLTypeDesc = { base: scalarFamily(targetType) ?? "float" };
        return `${this._wgslType(targetType)}(${elems.map((e) => this._emitInitializer(e, elemType)).join(", ")})`;
      }
    }
    const res = this._emitNode(init.children[0] as TreeNode);
    return this._coerceExpr(res, targetType);
  }

  private _broadcastToMatch(expr: EmittedExpr, target: WGSLTypeDesc): string {
    const tn = vectorSize(target);
    if (tn > 0 && isScalarType(expr.type)) {
      const fam = scalarFamily(target) ?? "float";
      return `vec${tn}<${glslBaseToWGSL(fam)}>(${expr.code})`;
    }
    return expr.code;
  }

  private _coerceExpr(expr: EmittedExpr, expected?: WGSLTypeDesc): string {
    if (!expected || expected.base === "unknown" || expected.base === "void") return expr.code;
    if (typeKey(expr.type) === typeKey(expected)) return expr.code;
    if (isScalarType(expected) && isScalarType(expr.type) && expr.type.base !== expected.base) {
      return `${glslBaseToWGSL(expected.base)}(${expr.code})`;
    }
    return expr.code;
  }

  private _coerceShiftRhs(right: EmittedExpr, leftType: WGSLTypeDesc, rightNode?: TreeNode): string {
    const ln = vectorSize(leftType);
    const rn = vectorSize(right.type);
    if (ln > 0) {
      if (rn === ln && right.type.base.startsWith("uvec")) return right.code;
      return `vec${ln}<u32>(${right.code})`;
    }
    if (rightNode) {
      const u = this._unwrapSingle(rightNode);
      if (u instanceof ASTNode.PrimaryExpression && u.children.length === 1 && u.children[0] instanceof BaseToken) {
        if (u.children[0].type === ETokenType.INT_CONSTANT) return right.code;
      }
    }
    if (right.type.base === "uint") return right.code;
    return `u32(${right.code})`;
  }

  private _incStep(t: WGSLTypeDesc): string {
    return t.base === "float" ? "1.0" : t.base === "uint" ? "1u" : "1";
  }

  private _zeroLiteral(t: WGSLTypeDesc): string {
    return t.base === "float" ? "0.0" : t.base === "uint" ? "0u" : "0";
  }

  private _inferType(node: TreeNode): WGSLTypeDesc {
    const n = this._unwrapSingle(node);
    if (n instanceof ASTNode.VariableIdentifier) {
      const sym = n.resolvedValueSymbols()[0];
      if (sym instanceof VarSymbol) return this._typeFromSymbolType(sym.dataType);
      const b = galaceanTypeToBase(n.typeInfo);
      if (b !== "unknown") return { base: b };
      if (
        n.builtinSemantic === ShaderBuiltinSemantic.VertexPosition ||
        n.builtinSemantic === ShaderBuiltinSemantic.FragCoord ||
        n.builtinSemantic === ShaderBuiltinSemantic.FragmentOutput0
      )
        return WT_VEC4;
      if (n.builtinSemantic === ShaderBuiltinSemantic.PointCoord) return WT_VEC2;
      if (n.builtinSemantic === ShaderBuiltinSemantic.FrontFacing) return WT_BOOL;
      if (
        n.builtinSemantic === ShaderBuiltinSemantic.PointSize ||
        n.builtinSemantic === ShaderBuiltinSemantic.FragmentDepth
      )
        return WT_FLOAT;
      if (
        n.builtinSemantic === ShaderBuiltinSemantic.VertexID ||
        n.builtinSemantic === ShaderBuiltinSemantic.InstanceID ||
        n.builtinSemantic === ShaderBuiltinSemantic.BuiltinLimit
      )
        return WT_INT;
      if (
        n.builtinSemantic === ShaderBuiltinSemantic.GlobalInvocationID ||
        n.builtinSemantic === ShaderBuiltinSemantic.LocalInvocationID ||
        n.builtinSemantic === ShaderBuiltinSemantic.WorkGroupID ||
        n.builtinSemantic === ShaderBuiltinSemantic.NumWorkGroups
      )
        return WT_UVEC3;
      if (n.builtinSemantic === ShaderBuiltinSemantic.LocalInvocationIndex) return WT_UINT;
      return WT_UNKNOWN;
    }
    if (n instanceof ASTNode.PostfixExpression) {
      if (n.children.length === 3 && n.children[2] instanceof BaseToken) {
        const ot = this._inferType(n.children[0] as TreeNode);
        const sAst = this._structDeclMap.get(ot.base);
        if (sAst && ot.arraySize === undefined) {
          const found = sAst.propList.find((p) => p.ident.lexeme === (n.children[2] as BaseToken).lexeme);
          if (found) return this._typeFromSymbolType(found.typeInfo);
        }
        if (vectorSize(ot) > 0 && isValidSwizzle(n.children[2].lexeme)) {
          return makeVectorType(scalarFamily(ot) ?? "float", n.children[2].lexeme.length);
        }
      }
      if (n.children.length === 4) {
        const ot = this._inferType(n.children[0] as TreeNode);
        if (ot.arraySize !== undefined) return { base: ot.base };
        const m = matrixDims(ot);
        if (m) return makeVectorType("float", m.rows);
        if (vectorSize(ot) > 0) return { base: scalarFamily(ot) ?? "float" };
      }
    }
    if (n instanceof ASTNode.FunctionCallGeneric) {
      const fnIdent = n.children[0] as ASTNode.FunctionIdentifier;
      const typeSpec = fnIdent.children[0] as ASTNode.TypeSpecifier;
      if (typeSpec.arraySpecifier) {
        return { base: fnIdent.lexeme, arraySize: this._arrayExtentString(typeSpec.arraySpecifier) };
      }
      if (n.fnSymbol instanceof FnSymbol) {
        return this._fnInfoByAst.get(n.fnSymbol.astNode)?.returnType ?? { base: galaceanTypeToBase(n.type) };
      }
      const argTypes: WGSLTypeDesc[] = [];
      if (n.children.length === 4 && n.children[2] instanceof ASTNode.FunctionCallParameterList) {
        for (const p of n.children[2].paramNodes) {
          if (p instanceof TreeNode) argTypes.push(this._inferType(p));
        }
      }
      return inferBuiltinReturnType(fnIdent.lexeme, argTypes);
    }
    if (n instanceof ASTNode.ExpressionAstNode) {
      const b = galaceanTypeToBase(n.type);
      if (b !== "unknown") return { base: b };
    }
    if (n instanceof ASTNode.PrimaryExpression && n.children.length === 3) {
      return this._inferType(n.children[1] as TreeNode);
    }
    return WT_UNKNOWN;
  }

  private _hasSideEffects(node: TreeNode): boolean {
    if (node instanceof ASTNode.AssignmentExpression && node.children.length === 3) return true;
    if (node instanceof ASTNode.UnaryExpression && node.children.length === 2) {
      const op = node.children[0];
      if (op instanceof BaseToken && (op.lexeme === "++" || op.lexeme === "--")) return true;
    }
    if (node instanceof ASTNode.PostfixExpression && node.children.length === 2) return true;
    if (node instanceof ASTNode.FunctionCallGeneric) {
      const callee = (node.children[0] as ASTNode.FunctionIdentifier).lexeme;
      if (this._fnInfoByName.has(callee)) return true;
    }
    for (const c of node.children) {
      if (c instanceof TreeNode && this._hasSideEffects(c)) return true;
    }
    return false;
  }

  private _isSimpleConstExpr(node: TreeNode): boolean {
    const n = this._unwrapSingle(node);
    if (n instanceof ASTNode.PrimaryExpression) {
      if (n.children.length === 3) return this._isSimpleConstExpr(n.children[1] as TreeNode);
      const tok = n.children[0];
      if (tok instanceof BaseToken) return true;
      return tok instanceof TreeNode && this._isSimpleConstExpr(tok);
    }
    if (n instanceof ASTNode.VariableIdentifier) {
      const sym = n.resolvedValueSymbols()[0];
      return sym instanceof VarSymbol && sym.isConst;
    }
    if (n instanceof ASTNode.UnaryExpression && n.children.length === 2) {
      const op = n.children[0];
      if (op instanceof BaseToken && (op.lexeme === "++" || op.lexeme === "--")) return false;
      return this._isSimpleConstExpr(n.children[1] as TreeNode);
    }
    if (n instanceof ASTNode.FunctionCallGeneric) {
      const callee = (n.children[0] as ASTNode.FunctionIdentifier).lexeme;
      if (this._fnInfoByName.has(callee) || TEXTURE_BUILTINS.has(callee)) return false;
      if (n.children.length === 4 && n.children[2] instanceof ASTNode.FunctionCallParameterList) {
        return n.children[2].paramNodes.every((p) => p instanceof TreeNode && this._isSimpleConstExpr(p));
      }
      return true;
    }
    if (n instanceof ASTNode.Initializer && n.children.length === 3) {
      return this._isSimpleConstExpr(n.children[1] as TreeNode);
    }
    if (n instanceof ASTNode.InitializerList) {
      return n.children.every((c) => !(c instanceof TreeNode) || this._isSimpleConstExpr(c));
    }
    if (
      n.children.length === 3 &&
      n instanceof ASTNode.ExpressionAstNode &&
      !(n instanceof ASTNode.AssignmentExpression)
    ) {
      return this._isSimpleConstExpr(n.children[0] as TreeNode) && this._isSimpleConstExpr(n.children[2] as TreeNode);
    }
    return false;
  }

  // On-demand WGSL math helpers
  private _ensureMatDiagHelper(cols: number, rows: number): string {
    const key = `gs_mat${cols}x${rows}_diag`;
    if (!this._helpers.has(key)) {
      const colExprs = Array.from({ length: cols }, (_, c) => {
        const elems = Array.from({ length: rows }, (_, r) => (r === c ? "s" : "0.0")).join(", ");
        return `vec${rows}<f32>(${elems})`;
      }).join(", ");
      this._helpers.set(
        key,
        `fn ${key}(s: f32) -> mat${cols}x${rows}<f32> {\n  return mat${cols}x${rows}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private _ensureMatFromMatHelper(tc: number, tr: number, sc: number, sr: number): string {
    const key = `gs_mat${tc}x${tr}_from_${sc}x${sr}`;
    if (!this._helpers.has(key)) {
      const colExprs = Array.from({ length: tc }, (_, c) => {
        const elems = Array.from({ length: tr }, (_, r) =>
          c < sc && r < sr ? `m[${c}][${r}]` : c === r ? "1.0" : "0.0"
        ).join(", ");
        return `vec${tr}<f32>(${elems})`;
      }).join(", ");
      this._helpers.set(
        key,
        `fn ${key}(m: mat${sc}x${sr}<f32>) -> mat${tc}x${tr}<f32> {\n  return mat${tc}x${tr}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private _ensureModHelper(type: WGSLTypeDesc): string {
    const safeType = type.base === "unknown" ? WT_FLOAT : type;
    const wType = glslBaseToWGSL(safeType.base);
    const key = `gs_mod_${safeType.base}`;
    if (!this._helpers.has(key)) {
      this._helpers.set(key, `fn ${key}(x: ${wType}, y: ${wType}) -> ${wType} {\n  return x - y * floor(x / y);\n}`);
    }
    return key;
  }

  private _ensureMatrixCompMultHelper(cols: number, rows: number): string {
    const key = `gs_matCompMult_${cols}x${rows}`;
    if (!this._helpers.has(key)) {
      const colExprs = Array.from({ length: cols }, (_, c) => `a[${c}] * b[${c}]`).join(", ");
      this._helpers.set(
        key,
        `fn ${key}(a: mat${cols}x${rows}<f32>, b: mat${cols}x${rows}<f32>) -> mat${cols}x${rows}<f32> {\n  return mat${cols}x${rows}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private _ensureOuterProductHelper(rows: number, cols: number): string {
    const key = `gs_outerProduct_${cols}x${rows}`;
    if (!this._helpers.has(key)) {
      const colExprs = Array.from({ length: cols }, (_, c) => `a * b[${c}]`).join(", ");
      this._helpers.set(
        key,
        `fn ${key}(a: vec${rows}<f32>, b: vec${cols}<f32>) -> mat${cols}x${rows}<f32> {\n  return mat${cols}x${rows}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private _ensureInverseHelper(n: 2 | 3 | 4): string {
    const key = `gs_inverse_mat${n}`;
    if (this._helpers.has(key)) return key;
    if (n === 2) {
      this._helpers.set(
        key,
        `fn ${key}(m: mat2x2<f32>) -> mat2x2<f32> {\n  let d = m[0][0] * m[1][1] - m[1][0] * m[0][1];\n  return mat2x2<f32>(vec2<f32>(m[1][1], -m[0][1]), vec2<f32>(-m[1][0], m[0][0])) * (1.0 / d);\n}`
      );
    } else if (n === 3) {
      this._helpers.set(
        key,
        `fn ${key}(m: mat3x3<f32>) -> mat3x3<f32> {\n  let c0 = cross(m[1], m[2]);\n  let c1 = cross(m[2], m[0]);\n  let c2 = cross(m[0], m[1]);\n  return transpose(mat3x3<f32>(c0, c1, c2)) * (1.0 / dot(m[0], c0));\n}`
      );
    } else {
      this._helpers.set(
        key,
        `fn ${key}(m: mat4x4<f32>) -> mat4x4<f32> {
  let c00 = m[2][2] * m[3][3] - m[3][2] * m[2][3];
  let c02 = m[1][2] * m[3][3] - m[3][2] * m[1][3];
  let c03 = m[1][2] * m[2][3] - m[2][2] * m[1][3];
  let c04 = m[2][1] * m[3][3] - m[3][1] * m[2][3];
  let c06 = m[1][1] * m[3][3] - m[3][1] * m[1][3];
  let c07 = m[1][1] * m[2][3] - m[2][1] * m[1][3];
  let c08 = m[2][1] * m[3][2] - m[3][1] * m[2][2];
  let c10 = m[1][1] * m[3][2] - m[3][1] * m[1][2];
  let c11 = m[1][1] * m[2][2] - m[2][1] * m[1][2];
  let c12 = m[2][0] * m[3][3] - m[3][0] * m[2][3];
  let c14 = m[1][0] * m[3][3] - m[3][0] * m[1][3];
  let c15 = m[1][0] * m[2][3] - m[2][0] * m[1][3];
  let c16 = m[2][0] * m[3][2] - m[3][0] * m[2][2];
  let c18 = m[1][0] * m[3][2] - m[3][0] * m[1][2];
  let c19 = m[1][0] * m[2][2] - m[2][0] * m[1][2];
  let c20 = m[2][0] * m[3][1] - m[3][0] * m[2][1];
  let c22 = m[1][0] * m[3][1] - m[3][0] * m[1][1];
  let c23 = m[1][0] * m[2][1] - m[2][0] * m[1][1];
  let f0 = vec4<f32>(c00, c00, c02, c03);
  let f1 = vec4<f32>(c04, c04, c06, c07);
  let f2 = vec4<f32>(c08, c08, c10, c11);
  let f3 = vec4<f32>(c12, c12, c14, c15);
  let f4 = vec4<f32>(c16, c16, c18, c19);
  let f5 = vec4<f32>(c20, c20, c22, c23);
  let v0 = vec4<f32>(m[1][0], m[0][0], m[0][0], m[0][0]);
  let v1 = vec4<f32>(m[1][1], m[0][1], m[0][1], m[0][1]);
  let v2 = vec4<f32>(m[1][2], m[0][2], m[0][2], m[0][2]);
  let v3 = vec4<f32>(m[1][3], m[0][3], m[0][3], m[0][3]);
  let i0 = v1 * f0 - v2 * f1 + v3 * f2;
  let i1 = v0 * f0 - v2 * f3 + v3 * f4;
  let i2 = v0 * f1 - v1 * f3 + v3 * f5;
  let i3 = v0 * f2 - v1 * f4 + v2 * f5;
  let sA = vec4<f32>(1.0, -1.0, 1.0, -1.0);
  let sB = vec4<f32>(-1.0, 1.0, -1.0, 1.0);
  let inv = mat4x4<f32>(i0 * sA, i1 * sB, i2 * sA, i3 * sB);
  let row0 = vec4<f32>(inv[0][0], inv[1][0], inv[2][0], inv[3][0]);
  return inv * (1.0 / dot(m[0], row0));
}`
      );
    }
    return key;
  }

  // ---------------------------------------------------------------------------
  // Reachability, Macro Branches & Declaration Ownership (shared with ShaderLab IR)
  // ---------------------------------------------------------------------------

  private _referenceInterfaceDependencies(structs: readonly ASTNode.StructSpecifier[]): void {
    for (const struct of structs) {
      this._currentDeclaration = struct;
      for (const prop of struct.propList) {
        for (const dep of prop.typeInfo.structDeclarations) {
          if (dep.ident) this.context.referenceGlobal(dep.ident.lexeme, ESymbolType.STRUCT);
        }
        prop.typeInfo.arraySpecifier?.codeGen(this);
      }
    }
    this._currentDeclaration = undefined;
  }

  private _preRegisterGlobalMacroRefs(macros: readonly ASTNode.GlobalDeclaration[]): void {
    const walk = (children: NodeChild[]) => {
      for (const child of children) {
        if (child instanceof ASTNode.MacroDefine) {
          if (child.valueExpression) child.valueExpression.codeGen(this);
        } else if (child instanceof TreeNode) {
          const prev = this._currentDeclaration;
          if (child instanceof ASTNode.FunctionDefinition) this._currentDeclaration = child;
          walk(child.children);
          this._currentDeclaration = prev;
        }
      }
    };
    for (const macro of macros) walk(macro.children);
  }

  private _getGlobalSymbol(out: ICodeSegment[]): void {
    const context = this.context;
    for (const sm of context._referencedGlobalSymbols) {
      if (sm.astNode instanceof ASTNode.VariableDeclaration && (sm.astNode.uniformBlock || sm.astNode.storageBlock))
        continue;
      this._currentDeclaration = sm.astNode;
      const codeGenResult = sm.astNode!.codeGen(this);
      this._currentDeclaration = undefined;
      if (!codeGenResult) continue;
      if (!sm.isInMacroBranch) {
        const segment = {
          text: this._declaration(codeGenResult, sm.astNode!),
          index: sm.astNode!.location.start.index
        };
        out.push(segment);
        if (sm.astNode instanceof ASTNode.StructSpecifier) this._structCodeSegments.set(sm.astNode, segment);
        if (sm.astNode instanceof ASTNode.VariableDeclaration) this._variableCodeSegments.set(sm.astNode, segment);
      }
    }
  }

  private _getCustomStruct(structNodes: ASTNode.StructSpecifier[], out: ICodeSegment[]): void {
    for (const node of structNodes) {
      if (this._structCodeSegments.has(node)) continue;
      const text = node.codeGen(this);
      if (!node.isInMacroBranch) {
        out.push({ text: this._declaration(text, node), index: node.location.start.index });
      }
    }
  }

  private _getGlobalMacroDeclarations(macros: readonly ASTNode.GlobalDeclaration[], out: ICodeSegment[]): void {
    const context = this.context;
    const referencedGlobalMacroASTs = context._referencedGlobalMacroASTs;
    referencedGlobalMacroASTs.length = 0;
    for (const symbol of context._referencedGlobalSymbols) {
      if (symbol.isInMacroBranch) referencedGlobalMacroASTs.push(symbol.astNode!);
    }

    for (const macro of macros) {
      let text: string;
      const child = macro.children[0];
      if (child instanceof ASTNode.GlobalMacroIfStatement) {
        const result: ICodeSegment[] = macro.macroExpressions.map((item) => ({
          text:
            item instanceof BaseToken
              ? item.type === Keyword.MACRO_DEFINE_EXPRESSION
                ? this._translateOpaqueDefineLexeme(item.lexeme)
                : item.lexeme
              : item.codeGen(this),
          index: item.location.start.index
        }));
        this._visitGlobalMacroIfStatement(child, result);
        text = result
          .sort((a, b) => a.index - b.index)
          .map((item) => item.text)
          .filter(Boolean)
          .join("\n");
      } else if (child instanceof BaseToken && child.type === Keyword.MACRO_DEFINE_EXPRESSION) {
        text = this._translateOpaqueDefineLexeme(child.lexeme);
      } else {
        text = macro.codeGen(this);
      }
      if (text) out.push({ text, index: macro.location.start.index });
    }
  }

  private _visitGlobalMacroIfStatement(node: TreeNode, out: ICodeSegment[]): void {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child instanceof ASTNode.PrecisionSpecifier) {
        continue;
      } else if (child instanceof ASTNode.FunctionDefinition) {
        if (this.context._referencedGlobalMacroASTs.indexOf(child) !== -1) {
          const text = this.getCachedCode(child);
          if (text !== undefined) {
            out.push({ text: this._declaration(text, child), index: child.location.start.index });
          }
        }
      } else if (child instanceof ASTNode.StructSpecifier) {
        const context = this.context;
        const stage = context.stage;
        if (
          context._referencedGlobalMacroASTs.indexOf(child) !== -1 ||
          (stage === EShaderStage.VERTEX
            ? context.hasStructRole(child, ShaderStructRole.Attribute) ||
              context.hasStructRole(child, ShaderStructRole.Varying)
            : context.hasStructRole(child, ShaderStructRole.Varying) ||
              context.hasStructRole(child, ShaderStructRole.Mrt))
        ) {
          out.push({
            text: this._declaration(this.getCachedCode(child) ?? "", child),
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.UniformBlock) {
        const text = this._uniformBlockCode(child);
        if (text) out.push({ text, index: child.location.start.index });
        continue;
      } else if (child instanceof ASTNode.StorageBlock) {
        const text = this._storageBlockCode(child);
        if (text) out.push({ text, index: child.location.start.index });
        continue;
      } else if (child instanceof ASTNode.VariableDeclarationList) {
        for (const variableDeclaration of child.variableDeclarations) {
          if (this.context._referencedGlobalMacroASTs.indexOf(variableDeclaration) !== -1) {
            out.push({
              text: this._declaration(this.getCachedCode(variableDeclaration) ?? "", variableDeclaration),
              index: variableDeclaration.location.start.index
            });
          }
        }
      }
      if (child instanceof TreeNode) this._visitGlobalMacroIfStatement(child, out);
    }
  }

  private _instancingNames(): IShaderInstancingNames {
    const names = this.context.names;
    return {
      initialize: names.allocate("instance:initialize", "gs_initInstance"),
      index: names.allocate("instance:index", "gs_instanceIndex"),
      block: names.allocate("instance:block", "gs_InstanceBlock"),
      struct: names.allocate("instance:struct", "gs_Instance"),
      instance: names.allocate("instance:object", "gs_instanceBuffer")
    };
  }

  protected get currentDeclarationOwner(): DeferredDeclarationOwnership | undefined {
    return this._currentDeclaration && this._declarationOwners.get(this._currentDeclaration);
  }

  private _referenceDeclaration(from: number, node: TreeNode): void {
    const owner = this._declarationOwners.get(node);
    if (!owner) return;
    let targets = this._declarationReferences.get(from);
    if (!targets) this._declarationReferences.set(from, (targets = new Set()));
    targets.add(owner.id);
  }

  private _emitDeclarationReferences(out: ICodeSegment[]): void {
    for (const [from, targets] of this._declarationReferences) {
      for (const to of targets) out.push({ text: ShaderInstructionEncoder.reference(from, to), index: -1 });
    }
  }

  private _declaration(text: string, node: TreeNode, activate = true): string {
    const initializer = text && this._inputHelperBodies.get(node);
    return ShaderInstructionEncoder.declaration(
      initializer ? `${text}\n${initializer}` : text,
      this._declarationOwners.get(node),
      activate
    );
  }

  override visitTypeSpecifier(node: ASTNode.TypeSpecifier): string {
    const call = node.parent instanceof ASTNode.FunctionIdentifier ? node.parent.parent : undefined;
    if (call instanceof ASTNode.FunctionCallGeneric && call.fnSymbol instanceof FnSymbol) {
      return super.visitTypeSpecifier(node);
    }
    for (const type of node.structDependencies) {
      if (!type.ident || this.context.getStructRole([type])) continue;
      this.context.referenceGlobal(type.ident.lexeme, ESymbolType.STRUCT);
    }
    const t = this._typeFromSymbolType({
      type: node.type,
      typeLexeme: node.lexeme,
      arraySpecifier: node.arraySpecifier,
      structDeclarations: node.structDeclarations
    });
    return this._wgslType(t);
  }
}
