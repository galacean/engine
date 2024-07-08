import BaseError from "../common/BaseError";
import { SymbolTableStack } from "../common/BaseSymbolTable";
import { BaseToken } from "../common/BaseToken";
import { EKeyword, ETokenType } from "../common";
import { IIndexRange, Position } from "../common";
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
  CullMode
} from "@galacean/engine";

export interface statement {
  content: string;
  range: IIndexRange;
}

type RenderStates = [
  /** Constant RenderState. */
  Record<number, any>,
  /** Variable RenderState. */
  Record<number, string>
];

interface ShaderStruct {
  name: string;
  subShaders: SubShaderStruct[];
  globalContents: statement[];
  renderStates: RenderStates;
}

interface SubShaderStruct {
  name: string;
  passes: PassStruct[];
  globalContents: statement[];
  tags?: Record<string, number | string | boolean>;
  renderStates: RenderStates;
}

interface PassStruct {
  name: string;
  isUsePass: boolean;
  // Undefined content when referenced by `UsePass`
  globalContents?: statement[];
  tags: Record<string, number | string | boolean>;
  renderStates: RenderStates;
  contents: string;
  vertexEntry: string;
  fragmentEntry: string;
}

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

export default class ShaderStructParser extends BaseError {
  static _engineType = { RenderQueueType, CompareFunction, StencilOperation, BlendOperation, BlendFactor, CullMode };
  private static _isRenderStateDeclarator(token: BaseToken) {
    return RenderStateType.includes(token.type);
  }

  private static _isEngineType(token: BaseToken) {
    return EngineType.includes(token.type);
  }

  private _scanner: Scanner;
  private _symbolTable: SymbolTableStack<ISymbol, SymbolTable> = new SymbolTableStack();

  constructor(source: string) {
    super("StructParser");
    this._scanner = new Scanner(source, KeywordMap);
    this._newScope();
  }

  parse(): ShaderStruct {
    const ret = { subShaders: [], globalContents: [], renderStates: [{}, {}] } as ShaderStruct;
    const scanner = this._scanner;

    scanner.scanText("Shader");
    ret.name = scanner.scanPairedText('"', '"');
    scanner.scanText("{");

    this._scanner.skipCommentsAndSpace();
    this._parseShaderStatements(ret);

    const shaderGlobalStatements = ret.globalContents;
    const shaderRenderStates = ret.renderStates;
    for (const subShader of ret.subShaders) {
      const curSubShaderGlobalStatements = shaderGlobalStatements.concat(subShader.globalContents);
      const curSubShaderRenderStates = [
        { ...shaderRenderStates[0], ...subShader.renderStates[0] },
        { ...shaderRenderStates[1], ...subShader.renderStates[1] }
      ];
      for (const pass of subShader.passes) {
        Object.assign(pass.renderStates[0], curSubShaderRenderStates[0]);
        Object.assign(pass.renderStates[1], curSubShaderRenderStates[1]);
        if (pass.isUsePass) continue;
        const passGlobalStatements = curSubShaderGlobalStatements.concat(pass.globalContents);
        pass.contents = passGlobalStatements.map((item) => item.content).join("\n");
      }
    }
    return ret;
  }

  private _parseShaderStatements(ret: ShaderStruct) {
    const scanner = this._scanner;
    let braceLevel = 1;
    let start = scanner.curPosition;

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case EKeyword.GS_SubShader:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          const subShader = this._parseSubShader();
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
          this._parseRenderQueueAssignment(ret);
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
          if (ShaderStructParser._isRenderStateDeclarator(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseRenderStateDeclarationOrAssignment(ret, word);
            start = scanner.curPosition;
            break;
          } else if (ShaderStructParser._isEngineType(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseVariableDeclaration(word.type);
            start = scanner.curPosition;
            break;
          }
      }
    }
  }

