import type { IShaderInfo } from "@galacean/engine-design";
import type { IPoolElement } from "@galacean/engine-core";
import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { EShaderStage } from "@galacean/engine-shader-parser/internal";
import { Keyword } from "@galacean/engine-shader-parser/internal";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser/internal";
import { NodeChild } from "@galacean/engine-shader-parser/internal";
import { ShaderData } from "@galacean/engine-shader-parser/internal";
import { ESymbolType } from "@galacean/engine-shader-parser/internal";
import {
  FnSymbol,
  VarSymbol,
  canInheritanceBranchesCover,
  getLexicalDeclarationCoexistence
} from "@galacean/engine-shader-parser/internal";
import { GSError, GSErrorName, mapExpandedShaderError } from "@galacean/engine-shader-parser/internal";
import { ShaderStructRole } from "@galacean/engine-shader-parser/internal";
import { ParserUtils } from "@galacean/engine-shader-parser/internal";
import type {
  BranchSignature,
  ShaderClueIR,
  ShaderCoreInfo,
  ShaderEntryPointInfo
} from "@galacean/engine-shader-parser/internal";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { ICodeSegment } from "./types";
import type { ShaderBackend } from "../ShaderBackend";

/**
 * @internal
 */
export abstract class GLESVisitor extends CodeGenVisitor implements ShaderBackend, IPoolElement {
  private _globalCodeArray: ICodeSegment[] = [];
  private readonly _forwardFunctionDeclarations = new Map<ASTNode.FunctionDefinition, string>();
  private readonly _forwardStructIndices = new Map<ASTNode.StructSpecifier, number>();
  private readonly _structCodeSegments = new Map<ASTNode.StructSpecifier, ICodeSegment>();
  private readonly _forwardVariableIndices = new Map<ASTNode.VariableDeclaration, number>();
  private readonly _variableCodeSegments = new Map<ASTNode.VariableDeclaration, ICodeSegment>();
  private _sourceIR?: ShaderClueIR;
  private _outerMacroDeclarations: readonly ASTNode.GlobalDeclaration[] = [];

  /**
   * Clears pass-local output retained by the pooled visitor.
   */
  reset(): void {
    const { _globalCodeArray: globalCodeArray } = this;
    globalCodeArray.length = 0;
    this._forwardFunctionDeclarations.clear();
    this._forwardStructIndices.clear();
    this._structCodeSegments.clear();
    this._forwardVariableIndices.clear();
    this._variableCodeSegments.clear();
  }

  /**
   * Releases references retained by an idle visitor when its pool is collected.
   * @internal
   */
  dispose(): void {
    this.context.reset();
    this.reset();
  }

  /**
   * Emits target-specific declarations that precede generated global code.
   * @param data - Parser-owned shader facts.
   * @param out - Destination code segments.
   */
  getOtherGlobal(data: ShaderData, out: ICodeSegment[]): void {
    for (const precision of data.globalPrecisions) {
      out.push({ text: precision.codeGen(this), index: precision.location.start.index });
    }
  }

