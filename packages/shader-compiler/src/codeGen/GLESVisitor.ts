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
  StructSymbol,
  VarSymbol,
  canInheritanceBranchesCover,
  getLexicalDeclarationCoexistence
} from "@galacean/engine-shader-parser/internal";
import { GSError, GSErrorName, mapExpandedShaderError } from "@galacean/engine-shader-parser/internal";
import { ShaderStructRole } from "@galacean/engine-shader-parser/internal";
import type {
  BranchSignature,
  StructProp,
  ShaderClueIR,
  ShaderCoreInfo,
  ShaderEntryPointInfo,
  DeferredDeclarationOwnership
} from "@galacean/engine-shader-parser/internal";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { isUnsafeGLSLIdentifier } from "./NameAllocator";
import { ICodeSegment } from "./types";
import type { ShaderBackend } from "../ShaderBackend";
import { ShaderInstructionEncoder } from "../ShaderInstructionEncoder";

/**
 * @internal
 */
export abstract class GLESVisitor extends CodeGenVisitor implements ShaderBackend, IPoolElement {
  protected readonly supportsArrayStructReturn: boolean = true;
  /** Names of pass-scope declarations, which stage-interface globals must not redeclare. */
  private readonly _globalNames = new Set<string>();
  /** Interface type and variable tokens whose source names GLSL ES rejects. */
  private readonly _escapedDeclarations = new Map<BaseToken, string>();
  private _vertexOutputNames?: Record<string, string>;
  private readonly _fragmentVaryingProps = new Set<StructProp>();
  private readonly _globalInputs = new Map<EShaderStage, VarSymbol[]>();
  private readonly _inputHelperBodies = new Map<TreeNode, string>();
  private readonly _inputHelperGroups = new Map<number, { name: string; fallback: DeferredDeclarationOwnership }>();
  private _globalCodeArray: ICodeSegment[] = [];
  private readonly _forwardFunctionDeclarations = new Map<ASTNode.FunctionDefinition, string>();
  private readonly _forwardStructIndices = new Map<ASTNode.StructSpecifier, number>();
  private readonly _structCodeSegments = new Map<ASTNode.StructSpecifier, ICodeSegment>();
  private readonly _forwardVariableIndices = new Map<ASTNode.VariableDeclaration, number>();
  private readonly _variableCodeSegments = new Map<ASTNode.VariableDeclaration, ICodeSegment>();
  private readonly _declarationOwners = new Map<TreeNode, DeferredDeclarationOwnership>();
  private readonly _deferredPrototypes = new Map<ASTNode.FunctionDefinition, ICodeSegment>();
  private readonly _declarationReferences = new Map<number, Set<number>>();
  private _currentDeclaration?: TreeNode;
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
    this._deferredPrototypes.clear();
    this._declarationReferences.clear();
    this._inputHelperBodies.clear();
    this._inputHelperGroups.clear();
    this._currentDeclaration = undefined;
  }

  /**
   * Releases references retained by an idle visitor when its pool is collected.
   * @internal
   */
  dispose(): void {
    this.context.reset();
    this.context.names.reset();
    this._globalNames.clear();
    this._escapedDeclarations.clear();
    this._vertexOutputNames = undefined;
    this.reset();
  }

  /**
   * Emits target-specific declarations that precede generated global code.
   * @param data - Parser-owned shader facts.
   * @param out - Destination code segments.
   */
  getOtherGlobal(data: ShaderData, out: ICodeSegment[]): void {
    for (const { name, fallback } of this._inputHelperGroups.values()) {
      out.push({
        text:
          ShaderInstructionEncoder.declaration(`void ${name}() {}`, fallback) +
          ShaderInstructionEncoder.reference(0, fallback.id),
        index: -1
      });
    }
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
    this.context.names.reset();
    this._globalNames.clear();
    this._escapedDeclarations.clear();
    this._vertexOutputNames = undefined;
    this.reset();

    const node = ir.program;
    const shaderData = node.shaderData;
    const context = this.context;
    context._passSymbolTable = shaderData.symbolTable;
    let hasUnsafeIdentifier = false;
    for (const name of ir.source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      context.names.reserve(name);
      hasUnsafeIdentifier ||= isUnsafeGLSLIdentifier(name);
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
    io.vertexStructVariableRoles.forEach((role, variable) => {
      context.registerStructVar(variable, role, EShaderStage.VERTEX);
    });
    io.fragmentStructVariableRoles.forEach((role, variable) => {
      context.registerStructVar(variable, role, EShaderStage.FRAGMENT);
    });
    if (hasUnsafeIdentifier) this._collectEscapedDeclarations(node);

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
        // `nextInputOwner` already exceeds every owner id and group.
        let nextId = nextInputOwner;
        let nextGroup = nextInputOwner;
        // Reachability follows the selected declaration, including dependencies without an override.
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
        const propDeclarations = new Map();
        for (const struct of [...io.attributeStructs, ...io.varyingStructs, ...io.mrtStructs]) {
          for (const prop of struct.propList) propDeclarations.set(prop, struct);
        }
        context.onReferenceStructProps = (props) => {
          const from = this.currentDeclarationOwner?.id ?? 0;
          for (const prop of props) this._referenceDeclaration(from, propDeclarations.get(prop));
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
      return { vertex, fragment, vertexOutputNames: this._vertexOutputNames };
    } finally {
      this._sourceIR = undefined;
      this._outerMacroDeclarations = [];
      this._globalInputs.clear();
      this._declarationOwners.clear();
      context.onReferenceGlobal = undefined;
      context.onReferenceStructProps = undefined;
      this._fragmentVaryingProps.clear();
      this._globalNames.clear();
      this._escapedDeclarations.clear();
      this._vertexOutputNames = undefined;
      context.reset();
      context.names.reset();
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

    // Attribute/varying structs were collected in ShaderCoreInfo

    // Pre-walk global `#define` values so referenced struct properties emit `attribute`/`varying` declarations.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroDeclarations);

    const globalCodeArray = this._globalCodeArray;
    context.referenceGlobal(entryInfo.name, ESymbolType.FN);

    this._referenceInterfaceDependencies([...context.attributeStructs, ...context.varyingStructs]);
    this._initializeGlobalInputs();
    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.attributeStructs, globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroDeclarations, globalCodeArray);
    this.getOtherGlobal(data, globalCodeArray);
    this._emitDeclarationReferences(globalCodeArray);

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

    // Struct-variable identities are already populated from ShaderCoreInfo; just pre-walk macro
    // refs so struct codegen sees the references.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroStatements);

    const globalCodeArray = this._globalCodeArray;
    context.referenceGlobal(entryInfo.name, ESymbolType.FN);

    this._referenceInterfaceDependencies([...context.varyingStructs, ...context.mrtStructs]);
    this._initializeGlobalInputs();
    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getCustomStruct(context.mrtStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroStatements, globalCodeArray);
    this.getOtherGlobal(data, globalCodeArray);
    this._emitDeclarationReferences(globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    for (const props of Object.values(context._referencedVaryingList)) {
      for (const prop of props) this._fragmentVaryingProps.add(prop);
    }
    context.reset(false);
    this.reset();

    return globalCode;
  }

  private _referenceInterfaceDependencies(structs: readonly ASTNode.StructSpecifier[]): void {
    for (const struct of structs) {
      this._currentDeclaration = struct;
      for (const prop of struct.propList) {
        for (const dependency of prop.typeInfo.structDeclarations) {
          if (dependency.ident) this.context.referenceGlobal(dependency.ident.lexeme, ESymbolType.STRUCT);
        }
        prop.typeInfo.arraySpecifier?.codeGen(this);
      }
    }
    this._currentDeclaration = undefined;
  }

  /**
   * Resolves an interface member's global name, shared by both stages for varyings.
   * @param prop - Interface member
   * @param role - Stage-interface role of the member's structure
   * @returns Generated global identifier
   */
  protected interfaceName(prop: StructProp, role: ShaderStructRole): string {
    const context = this.context;
    const name = prop.ident.lexeme;
    const isOutput = role === ShaderStructRole.Mrt;
    const sameName = (item: StructProp) => item.ident.lexeme === name;
    const conflicts =
      this._globalNames.has(name) ||
      // Vertex attributes and fragment outputs share a stage scope with varyings.
      (!isOutput && (context.attributeList.some(sameName) || context.mrtList.some(sameName)));
    const key = `${isOutput ? "output" : "varying"}:${name}`;
    const generated = isUnsafeGLSLIdentifier(name)
      ? context.names.sourceName(key, name)
      : conflicts
        ? context.names.allocate(key, name)
        : name;
    if (!isOutput && context.stage === EShaderStage.VERTEX && generated !== name) {
      (this._vertexOutputNames ??= Object.create(null))[name] = generated;
    }
    return generated;
  }

  protected override interfaceMemberName(name: string): string {
    return this.context.names.sourceName(`member:${name}`, name);
  }

  private _interfaceTypeName(struct: ASTNode.StructSpecifier): string {
    const name = struct.ident!.lexeme;
    return this.context.names.sourceName(`type:${name}`, name);
  }

  /**
   * Escapes interface-typed variables whose names GLSL ES reserves.
   * @param name - Source name
   * @param structs - Struct declarations of the variable type
   * @returns The escaped name, or the source name when no escape is necessary
   */
  private _interfaceVariableName(name: string, structs: readonly ASTNode.StructSpecifier[] | undefined): string {
    return structs?.length && this.context.getStructRole(structs)
      ? this.context.names.sourceName(`variable:${name}`, name)
      : name;
  }

  private _collectEscapedDeclarations(node: TreeNode): void {
    if (node instanceof ASTNode.TypeSpecifier && this.context.getStructRole(node.structDeclarations)) {
      const token = (node.children[0] as TreeNode).children[0];
      if (token instanceof BaseToken && token.lexeme === node.structDeclarations[0].ident?.lexeme) {
        const name = this._interfaceTypeName(node.structDeclarations[0]);
        if (name !== token.lexeme) this._escapedDeclarations.set(token, name);
      }
    }
    let identifier: BaseToken | undefined;
    let structs: readonly ASTNode.StructSpecifier[] | undefined;
    if (node instanceof ASTNode.ParameterDeclarator) {
      identifier = node.ident;
      structs = node.typeInfo?.structDeclarations;
    } else {
      // Local, global and multi-variable declarations share the parser's `declarator` record.
      const { declarator } = node as {
        declarator?: { identifier?: BaseToken; typeInfo?: { structDeclarations: readonly ASTNode.StructSpecifier[] } };
      };
      identifier = declarator?.identifier;
      structs = declarator?.typeInfo?.structDeclarations;
    }
    if (identifier) {
      const name = this._interfaceVariableName(identifier.lexeme, structs);
      if (name !== identifier.lexeme) this._escapedDeclarations.set(identifier, name);
    }
    for (const child of node.children) {
      if (child instanceof TreeNode) this._collectEscapedDeclarations(child);
    }
  }

  protected override tokenLexeme(token: BaseToken): string {
    return this._escapedDeclarations.get(token) ?? token.lexeme;
  }

  private _escapedReference(node: ASTNode.VariableIdentifier): string | undefined {
    const token = node.children[0];
    if (!this._escapedDeclarations.size || !(token instanceof BaseToken) || !isUnsafeGLSLIdentifier(token.lexeme)) {
      return undefined;
    }
    const symbols = node.resolvedValueSymbols();
    if (!symbols.length) {
      // Macro values can lack symbols. The stage's unambiguous name-to-role map binds them, as for member access.
      return this.context.getUnresolvedStructVarRole(token.lexeme)
        ? this.context.names.sourceName(`variable:${token.lexeme}`, token.lexeme)
        : undefined;
    }
    let name: string | undefined;
    for (const symbol of symbols) {
      const candidate =
        symbol instanceof VarSymbol
          ? this._interfaceVariableName(token.lexeme, symbol.dataType?.structDeclarations)
          : symbol instanceof StructSymbol && this.context.getStructRole([symbol.astNode])
            ? this._interfaceTypeName(symbol.astNode)
            : token.lexeme;
      // Branch candidates must agree, otherwise the reference keeps its source spelling.
      if (name !== undefined && name !== candidate) return undefined;
      name = candidate;
    }
    return name;
  }

  protected abstract fragmentColorOutput(): string;
  protected abstract mrtOutput(prop: StructProp): string;

  private _transferName(struct: ASTNode.StructSpecifier, read: boolean): string {
    return this.context.names.allocate(
      `${read ? "read" : "write"}:${struct.ident!.lexeme}`,
      `${read ? "read" : "write"}_${struct.ident!.lexeme}`
    );
  }

  override visitStructSpecifier(node: ASTNode.StructSpecifier): string {
    const context = this.context;
    const role = context.getStructRole([node]);
    if (!role) return super.visitStructSpecifier(node);
    const typeName = this._interfaceTypeName(node);
    const memberCode = (emit: (prop: StructProp) => string) => {
      const segments: ICodeSegment[] = node.macroExpressions.map((item) => ({
        text: item instanceof BaseToken ? item.lexeme : item.codeGen(this),
        index: item.location.start.index
      }));
      for (const prop of node.propList) {
        if (!retain(prop)) continue;
        segments.push({ text: emit(prop), index: prop.ident.location.start.index });
      }
      return segments
        .sort((a, b) => a.index - b.index)
        .map((item) => item.text)
        .join("\n");
    };
    const references =
      role === ShaderStructRole.Attribute
        ? context._referencedAttributeList
        : role === ShaderStructRole.Varying
          ? context._referencedVaryingList
          : context._referencedMRTList;
    const used = (prop: StructProp) => !!references[prop.ident.lexeme]?.includes(prop);
    // Interface members have no array wire form, and GLSL ES 1.00 functions cannot return structures that contain
    // arrays. GLES100 therefore omits array members from interface structures.
    const retain = (prop: StructProp) => this.supportsArrayStructReturn || !this._containsArray(prop);
    const declaration = (prop: StructProp) =>
      `${prop.typeInfo.typeLexeme} ${this.interfaceMemberName(prop.ident.lexeme)}${prop.typeInfo.arraySpecifier?.codeGen(this) ?? ""};`;
    let structCode: string;
    const hasRetainedField = node.propList.some(retain);
    if (hasRetainedField && !node.macroExpressions.length) {
      structCode = `struct ${typeName} {\n${memberCode(declaration)}\n};`;
    } else {
      const hasFields = context.names.allocate(node, `${typeName}_has_fields`);
      const padding = context.names.allocate("empty-interface-member", "interface_padding");
      // A macro configuration can remove every source field; GLSL still requires a nonempty struct.
      structCode = `#undef ${hasFields}\nstruct ${typeName} {\n${memberCode((prop) => `${declaration(prop)}\n#define ${hasFields}\n`)}\n#ifndef ${hasFields}\nfloat ${padding};\n#endif\n};\n#undef ${hasFields}\n`;
    }
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
    const value = context.names.allocate("interface-value", "interface_value");
    const assignments = memberCode((prop) => {
      if (!used(prop)) return "";
      const wire =
        role === ShaderStructRole.Attribute
          ? prop.ident.lexeme
          : role === ShaderStructRole.Mrt
            ? this.mrtOutput(prop)
            : this.interfaceName(prop, role);
      const member = `${value}.${this.interfaceMemberName(prop.ident.lexeme)}`;
      return read ? `${member} = ${wire};` : `${wire} = ${member};`;
    });
    const transfer = read
      ? `${typeName} ${this._transferName(node, true)}() { ${typeName} ${value};\n${assignments}\nreturn ${value}; }`
      : `void ${this._transferName(node, false)}(${typeName} ${value}) {\n${assignments}\n}`;
    return `${structCode}\n${declarations}\n${transfer}`;
  }

  private _containsArray(prop: StructProp, visited = new Set<ASTNode.StructSpecifier>()): boolean {
    if (prop.typeInfo.arraySpecifier) return true;
    for (const struct of prop.typeInfo.structDeclarations) {
      if (visited.has(struct)) continue;
      visited.add(struct);
      if (struct.propList.some((member) => this._containsArray(member, visited))) return true;
    }
    return false;
  }

  override defaultCodeGen(children: NodeChild[]): string {
    const parent = children[0] instanceof TreeNode ? children[0].parent : undefined;
    if (parent instanceof ASTNode.EqualityExpression && children.length === 3) {
      const observe = (node: TreeNode) => {
        if (node instanceof ASTNode.VariableIdentifier) {
          for (const symbol of node.resolvedValueSymbols()) {
            if (symbol instanceof VarSymbol)
              for (const struct of symbol.dataType?.structDeclarations ?? []) this._observeWholeStruct(struct);
          }
        }
        if (node instanceof ASTNode.FunctionCallGeneric) {
          const declaration = node.fnSymbol?.astNode;
          if (declaration instanceof ASTNode.StructSpecifier) this._observeWholeStruct(declaration);
          else if (declaration instanceof ASTNode.FunctionDefinition) {
            for (const struct of declaration.protoType.returnType.typeSpecifier.structDeclarations)
              this._observeWholeStruct(struct);
          }
        }
        for (const child of node.children) if (child instanceof TreeNode) observe(child);
      };
      for (const child of children)
        if (child instanceof TreeNode && typeof (child as ASTNode.ExpressionAstNode).type === "string") observe(child);
    }
    return super.defaultCodeGen(children);
  }

  private _observeWholeStruct(struct: ASTNode.StructSpecifier): void {
    const role = this.context.getStructRole([struct]);
    for (const prop of struct.propList) {
      if (role === ShaderStructRole.Attribute) this.context.referenceAttribute(prop.ident);
      else if (role === ShaderStructRole.Varying) this.context.referenceVarying(prop.ident);
      else if (role === ShaderStructRole.Mrt) this.context.referenceMRTProp(prop.ident);
    }
  }

  override visitFunctionHeader(node: ASTNode.FunctionHeader): string {
    if (node.ident.lexeme === "main" && this.context.stageEntry === "main") {
      return `${node.returnType.codeGen(this)} ${this.context.names.allocate("entry-main", "entry_main")}(`;
    }
    return super.visitFunctionHeader(node);
  }

  override visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string {
    const call = node.parent;
    if (
      node.lexeme === "main" &&
      this.context.stageEntry === "main" &&
      call instanceof ASTNode.FunctionCallGeneric &&
      call.fnSymbol instanceof FnSymbol
    ) {
      return this.context.names.allocate("entry-main", "entry_main");
    }
    return super.visitFunctionIdentifier(node);
  }

  override visitFunctionDefinition(fnNode: ASTNode.FunctionDefinition): string {
    const definition = super.visitFunctionDefinition(fnNode);
    if (fnNode.protoType.ident.lexeme !== this.context.stageEntry) return definition;
    const args: string[] = [];
    const parameters: string[] = [];
    for (const parameter of fnNode.protoType.parameterList ?? []) {
      if (!parameter.ident || !parameter.typeInfo) continue;
      const struct = parameter.typeInfo.structDeclarations[0];
      if (struct) {
        const name = this.context.names.allocate(parameter, `input_${parameter.ident.lexeme}`);
        parameters.push(`${this._interfaceTypeName(struct)} ${name} = ${this._transferName(struct, true)}();`);
        args.push(name);
      }
    }
    const name = fnNode.protoType.ident.lexeme;
    const entryName = name === "main" ? this.context.names.allocate("entry-main", "entry_main") : name;
    const call = `${entryName}(${args.join(", ")})`;
    const type = fnNode.protoType.returnType;
    const struct = type.typeSpecifier.structDeclarations[0];
    let statement: string;
    if (struct) {
      statement = `${this._transferName(struct, false)}(${call});`;
    } else if (this.context.stage === EShaderStage.FRAGMENT && type.type === Keyword.VEC4) {
      statement = `${this.fragmentColorOutput()} = ${call};`;
    } else statement = `${call};`;
    const inputs = this._initializeGlobalInputs();
    return `${definition}\nvoid main() {\n${inputs.join("\n")}\n${parameters.join("\n")}\n${statement} }`;
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
        // A missing conditional input selects the no-op; an active declaration selects its own initializer.
        const fallback = { id: nextId + 1, group: owner.group, sourceScope: -1 };
        const name = this.context.names.allocate(`input-initializer:${owner.group}`, `initialize_${variable.ident}`);
        this._inputHelperGroups.set(owner.group, (group = { name, fallback }));
      }
      const target = this._interfaceVariableName(variable.ident, variable.dataType!.structDeclarations);
      this._inputHelperBodies.set(
        variable.astNode!,
        `void ${group.name}() { ${target} = ${this._transferName(struct, true)}(); }`
      );
      calls.add(`${group.name}();`);
    }
    return Array.from(calls);
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
        const previous = this._currentDeclaration;
        if (child instanceof ASTNode.FunctionDefinition) this._currentDeclaration = child;
        this._walkMacroDefineTokens(child.children);
        this._currentDeclaration = previous;
      }
    }
  }

  private _getGlobalSymbol(out: ICodeSegment[]): void {
    const context = this.context;
    // Set iteration includes dependencies discovered while generating earlier declarations.
    for (const sm of context._referencedGlobalSymbols) {
      this._currentDeclaration = sm.astNode;
      const codeGenResult = sm.astNode!.codeGen(this);
      this._currentDeclaration = undefined;
      if (!codeGenResult) continue;
      const text = codeGenResult + (sm.type === ESymbolType.VAR ? ";" : "");
      if (!sm.isInMacroBranch) {
        const segment = {
          text: this._declaration(text, sm.astNode!),
          index: sm.astNode!.location.start.index
        };
        out.push(segment);
        if (sm.astNode instanceof ASTNode.StructSpecifier) this._structCodeSegments.set(sm.astNode, segment);
        if (sm.astNode instanceof ASTNode.VariableDeclaration) this._variableCodeSegments.set(sm.astNode, segment);
      }
    }
    this._getForwardDeclarations(out);
    for (const segment of this._deferredPrototypes.values()) out.push(segment);
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
    const owner = this._declarationOwners.get(definition);
    if (owner) {
      for (const candidate of candidates) {
        const replacement = candidate.astNode;
        const nextOwner = this._declarationOwners.get(replacement);
        if (
          !nextOwner ||
          nextOwner.group !== owner.group ||
          nextOwner.sourceScope <= owner.sourceScope ||
          replacement.location.start.index <= referenceIndex
        )
          continue;
        const prototype = replacement.protoType;
        const anchor = definition.location.start.index;
        const previous = this._deferredPrototypes.get(replacement);
        if (previous && previous.index <= anchor) continue;
        if (
          !this._isContextIndependent(prototype) ||
          this._hasDeclarationContextBarrier(anchor, prototype.location.start.index, false)
        ) {
          this._unsupportedForwardDeclaration(prototype);
        }
        const outer = this._outerMacroDeclarations.find(
          (macro) => macro.location.start.index <= anchor && macro.location.end.index >= definition.location.end.index
        );
        const typeAnchor = outer?.location.start.index ?? anchor;
        this._prepareForwardTypes(prototype.returnType.typeSpecifier.structDeclarations, anchor, typeAnchor);
        for (const parameter of prototype.parameterList ?? []) {
          this._prepareForwardTypes(parameter.typeInfo?.structDeclarations ?? [], anchor, typeAnchor);
        }
        // Selection is determined at the later definition, so the prototype must not replay its guard here.
        this._deferredPrototypes.set(replacement, {
          text: this._declaration(`${prototype.codeGen(this)};`, replacement, false),
          index: typeAnchor
        });
      }
      return;
    }
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
        this._prepareForwardTypes(parameter.typeInfo?.structDeclarations ?? [], anchor, typeAnchor);
      }
      declarations.set(definition, text);
    }
  }

  private _getForwardSignature(prototype: ASTNode.FunctionProtoType): string {
    const parameters: string[] = [];
    for (const parameter of prototype.parameterList ?? []) {
      const declaration = parameter.astNode!;
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
      const candidates = this.context._referencedGlobals[symbol.ident]?.filter(
        (candidate): candidate is VarSymbol => candidate instanceof VarSymbol
      );
      const owner = this._declarationOwners.get(symbol.astNode);
      if (!candidates || (!owner && candidates.includes(symbol))) continue;
      const preceding = candidates.filter(
        (candidate) => candidate.astNode!.location.start.index < node.location.start.index
      );
      if (
        !owner &&
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
        if (candidate.astNode!.location.start.index <= node.location.start.index) continue;
        if (owner) {
          const nextOwner = this._declarationOwners.get(candidate.astNode!);
          if (!nextOwner || nextOwner.group !== owner.group || nextOwner.sourceScope <= owner.sourceScope) continue;
        }
        const declaration = candidate.astNode!;
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
        this._prepareForwardTypes(candidate.dataType!.structDeclarations, anchor);
        this._forwardVariableIndices.set(
          declaration,
          Math.min(this._forwardVariableIndices.get(declaration) ?? Infinity, anchor)
        );
      }
    }
    return this._escapedReference(node) ?? code;
  }

  private _getForwardDeclarations(out: ICodeSegment[]): void {
    type Declaration = ASTNode.StructSpecifier | ASTNode.VariableDeclaration;
    const guarded = new Map<ASTNode.GlobalDeclaration, { index: number; declarations: Declaration[] }>();
    const declarations: [Declaration, number][] = Array.from(this._forwardStructIndices);
    for (const entry of this._forwardVariableIndices) declarations.push(entry);
    const code = (declaration: Declaration) =>
      this._declaration(
        declaration.codeGen(this) + (declaration instanceof ASTNode.VariableDeclaration ? ";" : ""),
        declaration,
        false
      );
    for (const [declaration, index] of declarations) {
      const owner = this._declarationOwners.get(declaration);
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
        if (previous) {
          if (owner) previous.text = this._declaration("", declaration);
          else out.splice(out.indexOf(previous), 1);
        }
        out.push({ text: code(declaration), index });
      } else if (owner) {
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
    const call = node.parent instanceof ASTNode.FunctionIdentifier ? node.parent.parent : undefined;
    if (call instanceof ASTNode.FunctionCallGeneric && call.fnSymbol instanceof FnSymbol) {
      return super.visitTypeSpecifier(node);
    }
    for (const type of node.structDependencies) {
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
      const owner = this._declarationOwners.get(type);
      if (!owner && final.some((symbol) => symbol.astNode === type)) continue;
      const oldMacro = this._outerMacroDeclarations.find(
        (item) =>
          item.location.start.index <= type.location.start.index && item.location.end.index >= type.location.end.index
      );
      this._prepareForwardTypes(
        final
          .filter((symbol) => {
            if (!owner) return true;
            const nextOwner = this._declarationOwners.get(symbol.astNode!);
            return nextOwner?.group === owner.group && nextOwner.sourceScope > owner.sourceScope;
          })
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
            text: this._declaration(text, child),
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.StructSpecifier) {
        if (this._forwardStructIndices.has(child)) {
          const text = this._declaration("", child);
          if (text) out.push({ text, index: child.location.start.index });
          continue;
        }
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
      } else if (child instanceof ASTNode.VariableDeclarationList) {
        const variableDeclarations = child.variableDeclarations;
        for (let i = 0; i < variableDeclarations.length; i++) {
          const variableDeclaration = variableDeclarations[i];
          if (this.context._referencedGlobalMacroASTs.indexOf(variableDeclaration) !== -1) {
            out.push({
              text: this._declaration(
                this._forwardVariableIndices.has(variableDeclaration)
                  ? ""
                  : `${this.getCachedCode(variableDeclaration) ?? ""};`,
                variableDeclaration
              ),
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

  /** Ownership of the declaration currently generating dependencies. @internal */
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
}
