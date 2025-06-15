import {
  BlendFactor,
  BlendOperation,
  Color,
  CompareFunction,
  CullMode,
  Logger,
  RenderQueueType,
  RenderStateDataKey,
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
  static _engineType = { RenderQueueType, CompareFunction, StencilOperation, BlendOperation, BlendFactor, CullMode };

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

    lexer.scanText("Shader");
    shaderSource.name = lexer.scanPairedChar('"', '"', false, false);
    lexer.scanText("{");

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

  /**
   * Get the appropriate keyword type for a render state property based on its name
   * @param propertyName - The name of the render state property
   * @returns The corresponding Keyword type for symbol lookup
   */
  private static _getRenderStatePropertyType(propertyName: string): Keyword {
    switch (propertyName) {
      case "WriteEnabled":
      case "Enabled":
        return Keyword.GSBool;
      case "SourceColorBlendFactor":
      case "DestinationColorBlendFactor":
      case "SourceAlphaBlendFactor":
      case "DestinationAlphaBlendFactor":
        return Keyword.GSBlendFactor;
      case "CullMode":
        return Keyword.GSCullMode;
      default:
        return undefined; // For properties that don't have a specific type mapping
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
      lexer.scanText("{");
      const renderState = this._parseRenderStatePropList(stateToken.lexeme, lexer);
      this._symbolTableStack.insert({ ident: token.lexeme, type: stateToken.type, value: renderState });
    } else if (token.lexeme === "=") {
      // Assignment
      const variable = lexer.scanToken();

      lexer.scanText(";");
      const sm = ShaderSourceParser._lookupVariable(variable.lexeme, stateToken.type);
      if (!sm?.value) {
        const error = ShaderLabUtils.createGSError(
          `Invalid "${stateToken.lexeme}" variable: ${variable.lexeme}`,
          GSErrorName.CompilationError,
          lexer.source,
          variable.location
        );
        // #if _VERBOSE
        this._errors.push(<GSError>error);
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
    scanner.scanText(";");
    this._symbolTableStack.insert({ type: type, ident: token.lexeme });
  }

  private static _pushScope() {
    const symbolTable = new ContentSymbolTable();
    this._symbolTableStack.pushScope(symbolTable);
  }

  private static _popScope() {
    this._symbolTableStack.popScope();
  }

  private static _parseRenderStatePropList(state: string, scanner: SourceLexer): IRenderStates {
    const ret: IRenderStates = { constantMap: {}, variableMap: {} };
    while (scanner.getCurChar() !== "}") {
      this._parseRenderStateProperties(ret, state, scanner);
      scanner.skipCommentsAndSpace();
    }
    scanner._advance();
    return ret;
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

  private static _parseRenderStateProperties(out: IRenderStates, stateLexeme: string, lexer: SourceLexer): void {
    const propertyToken = lexer.scanToken();
    const propertyLexeme = propertyToken.lexeme;
    let renderStateKey = propertyLexeme;

    const nextToken = lexer.scanToken();
    if (stateLexeme === "BlendState" && propertyLexeme !== "BlendColor" && propertyLexeme !== "AlphaToCoverage") {
      let keyIndex = 0;
      if (nextToken.type === Keyword.LeftBracket) {
        keyIndex = lexer.scanNumber();
        lexer.scanText("]");
        lexer.scanText("=");
      } else if (nextToken.type !== Keyword.Equal) {
        this._createCompileError(lexer, `Invalid syntax, expect character '=', but got ${nextToken.lexeme}`);
        // #if _VERBOSE
        lexer.scanToCharacter(";");
        return;
        // #endif
      }
      renderStateKey += keyIndex;
    }

    const renderStateElementKey = RenderStateDataKey[stateLexeme + renderStateKey];
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
      const variableToken = lexer.scanToken();
      const valueType = variableToken.type;

      if (valueType === Keyword.True) {
        propertyValue = true;
      } else if (valueType === Keyword.False) {
        propertyValue = false;
      } else if (valueType === Keyword.GSColor) {
        lexer.scanText("(");
        const args: number[] = [];
        while (true) {
          args.push(lexer.scanNumber());
          lexer.skipCommentsAndSpace();
          const peek = lexer.peek(1);
          if (peek === ")") {
            lexer._advance();
            break;
          }
          lexer.scanText(",");
        }
        propertyValue = new Color(...args);
      } else if (lexer.getCurChar() === ".") {
        lexer._advance();
        const engineTypeProp = lexer.scanToken();
        propertyValue = ShaderSourceParser._engineType[variableToken.lexeme]?.[engineTypeProp.lexeme];
        if (propertyValue == undefined) {
          this._createCompileError(
            lexer,
            `Invalid engine constant: ${variableToken.lexeme}.${engineTypeProp.lexeme}`,
            engineTypeProp.location
          );
          // #if _VERBOSE
          lexer.scanToCharacter(";");
          return;
          // #endif
        }
      } else {
        propertyValue = variableToken.lexeme;
        const lookupType = ShaderSourceParser._getRenderStatePropertyType(propertyLexeme);
        if (!ShaderSourceParser._lookupVariable(variableToken.lexeme, lookupType)) {
          this._createCompileError(
            lexer,
            `Invalid ${stateLexeme} variable: ${variableToken.lexeme}`,
            variableToken.location
          );
          // #if _VERBOSE
          return;
          // #endif
        }
      }
    }
    lexer.scanText(";");
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
      scanner.scanText(";");
      this._symbolTableStack.insert({ ident: token.lexeme, type: Keyword.GSRenderQueueType });
      return;
    }

    if (token.lexeme !== "=") {
      const error = ShaderLabUtils.createGSError(
        `Invalid syntax.`,
        GSErrorName.CompilationError,
        scanner.source,
        token.location
      );
      // #if _VERBOSE
      this._errors.push(<GSError>error);
      return;
      // #endif
    }
    const word = scanner.scanToken();
    scanner.scanText(";");
    const value = ShaderSourceParser._engineType.RenderQueueType[word.lexeme];
    const key = RenderStateDataKey.RenderQueueType;
    if (value == undefined) {
      const sm = ShaderSourceParser._lookupVariable(word.lexeme, Keyword.GSRenderQueueType);
      if (!sm) {
        const error = ShaderLabUtils.createGSError(
          `Invalid RenderQueueType variable: ${word.lexeme}`,
          GSErrorName.CompilationError,
          scanner.source,
          word.location
        );
        // #if _VERBOSE
        this._errors.push(<GSError>error);
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
    scanner.scanText("{");

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
    scanner.scanText("{");
    while (true) {
      const ident = scanner.scanToken();
      scanner.scanText("=");
      const value = scanner.scanPairedChar('"', '"', false, false);
      scanner.skipCommentsAndSpace();

      tags[ident.lexeme] = value;

      if (scanner.peek(1) === "}") {
        scanner._advance();
        return;
      }
      scanner.scanText(",");
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
    scanner.scanText("{");
    let braceLevel = 1;

    scanner.skipCommentsAndSpace();
    let start = scanner.getCurPosition();

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case Keyword.GSVertexShader:
        case Keyword.GSFragmentShader:
          this._addPendingContents(scanner, start, word.lexeme.length, ret.pendingContents);
          scanner.scanText("=");
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
          scanner.scanText(";");
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
}