  private _parseRenderStateDeclarationOrAssignment(ret: { renderStates: RenderStates }, stateToken: BaseToken) {
    const ident = this._scanner.scanToken();
    let isDeclaration: boolean;
    if (ident.type === ETokenType.ID) {
      isDeclaration = true;
      this._scanner.scanText("{");
    } else if (ident.lexeme === "{") {
      isDeclaration = false;
    } else if (ident.lexeme === "=") {
      const variable = this._scanner.scanToken();
      this._scanner.scanText(";");
      const sm = this._symbolTable.lookup({ type: stateToken.type, ident: variable.lexeme });
      if (!sm?.value) {
        this.throw(this._scanner.current, `Invalid ${stateToken.lexeme} variable:`, variable.lexeme);
      }
      const renderState = sm.value as RenderStates;
      Object.assign(ret.renderStates[0], renderState[0]);
      Object.assign(ret.renderStates[1], renderState[1]);
      return;
    }

    const renderState = this._parseRenderStatePropList(stateToken.lexeme);
    if (isDeclaration) {
      this._symbolTable.insert({ ident: ident.lexeme, type: stateToken.type, value: renderState });
    } else {
      Object.assign(ret.renderStates[0], renderState[0]);
      Object.assign(ret.renderStates[1], renderState[1]);
    }
  }

  private _parseVariableDeclaration(type: number) {
    const token = this._scanner.scanToken();
    this._scanner.scanText(";");
    this._symbolTable.insert({ type: token.type, ident: token.lexeme });
  }

  private _newScope() {
    const symbolTable = new SymbolTable();
    this._symbolTable.newScope(symbolTable);
  }

  private _parseRenderStatePropList(state: string): RenderStates {
    const ret = [{}, {}] as RenderStates;
    while (this._scanner.curChar() !== "}") {
      this._parseRenderStatePropItem(ret, state);
      this._scanner.skipCommentsAndSpace();
    }
    this._scanner._advance();
    return ret;
  }

  private _parseRenderStatePropItem(ret: RenderStates, state: string) {
    let renderStateProp = this._scanner.scanToken().lexeme;
    const op = this._scanner.scanToken();
    if (state === "BlendState" && renderStateProp !== "BlendColor" && renderStateProp !== "AlphaToCoverage") {
      let idx = 0;
      if (op.lexeme === "[") {
        idx = this._scanner.scanNumber();
        this._scanner.scanText("]");
        this._scanner.scanText("=");
      } else if (op.lexeme !== "=") {
        this.throw(this._scanner.current, "Invalid syntax, expect character '=', but got", op.lexeme);
      }
      renderStateProp += idx;
    }

    renderStateProp = state + renderStateProp;
    const renderStateElementKey = RenderStateDataKey[renderStateProp];
    if (renderStateElementKey == undefined)
      this.throw(this._scanner.current, "Invalid render state element", renderStateProp);

    this._scanner.skipCommentsAndSpace();
    let value: any;
    if (/[0-9.]/.test(this._scanner.curChar())) {
      value = this._scanner.scanNumber();
    } else {
      const token = this._scanner.scanToken();
      if (token.type === EKeyword.TRUE) value = true;
      else if (token.type === EKeyword.FALSE) value = false;
      else if (token.type === EKeyword.GS_Color) {
        this._scanner.scanText("(");
        const args: number[] = [];
        while (true) {
          args.push(this._scanner.scanNumber());
          this._scanner.skipCommentsAndSpace();
          const peek = this._scanner.peek();
          if (peek === ")") {
            this._scanner._advance();
            break;
          }
          this._scanner.scanText(",");
        }
        value = new Color(...args);
      } else if (this._scanner.curChar() === ".") {
        this._scanner._advance();
        const engineTypeProp = this._scanner.scanToken();
        value = ShaderStructParser._engineType[token.lexeme]?.[engineTypeProp.lexeme];
        if (value == undefined)
          this.throw(this._scanner.current, "Invalid engine constant:", `${token.lexeme}.${engineTypeProp.lexeme}`);
      } else {
        value = token.lexeme;
      }
    }
    this._scanner.scanText(";");
    if (typeof value === "string") {
      ret[1][renderStateElementKey] = value;
    } else {
      ret[0][renderStateElementKey] = value;
    }
  }

