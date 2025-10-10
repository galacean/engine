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
import { ETokenType, ShaderPosition, ShaderRange } from "../common";
import { BaseToken } from "../common/BaseToken";
import { SymbolTableStack } from "../common/SymbolTableStack";
import { GSErrorName } from "../GSError";
// #if _VERBOSE
import { GSError } from "../GSError";
// #endif
import { BaseLexer } from "../common/BaseLexer";
import { Keyword } from "../common/enums/Keyword";
import { SymbolTable } from "../common/SymbolTable";
import { ShaderLabUtils } from "../ShaderLabUtils";
import { ShaderSourceFactory } from "./ShaderSourceFactory";
import { ShaderSourceSymbol } from "./ShaderSourceSymbol";
import SourceLexer from "./SourceLexer";

/**
 * @internal
 */
export class ShaderSourceParser {
  static readonly errors = new Array<GSError>();

  private static _renderStateConstMap = <Record<string, Record<string, number | string | boolean>>>{
    RenderQueueType,
    CompareFunction,
    StencilOperation,
    BlendOperation,
    BlendFactor,
    CullMode
  };
  private static _symbolTableStack = new SymbolTableStack<ShaderSourceSymbol, SymbolTable<ShaderSourceSymbol>>();
  private static _lexer = new SourceLexer();
  private static _lookupSymbol = new ShaderSourceSymbol("", null);

  static parse(sourceCode: string): IShaderSource {
    const startTime = performance.now();

    // Clear previous data
    this.errors.length = 0;
    this._symbolTableStack.clear();
    this._pushScope();

    const lexer = this._lexer;
    lexer.setSource(sourceCode);

    const shaderSource = this._parseShader(lexer);

    const shaderPendingContents = shaderSource.pendingContents;
    const shaderRenderStates = shaderSource.renderStates;
    for (let i = 0, n = shaderSource.subShaders.length; i < n; i++) {
      const subShader = shaderSource.subShaders[i];
      const curSubShaderGlobalStatements = shaderPendingContents.concat(subShader.pendingContents);
      // Merge Shader and SubShader render states, ensuring SubShader overrides Shader
      const mergedStates = {
        constantMap: { ...shaderRenderStates.constantMap },
        variableMap: { ...shaderRenderStates.variableMap }
      };
      this._mergeRenderStates(mergedStates, subShader.renderStates);

      for (let j = 0, m = subShader.passes.length; j < m; j++) {
        const pass = subShader.passes[j];
        // Apply inheritance: Pass-level states override inherited states
        // Create a copy for each pass to avoid shared state
        const passStates = {
          constantMap: { ...mergedStates.constantMap },
          variableMap: { ...mergedStates.variableMap }
        };
        this._mergeRenderStates(passStates, pass.renderStates);
        pass.renderStates.constantMap = passStates.constantMap;
        pass.renderStates.variableMap = passStates.variableMap;

        if (pass.isUsePass) continue;
        const passGlobalStatements = curSubShaderGlobalStatements.concat(pass.pendingContents);
        pass.contents = passGlobalStatements.map((item) => item.content).join("\n");
      }
    }

    Logger.info(`[Task - Source compilation] cost time ${performance.now() - startTime}ms`);
    return shaderSource;
  }

  private static _parseShader(lexer: SourceLexer): IShaderSource {
    // Parse shader header
    lexer.scanLexeme("Shader");
    const name = lexer.scanPairedChar('"', '"', false, false);
    const shaderSource = ShaderSourceFactory.createShaderSource(name);
    lexer.scanLexeme("{");

    let braceLevel = 1;
    lexer.skipCommentsAndSpace();
    let start = lexer.getShaderPosition(0);

    const { pendingContents } = shaderSource;
    while (true) {
      const token = lexer.scanToken();
      switch (token.type) {
        case Keyword.GSSubShader:
          this._addPendingContents(start, token.lexeme.length, pendingContents);
          const subShader = this._parseSubShader();
          shaderSource.subShaders.push(subShader);
          start = lexer.getShaderPosition(0);
          break;
        case Keyword.GSEditorProperties:
        case Keyword.GSEditorMacros:
        case Keyword.GSEditor:
          this._addPendingContents(start, token.lexeme.length, pendingContents);
          lexer.scanPairedChar("{", "}", true, false);
          start = lexer.getShaderPosition(0);
          break;
        case Keyword.LeftBrace:
          ++braceLevel;
          break;
        case Keyword.RightBrace:
          if (--braceLevel === 0) {
            this._addPendingContents(start, token.lexeme.length, pendingContents);
            this._popScope();
            return shaderSource;
          }
          break;
        default:
          start = this._parseRenderState(token, start, pendingContents, shaderSource.renderStates);
      }
    }
  }

