import { SymbolTableStack } from "../common/BaseSymbolTable";
import { BaseToken } from "../common/BaseToken";
import { EKeyword, ETokenType } from "../common";
import { ShaderPosition } from "../common";
import { KeywordMap } from "./KeywordMap";
import Scanner from "./Scanner";
import SymbolTable, { ISymbol } from "./SymbolTable";
import {
  RenderStateDataKey,
  Color,
  RenderQueueType,
  CompareFunction,
  StencilOperation,
  BlendOperation,
  BlendFactor,
  CullMode,
  Logger
} from "@galacean/engine";
import {
  IStatement,
  IShaderContent,
  ISubShaderContent,
  IShaderPassContent,
  IRenderStates
} from "@galacean/engine-design";
// #if _EDITOR
import { CompilationError } from "../Error";
// #endif

const EngineType = [
  EKeyword.GS_RenderQueueType,
  EKeyword.GS_BlendFactor,
  EKeyword.GS_BlendOperation,
  EKeyword.GS_Bool,
  EKeyword.GS_Number,
  EKeyword.GS_Color,
  EKeyword.GS_CompareFunction,
  EKeyword.GS_StencilOperation,
  EKeyword.GS_CullMode
];

const RenderStateType = [
  EKeyword.GS_BlendState,
  EKeyword.GS_DepthState,
  EKeyword.GS_RasterState,
  EKeyword.GS_StencilState
];

export class ShaderContentParser {
  static _engineType = { RenderQueueType, CompareFunction, StencilOperation, BlendOperation, BlendFactor, CullMode };
  private static _isRenderStateDeclarator(token: BaseToken) {
    return RenderStateType.includes(token.type);
  }

  private static _isEngineType(token: BaseToken) {
    return EngineType.includes(token.type);
  }

  private static _symbolTable: SymbolTableStack<ISymbol, SymbolTable> = new SymbolTableStack();

  static reset() {
    this._symbolTable.clear();
    this._newScope();
  }

  static parse(source: string): IShaderContent {
    const start = performance.now();

    const scanner = new Scanner(source, KeywordMap);
    const ret = {
      subShaders: [],
      globalContents: [],
      renderStates: { constantMap: {}, variableMap: {} }
    } as IShaderContent;

    scanner.scanText("Shader");
    ret.name = scanner.scanPairedText('"', '"');
    scanner.scanText("{");

    scanner.skipCommentsAndSpace();
    this._parseShaderStatements(ret, scanner);

    const shaderGlobalStatements = ret.globalContents;
    const shaderRenderStates = ret.renderStates;
    for (let i = 0; i < ret.subShaders.length; i++) {
      const subShader = ret.subShaders[i];
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

    Logger.info(`[content compilation] cost time ${performance.now() - start}ms`);

    return ret;
  }

  private static _parseShaderStatements(ret: IShaderContent, scanner: Scanner) {
    let braceLevel = 1;
    let start = scanner.curPosition;

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case EKeyword.GS_SubShader:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          const subShader = this._parseSubShader(scanner);
          ret.subShaders.push(subShader);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_EditorProperties:
        case EKeyword.GS_EditorMacros:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          scanner.scanPairedText("{", "}", true);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_RenderQueueType:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseRenderQueueAssignment(ret, scanner);
          start = scanner.curPosition;
          break;

        case ETokenType.NOT_WORD:
          if (word.lexeme === "{") braceLevel += 1;
          else if (word.lexeme === "}") {
            braceLevel -= 1;
            if (braceLevel === 0) {
              this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
              this._symbolTable.dropScope();
              return;
            }
          }

        default:
          if (ShaderContentParser._isRenderStateDeclarator(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseRenderStateDeclarationOrAssignment(ret, word, scanner);
            start = scanner.curPosition;
            break;
          } else if (ShaderContentParser._isEngineType(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseVariableDeclaration(word.type, scanner);
            start = scanner.curPosition;
            break;
          }
      }
    }
  }

  private static _parseRenderStateDeclarationOrAssignment(
    ret: { renderStates: IRenderStates },
    stateToken: BaseToken,
    scanner: Scanner
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
      const sm = this._symbolTable.lookup({ type: stateToken.type, ident: variable.lexeme });
      if (!sm?.value) {
        let error: CompilationError;
        // #if _EDITOR
        throw new CompilationError(
          `Invalid ${stateToken.lexeme} variable: ${variable.lexeme}`,
          scanner.curPosition,
          scanner.source
        );
        // #else
        throw new Error(`Invalid ${stateToken.lexeme} variable: ${variable.lexeme}`);
        // #endif
      }
      const renderState = sm.value as IRenderStates;
      Object.assign(ret.renderStates.constantMap, renderState.constantMap);
      Object.assign(ret.renderStates.variableMap, renderState.variableMap);
      return;
    }

    const renderState = this._parseRenderStatePropList(stateToken.lexeme, scanner);
    if (isDeclaration) {
      this._symbolTable.insert({ ident: ident.lexeme, type: stateToken.type, value: renderState });
    } else {
      Object.assign(ret.renderStates.constantMap, renderState.constantMap);
      Object.assign(ret.renderStates.variableMap, renderState.variableMap);
    }
  }

