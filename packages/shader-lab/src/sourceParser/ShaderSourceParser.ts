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
import { ETokenType, ShaderPosition, TokenType } from "../common";
import { SymbolTableStack } from "../common/BaseSymbolTable";
import { BaseToken } from "../common/BaseToken";
import { GSErrorName } from "../GSError";
import ContentSymbolTable, { ISymbol } from "./ContentSymbolTable";
// #if _VERBOSE
import { GSError } from "../GSError";
// #endif
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
    this._newScope();
  }

  static parse(sourceCode: string): IShaderSource {
    const start = performance.now();

    const lexer = new SourceLexer(sourceCode);
    const shaderSource = <IShaderSource>{
      subShaders: [],
      globalContents: [],
      renderStates: { constantMap: {}, variableMap: {} }
    };

    lexer.scanText("Shader");
    shaderSource.name = lexer.scanPairedText('"', '"', false, false);
    lexer.scanText("{");

    this._parseShader(lexer, shaderSource);

    const shaderGlobalStatements = shaderSource.globalContents;
    const shaderRenderStates = shaderSource.renderStates;
    for (let i = 0; i < shaderSource.subShaders.length; i++) {
      const subShader = shaderSource.subShaders[i];
      const curSubShaderGlobalStatements = shaderGlobalStatements.concat(subShader.globalContents);
      const constMap = { ...shaderRenderStates.constantMap, ...subShader.renderStates.constantMap };
      const variableMap = { ...shaderRenderStates.variableMap, ...subShader.renderStates.variableMap };

      for (let i = 0; i < subShader.passes.length; i++) {
        const pass = subShader.passes[i];
        Object.assign(pass.renderStates.constantMap, constMap);
        Object.assign(pass.renderStates.variableMap, variableMap);
        if (pass.isUsePass) continue;
        // @ts-ignore
        const passGlobalStatements = curSubShaderGlobalStatements.concat(pass.globalContents);
        pass.contents = passGlobalStatements.map((item) => item.content).join("\n");
      }
    }

    Logger.info(`[Source compilation] cost time ${performance.now() - start}ms`);

    return shaderSource;
  }

  private static _lookupSymbolByType(ident: string, type: TokenType): ISymbol | undefined {
    const stack = ShaderSourceParser._symbolTableStack.stack;
    for (let length = stack.length, i = length - 1; i >= 0; i--) {
      const symbolTable = stack[i];
      const ret = symbolTable.lookup(ident, type);
      if (ret) return ret;
    }
  }

  private static _parseShader(lexer: SourceLexer, outShaderSource: IShaderSource): void {
    let braceLevel = 1;

    lexer.skipCommentsAndSpace();
    let start = lexer.getCurPosition();

    const { globalContents } = outShaderSource;
    while (true) {
      const token = lexer.scanToken();
      const { lexeme } = token;
      switch (token.type) {
        case Keyword.GSSubShader:
          this._addGlobalStatement(lexer, start, lexeme.length, globalContents);
          const subShader = this._parseSubShader(lexer);
          outShaderSource.subShaders.push(subShader);
          start = lexer.getCurPosition();
          break;
        case Keyword.GSEditorProperties:
        case Keyword.GSEditorMacros:
        case Keyword.GSEditor:
          this._addGlobalStatement(lexer, start, lexeme.length, globalContents);
          lexer.scanPairedText("{", "}", true, false);
          start = lexer.getCurPosition();
          break;
        case ETokenType.NotWord:
          if (lexeme === "{") {
            ++braceLevel;
          } else if (lexeme === "}") {
            if (--braceLevel === 0) {
              this._addGlobalStatement(lexer, start, lexeme.length, globalContents);
              this._symbolTableStack.dropScope();
              return;
            }
          }
      }
      start = this._parseRenderState(token, lexer, start, globalContents, outShaderSource.renderStates);
    }
  }

  private static _parseRenderStateDeclarationOrAssignment(
    renderStates: IRenderStates,
    stateToken: BaseToken,
    scanner: SourceLexer
  ) {
    const ident = scanner.scanToken();
    let isDeclaration: boolean;
    if (ident.type === ETokenType.ID) {
      isDeclaration = true;
      scanner.scanText("{");
    } else if (ident.lexeme === "{") {
      isDeclaration = false;
    } else if (ident.lexeme === "=") {
      const variable = scanner.scanToken();
      scanner.scanText(";");
      const sm = ShaderSourceParser._lookupSymbolByType(variable.lexeme, stateToken.type);
      if (!sm?.value) {
        const error = ShaderLabUtils.createGSError(
          `Invalid "${stateToken.lexeme}" variable: ${variable.lexeme}`,
          GSErrorName.CompilationError,
          scanner.source,
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

    const renderState = this._parseRenderStatePropList(stateToken.lexeme, scanner);
    if (isDeclaration) {
      this._symbolTableStack.insert({ ident: ident.lexeme, type: stateToken.type, value: renderState });
    } else {
      Object.assign(renderStates.constantMap, renderState.constantMap);
      Object.assign(renderStates.variableMap, renderState.variableMap);
    }
  }

  private static _parseVariableDeclaration(type: number, scanner: SourceLexer) {
    const token = scanner.scanToken();
    scanner.scanText(";");
    this._symbolTableStack.insert({ type: token.type, ident: token.lexeme });
  }

  private static _newScope() {
    const symbolTable = new ContentSymbolTable();
    this._symbolTableStack.newScope(symbolTable);
  }

  private static _dropScope() {
    this._symbolTableStack.dropScope();
  }

  private static _parseRenderStatePropList(state: string, scanner: SourceLexer): IRenderStates {
    const ret: IRenderStates = { constantMap: {}, variableMap: {} };
    while (scanner.getCurChar() !== "}") {
      this._parseRenderStatePropItem(ret, state, scanner);
      scanner.skipCommentsAndSpace();
    }
    scanner._advance();
    return ret;
  }

  private static _parseRenderStatePropItem(ret: IRenderStates, state: string, scanner: SourceLexer) {
    let renderStateProp = scanner.scanToken().lexeme;
    const op = scanner.scanToken();
    if (state === "BlendState" && renderStateProp !== "BlendColor" && renderStateProp !== "AlphaToCoverage") {
      let idx = 0;
      if (op.lexeme === "[") {
        idx = scanner.scanNumber();
        scanner.scanText("]");
        scanner.scanText("=");
      } else if (op.lexeme !== "=") {
        const error = ShaderLabUtils.createGSError(
          `Invalid syntax, expect character '=', but got ${op.lexeme}`,
          GSErrorName.CompilationError,
          scanner.source,
          scanner.getCurPosition()
        );
        // #if _VERBOSE
        this._errors.push(<GSError>error);
        scanner.scanToCharacter(";");
        return;
        // #endif
      }
      renderStateProp += idx;
    }

    renderStateProp = state + renderStateProp;
    const renderStateElementKey = RenderStateDataKey[renderStateProp];
    if (renderStateElementKey == undefined) {
      const error = ShaderLabUtils.createGSError(
        `Invalid render state element ${renderStateProp}`,
        GSErrorName.CompilationError,
        scanner.source,
        scanner.getCurPosition()
      );
      // #if _VERBOSE
      this._errors.push(<GSError>error);
      scanner.scanToCharacter(";");
      return;
      // #endif
    }

    scanner.skipCommentsAndSpace();
    let value: any;
    if (/[0-9.]/.test(scanner.getCurChar())) {
      value = scanner.scanNumber();
    } else {
      const token = scanner.scanToken();
      if (token.type === Keyword.TRUE) value = true;
      else if (token.type === Keyword.FALSE) value = false;
      else if (token.type === Keyword.GS_Color) {
        scanner.scanText("(");
        const args: number[] = [];
        while (true) {
          args.push(scanner.scanNumber());
          scanner.skipCommentsAndSpace();
          const peek = scanner.peek(1);
          if (peek === ")") {
            scanner._advance();
            break;
          }
          scanner.scanText(",");
        }
        value = new Color(...args);
      } else if (scanner.getCurChar() === ".") {
        scanner._advance();
        const engineTypeProp = scanner.scanToken();
        value = ShaderSourceParser._engineType[token.lexeme]?.[engineTypeProp.lexeme];
        if (value == undefined) {
          const error = ShaderLabUtils.createGSError(
            `Invalid engine constant: ${token.lexeme}.${engineTypeProp.lexeme}`,
            GSErrorName.CompilationError,
            scanner.source,
            engineTypeProp.location
          );
          // #if _VERBOSE
          this._errors.push(<GSError>error);
          scanner.scanToCharacter(";");
          return;
          // #endif
        }
      } else {
        value = token.lexeme;
      }
    }
    scanner.scanText(";");
    if (typeof value === "string") {
      ret.variableMap[renderStateElementKey] = value;
    } else {
      ret.constantMap[renderStateElementKey] = value;
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
      const sm = ShaderSourceParser._lookupSymbolByType(word.lexeme, Keyword.GSRenderQueueType);
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

  private static _addGlobalStatement(
    lexer: SourceLexer,
    start: ShaderPosition,
    backOffset: number,
    outGlobalContents: IStatement[]
  ) {
    const endIndex = lexer.current - backOffset;
    if (endIndex > start.index) {
      outGlobalContents.push({
        range: { start, end: { ...lexer.getCurPosition(), index: endIndex - 1 } },
        content: lexer.source.substring(start.index, endIndex - 1)
      });
    }
  }

  private static _parseSubShader(scanner: SourceLexer): ISubShaderSource {
    this._newScope();
    const ret = {
      passes: [],
      globalContents: [],
      renderStates: { constantMap: {}, variableMap: {} },
      tags: {}
    } as ISubShaderSource;
    let braceLevel = 1;
    ret.name = scanner.scanPairedText('"', '"', false, false);
    scanner.scanText("{");

    scanner.skipCommentsAndSpace();
    let start = scanner.getCurPosition();

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case Keyword.GS_Pass:
          this._addGlobalStatement(scanner, start, word.lexeme.length, ret.globalContents);
          const pass = this._parsePass(scanner);
          ret.passes.push(pass);
          start = scanner.getCurPosition();
          break;
        case Keyword.GS_UsePass:
          this._addGlobalStatement(scanner, start, word.lexeme.length, ret.globalContents);
          const name = scanner.scanPairedText('"', '"', false, false);
          // @ts-ignore
          ret.passes.push({ name, isUsePass: true, renderStates: { constantMap: {}, variableMap: {} }, tags: {} });
          start = scanner.getCurPosition();
          break;
        case Keyword.GS_Tags:
          this._addGlobalStatement(scanner, start, word.lexeme.length, ret.globalContents);
          this._parseTags(ret, scanner);
          start = scanner.getCurPosition();
          break;
        case ETokenType.NotWord:
          if (word.lexeme === "{") braceLevel += 1;
          else if (word.lexeme === "}") {
            braceLevel -= 1;
            if (braceLevel === 0) {
              this._addGlobalStatement(scanner, start, word.lexeme.length, ret.globalContents);
              this._dropScope();
              return ret;
            }
          }
      }
      start = this._parseRenderState(word, scanner, start, ret.globalContents, ret.renderStates);
    }
  }

  private static _parseTags(ret: { tags?: Record<string, number | string | boolean> }, scanner: SourceLexer) {
    scanner.scanText("{");
    while (true) {
      const ident = scanner.scanToken();
      scanner.scanText("=");
      const value = scanner.scanPairedText('"', '"', false, false);
      scanner.skipCommentsAndSpace();

      ret.tags[ident.lexeme] = value;

      if (scanner.peek(1) === "}") {
        scanner._advance();
        return;
      }
      scanner.scanText(",");
    }
  }

  private static _parsePass(scanner: SourceLexer): IShaderPassSource {
    this._newScope();
    const ret = {
      globalContents: [],
      renderStates: { constantMap: {}, variableMap: {} },
      tags: {}
    } as IShaderPassSource & {
      globalContents: IStatement[];
    };
    ret.name = scanner.scanPairedText('"', '"', false, false);
    scanner.scanText("{");
    let braceLevel = 1;

    scanner.skipCommentsAndSpace();
    let start = scanner.getCurPosition();

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case Keyword.GS_Tags:
          this._addGlobalStatement(scanner, start, word.lexeme.length, ret.globalContents);
          this._parseTags(ret, scanner);
          start = scanner.getCurPosition();
          break;
        case Keyword.GS_VertexShader:
        case Keyword.GS_FragmentShader:
          this._addGlobalStatement(scanner, start, word.lexeme.length, ret.globalContents);
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
          const key = word.type === Keyword.GS_VertexShader ? "vertexEntry" : "fragmentEntry";
          ret[key] = entry.lexeme;
          scanner.scanText(";");
          start = scanner.getCurPosition();
          break;

        case ETokenType.NotWord:
          if (word.lexeme === "{") braceLevel += 1;
          else if (word.lexeme === "}") {
            braceLevel -= 1;
            if (braceLevel === 0) {
              this._addGlobalStatement(scanner, start, word.lexeme.length, ret.globalContents);
              this._dropScope();
              return ret;
            }
          }
      }
      start = this._parseRenderState(word, scanner, start, ret.globalContents, ret.renderStates);
    }
  }

  private static _parseRenderState(
    token: BaseToken<number>,
    lexer: SourceLexer,
    start: ShaderPosition,
    globalContents: IStatement[],
    renderStates: IRenderStates
  ): ShaderPosition {
    switch (token.type) {
      case Keyword.GS_BlendState:
      case Keyword.GS_DepthState:
      case Keyword.GS_RasterState:
      case Keyword.GS_StencilState:
        this._addGlobalStatement(lexer, start, token.lexeme.length, globalContents);
        this._parseRenderStateDeclarationOrAssignment(renderStates, token, lexer);
        return lexer.getCurPosition();
      case Keyword.GS_BlendFactor:
      case Keyword.GS_BlendOperation:
      case Keyword.GS_Bool:
      case Keyword.GS_Number:
      case Keyword.GS_Color:
      case Keyword.GS_CompareFunction:
      case Keyword.GS_StencilOperation:
      case Keyword.GS_CullMode:
        this._addGlobalStatement(lexer, start, token.lexeme.length, globalContents);
        this._parseVariableDeclaration(token.type, lexer);
        return lexer.getCurPosition();
      case Keyword.GSRenderQueueType:
        this._addGlobalStatement(lexer, start, token.lexeme.length, globalContents);
        this._parseRenderQueueDeclarationOrAssignment(renderStates, lexer);
        return lexer.getCurPosition();
      default:
        return start;
    }
  }
}