  private static _parseRenderStateDeclarationOrAssignment(renderStates: IRenderStates, stateToken: BaseToken): void {
    const lexer = this._lexer;
    const token = lexer.scanToken();
    if (token.type === ETokenType.ID) {
      // Declaration
      lexer.scanLexeme("{");
      const renderState = this._parseRenderStateProperties(stateToken.lexeme);
      const symbol = new ShaderSourceSymbol(token.lexeme, stateToken.type, renderState);
      this._symbolTableStack.insert(symbol);
    } else if (token.lexeme === "=") {
      // Check if it's direct assignment syntax sugar or variable assignment
      const nextToken = lexer.scanToken();

      let renderState: IRenderStates;
      if (nextToken.lexeme === "{") {
        // Syntax: DepthState = { ... }
        renderState = this._parseRenderStateProperties(stateToken.lexeme);
      } else {
        // Syntax: DepthState = customDepthState;
        lexer.scanLexeme(";");
        const lookupSymbol = this._lookupSymbol;
        lookupSymbol.set(nextToken.lexeme, stateToken.type);
        const sm = this._symbolTableStack.lookup(lookupSymbol);
        if (!sm?.value) {
          this._createCompileError(`Invalid "${stateToken.lexeme}" variable: ${nextToken.lexeme}`, nextToken.location);
          // #if _VERBOSE
          return;
          // #endif
        }
        renderState = sm.value as IRenderStates;
      }
      this._mergeRenderStates(renderStates, renderState);
    }
  }

  private static _mergeRenderStates(target: IRenderStates, source: IRenderStates): void {
    // For each key in the source, remove it from the opposite map in target to ensure proper override
    const { constantMap: targetConstantMap, variableMap: targetVariableMap } = target;
    const { constantMap: sourceConstantMap, variableMap: sourceVariableMap } = source;

    for (const key in sourceConstantMap) {
      delete targetVariableMap[key];
      targetConstantMap[key] = sourceConstantMap[key];
    }

    for (const key in sourceVariableMap) {
      delete targetConstantMap[key];
      targetVariableMap[key] = sourceVariableMap[key];
    }
  }

  private static _parseVariableDeclaration(): void {
    const lexer = this._lexer;
    const token = lexer.scanToken();
    lexer.scanLexeme(";");
    const symbol = new ShaderSourceSymbol(token.lexeme, token.type);
    this._symbolTableStack.insert(symbol);
  }

  private static _pushScope(): void {
    const symbolTable = new SymbolTable<ShaderSourceSymbol>();
    this._symbolTableStack.pushScope(symbolTable);
  }

  private static _popScope(): void {
    this._symbolTableStack.popScope();
  }

  private static _parseRenderStateProperties(state: string): IRenderStates {
    const lexer = this._lexer;
    const renderStates = ShaderSourceFactory.createRenderStates();
    while (lexer.getCurChar() !== "}") {
      this._parseRenderStateProperty(state, renderStates);
      lexer.skipCommentsAndSpace();
    }
    lexer.advance(1);
    return renderStates;
  }

  private static _createCompileError(message: string, location?: ShaderPosition | ShaderRange): void {
    const error = this._lexer.createCompileError(message, location);
    // #if _VERBOSE
    this.errors.push(<GSError>error);
    // #endif
  }