  private _parseRenderQueueAssignment(ret: { renderStates: RenderStates }) {
    this._scanner.scanText("=");
    const word = this._scanner.scanToken();
    this._scanner.scanText(";");
    const value = ShaderStructParser._engineType.RenderQueueType[word.lexeme];
    if (value == undefined) {
      this.throw(this._scanner.current, "Invalid render queue", word.lexeme);
    }
    const key = RenderStateDataKey.RenderQueueType;
    ret.renderStates[0][key] = value;
  }

  private _addGlobalStatement(ret: { globalContents: statement[] }, scanner: Scanner, start: Position, offset: number) {
    if (scanner.current > start.index + offset) {
      ret.globalContents.push({
        range: { start, end: { ...scanner.curPosition, index: scanner.current - offset - 1 } },
        content: scanner.source.substring(start.index, scanner.current - offset - 1)
      });
    }
  }

  private _parseSubShader(): SubShaderStruct {
    this._newScope();
    const ret = { passes: [], globalContents: [], renderStates: [{}, {}], tags: {} } as SubShaderStruct;
    const scanner = this._scanner;
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
          const pass = this._parsePass();
          ret.passes.push(pass);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_RenderQueueType:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseRenderQueueAssignment(ret);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_UsePass:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          const name = scanner.scanPairedText('"', '"');
          // @ts-ignore
          ret.passes.push({ name, isUsePass: true, renderStates: [{}, {}], tags: {} });
          start = scanner.curPosition;
          break;

        case EKeyword.GS_Tags:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseTags(ret);
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
          if (ShaderStructParser._isRenderStateDeclarator(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseRenderStateDeclarationOrAssignment(ret, word);
            start = scanner.curPosition;
            break;
          } else if (ShaderStructParser._isEngineType(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseVariableDeclaration(word.type);
            start = scanner.curPosition;
            break;
          }
      }
    }
  }

  private _parseTags(ret: { tags?: Record<string, number | string | boolean> }) {
    this._scanner.scanText("{");
    while (true) {
      const ident = this._scanner.scanToken();
      this._scanner.scanText("=");
      const value = this._scanner.scanPairedText('"', '"');
      this._scanner.skipCommentsAndSpace();

      ret.tags[ident.lexeme] = value;

      if (this._scanner.peek() === "}") {
        this._scanner._advance();
        return;
      }
      this._scanner.scanText(",");
    }
  }

  private _parsePass(): PassStruct {
    const ret = { globalContents: [], renderStates: [{}, {}], tags: {} } as PassStruct & {
      globalContents: statement[];
    };
    const scanner = this._scanner;
    ret.name = scanner.scanPairedText('"', '"');
    scanner.scanText("{");
    let braceLevel = 1;

    scanner.skipCommentsAndSpace();
    let start = this._scanner.curPosition;

    while (true) {
      const word = scanner.scanToken();
      switch (word.type) {
        case EKeyword.GS_RenderQueueType:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseRenderQueueAssignment(ret);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_Tags:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          this._parseTags(ret);
          start = scanner.curPosition;
          break;

        case EKeyword.GS_VertexShader:
        case EKeyword.GS_FragmentShader:
          this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
          scanner.scanText("=");
          const entry = scanner.scanToken();
          // #if _EDITOR
          if (ret[word.lexeme]) {
            this.throw(scanner.current, "reassign main entry");
          }
          // #endif
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
          if (ShaderStructParser._isRenderStateDeclarator(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseRenderStateDeclarationOrAssignment(ret, word);
            start = scanner.curPosition;
            break;
          } else if (ShaderStructParser._isEngineType(word)) {
            this._addGlobalStatement(ret, scanner, start, word.lexeme.length);
            this._parseVariableDeclaration(word.type);
            start = scanner.curPosition;
            break;
          }
      }
    }
  }
}