  private static _parseVariableDeclaration(type: number, scanner: Scanner) {
    const token = scanner.scanToken();
    scanner.scanText(";");
    this._symbolTable.insert({ type: token.type, ident: token.lexeme });
  }

  private static _newScope() {
    const symbolTable = new SymbolTable();
    this._symbolTable.newScope(symbolTable);
  }

  private static _parseRenderStatePropList(state: string, scanner: Scanner): IRenderStates {
    const ret: IRenderStates = { constantMap: {}, variableMap: {} };
    while (scanner.getCurChar() !== "}") {
      this._parseRenderStatePropItem(ret, state, scanner);
      scanner.skipCommentsAndSpace();
    }
    scanner._advance();
    return ret;
  }

  private static _parseRenderStatePropItem(ret: IRenderStates, state: string, scanner: Scanner) {
    let renderStateProp = scanner.scanToken().lexeme;
    const op = scanner.scanToken();
    if (state === "BlendState" && renderStateProp !== "BlendColor" && renderStateProp !== "AlphaToCoverage") {
      let idx = 0;
      if (op.lexeme === "[") {
        idx = scanner.scanNumber();
        scanner.scanText("]");
        scanner.scanText("=");
      } else if (op.lexeme !== "=") {
        const error = new CompilationError(
          `Invalid syntax, expect character '=', but got ${op.lexeme}`,
          scanner.curPosition,
          scanner.source
        );
        error.log();
        throw error;
      }
      renderStateProp += idx;
    }

    renderStateProp = state + renderStateProp;
    const renderStateElementKey = RenderStateDataKey[renderStateProp];
    if (renderStateElementKey == undefined) {
      const error = new CompilationError(
        `Invalid render state element ${renderStateProp}`,
        scanner.curPosition,
        scanner.source
      );
      error.log();
      throw error;
    }

    scanner.skipCommentsAndSpace();
    let value: any;
    if (/[0-9.]/.test(scanner.getCurChar())) {
      value = scanner.scanNumber();
    } else {
      const token = scanner.scanToken();
      if (token.type === EKeyword.TRUE) value = true;
      else if (token.type === EKeyword.FALSE) value = false;
      else if (token.type === EKeyword.GS_Color) {
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
        value = ShaderContentParser._engineType[token.lexeme]?.[engineTypeProp.lexeme];
        if (value == undefined) {
          const error = new CompilationError(
            `Invalid engine constant: ${token.lexeme}.${engineTypeProp.lexeme}`,
            scanner.curPosition,
            scanner.source
          );
          error.log();
          throw error;
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

  private static _parseRenderQueueAssignment(ret: { renderStates: IRenderStates }, scanner: Scanner) {
    scanner.scanText("=");
    const word = scanner.scanToken();
    scanner.scanText(";");
    const value = ShaderContentParser._engineType.RenderQueueType[word.lexeme];
    if (value == undefined) {
      const error = new CompilationError(`Invalid render queue ${word.lexeme}`, word.location, scanner.source);
      error.log();
      throw error;
    }
    const key = RenderStateDataKey.RenderQueueType;
    ret.renderStates.constantMap[key] = value;
  }

  private static _addGlobalStatement(
    ret: { globalContents: IStatement[] },
    scanner: Scanner,
    start: ShaderPosition,
    offset: number
  ) {
    if (scanner.current > start.index + offset) {
      ret.globalContents.push({
        range: { start, end: { ...scanner.curPosition, index: scanner.current - offset - 1 } },
        content: scanner.source.substring(start.index, scanner.current - offset - 1)
      });
    }
  }

  private static _parseSubShader(scanner: Scanner): ISubShaderContent {
    this._newScope();
    const ret = {
      passes: [],
      globalContents: [],
      renderStates: { constantMap: {}, variableMap: {} },
      tags: {}
    } as ISubShaderContent;
    let braceLevel = 1;
    ret.name = scanner.scanPairedText('"', '"');
    scanner.scanText("{");

    scanner.skipCommentsAndSpace();
    let start = scanner.curPosition;

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case EKeyword.GS_Pass:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          const pass = this._parsePass(scanner);
          ret.passes.push(pass);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_RenderQueueType:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseRenderQueueAssignment(ret, scanner);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_UsePass:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          const name = scanner.scanPairedText('"', '"');
          // @ts-ignore
          ret.passes.push({ name, isUsePass: true, renderStates: { constantMap: {}, variableMap: {} }, tags: {} });
          start = scanner.curPosition;
          break;

        case EKeyword.GS_Tags:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseTags(ret, scanner);
          start = scanner.curPosition;
          break;

        case ETokenType.NOT_WORD:
          if (word.lexeme === "{") braceLevel += 1;
          else if (word.lexeme === "}") {
            braceLevel -= 1;
            if (braceLevel === 0) {
              this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
              this._symbolTable.dropScope();
              return ret;
            }
          }

        default:
          if (ShaderContentParser._isRenderStateDeclarator(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseRenderStateDeclarationOrAssignment(ret, word, scanner);
            start = scanner.curPosition;
            break;
          } else if (ShaderContentParser._isEngineType(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseVariableDeclaration(word.type, scanner);
            start = scanner.curPosition;
            break;
          }
      }
    }
  }

  private static _parseTags(ret: { tags?: Record<string, number | string | boolean> }, scanner: Scanner) {
    scanner.scanText("{");
    while (true) {
      const ident = scanner.scanToken();
      scanner.scanText("=");
      const value = scanner.scanPairedText('"', '"');
      scanner.skipCommentsAndSpace();

      ret.tags[ident.lexeme] = value;

      if (scanner.peek(1) === "}") {
        scanner._advance();
        return;
      }
      scanner.scanText(",");
    }
  }

  private static _parsePass(scanner: Scanner): IShaderPassContent {
    const ret = {
      globalContents: [],
      renderStates: { constantMap: {}, variableMap: {} },
      tags: {}
    } as IShaderPassContent & {
      globalContents: IStatement[];
    };
    ret.name = scanner.scanPairedText('"', '"');
    scanner.scanText("{");
    let braceLevel = 1;

    scanner.skipCommentsAndSpace();
    let start = scanner.curPosition;

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case EKeyword.GS_RenderQueueType:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseRenderQueueAssignment(ret, scanner);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_Tags:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseTags(ret, scanner);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_VertexShader:
        case EKeyword.GS_FragmentShader:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          scanner.scanText("=");
          const entry = scanner.scanToken();
          if (ret[word.lexeme]) {
            const error = new CompilationError("reassign main entry", scanner.curPosition, scanner.source);
            error.log();
            throw error;
          }
          const key = word.type === EKeyword.GS_VertexShader ? "vertexEntry" : "fragmentEntry";
          ret[key] = entry.lexeme;
          scanner.scanText(";");
          start = scanner.curPosition;
          break;

        case ETokenType.NOT_WORD:
          if (word.lexeme === "{") braceLevel += 1;
          else if (word.lexeme === "}") {
            braceLevel -= 1;
            if (braceLevel === 0) {
              this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
              this._symbolTable.dropScope();
              return ret;
            }
          }

        default:
          if (ShaderContentParser._isRenderStateDeclarator(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseRenderStateDeclarationOrAssignment(ret, word, scanner);
            start = scanner.curPosition;
            break;
          } else if (ShaderContentParser._isEngineType(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseVariableDeclaration(word.type, scanner);
            start = scanner.curPosition;
            break;
          }
      }
    }
  }
}
