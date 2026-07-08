import type { IShaderInfo } from "@galacean/engine-design";
import { BaseToken } from "@galacean/engine-shader-parser";
import { EShaderStage } from "@galacean/engine-shader-parser";
import { Keyword } from "@galacean/engine-shader-parser";
import { ASTNode, TreeNode } from "@galacean/engine-shader-parser";
import { NodeChild } from "@galacean/engine-shader-parser";
import { ShaderData } from "@galacean/engine-shader-parser";
import { ESymbolType, FnSymbol, SymbolInfo } from "@galacean/engine-shader-parser";
import { ShaderCompilerUtils, ShaderIOAnalyzer } from "@galacean/engine-shader-parser";
import { CodeGenVisitor } from "./CodeGenVisitor";
import { ICodeSegment } from "./types";
import { VisitorContext } from "./VisitorContext";

/**
 * @internal
 */
export abstract class GLESVisitor extends CodeGenVisitor {
  private _globalCodeArray: ICodeSegment[] = [];
  // Entry names already warned about in the current compile — cleared in `visitShaderProgram`
  // so a missing entry surfaces once per compile, not once per stage.
  private _missingEntryWarned = new Set<string>();
  private static _lookupSymbol: SymbolInfo = new SymbolInfo("", null);
  private static _serializedGlobalKey = new Set();

  reset(): void {
    const { _globalCodeArray: globalCodeArray } = this;
    globalCodeArray.length = 0;
    GLESVisitor._serializedGlobalKey.clear();
  }

  getOtherGlobal(data: ShaderData, out: ICodeSegment[]): void {
    for (const precision of data.globalPrecisions) {
      out.push({ text: precision.codeGen(this), index: precision.location.start.index });
    }
  }

  visitShaderProgram(node: ASTNode.GLShaderProgram, vertexEntry: string, fragmentEntry: string): IShaderInfo {
    VisitorContext.reset();
    this.reset();
    this._missingEntryWarned.clear();

    const shaderData = node.shaderData;
    const context = VisitorContext.context;
    context._passSymbolTable = shaderData.symbolTable;

    const outerGlobalMacroDeclarations = shaderData.getOuterGlobalMacroDeclarations();

    // IO structs + roles come from the parser's analyzer; codegen consumes them and ignores its diagnostics.
    const { io } = ShaderIOAnalyzer.analyze(
      shaderData,
      vertexEntry,
      fragmentEntry,
      ShaderCompilerUtils.processingPassText
    );
    context.attributeStructs.push(...io.attributeStructs);
    context.attributeList.push(...io.attributeList);
    context.varyingStructs.push(...io.varyingStructs);
    context.varyingList.push(...io.varyingList);
    context.mrtStructs.push(...io.mrtStructs);
    context.mrtList.push(...io.mrtList);
    for (const varName in io.vertexStructVarMap) {
      context.registerStructVar(EShaderStage.VERTEX, varName, io.vertexStructVarMap[varName]);
    }
    for (const varName in io.fragmentStructVarMap) {
      context.registerStructVar(EShaderStage.FRAGMENT, varName, io.fragmentStructVarMap[varName]);
    }

    return {
      vertex: this._vertexMain(vertexEntry, shaderData, outerGlobalMacroDeclarations),
      fragment: this._fragmentMain(fragmentEntry, shaderData, outerGlobalMacroDeclarations)
    };
  }

  private _vertexMain(
    entry: string,
    data: ShaderData,
    outerGlobalMacroDeclarations: ASTNode.GlobalDeclaration[]
  ): string {
    const context = VisitorContext.context;
    context.stage = EShaderStage.VERTEX;
    context.stageEntry = entry;

    const lookupSymbol = GLESVisitor._lookupSymbol;
    const symbolTable = data.symbolTable;
    lookupSymbol.set(entry, ESymbolType.FN);
    const fnSymbols = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
    // Entry-not-found is the analyzer's `EntryNotFound` diagnostic — codegen doesn't re-validate;
    // it degrades to an empty stage source (invalid GLSL) rather than throwing, keeping validator
    // and emitter concerns separated. Deduped so a missing entry warns once per compile.
    if (!fnSymbols.length) return this._softMissEntry(entry, false);

    // attribute/varying structs were collected in visitShaderProgram (ShaderIOAnalyzer).

    // Pre-walk global `#define` values so referenced struct properties emit `attribute`/`varying` declarations.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroDeclarations);

    const globalCodeArray = this._globalCodeArray;
    VisitorContext.context.referenceGlobal(entry, ESymbolType.FN);

    this._getGlobalSymbol(globalCodeArray);
    this._getCustomStruct(context.attributeStructs, globalCodeArray);
    this._getCustomStruct(context.varyingStructs, globalCodeArray);
    this._getGlobalMacroDeclarations(outerGlobalMacroDeclarations, globalCodeArray);
    this.getOtherGlobal(data, globalCodeArray);

    const globalCode = globalCodeArray
      .sort((a, b) => a.index - b.index)
      .map((item) => item.text)
      .join("\n");

    VisitorContext.context.reset(false);
    this.reset();

    return globalCode;
  }