  private static _parseRenderStateProperty(stateLexeme: string, out: IRenderStates): void {
    const lexer = this._lexer;
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
        this._createCompileError(`Invalid syntax, expect '[' or '=', but got unexpected token`);
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
      this._createCompileError(`Invalid render state property ${propertyLexeme}`);
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
        lexer.advance(1);
        const constValueToken = lexer.scanToken();
        propertyValue = this._renderStateConstMap[valueToken.lexeme]?.[constValueToken.lexeme];
        if (propertyValue == undefined) {
          this._createCompileError(
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
        const lookupSymbol = this._lookupSymbol;
        lookupSymbol.set(valueToken.lexeme, ETokenType.ID);
        if (!this._symbolTableStack.lookup(lookupSymbol)) {
          this._createCompileError(`Invalid ${stateLexeme} variable: ${valueToken.lexeme}`, valueToken.location);
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

  private static _parseRenderQueueDeclarationOrAssignment(renderStates: IRenderStates): void {
    const lexer = this._lexer;
    const token = lexer.scanToken();
    if (token.type === ETokenType.ID) {
      // Declaration
      lexer.scanLexeme(";");
      const symbol = new ShaderSourceSymbol(token.lexeme, Keyword.GSRenderQueueType);
      this._symbolTableStack.insert(symbol);
      return;
    }

    if (token.lexeme !== "=") {
      this._createCompileError(`Invalid syntax, expect character '=', but got ${token.lexeme}`, token.location);
      // #if _VERBOSE
      return;
      // #endif
    }
    const word = lexer.scanToken();
    lexer.scanLexeme(";");
    const value = this._renderStateConstMap.RenderQueueType[word.lexeme];
    const key = RenderStateElementKey.RenderQueueType;
    if (value == undefined) {
      renderStates.variableMap[key] = word.lexeme;
      const lookupSymbol = this._lookupSymbol;
      lookupSymbol.set(word.lexeme, Keyword.GSRenderQueueType);
      const sm = this._symbolTableStack.lookup(lookupSymbol);
      if (!sm) {
        this._createCompileError(`Invalid RenderQueueType variable: ${word.lexeme}`, word.location);
        // #if _VERBOSE
        return;
        // #endif
      }
    } else {
      renderStates.constantMap[key] = value;
    }
  }

  private static _addPendingContents(
    start: ShaderPosition,
    backOffset: number,
    outPendingContents: IStatement[]
  ): void {
    const lexer = this._lexer;
    if (lexer.hasPendingContent) {
      const endIndex = lexer.currentIndex - backOffset;
      outPendingContents.push({
        range: { start, end: { ...lexer.getShaderPosition(0), index: endIndex - 1 } },
        content: lexer.source.substring(start.index, endIndex - 1)
      });
      lexer.hasPendingContent = false;
    }
  }

  private static _parseSubShader(): ISubShaderSource {
    const lexer = this._lexer;
    this._pushScope();

    let braceLevel = 1;
    const name = lexer.scanPairedChar('"', '"', false, false);
    const subShaderSource = ShaderSourceFactory.createSubShaderSource(name);
    lexer.scanLexeme("{");

    lexer.skipCommentsAndSpace();
    let start = lexer.getShaderPosition(0);

    while (true) {
      const token = lexer.scanToken();
      switch (token.type) {
        case Keyword.GSPass:
          this._addPendingContents(start, token.lexeme.length, subShaderSource.pendingContents);
          const pass = this._parsePass();
          subShaderSource.passes.push(pass);
          start = lexer.getShaderPosition(0);
          break;
        case Keyword.GSUsePass:
          this._addPendingContents(start, token.lexeme.length, subShaderSource.pendingContents);
          const name = lexer.scanPairedChar('"', '"', false, false);
          subShaderSource.passes.push(ShaderSourceFactory.createUsePass(name));
          start = lexer.getShaderPosition(0);
          break;
        case Keyword.LeftBrace:
          ++braceLevel;
          break;
        case Keyword.RightBrace:
          if (--braceLevel === 0) {
            this._addPendingContents(start, token.lexeme.length, subShaderSource.pendingContents);
            this._popScope();
            return subShaderSource;
          }
          break;
        default:
          start = this._parseRenderStateAndTags(
            token,
            start,
            subShaderSource.pendingContents,
            subShaderSource.renderStates,
            subShaderSource.tags
          );
      }
    }
  }

  private static _parseTags(tags: Record<string, number | string | boolean>): void {
    const lexer = this._lexer;
    lexer.scanLexeme("{");
    while (true) {
      const ident = lexer.scanToken();
      lexer.scanLexeme("=");
      const value = lexer.scanPairedChar('"', '"', false, false);
      lexer.skipCommentsAndSpace();

      tags[ident.lexeme] = value;

      if (lexer.peek(1) === "}") {
        lexer.advance(1);
        return;
      }
      lexer.scanLexeme(",");
    }
  }

  private static _parsePass(): IShaderPassSource {
    this._pushScope();
    const lexer = this._lexer;

    const name = lexer.scanPairedChar('"', '"', false, false);
    const passSource = ShaderSourceFactory.createShaderPassSource(name);
    lexer.scanLexeme("{");
    let braceLevel = 1;

    lexer.skipCommentsAndSpace();
    let start = lexer.getShaderPosition(0);

    while (true) {
      const token = lexer.scanToken();
      switch (token.type) {
        case Keyword.GSVertexShader:
        case Keyword.GSFragmentShader:
          this._addPendingContents(start, token.lexeme.length, passSource.pendingContents);
          lexer.scanLexeme("=");
          const entry = lexer.scanToken();
          if (passSource[token.lexeme]) {
            const error = ShaderLabUtils.createGSError(
              "Reassign main entry",
              GSErrorName.CompilationError,
              lexer.source,
              lexer.getShaderPosition(0)
            );
            // #if _VERBOSE
            Logger.error(error.toString());
            throw error;
            // #endif
          }
          const key = token.type === Keyword.GSVertexShader ? "vertexEntry" : "fragmentEntry";
          passSource[key] = entry.lexeme;
          lexer.scanLexeme(";");
          start = lexer.getShaderPosition(0);
          break;
        case Keyword.LeftBrace:
          ++braceLevel;
          break;
        case Keyword.RightBrace:
          if (--braceLevel === 0) {
            this._addPendingContents(start, token.lexeme.length, passSource.pendingContents);
            this._popScope();
            return passSource;
          }
          break;
        default:
          start = this._parseRenderStateAndTags(
            token,
            start,
            passSource.pendingContents,
            passSource.renderStates,
            passSource.tags
          );
      }
    }
  }

  private static _parseRenderStateAndTags(
    token: BaseToken<number>,
    start: ShaderPosition,
    outGlobalContents: IStatement[],
    outRenderStates: IRenderStates,
    outTags: Record<string, number | string | boolean>
  ): ShaderPosition {
    switch (token.type) {
      case Keyword.GSTags:
        this._addPendingContents(start, token.lexeme.length, outGlobalContents);
        this._parseTags(outTags);
        start = this._lexer.getShaderPosition(0);
        break;
      default:
        start = this._parseRenderState(token, start, outGlobalContents, outRenderStates);
    }
    return start;
  }

  private static _parseRenderState(
    token: BaseToken<number>,
    start: ShaderPosition,
    outGlobalContents: IStatement[],
    outRenderStates: IRenderStates
  ): ShaderPosition {
    switch (token.type) {
      case Keyword.GSBlendState:
      case Keyword.GSDepthState:
      case Keyword.GSRasterState:
      case Keyword.GSStencilState:
        this._addPendingContents(start, token.lexeme.length, outGlobalContents);
        this._parseRenderStateDeclarationOrAssignment(outRenderStates, token);
        start = this._lexer.getShaderPosition(0);
        break;
      case Keyword.GSBlendFactor:
      case Keyword.GSBlendOperation:
      case Keyword.GSBool:
      case Keyword.GSNumber:
      case Keyword.GSColor:
      case Keyword.GSCompareFunction:
      case Keyword.GSStencilOperation:
      case Keyword.GSCullMode:
        this._addPendingContents(start, token.lexeme.length, outGlobalContents);
        this._parseVariableDeclaration();
        start = this._lexer.getShaderPosition(0);
        break;
      case Keyword.GSRenderQueueType:
        this._addPendingContents(start, token.lexeme.length, outGlobalContents);
        this._parseRenderQueueDeclarationOrAssignment(outRenderStates);
        start = this._lexer.getShaderPosition(0);
        break;
      default:
        // Unrecognized tokens are defined as pending content
        this._lexer.hasPendingContent = true;
    }
    return start;
  }
}
