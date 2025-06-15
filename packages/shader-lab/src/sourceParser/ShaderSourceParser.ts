import {
  BlendFactor,
  BlendOperation,
  Color,
  CompareFunction,
  CullMode,
  Logger,
  RenderQueueType,
  RenderStateElementKey,
  StencilOperation
} from "@galacean/engine";
import { IRenderStates, IShaderPassSource, IShaderSource, IStatement, ISubShaderSource } from "@galacean/engine-design";
import { ETokenType, ShaderPosition, ShaderRange, TokenType } from "../common";
import { SymbolTableStack } from "../common/BaseSymbolTable";
import { BaseToken } from "../common/BaseToken";
import { GSErrorName } from "../GSError";
import ContentSymbolTable, { ISymbol } from "./ShaderSourceSymbolTable";
// #if _VERBOSE
import { GSError } from "../GSError";
// #endif
import { BaseLexer } from "../common/BaseLexer";
import { Keyword } from "../common/enums/Keyword";
import { ShaderLabUtils } from "../ShaderLabUtils";
import SourceLexer from "./SourceLexer";

/**
 * @internal
 */
export class ShaderSourceParser {
  static _renderStateConstType = {
    RenderQueueType,
    CompareFunction,
    StencilOperation,
    BlendOperation,
    BlendFactor,
    CullMode
  };

  static _errors: GSError[] = [];

  private static _symbolTableStack: SymbolTableStack<ISymbol, ContentSymbolTable> = new SymbolTableStack();

  static reset() {
    this._errors.length = 0;
    this._symbolTableStack.clear();
    this._pushScope();
  }

  static parse(sourceCode: string): IShaderSource {
    const start = performance.now();

    const lexer = new SourceLexer(sourceCode);
    const shaderSource = <IShaderSource>{
      subShaders: [],
      pendingContents: [],
      renderStates: { constantMap: {}, variableMap: {} }
    };

    lexer.scanLexeme("Shader");
    shaderSource.name = lexer.scanPairedChar('"', '"', false, false);
    lexer.scanLexeme("{");

    this._parseShader(lexer, shaderSource);

    const shaderPendingContents = shaderSource.pendingContents;
    const shaderRenderStates = shaderSource.renderStates;
    for (let i = 0; i < shaderSource.subShaders.length; i++) {
      const subShader = shaderSource.subShaders[i];
      const curSubShaderGlobalStatements = shaderPendingContents.concat(subShader.pendingContents);
      const constMap = { ...shaderRenderStates.constantMap, ...subShader.renderStates.constantMap };
      const variableMap = { ...shaderRenderStates.variableMap, ...subShader.renderStates.variableMap };

      for (let i = 0; i < subShader.passes.length; i++) {
        const pass = subShader.passes[i];
        Object.assign(pass.renderStates.constantMap, constMap);
        Object.assign(pass.renderStates.variableMap, variableMap);
        if (pass.isUsePass) continue;
        const passGlobalStatements = curSubShaderGlobalStatements.concat(pass.pendingContents);
        pass.contents = passGlobalStatements.map((item) => item.content).join("\n");
      }
    }

    Logger.info(`[Source compilation] cost time ${performance.now() - start}ms`);

    return shaderSource;
  }

  private static _lookupVariable(variableName: string, type: TokenType): ISymbol | undefined {
    const stack = ShaderSourceParser._symbolTableStack.stack;
    for (let length = stack.length, i = length - 1; i >= 0; i--) {
      const symbolTable = stack[i];
      const ret = symbolTable.lookup(variableName, type);
      if (ret) return ret;
    }
  }