  private _fragmentMain(
    entry: string,
    data: ShaderData,
    outerGlobalMacroStatements: ASTNode.GlobalDeclaration[]
  ): string {
    const context = VisitorContext.context;
    context.stage = EShaderStage.FRAGMENT;
    context.stageEntry = entry;

    const lookupSymbol = GLESVisitor._lookupSymbol;
    const { symbolTable } = data;
    lookupSymbol.set(entry, ESymbolType.FN);
    const fnSymbols = <FnSymbol[]>symbolTable.getSymbols(lookupSymbol, true, []);
    // See vertex counterpart — analyzer's `EntryNotFound` covers the user-facing error;
    // codegen soft-returns to keep the pipeline shape (`{ vertex, fragment }`) intact.
    if (!fnSymbols?.length) return this._softMissEntry(entry, true);

    // MRT structs were collected in visitShaderProgram; here only mark the fragment return statements.
    fnSymbols.forEach((fnSymbol) => {
      const { returnStatement } = fnSymbol.astNode;
      if (returnStatement) {
        returnStatement.isFragReturnStatement = true;
      }
    });

    // Both stage struct-var maps are already populated in `visitShaderProgram`; just
    // pre-walk macro refs so struct codegen sees the references.
    this._preRegisterGlobalMacroRefs(outerGlobalMacroStatements);

    const globalCodeArray = this._globalCodeArray;
    VisitorContext.context.referenceGlobal(entry, ESymbolType.FN);

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

  /**
   * Soft path for a missing entry function: reset the per-stage visitor state (matching
   * the throw-avoided branch's cleanup) and return an empty stage source with a
   * deduped `console.warn`. Analyzer's `EntryNotFound` remains the source of truth
   * for the user-facing error — this only keeps codegen from crashing.
   * `fullReset` mirrors the fragment path (final pass tear-down); vertex uses `reset(false)`.
   */
  private _softMissEntry(entry: string, fullReset: boolean): string {
    if (!this._missingEntryWarned.has(entry)) {
      this._missingEntryWarned.add(entry);
      console.warn(`Shader entry function '${entry}' not found — stage source will be empty.`);
    }
    VisitorContext.context.reset(fullReset);
    this.reset();
    return "";
  }

  /**
   * Pre-walk `#define` values in global macro declarations and register any
   * `structVar.prop` member accesses as referenced struct props. This must run before
   * struct codegen emits the declaration lists (`attribute …`, `varying …`, `MRT …`),
   * otherwise properties used only from macros would be missing from the output.
   */
  private _preRegisterGlobalMacroRefs(macros: ASTNode.GlobalDeclaration[]): void {
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

  private _getGlobalSymbol(out: ICodeSegment[]): void {
    const context = VisitorContext.context;
    const { _referencedGlobals } = context;
    const lastLength = Object.keys(_referencedGlobals).length;
    if (lastLength === 0) return;

    for (const ident in _referencedGlobals) {
      if (GLESVisitor._serializedGlobalKey.has(ident)) continue;
      GLESVisitor._serializedGlobalKey.add(ident);

      const symbols = _referencedGlobals[ident];
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

    if (Object.keys(_referencedGlobals).length !== lastLength) {
      this._getGlobalSymbol(out);
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

  private _getGlobalMacroDeclarations(macros: ASTNode.GlobalDeclaration[], out: ICodeSegment[]): void {
    const context = VisitorContext.context;
    const referencedGlobals = context._referencedGlobals;
    const referencedGlobalMacroASTs = context._referencedGlobalMacroASTs;
    referencedGlobalMacroASTs.length = 0;

    for (const symbols of Object.values(referencedGlobals)) {
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
        let result: ICodeSegment[] = [];
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
        if (VisitorContext.context._referencedGlobalMacroASTs.indexOf(child) !== -1) {
          out.push({
            text: child.getCache(), // code has generated in `_getGlobalSymbol`
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.StructSpecifier) {
        const context = VisitorContext.context;
        const stage = context.stage;
        if (
          VisitorContext.context._referencedGlobalMacroASTs.indexOf(child) !== -1 ||
          (stage === EShaderStage.VERTEX
            ? context.isAttributeStruct(child.ident?.lexeme) || context.isVaryingStruct(child.ident?.lexeme)
            : context.isVaryingStruct(child.ident?.lexeme) || context.isMRTStruct(child.ident?.lexeme))
        ) {
          out.push({
            text: child.getCache(), // code has generated in `_getGlobalSymbol` or `_getCustomStruct`
            index: child.location.start.index
          });
        }
      } else if (child instanceof ASTNode.VariableDeclarationList) {
        const variableDeclarations = child.variableDeclarations;
        for (let i = 0; i < variableDeclarations.length; i++) {
          const variableDeclaration = variableDeclarations[i];
          if (VisitorContext.context._referencedGlobalMacroASTs.indexOf(variableDeclaration) !== -1) {
            out.push({
              text: variableDeclaration.getCache() + ";", // code has generated in `_getGlobalSymbol`
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
