import BaseError from "../BaseError";
import { IIndexRange } from "../preprocessor/IndexRange";
import Scanner from "./Scanner";

export interface statement {
  content: string;
  range: IIndexRange;
}

interface ShaderStruct {
  name: string;
  subShaders: SubShaderStruct[];
  globalContents: statement[];
}

interface SubShaderStruct {
  name: string;
  passes: PassStruct[];
  globalContents: statement[];
}

interface PassStruct {
  name: string;
  // Undefined content when referenced by `UsePass`
  content?: string;
}

export default class ShaderStructParser extends BaseError {
  private _scanner: Scanner;

  constructor(source: string) {
    super("StructParser");
    this._scanner = new Scanner(source);
  }

  parse(): ShaderStruct {
    const ret = { subShaders: [], globalContents: [] } as ShaderStruct;
    const scanner = this._scanner;

    scanner.scanText("Shader");
    ret.name = scanner.scanPairedText('"', '"');
    scanner.scanText("{");

    this._scanner.skipCommentsAndSpace();
    let start = this._scanner.current;
    const addGlobalStatement = (offset: number) => {
      if (this._scanner.current > start + offset) {
        ret.globalContents.push({
          range: { start, end: this._scanner.current - offset },
          content: this._scanner.source.substring(start, this._scanner.current - offset)
        });
      }
    };

    while (true) {
      const word = this._scanner.scanWord();

      if (word === "SubShader") {
        addGlobalStatement(word.length);
        const subShader = this._parseSubShader();
        ret.subShaders.push(subShader);
        start = this._scanner.current;
      } else if (word === "EditorProperties" || word === "EditorMacros") {
        addGlobalStatement(word.length);
        this._scanner.scanPairedText("{", "}", true);
        start = this._scanner.current;
        // @remark: "}" must be surrounded by space!
      } else if (word === "}") {
        addGlobalStatement(word.length);
        break;
      }
      if (this._scanner.isEnd()) {
        this.throw(0, "no matched '}' for Shader block.");
      }
    }

    const shaderGlobal = ret.globalContents;
    for (const subShader of ret.subShaders) {
      const subShaderGlobal = subShader.globalContents;
      for (const pass of subShader.passes) {
        if (pass.content == undefined) continue;
        pass.content =
          shaderGlobal.map((item) => item.content).join("\n") +
          subShaderGlobal.map((item) => item.content).join("\n") +
          pass.content;
      }
    }
    return ret;
  }

  private _parseSubShader(): SubShaderStruct {
    const ret = { passes: [], globalContents: [] } as SubShaderStruct;
    const scanner = this._scanner;

    ret.name = scanner.scanPairedText('"', '"');
    scanner.scanText("{");

    scanner.skipCommentsAndSpace();
    let start = this._scanner.current;
    const keyword = "Pass";
    const addGlobalStatement = (offset: number) => {
      if (this._scanner.current > start + offset) {
        ret.globalContents.push({
          range: { start, end: this._scanner.current - keyword.length },
          content: this._scanner.source.substring(start, this._scanner.current - keyword.length)
        });
      }
    };

    while (true) {
      const word = this._scanner.scanWord();

      if (word === keyword) {
        addGlobalStatement(word.length);
        const pass = this._parsePass();
        ret.passes.push(pass);
        start = this._scanner.current;
        // @remark: "}" must be surrounded by space!
      } else if (word === "UsePass") {
        const name = this._scanner.scanPairedText('"', '"');
        ret.passes.push({ name });
        start = this._scanner.current;
      } else if (word === "{") {
        this._scanner.scanPairedText("{", "}", true, true);
      } else if (word === "}") {
        addGlobalStatement(word.length);
        break;
      }
      if (this._scanner.isEnd()) {
        this.throw(0, "no matched '}' for SubShader block.");
      }
    }

    return ret;
  }

  private _parsePass(): PassStruct {
    const ret = {} as PassStruct;
    const scanner = this._scanner;

    ret.name = scanner.scanPairedText('"', '"');
    ret.content = scanner.scanPairedText("{", "}", true);
    return ret;
  }
}