  private static _parseShader(lexer: SourceLexer, outShaderSource: IShaderSource): void {
    let braceLevel = 1;

    lexer.skipCommentsAndSpace();
    let start = lexer.getCurPosition();

    const { pendingContents } = outShaderSource;
    while (true) {
      const token = lexer.scanToken();
      const { lexeme } = token;
      switch (token.type) {
        case Keyword.GSSubShader:
          this._addPendingContents(lexer, start, lexeme.length, pendingContents);
          const subShader = this._parseSubShader(lexer);
          outShaderSource.subShaders.push(subShader);
          start = lexer.getCurPosition();
          break;
        case Keyword.GSEditorProperties:
        case Keyword.GSEditorMacros:
        case Keyword.GSEditor:
          this._addPendingContents(lexer, start, lexeme.length, pendingContents);
          lexer.scanPairedChar("{", "}", true, false);
          start = lexer.getCurPosition();
          break;
        case Keyword.LeftBrace:
          ++braceLevel;
          break;
        case Keyword.RightBrace:
          if (--braceLevel === 0) {
            this._addPendingContents(lexer, start, lexeme.length, pendingContents);
            this._popScope();
            return;
          }
          break;
      }
      start = this._parseRenderState(token, lexer, start, pendingContents, outShaderSource.renderStates);
    }
  }

  private static _parseRenderStateDeclarationOrAssignment(
    renderStates: IRenderStates,
    stateToken: BaseToken,
    lexer: SourceLexer
  ) {
    const token = lexer.scanToken();
    if (token.type === ETokenType.ID) {
      // Declaration
      lexer.scanLexeme("{");
      const renderState = this._parseRenderStatePropList(stateToken.lexeme, lexer);
      this._symbolTableStack.insert({ ident: token.lexeme, type: stateToken.type, value: renderState });
    } else if (token.lexeme === "=") {
      // Assignment
      const variable = lexer.scanToken();

      lexer.scanLexeme(";");
      const sm = ShaderSourceParser._lookupVariable(variable.lexeme, stateToken.type);
      if (!sm?.value) {
        this._createCompileError(
          lexer,
          `Invalid "${stateToken.lexeme}" variable: ${variable.lexeme}`,
          variable.location
        );
        // #if _VERBOSE
        return;
        // #endif
      }
      const renderState = sm.value as IRenderStates;
      Object.assign(renderStates.constantMap, renderState.constantMap);
      Object.assign(renderStates.variableMap, renderState.variableMap);
      return;
    }
  }

  private static _parseVariableDeclaration(type: number, scanner: SourceLexer) {
    const token = scanner.scanToken();
    scanner.scanLexeme(";");
    this._symbolTableStack.insert({ type: type, ident: token.lexeme });
  }

  private static _pushScope() {
    const symbolTable = new ContentSymbolTable();
    this._symbolTableStack.pushScope(symbolTable);
  }

  private static _popScope() {
    this._symbolTableStack.popScope();
  }

  private static _parseRenderStatePropList(state: string, lexer: SourceLexer): IRenderStates {
    const renderStates = <IRenderStates>{ constantMap: {}, variableMap: {} };
    while (lexer.getCurChar() !== "}") {
      this._parseRenderStateProperties(state, lexer, renderStates);
      lexer.skipCommentsAndSpace();
    }
    lexer._advance();
    return renderStates;
  }

  private static _createCompileError(
    lexer: SourceLexer,
    message: string,
    location?: ShaderPosition | ShaderRange
  ): void {
    const error = lexer.createCompileError(message, location);
    // #if _VERBOSE
    this._errors.push(<GSError>error);
    // #endif
  }