  /**
   * Generates vertex and fragment source from neutral parser facts.
   * @param ir - Request-owned neutral shader IR.
   * @param coreInfo - Entry and stage-interface facts derived from the same IR.
   * @returns Generated vertex and fragment source.
   */
  generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo): IShaderInfo {
    this.context.reset();
    this.reset();

    const node = ir.program;
    const shaderData = node.shaderData;
    const context = this.context;
    context._passSymbolTable = shaderData.symbolTable;

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
    io.vertexStructVariableRoles.forEach((role, variable) => {
      context.registerStructVar(variable, role, EShaderStage.VERTEX);
    });
    io.fragmentStructVariableRoles.forEach((role, variable) => {
      context.registerStructVar(variable, role, EShaderStage.FRAGMENT);
    });

    this._sourceIR = ir;
    this._outerMacroDeclarations = outerGlobalMacroDeclarations;
    try {
      return {
        vertex: this._vertexMain(coreInfo.vertexEntry, shaderData, outerGlobalMacroDeclarations),
        fragment: this._fragmentMain(coreInfo.fragmentEntry, shaderData, outerGlobalMacroDeclarations)
      };
    } finally {
      this._sourceIR = undefined;
      this._outerMacroDeclarations = [];
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

    // Attribute/varying structs were collected in ShaderCoreInfo

    // Pre-walk global `#define` values so referenced struct properties emit `attribute`/`varying` declarations.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroDeclarations);

    const globalCodeArray = this._globalCodeArray;
    context.referenceGlobal(entryInfo.name, ESymbolType.FN);

    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.attributeStructs, globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroDeclarations, globalCodeArray);
    this.getOtherGlobal(data, globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    context.reset(false);
    this.reset();

    return globalCode;
  }

  private _fragmentMain(
    entryInfo: ShaderEntryPointInfo,
    data: ShaderData,
    outerGlobalMacroStatements: readonly ASTNode.GlobalDeclaration[]
  ): string {
    const context = this.context;
    context.stage = EShaderStage.FRAGMENT;
    context.stageEntry = entryInfo.name;
    this.prepareFragment(entryInfo, outerGlobalMacroStatements);

    // Every value-return must preserve early-exit control flow after entry return values are
    // lowered into fragment outputs.
    entryInfo.functions.forEach((fnSymbol) => {
      const returnType = fnSymbol.astNode.protoType.returnType;
      const mode =
        returnType.type === Keyword.VEC4
          ? "color"
          : returnType.typeSpecifier.structDeclarations.some((struct) =>
                context.hasStructRole(struct, ShaderStructRole.Mrt)
              )
            ? "mrt"
            : undefined;
      if (mode) {
        const statements = fnSymbol.astNode.statements;
        this._registerFragmentReturns(statements, mode, ParserUtils.lastStatement(statements));
      }
    });

    // Struct-variable identities are already populated from ShaderCoreInfo; just pre-walk macro
    // refs so struct codegen sees the references.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroStatements);

    const globalCodeArray = this._globalCodeArray;
    context.referenceGlobal(entryInfo.name, ESymbolType.FN);

    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getCustomStruct(context.mrtStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroStatements, globalCodeArray);
    this.getOtherGlobal(data, globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    context.reset();
    this.reset();

    return globalCode;
  }

  protected prepareFragment(
    entryInfo: ShaderEntryPointInfo,
    outerGlobalMacroStatements: readonly ASTNode.GlobalDeclaration[]
  ): void {
    void entryInfo;
    void outerGlobalMacroStatements;
  }

  /**
   * Pre-walk `#define` values in global macro declarations and register any
   * `structVar.prop` member accesses as referenced struct props. This must run before
   * struct codegen emits the declaration lists (`attribute …`, `varying …`, `MRT …`),
   * otherwise properties used only from macros would be missing from the output.
   */
  private _preRegisterGlobalMacroRefs(macros: readonly ASTNode.GlobalDeclaration[]): void {
    for (const macro of macros) {
      this._walkMacroDefineTokens(macro.children);
    }
  }

  private _walkMacroDefineTokens(children: NodeChild[]): void {
    for (const child of children) {
      if (child instanceof ASTNode.MacroDefine) {
        // Codegen the value once so the enclosed `visitPostfixExpression` calls
        // register their struct-prop references. The returned string is discarded
        // — the real emit happens later in `_getGlobalMacroDeclarations`.
        if (child.valueExpression) child.valueExpression.codeGen(this);
      } else if (child instanceof TreeNode) {
        this._walkMacroDefineTokens(child.children);
      }
    }
  }

  private _registerFragmentReturns(node: TreeNode, mode: "color" | "mrt", terminal?: TreeNode): void {
    if (node instanceof ASTNode.JumpStatement && node.children.length === 3) {
      this.context.registerFragmentReturn(node, mode);
      if (node === terminal) this.context.registerTerminalInterfaceReturn(node);
      return;
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) this._registerFragmentReturns(child, mode, terminal);
    }
  }

  private _getGlobalSymbol(out: ICodeSegment[]): void {
    const context = this.context;
    const { _referencedGlobals, _referencedGlobalKeys } = context;
    for (let keyIndex = 0; keyIndex < _referencedGlobalKeys.length; keyIndex++) {
      const symbols = _referencedGlobals[_referencedGlobalKeys[keyIndex]];
      for (let i = 0, n = symbols.length; i < n; i++) {
        const sm = symbols[i];
        const codeGenResult = sm.astNode.codeGen(this);
        if (!codeGenResult) continue;
        const text = codeGenResult + (sm.type === ESymbolType.VAR ? ";" : "");
        if (!sm.isInMacroBranch) {
          const segment = {
            text,
            index: sm.astNode.location.start.index
          };
          out.push(segment);
          if (sm.astNode instanceof ASTNode.StructSpecifier) this._structCodeSegments.set(sm.astNode, segment);
          if (sm.astNode instanceof ASTNode.VariableDeclaration) this._variableCodeSegments.set(sm.astNode, segment);
        }
      }
    }
    this._getForwardDeclarations(out);
    for (const [definition, text] of this._forwardFunctionDeclarations) {
      if (!definition.isInMacroBranch) out.push({ text, index: definition.location.start.index });
    }
  }

  protected override referenceFunction(symbol: FnSymbol, referenceIndex: number, branch: BranchSignature): void {
    super.referenceFunction(symbol, referenceIndex, branch);
    const definition = symbol.astNode;
    const declarations = this._forwardFunctionDeclarations;
    if (symbol.ident === this.context.stageEntry) return;
    const candidates = this.context._referencedGlobals[symbol.ident].filter(
      (candidate): candidate is FnSymbol => candidate instanceof FnSymbol && candidate.equal(symbol)
    );
    if (candidates.some((candidate) => candidate.astNode === definition)) return;
    const compatible = candidates.filter((candidate) => this._canBranchesOverlap(candidate.branchSignature, branch));
    const preceding = compatible.filter((candidate) => candidate.astNode.location.start.index < referenceIndex);
    if (
      canInheritanceBranchesCover(
        preceding.map((candidate) => candidate.branchSignature),
        branch
      )
    )
      return;
    const replacement = compatible.find((candidate) => candidate.astNode.location.start.index > referenceIndex);
    if (replacement) {
      // An inherited helper can call a declaration whose overriding body occurs later. Keep the
      // original declaration's macro/type context and emit only the final backend signature there.
      const prototype = replacement.astNode.protoType;
      const anchor = definition.location.start.index;
      const text = `${prototype.codeGen(this)};`;
      const signature = this._getForwardSignature(prototype);
      for (const candidate of candidates) {
        if (
          this._canBranchesOverlap(candidate.branchSignature, symbol.branchSignature) &&
          this._getForwardSignature(candidate.astNode.protoType) !== signature
        ) {
          this._unsupportedForwardDeclaration(candidate.astNode.protoType);
        }
      }
      if (declarations.has(definition)) return;
      if (
        !this._isContextIndependent(prototype) ||
        this._hasDeclarationContextBarrier(anchor, prototype.location.start.index, false)
      ) {
        this._unsupportedForwardDeclaration(prototype);
      }
      const outerMacro = this._outerMacroDeclarations.find(
        (macro) => macro.location.start.index <= anchor && macro.location.end.index >= definition.location.end.index
      );
      const typeAnchor = outerMacro?.location.start.index ?? anchor;
      this._prepareForwardTypes(prototype.returnType.typeSpecifier.structDeclarations, anchor, typeAnchor);
      for (const parameter of prototype.parameterList ?? []) {
        if (
          parameter.astNode instanceof ASTNode.ParameterDeclaration &&
          parameter.astNode.symbol &&
          this.context.getStructVarRole([parameter.astNode.symbol])
        ) {
          continue;
        }
        this._prepareForwardTypes(parameter.typeInfo?.structDeclarations ?? [], anchor, typeAnchor);
      }
      declarations.set(definition, text);
    }
  }

  private _getForwardSignature(prototype: ASTNode.FunctionProtoType): string {
    const parameters: string[] = [];
    for (const parameter of prototype.parameterList ?? []) {
      const declaration = parameter.astNode;
      if (
        declaration instanceof ASTNode.ParameterDeclaration &&
        declaration.symbol &&
        this.context.getStructVarRole([declaration.symbol])
      )
        continue;
      const tokens: string[] = [];
      const visit = (node: NodeChild) => {
        if (node instanceof BaseToken) {
          if (node !== parameter.ident && node.type !== Keyword.IN) tokens.push(node.lexeme);
        } else {
          node.children.forEach(visit);
        }
      };
      visit(declaration);
      const text = tokens.join(" ");
      if (text !== "void") parameters.push(text);
    }
    return `${prototype.returnType.codeGen(this)}(${parameters.join(",")})`;
  }

  private _canBranchesOverlap(left: BranchSignature, right: BranchSignature): boolean {
    return (
      getLexicalDeclarationCoexistence(left, right) !== "exclusive" &&
      !canInheritanceBranchesCover([], [...left, ...right])
    );
  }

  override visitVariableIdentifier(node: ASTNode.VariableIdentifier): string {
    const code = super.visitVariableIdentifier(node);
    for (const symbol of node.resolvedSymbols()) {
      if (!(symbol instanceof VarSymbol) || !symbol.isUniform) continue;
      const candidates = this.context._referencedGlobals[symbol.ident];
      if (!candidates || candidates.includes(symbol)) continue;
      const preceding = candidates.filter(
        (candidate) => candidate.astNode.location.start.index < node.location.start.index
      );
      if (
        canInheritanceBranchesCover(
          preceding.map((candidate) => candidate.branchSignature),
          node._branch
        )
      )
        continue;
      const oldMacro = this._outerMacroDeclarations.find(
        (macro) =>
          macro.location.start.index <= symbol.astNode.location.start.index &&
          macro.location.end.index >= symbol.astNode.location.end.index
      );
      const anchor = oldMacro?.location.start.index ?? symbol.astNode.location.start.index;
      for (const candidate of candidates) {
        if (candidate.astNode.location.start.index <= node.location.start.index) continue;
        const declaration = candidate.astNode;
        if (
          !(candidate instanceof VarSymbol) ||
          !candidate.isUniform ||
          !(declaration instanceof ASTNode.VariableDeclaration)
        ) {
          this._unsupportedForwardDeclaration(declaration);
        }
        const macro = this._outerMacroDeclarations.find(
          (item) =>
            item.location.start.index <= declaration.location.start.index &&
            item.location.end.index >= declaration.location.end.index
        );
        if (
          !this._isContextIndependent(declaration) ||
          this._hasDeclarationContextBarrier(anchor, macro?.location.end.index ?? declaration.location.end.index, true)
        ) {
          this._unsupportedForwardDeclaration(declaration);
        }
        this._prepareForwardTypes(candidate.dataType.structDeclarations, anchor);
        this._forwardVariableIndices.set(
          declaration,
          Math.min(this._forwardVariableIndices.get(declaration) ?? Infinity, anchor)
        );
      }
    }
    return code;
  }

  private _getForwardDeclarations(out: ICodeSegment[]): void {
    type Declaration = ASTNode.StructSpecifier | ASTNode.VariableDeclaration;
    const guarded = new Map<ASTNode.GlobalDeclaration, { index: number; declarations: Declaration[] }>();
    const declarations: [Declaration, number][] = Array.from(this._forwardStructIndices);
    for (const entry of this._forwardVariableIndices) declarations.push(entry);
    const code = (declaration: Declaration) =>
      declaration.codeGen(this) + (declaration instanceof ASTNode.VariableDeclaration ? ";" : "");
    for (const [declaration, index] of declarations) {
      const macro = this._outerMacroDeclarations.find(
        (item) =>
          item.location.start.index <= declaration.location.start.index &&
          item.location.end.index >= declaration.location.end.index
      );
      if (!macro) {
        const previous =
          declaration instanceof ASTNode.StructSpecifier
            ? this._structCodeSegments.get(declaration)
            : this._variableCodeSegments.get(declaration);
        if (previous) out.splice(out.indexOf(previous), 1);
        out.push({ text: code(declaration), index });
      } else {
        let group = guarded.get(macro);
        if (!group) guarded.set(macro, (group = { index, declarations: [] }));
        group.index = Math.min(group.index, index);
        group.declarations.push(declaration);
      }
    }
    for (const [macro, group] of guarded) {
      const segments: ICodeSegment[] = macro.macroExpressions.map((item) => ({
        text: item instanceof BaseToken ? item.lexeme : item.codeGen(this),
        index: item.location.start.index
      }));
      for (const declaration of group.declarations) {
        segments.push({ text: code(declaration), index: declaration.location.start.index });
      }
      out.push({
        text: segments
          .sort((a, b) => a.index - b.index)
          .map((item) => item.text)
          .join("\n"),
        index: group.index
      });
    }
  }

  override visitTypeSpecifier(node: ASTNode.TypeSpecifier): string {
    if (!node.structDeclarations.length) return super.visitTypeSpecifier(node);
    for (const type of node.structDeclarations) {
      if (!type.ident || this.context.getStructRole([type])) continue;
      // A function-local struct can shadow a global name without participating in inheritance.
      let parent = type.parent;
      while (
        parent &&
        !(parent instanceof ASTNode.GlobalDeclaration) &&
        !(parent instanceof ASTNode.FunctionDefinition)
      ) {
        parent = parent.parent;
      }
      if (parent instanceof ASTNode.FunctionDefinition) continue;
      this.context.referenceGlobal(type.ident.lexeme, ESymbolType.STRUCT);
      const final = this.context._referencedGlobals[type.ident.lexeme];
      if (final.some((symbol) => symbol.astNode === type)) continue;
      const oldMacro = this._outerMacroDeclarations.find(
        (item) =>
          item.location.start.index <= type.location.start.index && item.location.end.index >= type.location.end.index
      );
      this._prepareForwardTypes(
        final
          .map((symbol) => symbol.astNode)
          .filter((item): item is ASTNode.StructSpecifier => item instanceof ASTNode.StructSpecifier),
        oldMacro?.location.start.index ?? type.location.start.index
      );
    }
    return super.visitTypeSpecifier(node);
  }

  private _prepareForwardTypes(types: readonly ASTNode.StructSpecifier[], anchor: number, hoistAnchor = anchor): void {
    if (this.context.getStructRole(types)) return;
    for (const type of types) {
      if ((this._forwardStructIndices.get(type) ?? Infinity) <= anchor) continue;
      if (type.ident) {
        this.context.referenceGlobal(type.ident.lexeme, ESymbolType.STRUCT);
        const final = this.context._referencedGlobals[type.ident.lexeme];
        if (!final.some((symbol) => symbol.astNode === type)) {
          this._prepareForwardTypes(
            final
              .map((symbol) => symbol.astNode)
              .filter((item): item is ASTNode.StructSpecifier => item instanceof ASTNode.StructSpecifier),
            anchor,
            hoistAnchor
          );
          continue;
        }
      }
      const needsHoist = type.location.start.index > anchor;
      const macro = this._outerMacroDeclarations.find(
        (item) =>
          item.location.start.index <= type.location.start.index && item.location.end.index >= type.location.end.index
      );
      if (
        needsHoist &&
        (!this._isContextIndependent(type) ||
          this._hasDeclarationContextBarrier(hoistAnchor, macro?.location.end.index ?? type.location.end.index, true))
      ) {
        this._unsupportedForwardDeclaration(type);
      }
      const dependencyAnchor = needsHoist ? hoistAnchor : type.location.start.index;
      for (const property of type.propList) {
        this._prepareForwardTypes(property.typeInfo.structDeclarations, dependencyAnchor);
      }
      if (needsHoist) this._forwardStructIndices.set(type, hoistAnchor);
    }
  }

  private _isContextIndependent(node: TreeNode): boolean {
    if (
      node instanceof ASTNode.VariableIdentifier ||
      node instanceof ASTNode.MacroCallSymbol ||
      node instanceof ASTNode.MacroCallFunction
    )
      return false;
    if (node instanceof ASTNode.TypeSpecifier && node.isCustom && !node.structDeclarations.length) return false;
    return node.children.every((child) =>
      child instanceof TreeNode
        ? this._isContextIndependent(child)
        : child.type < Keyword.MACRO_IF || child.type > Keyword.MACRO_DEFINE_PARAMS
    );
  }

  private _hasDeclarationContextBarrier(start: number, end: number, includeMacros: boolean): boolean {
    const visit = (node: TreeNode, inFunction = false): boolean => {
      if (node.location.end.index <= start || node.location.start.index >= end) return false;
      if (node instanceof ASTNode.PrecisionSpecifier && !inFunction) return true;
      if (includeMacros && node instanceof ASTNode.MacroDefine) return true;
      inFunction ||= node instanceof ASTNode.FunctionDefinition;
      return node.children.some((child) =>
        child instanceof TreeNode
          ? visit(child, inFunction)
          : includeMacros &&
            child.location.start.index > start &&
            child.location.start.index < end &&
            (child.type === Keyword.MACRO_UNDEF || child.type === Keyword.MACRO_DEFINE_EXPRESSION)
      );
    };
    return visit(this._sourceIR!.program);
  }

  private _unsupportedForwardDeclaration(node: TreeNode): never {
    const ir = this._sourceIR!;
    throw mapExpandedShaderError(
      new GSError(
        GSErrorName.CompilationError,
        "Inherited declarations require incompatible forward signatures or depend on a later macro or precision context.",
        node.location,
        ir.source,
        undefined,
        "UnsupportedForwardDeclaration"
      ),
      ir.source,
      ir.sourceMap
    );
  }

  private _getCustomStruct(structNodes: ASTNode.StructSpecifier[], out: ICodeSegment[]): void {
    for (const node of structNodes) {
      const text = node.codeGen(this);

      if (!node.isInMacroBranch) {
        out.push({ text, index: node.location.start.index });
      }
    }
  }

  private _getGlobalMacroDeclarations(macros: readonly ASTNode.GlobalDeclaration[], out: ICodeSegment[]): void {
    const context = this.context;
    const referencedGlobals = context._referencedGlobals;
    const referencedGlobalKeys = context._referencedGlobalKeys;
    const referencedGlobalMacroASTs = context._referencedGlobalMacroASTs;
    referencedGlobalMacroASTs.length = 0;

    for (let keyIndex = 0; keyIndex < referencedGlobalKeys.length; keyIndex++) {
      const symbols = referencedGlobals[referencedGlobalKeys[keyIndex]];
      for (const symbol of symbols) {
        if (symbol.isInMacroBranch) {
          referencedGlobalMacroASTs.push(symbol.astNode);
        }
      }
    }

    for (const macro of macros) {
      let text: string;
      const child = macro.children[0];

      if (child instanceof ASTNode.GlobalMacroIfStatement) {
        const result: ICodeSegment[] = [];
        result.push(
          ...macro.macroExpressions.map((item) => ({
            text: item instanceof BaseToken ? item.lexeme : item.codeGen(this),
            index: item.location.start.index
          }))
        );

        this._visitGlobalMacroIfStatement(child, result);

        text = result
          .sort((a, b) => a.index - b.index)
          .map((item) => item.text)
          .join("\n");
      } else if (child instanceof BaseToken && child.type === Keyword.MACRO_DEFINE_EXPRESSION) {
        // Legacy opaque `#define` — its lexeme is the complete directive text,
        // newlines included; emit verbatim.
        text = child.lexeme;
      } else {
        text = macro.codeGen(this);
      }

      out.push({
        text,
        index: macro.location.start.index
      });
    }
  }

  private _visitGlobalMacroIfStatement(node: TreeNode, out: ICodeSegment[]): void {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child instanceof ASTNode.PrecisionSpecifier) {
        out.push({
          text: child.codeGen(this),
          index: child.location.start.index
        });
      } else if (child instanceof ASTNode.FunctionDefinition) {
        const text =
          this.context._referencedGlobalMacroASTs.indexOf(child) !== -1
            ? this.getCachedCode(child)
            : this._forwardFunctionDeclarations.get(child);
        if (text !== undefined) {
          out.push({
            text,
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.StructSpecifier) {
        if (this._forwardStructIndices.has(child)) continue;
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
            text: this.getCachedCode(child) ?? "",
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.VariableDeclarationList) {
        const variableDeclarations = child.variableDeclarations;
        for (let i = 0; i < variableDeclarations.length; i++) {
          const variableDeclaration = variableDeclarations[i];
          if (
            this.context._referencedGlobalMacroASTs.indexOf(variableDeclaration) !== -1 &&
            !this._forwardVariableIndices.has(variableDeclaration)
          ) {
            out.push({
              text: `${this.getCachedCode(variableDeclaration) ?? ""};`,
              index: variableDeclaration.location.start.index
            });
          }
        }
      }

      if (child instanceof TreeNode) {
        this._visitGlobalMacroIfStatement(child, out);
      }
    }
  }
}
