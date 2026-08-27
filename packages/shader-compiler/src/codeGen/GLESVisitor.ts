import type { IShaderInfo } from "@galacean/engine-design";
import type { IPoolElement } from "@galacean/engine-core";
import { BaseToken } from "@galacean/engine-shader-parser/internal";
import { EShaderStage } from "@galacean/engine-shader-parser/internal";
import { Keyword } from "@galacean/engine-shader-parser/internal";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser/internal";
import { NodeChild } from "@galacean/engine-shader-parser/internal";
import { ShaderData } from "@galacean/engine-shader-parser/internal";
import { ESymbolType } from "@galacean/engine-shader-parser/internal";
import { ShaderStructRole } from "@galacean/engine-shader-parser/internal";
import { ParserUtils } from "@galacean/engine-shader-parser/internal";
import type { ShaderClueIR, ShaderCoreInfo, ShaderEntryPointInfo } from "@galacean/engine-shader-parser/internal";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { ICodeSegment } from "./types";
import type { ShaderBackend } from "../ShaderBackend";

/**
 * @internal
 */
export abstract class GLESVisitor extends CodeGenVisitor implements ShaderBackend, IPoolElement {
  private _globalCodeArray: ICodeSegment[] = [];

  /**
   * Clears pass-local output retained by the pooled visitor.
   */
  reset(): void {
    const { _globalCodeArray: globalCodeArray } = this;
    globalCodeArray.length = 0;
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

    return {
      vertex: this._vertexMain(coreInfo.vertexEntry, shaderData, outerGlobalMacroDeclarations),
      fragment: this._fragmentMain(coreInfo.fragmentEntry, shaderData, outerGlobalMacroDeclarations)
    };
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
          out.push({
            text,
            index: sm.astNode.location.start.index
          });
        }
      }
    }
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
        if (this.context._referencedGlobalMacroASTs.indexOf(child) !== -1) {
          out.push({
            text: this.getCachedCode(child) ?? "",
            index: child.location.start.index
          });
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
            text: this.getCachedCode(child) ?? "",
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.VariableDeclarationList) {
        const variableDeclarations = child.variableDeclarations;
        for (let i = 0; i < variableDeclarations.length; i++) {
          const variableDeclaration = variableDeclarations[i];
          if (this.context._referencedGlobalMacroASTs.indexOf(variableDeclaration) !== -1) {
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