  private static _parseRenderStateProperties(stateLexeme: string, lexer: SourceLexer, out: IRenderStates): void {
    const propertyToken = lexer.scanToken();
    const propertyLexeme = propertyToken.lexeme;
    let stateElementKey = propertyLexeme;
    if (stateLexeme === "BlendState" && propertyLexeme !== "BlendColor" && propertyLexeme !== "AlphaToCoverage") {
      let keyIndex = 0;
      const scannedLexeme = lexer.scanTwoExpectedLexemes("[", "=");
      if (scannedLexeme === "[") {
        keyIndex = lexer.scanNumber();
        lexer.scanLexeme("]");
        lexer.scanLexeme("=");
      } else if (scannedLexeme !== "=") {
        this._createCompileError(lexer, `Invalid syntax, expect '[' or '=', but got unexpected token`);
        // #if _VERBOSE
        lexer.scanToCharacter(";");
        return;
        // #endif
      }
      stateElementKey += keyIndex;
    } else {
      lexer.scanLexeme("=");
    }

    const renderStateElementKey = RenderStateElementKey[stateLexeme + stateElementKey];
    if (renderStateElementKey === undefined) {
      this._createCompileError(lexer, `Invalid render state property ${propertyLexeme}`);
      // #if _VERBOSE
      lexer.scanToCharacter(";");
      return;
      // #endif
    }

    lexer.skipCommentsAndSpace();
    let propertyValue: number | string | boolean | Color;

    const curCharCode = lexer.getCurCharCode();
    if (BaseLexer.isDigit(curCharCode) || curCharCode === 46) {
      // Digit or '.'
      propertyValue = lexer.scanNumber();
    } else {
      const valueToken = lexer.scanToken();
      const valueTokenType = valueToken.type;

      if (valueTokenType === Keyword.True) {
        propertyValue = true;
      } else if (valueTokenType === Keyword.False) {
        propertyValue = false;
      } else if (valueTokenType === Keyword.GSColor) {
        propertyValue = lexer.scanColor();
      } else if (lexer.getCurChar() === ".") {
        lexer._advance();
        const constValueToken = lexer.scanToken();
        propertyValue = ShaderSourceParser._renderStateConstType[valueToken.lexeme]?.[constValueToken.lexeme];
        if (propertyValue == undefined) {
          this._createCompileError(
            lexer,
            `Invalid engine constant: ${valueToken.lexeme}.${constValueToken.lexeme}`,
            constValueToken.location
          );
          // #if _VERBOSE
          lexer.scanToCharacter(";");
          return;
          // #endif
        }
      } else {
        propertyValue = valueToken.lexeme;
        const lookupType = ShaderSourceParser._getRenderStatePropertyType(propertyLexeme);
        if (!ShaderSourceParser._lookupVariable(valueToken.lexeme, lookupType)) {
          this._createCompileError(lexer, `Invalid ${stateLexeme} variable: ${valueToken.lexeme}`, valueToken.location);
          // #if _VERBOSE
          lexer.scanToCharacter(";");
          return;
          // #endif
        }
      }
    }
    lexer.scanLexeme(";");
    if (typeof propertyValue === "string") {
      out.variableMap[renderStateElementKey] = propertyValue;
    } else {
      out.constantMap[renderStateElementKey] = propertyValue;
    }
  }

  private static _parseRenderQueueDeclarationOrAssignment(renderStates: IRenderStates, scanner: SourceLexer) {
    const token = scanner.scanToken();
    if (token.type === ETokenType.ID) {
      // declaration.
      scanner.scanLexeme(";");
      this._symbolTableStack.insert({ ident: token.lexeme, type: Keyword.GSRenderQueueType });
      return;
    }

    if (token.lexeme !== "=") {
      this._createCompileError(
        scanner,
        `Invalid syntax, expect character '=', but got ${token.lexeme}`,
        token.location
      );
      // #if _VERBOSE
      return;
      // #endif
    }
    const word = scanner.scanToken();
    scanner.scanLexeme(";");
    const value = ShaderSourceParser._renderStateConstType.RenderQueueType[word.lexeme];
    const key = RenderStateElementKey.RenderQueueType;
    if (value == undefined) {
      const sm = ShaderSourceParser._lookupVariable(word.lexeme, Keyword.GSRenderQueueType);
      if (!sm) {
        this._createCompileError(scanner, `Invalid RenderQueueType variable: ${word.lexeme}`, word.location);
        // #if _VERBOSE
        return;
        // #endif
      }
      renderStates.variableMap[key] = word.lexeme;
    } else {
      renderStates.constantMap[key] = value;
    }
  }

  private static _addPendingContents(
    lexer: SourceLexer,
    start: ShaderPosition,
    backOffset: number,
    outPendingContents: IStatement[]
  ) {
    const endIndex = lexer.current - backOffset;
    if (endIndex > start.index) {
      outPendingContents.push({
        range: { start, end: { ...lexer.getCurPosition(), index: endIndex - 1 } },
        content: lexer.source.substring(start.index, endIndex - 1)
      });
    }
  }

  private static _parseSubShader(scanner: SourceLexer): ISubShaderSource {
    this._pushScope();
    const ret = {
      passes: [],
      pendingContents: [],
      renderStates: { constantMap: {}, variableMap: {} },
      tags: {}
    } as ISubShaderSource;
    let braceLevel = 1;
    ret.name = scanner.scanPairedChar('"', '"', false, false);
    scanner.scanLexeme("{");

    scanner.skipCommentsAndSpace();
    let start = scanner.getCurPosition();

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case Keyword.GSPass:
          this._addPendingContents(scanner, start, word.lexeme.length, ret.pendingContents);
          const pass = this._parsePass(scanner);
          ret.passes.push(pass);
          start = scanner.getCurPosition();
          break;
        case Keyword.GSUsePass:
          this._addPendingContents(scanner, start, word.lexeme.length, ret.pendingContents);
          const name = scanner.scanPairedChar('"', '"', false, false);
          // @ts-ignore
          ret.passes.push({ name, isUsePass: true, renderStates: { constantMap: {}, variableMap: {} }, tags: {} });
          start = scanner.getCurPosition();
          break;
        case Keyword.LeftBrace:
          braceLevel += 1;
          break;
        case Keyword.RightBrace:
          braceLevel -= 1;
          if (braceLevel === 0) {
            this._addPendingContents(scanner, start, word.lexeme.length, ret.pendingContents);
            this._popScope();
            return ret;
          }
          break;
      }
      start = this._parseRenderStateAndTags(word, scanner, start, ret.pendingContents, ret.renderStates, ret.tags);
    }
  }

  private static _parseTags(tags: Record<string, number | string | boolean>, scanner: SourceLexer) {
    scanner.scanLexeme("{");
    while (true) {
      const ident = scanner.scanToken();
      scanner.scanLexeme("=");
      const value = scanner.scanPairedChar('"', '"', false, false);
      scanner.skipCommentsAndSpace();

      tags[ident.lexeme] = value;

      if (scanner.peek(1) === "}") {
        scanner._advance();
        return;
      }
      scanner.scanLexeme(",");
    }
  }

  private static _parsePass(scanner: SourceLexer): IShaderPassSource {
    this._pushScope();
    const ret = <IShaderPassSource>{
      pendingContents: [],
      renderStates: { constantMap: {}, variableMap: {} },
      tags: {}
    };
    ret.name = scanner.scanPairedChar('"', '"', false, false);
    scanner.scanLexeme("{");
    let braceLevel = 1;

    scanner.skipCommentsAndSpace();
    let start = scanner.getCurPosition();

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case Keyword.GSVertexShader:
        case Keyword.GSFragmentShader:
          this._addPendingContents(scanner, start, word.lexeme.length, ret.pendingContents);
          scanner.scanLexeme("=");
          const entry = scanner.scanToken();
          if (ret[word.lexeme]) {
            const error = ShaderLabUtils.createGSError(
              "reassign main entry",
              GSErrorName.CompilationError,
              scanner.source,
              scanner.getCurPosition()
            );
            // #if _VERBOSE
            Logger.error(error.toString());
            throw error;
            // #endif
          }
          const key = word.type === Keyword.GSVertexShader ? "vertexEntry" : "fragmentEntry";
          ret[key] = entry.lexeme;
          scanner.scanLexeme(";");
          start = scanner.getCurPosition();
          break;
        case Keyword.LeftBrace:
          braceLevel += 1;
          break;
        case Keyword.RightBrace:
          braceLevel -= 1;
          if (braceLevel === 0) {
            this._addPendingContents(scanner, start, word.lexeme.length, ret.pendingContents);
            this._popScope();
            return ret;
          }
          break;
      }
      start = this._parseRenderStateAndTags(word, scanner, start, ret.pendingContents, ret.renderStates, ret.tags);
    }
  }

  private static _parseRenderStateAndTags(
    token: BaseToken<number>,
    lexer: SourceLexer,
    start: ShaderPosition,
    outGlobalContents: IStatement[],
    outRenderStates: IRenderStates,
    outTags: Record<string, number | string | boolean>
  ): ShaderPosition {
    start = this._parseRenderState(token, lexer, start, outGlobalContents, outRenderStates);
    switch (token.type) {
      case Keyword.GSTags:
        this._addPendingContents(lexer, start, token.lexeme.length, outGlobalContents);
        this._parseTags(outTags, lexer);
        start = lexer.getCurPosition();
        break;
    }
    return start;
  }

  private static _parseRenderState(
    token: BaseToken<number>,
    lexer: SourceLexer,
    start: ShaderPosition,
    outGlobalContents: IStatement[],
    outRenderStates: IRenderStates
  ): ShaderPosition {
    switch (token.type) {
      case Keyword.GSBlendState:
      case Keyword.GSDepthState:
      case Keyword.GSRasterState:
      case Keyword.GSStencilState:
        this._addPendingContents(lexer, start, token.lexeme.length, outGlobalContents);
        this._parseRenderStateDeclarationOrAssignment(outRenderStates, token, lexer);
        start = lexer.getCurPosition();
        break;
      case Keyword.GSBlendFactor:
      case Keyword.GSBlendOperation:
      case Keyword.GSBool:
      case Keyword.GSNumber:
      case Keyword.GSColor:
      case Keyword.GSCompareFunction:
      case Keyword.GSStencilOperation:
      case Keyword.GSCullMode:
        this._addPendingContents(lexer, start, token.lexeme.length, outGlobalContents);
        this._parseVariableDeclaration(token.type, lexer);
        start = lexer.getCurPosition();
        break;
      case Keyword.GSRenderQueueType:
        this._addPendingContents(lexer, start, token.lexeme.length, outGlobalContents);
        this._parseRenderQueueDeclarationOrAssignment(outRenderStates, lexer);
        start = lexer.getCurPosition();
        break;
    }
    return start;
  }

  private static _getRenderStatePropertyType(propertyName: string): Keyword {
    switch (propertyName) {
      case "WriteEnabled":
      case "Enabled":
      case "AlphaToCoverage":
        return Keyword.GSBool;
      case "SourceColorBlendFactor":
      case "DestinationColorBlendFactor":
      case "SourceAlphaBlendFactor":
      case "DestinationAlphaBlendFactor":
        return Keyword.GSBlendFactor;
      case "AlphaBlendOperation":
      case "ColorBlendOperation":
        return Keyword.GSBlendOperation;
      case "ColorWriteMask":
      case "DepthBias":
      case "SlopeScaledDepthBias":
      case "ReferenceValue":
      case "Mask":
      case "WriteMask":
        return Keyword.GSNumber;
      case "CullMode":
        return Keyword.GSCullMode;
      case "BlendColor":
        return Keyword.GSColor;
      case "CompareFunction":
      case "CompareFunctionFront":
      case "CompareFunctionBack":
        return Keyword.GSCompareFunction;
      case "PassOperationFront":
      case "PassOperationBack":
      case "FailOperationFront":
      case "FailOperationBack":
      case "ZFailOperationFront":
      case "ZFailOperationBack":
        return Keyword.GSStencilOperation;
    }
  }
}
