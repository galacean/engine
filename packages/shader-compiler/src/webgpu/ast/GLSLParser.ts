import type {
  BlockStmt,
  ExprNode,
  LayoutQualifier,
  ParamDecl,
  ShaderModuleAST,
  StmtNode,
  StructField,
  SwitchCase,
  TopLevelDecl,
  TypeRef,
  VarDeclarator,
  VarDeclStmt
} from "./GLSLAst";

const enum TokKind {
  Eof = 0,
  Ident = 1,
  Int = 2,
  Uint = 3,
  Float = 4,
  Punct = 5
}

interface Token {
  kind: TokKind;
  text: string;
}

const BUILTIN_TYPES = new Set([
  "void",
  "bool",
  "int",
  "uint",
  "float",
  "vec2",
  "vec3",
  "vec4",
  "bvec2",
  "bvec3",
  "bvec4",
  "ivec2",
  "ivec3",
  "ivec4",
  "uvec2",
  "uvec3",
  "uvec4",
  "mat2",
  "mat3",
  "mat4",
  "mat2x2",
  "mat2x3",
  "mat2x4",
  "mat3x2",
  "mat3x3",
  "mat3x4",
  "mat4x2",
  "mat4x3",
  "mat4x4",
  "sampler2D",
  "sampler3D",
  "samplerCube",
  "sampler2DShadow",
  "samplerCubeShadow",
  "sampler2DArray",
  "sampler2DArrayShadow",
  "isampler2D",
  "isampler3D",
  "isamplerCube",
  "isampler2DArray",
  "usampler2D",
  "usampler3D",
  "usamplerCube",
  "usampler2DArray",
  // Vulkan-GLSL separated texture/sampler types
  "texture2D",
  "texture3D",
  "textureCube",
  "texture2DArray",
  "texture2DShadow",
  "textureCubeShadow",
  "texture2DArrayShadow",
  "itexture2D",
  "itexture3D",
  "itextureCube",
  "itexture2DArray",
  "utexture2D",
  "utexture3D",
  "utextureCube",
  "utexture2DArray",
  "sampler",
  "samplerShadow"
]);

const QUALIFIERS = new Set([
  "const",
  "in",
  "out",
  "inout",
  "uniform",
  "flat",
  "smooth",
  "centroid",
  "invariant",
  "precise",
  "highp",
  "mediump",
  "lowp",
  "readonly",
  "writeonly",
  "coherent",
  "volatile",
  "restrict"
]);

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", "&=", "^=", "|="]);

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  const len = source.length;
  let i = 0;

  while (i < len) {
    const c = source.charCodeAt(i);
    // Whitespace
    if (c <= 32) {
      i++;
      continue;
    }
    // Line comment
    if (c === 47 && source.charCodeAt(i + 1) === 47) {
      i += 2;
      while (i < len && source.charCodeAt(i) !== 10) i++;
      continue;
    }
    // Block comment
    if (c === 47 && source.charCodeAt(i + 1) === 42) {
      i += 2;
      while (i + 1 < len && !(source.charCodeAt(i) === 42 && source.charCodeAt(i + 1) === 47)) i++;
      i += 2;
      continue;
    }
    // Preprocessor directive (#version, #extension, #line, #pragma)
    if (c === 35) {
      while (i < len && source.charCodeAt(i) !== 10) {
        if (source.charCodeAt(i) === 92 && source.charCodeAt(i + 1) === 10) i += 2;
        else if (source.charCodeAt(i) === 92 && source.charCodeAt(i + 1) === 13 && source.charCodeAt(i + 2) === 10)
          i += 3;
        else i++;
      }
      continue;
    }
    // Identifier
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) {
      const start = i++;
      while (i < len) {
        const ch = source.charCodeAt(i);
        if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || (ch >= 48 && ch <= 57) || ch === 95) i++;
        else break;
      }
      out.push({ kind: TokKind.Ident, text: source.slice(start, i) });
      continue;
    }
    // Numeric literal (int, hex, uint, float)
    if ((c >= 48 && c <= 57) || (c === 46 && source.charCodeAt(i + 1) >= 48 && source.charCodeAt(i + 1) <= 57)) {
      const start = i;
      if (c === 48 && (source.charCodeAt(i + 1) === 120 || source.charCodeAt(i + 1) === 88)) {
        i += 2;
        while (i < len) {
          const ch = source.charCodeAt(i);
          if ((ch >= 48 && ch <= 57) || (ch >= 65 && ch <= 70) || (ch >= 97 && ch <= 102)) i++;
          else break;
        }
        let isUint = false;
        if (i < len && (source.charCodeAt(i) === 117 || source.charCodeAt(i) === 85)) {
          isUint = true;
          i++;
        }
        out.push({ kind: isUint ? TokKind.Uint : TokKind.Int, text: source.slice(start, i) });
        continue;
      }
      let isFloat = false;
      while (i < len && source.charCodeAt(i) >= 48 && source.charCodeAt(i) <= 57) i++;
      if (i < len && source.charCodeAt(i) === 46) {
        isFloat = true;
        i++;
        while (i < len && source.charCodeAt(i) >= 48 && source.charCodeAt(i) <= 57) i++;
      }
      if (i < len && (source.charCodeAt(i) === 101 || source.charCodeAt(i) === 69)) {
        isFloat = true;
        i++;
        if (i < len && (source.charCodeAt(i) === 43 || source.charCodeAt(i) === 45)) i++;
        while (i < len && source.charCodeAt(i) >= 48 && source.charCodeAt(i) <= 57) i++;
      }
      let isUint = false;
      if (i < len) {
        const suf = source.charCodeAt(i);
        if (suf === 102 || suf === 70) {
          isFloat = true;
          i++;
        } else if (suf === 117 || suf === 85) {
          isUint = true;
          i++;
        }
      }
      out.push({
        kind: isFloat ? TokKind.Float : isUint ? TokKind.Uint : TokKind.Int,
        text: source.slice(start, i)
      });
      continue;
    }
    // 3-char operators
    const s3 = source.slice(i, i + 3);
    if (s3 === "<<=" || s3 === ">>=") {
      out.push({ kind: TokKind.Punct, text: s3 });
      i += 3;
      continue;
    }
    // 2-char operators
    const s2 = source.slice(i, i + 2);
    if (
      s2 === "++" ||
      s2 === "--" ||
      s2 === "<<" ||
      s2 === ">>" ||
      s2 === "<=" ||
      s2 === ">=" ||
      s2 === "==" ||
      s2 === "!=" ||
      s2 === "&&" ||
      s2 === "||" ||
      s2 === "^^" ||
      s2 === "+=" ||
      s2 === "-=" ||
      s2 === "*=" ||
      s2 === "/=" ||
      s2 === "%=" ||
      s2 === "&=" ||
      s2 === "^=" ||
      s2 === "|="
    ) {
      out.push({ kind: TokKind.Punct, text: s2 });
      i += 2;
      continue;
    }
    out.push({ kind: TokKind.Punct, text: source[i++] });
  }
  out.push({ kind: TokKind.Eof, text: "" });
  return out;
}

class Parser {
  private pos = 0;
  private readonly structs = new Set<string>();

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== TokKind.Eof) this.pos++;
    return t;
  }

  private match(text: string): boolean {
    if (this.peek().text === text) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(text: string): Token {
    const t = this.next();
    if (t.text !== text) {
      const ctx = this.tokens
        .slice(Math.max(0, this.pos - 6), Math.min(this.tokens.length, this.pos + 6))
        .map((x) => x.text)
        .join(" ");
      throw new Error(`GLSL parser: expected '${text}', got '${t.text}' near: ${ctx}`);
    }
    return t;
  }

  private expectIdent(): string {
    const t = this.next();
    if (t.kind !== TokKind.Ident) {
      const ctx = this.tokens
        .slice(Math.max(0, this.pos - 6), Math.min(this.tokens.length, this.pos + 6))
        .map((x) => x.text)
        .join(" ");
      throw new Error(`GLSL parser: expected identifier, got '${t.text}' near: ${ctx}`);
    }
    return t.text;
  }

  private isTypeName(name: string): boolean {
    return BUILTIN_TYPES.has(name) || this.structs.has(name);
  }

  parseModule(): ShaderModuleAST {
    const decls: TopLevelDecl[] = [];
    while (this.peek().kind !== TokKind.Eof) {
      if (this.match(";")) continue;
      decls.push(...this.parseTopLevel());
    }
    return { decls };
  }

  private parseLayoutQualifier(): LayoutQualifier | undefined {
    if (this.peek().text !== "layout") return undefined;
    const layout: LayoutQualifier = {};
    while (this.match("layout")) {
      this.expect("(");
      while (this.peek().text !== ")" && this.peek().kind !== TokKind.Eof) {
        const key = this.expectIdent();
        if (this.match("=")) {
          const valTok = this.next();
          const val = parseInt(valTok.text, 10);
          if (key === "location") layout.location = val;
          else if (key === "set") layout.set = val;
          else if (key === "binding") layout.binding = val;
        } else {
          if (key === "std140") layout.std140 = true;
          else if (key === "row_major") layout.rowMajor = true;
        }
        this.match(",");
      }
      this.expect(")");
    }
    return layout;
  }

  private parseQualifiers(): string[] {
    const quals: string[] = [];
    while (this.peek().kind === TokKind.Ident && QUALIFIERS.has(this.peek().text)) {
      quals.push(this.next().text);
    }
    return quals;
  }

  private parseArraySpec(): ExprNode | null | undefined {
    if (!this.match("[")) return undefined;
    if (this.match("]")) return null;
    const expr = this.parseExpression();
    this.expect("]");
    return expr;
  }

  private parseTopLevel(): TopLevelDecl[] {
    if (this.peek().text === "precision") {
      while (this.peek().kind !== TokKind.Eof && !this.match(";")) this.next();
      return [{ kind: "PrecisionDecl" }];
    }

    const layout = this.parseLayoutQualifier();
    const qualifiers = this.parseQualifiers();
    // Allow layout(...) after qualifiers or interleaved
    const layout2 = this.parseLayoutQualifier();
    const mergedLayout = layout || layout2 ? { ...layout, ...layout2 } : undefined;
    if (layout2) qualifiers.push(...this.parseQualifiers());

    // struct definition (optionally followed by global var declarators)
    if (this.peek().text === "struct") {
      this.next();
      const name = this.peek().kind === TokKind.Ident ? this.next().text : `gs_anon_struct_${this.pos}`;
      this.expect("{");
      const fields = this.parseStructFields();
      this.expect("}");
      this.structs.add(name);
      const decls: TopLevelDecl[] = [{ kind: "StructDecl", name, fields }];
      if (this.match(";")) return decls;
      // Inline variable declaration: `struct Foo { ... } bar;`
      const declarators = this.parseVarDeclaratorList();
      this.expect(";");
      decls.push({
        kind: "GlobalVarDecl",
        layout: mergedLayout,
        qualifiers,
        type: { name },
        declarators
      });
      return decls;
    }

    // Uniform block: [layout(...)] uniform BlockName { ... } [instanceName];
    if (qualifiers.includes("uniform") && this.peek().kind === TokKind.Ident && this.peek(1).text === "{") {
      const blockName = this.next().text;
      this.expect("{");
      const fields = this.parseStructFields();
      this.expect("}");
      let instanceName: string | undefined;
      if (this.peek().kind === TokKind.Ident) {
        instanceName = this.next().text;
      }
      this.expect(";");
      return [
        {
          kind: "UniformBlockDecl",
          layout: mergedLayout ?? {},
          blockName,
          fields,
          instanceName
        }
      ];
    }

    // Type + identifier -> function or global variable
    const typeName = this.expectIdent();
    const typeArray = this.parseArraySpec();
    const type: TypeRef = { name: typeName, arraySize: typeArray };

    // Function declaration / definition
    if (this.peek().kind === TokKind.Ident && this.peek(1).text === "(") {
      const fnName = this.next().text;
      const params = this.parseParamList();
      if (this.match(";")) {
        return [{ kind: "FunctionDecl", returnType: type, name: fnName, params, body: null }];
      }
      const body = this.parseBlock();
      return [{ kind: "FunctionDecl", returnType: type, name: fnName, params, body }];
    }

    // Global variable declaration
    const declarators = this.parseVarDeclaratorList();
    this.expect(";");
    return [{ kind: "GlobalVarDecl", layout: mergedLayout, qualifiers, type, declarators }];
  }

  private parseStructFields(): StructField[] {
    const fields: StructField[] = [];
    while (this.peek().text !== "}" && this.peek().kind !== TokKind.Eof) {
      if (this.match(";")) continue;
      const layout = this.parseLayoutQualifier();
      const qualifiers = this.parseQualifiers();
      const typeName = this.expectIdent();
      const typeArray = this.parseArraySpec();
      do {
        const name = this.expectIdent();
        const arraySize = this.parseArraySpec();
        fields.push({
          layout,
          qualifiers,
          type: { name: typeName, arraySize: typeArray },
          name,
          arraySize: arraySize !== undefined ? arraySize : typeArray
        });
      } while (this.match(","));
      this.expect(";");
    }
    return fields;
  }

  private parseParamList(): ParamDecl[] {
    this.expect("(");
    const params: ParamDecl[] = [];
    if (this.match(")")) return params;
    // Handle `fn(void)`
    if (this.peek().text === "void" && this.peek(1).text === ")") {
      this.next();
      this.expect(")");
      return params;
    }
    do {
      const qualifiers = this.parseQualifiers();
      const typeName = this.expectIdent();
      const typeArray = this.parseArraySpec();
      let name = "";
      let arraySize = typeArray;
      if (this.peek().kind === TokKind.Ident) {
        name = this.next().text;
        const postArr = this.parseArraySpec();
        if (postArr !== undefined) arraySize = postArr;
      }
      params.push({ qualifiers, type: { name: typeName, arraySize: typeArray }, name, arraySize });
    } while (this.match(","));
    this.expect(")");
    return params;
  }

  private parseVarDeclaratorList(): VarDeclarator[] {
    const list: VarDeclarator[] = [];
    do {
      const name = this.expectIdent();
      const arraySize = this.parseArraySpec();
      let init: ExprNode | undefined;
      if (this.match("=")) {
        init = this.parseInitializer();
      }
      list.push({ name, arraySize, init });
    } while (this.match(","));
    return list;
  }

  private parseInitializer(): ExprNode {
    if (this.match("{")) {
      const elements: ExprNode[] = [];
      if (!this.match("}")) {
        do {
          if (this.peek().text === "}") break; // trailing comma
          elements.push(this.parseInitializer());
        } while (this.match(","));
        this.expect("}");
      }
      return { kind: "InitListExpr", elements };
    }
    return this.parseAssignment();
  }

  private parseBlock(): BlockStmt {
    this.expect("{");
    const stmts: StmtNode[] = [];
    while (this.peek().text !== "}" && this.peek().kind !== TokKind.Eof) {
      stmts.push(this.parseStmt());
    }
    this.expect("}");
    return { kind: "BlockStmt", stmts };
  }

  private isVarDeclStart(): boolean {
    let offset = 0;
    while (this.peek(offset).kind === TokKind.Ident && QUALIFIERS.has(this.peek(offset).text)) {
      offset++;
    }
    if (offset > 0) return true;
    const t0 = this.peek(offset);
    if (t0.kind !== TokKind.Ident || !this.isTypeName(t0.text)) return false;
    // Distinguish `vec3 x;` / `float[2] x;` from `vec3(1.0);` or `float[2](1.0, 2.0);`
    let nextOff = offset + 1;
    if (this.peek(nextOff).text === "[") {
      // Skip balanced `[...]`
      let depth = 1;
      nextOff++;
      while (depth > 0 && this.peek(nextOff).kind !== TokKind.Eof) {
        const tx = this.peek(nextOff).text;
        if (tx === "[") depth++;
        else if (tx === "]") depth--;
        nextOff++;
      }
    }
    return this.peek(nextOff).kind === TokKind.Ident;
  }

  private parseVarDeclStmt(consumeSemi = true): VarDeclStmt {
    const qualifiers = this.parseQualifiers();
    const typeName = this.expectIdent();
    const typeArray = this.parseArraySpec();
    const declarators = this.parseVarDeclaratorList();
    if (consumeSemi) this.expect(";");
    return { kind: "VarDeclStmt", qualifiers, type: { name: typeName, arraySize: typeArray }, declarators };
  }

  private parseStmt(): StmtNode {
    const tok = this.peek();
    if (tok.text === "{") return this.parseBlock();
    if (tok.text === ";") {
      this.next();
      return { kind: "ExprStmt", expr: null };
    }
    if (tok.text === "if") {
      this.next();
      this.expect("(");
      const cond = this.parseExpression();
      this.expect(")");
      const thenBranch = this.parseStmt();
      const elseBranch = this.match("else") ? this.parseStmt() : null;
      return { kind: "IfStmt", cond, thenBranch, elseBranch };
    }
    if (tok.text === "for") {
      this.next();
      this.expect("(");
      let init: VarDeclStmt | { kind: "ExprStmt"; expr: ExprNode | null } | null = null;
      if (this.match(";")) {
        init = null;
      } else if (this.isVarDeclStart()) {
        init = this.parseVarDeclStmt(true);
      } else {
        const expr = this.parseExpression();
        this.expect(";");
        init = { kind: "ExprStmt", expr };
      }
      let cond: ExprNode | null = null;
      if (!this.match(";")) {
        cond = this.parseExpression();
        this.expect(";");
      }
      let step: ExprNode | null = null;
      if (!this.match(")")) {
        step = this.parseExpression();
        this.expect(")");
      }
      const body = this.parseStmt();
      return { kind: "ForStmt", init, cond, step, body };
    }
    if (tok.text === "while") {
      this.next();
      this.expect("(");
      const cond = this.parseExpression();
      this.expect(")");
      const body = this.parseStmt();
      return { kind: "WhileStmt", cond, body };
    }
    if (tok.text === "do") {
      this.next();
      const body = this.parseStmt();
      this.expect("while");
      this.expect("(");
      const cond = this.parseExpression();
      this.expect(")");
      this.expect(";");
      return { kind: "DoWhileStmt", body, cond };
    }
    if (tok.text === "switch") {
      this.next();
      this.expect("(");
      const expr = this.parseExpression();
      this.expect(")");
      this.expect("{");
      const cases: SwitchCase[] = [];
      while (this.peek().text !== "}" && this.peek().kind !== TokKind.Eof) {
        let caseExpr: ExprNode | null = null;
        if (this.match("case")) {
          caseExpr = this.parseExpression();
          this.expect(":");
        } else if (this.match("default")) {
          this.expect(":");
        } else {
          throw new Error(`GLSL parser: expected 'case' or 'default' in switch, got '${this.peek().text}'`);
        }
        const stmts: StmtNode[] = [];
        while (
          this.peek().kind !== TokKind.Eof &&
          this.peek().text !== "}" &&
          this.peek().text !== "case" &&
          this.peek().text !== "default"
        ) {
          stmts.push(this.parseStmt());
        }
        cases.push({ expr: caseExpr, stmts });
      }
      this.expect("}");
      return { kind: "SwitchStmt", expr, cases };
    }
    if (tok.text === "return") {
      this.next();
      if (this.match(";")) return { kind: "ReturnStmt", expr: null };
      const expr = this.parseExpression();
      this.expect(";");
      return { kind: "ReturnStmt", expr };
    }
    if (tok.text === "break") {
      this.next();
      this.expect(";");
      return { kind: "BreakStmt" };
    }
    if (tok.text === "continue") {
      this.next();
      this.expect(";");
      return { kind: "ContinueStmt" };
    }
    if (tok.text === "discard") {
      this.next();
      this.expect(";");
      return { kind: "DiscardStmt" };
    }
    if (tok.text === "precision") {
      while (this.peek().kind !== TokKind.Eof && !this.match(";")) this.next();
      return { kind: "ExprStmt", expr: null };
    }
    if (this.isVarDeclStart()) {
      return this.parseVarDeclStmt(true);
    }
    const expr = this.parseExpression();
    this.expect(";");
    return { kind: "ExprStmt", expr };
  }

  private parseExpression(): ExprNode {
    const first = this.parseAssignment();
    if (!this.match(",")) return first;
    const exprs: ExprNode[] = [first];
    do {
      exprs.push(this.parseAssignment());
    } while (this.match(","));
    return { kind: "CommaExpr", exprs };
  }

  private parseAssignment(): ExprNode {
    const left = this.parseTernary();
    if (ASSIGN_OPS.has(this.peek().text)) {
      const op = this.next().text;
      const right = this.parseAssignment();
      return { kind: "AssignExpr", op, left, right };
    }
    return left;
  }

  private parseTernary(): ExprNode {
    const cond = this.parseLogicalOr();
    if (!this.match("?")) return cond;
    const thenExpr = this.parseExpression();
    this.expect(":");
    const elseExpr = this.parseAssignment();
    return { kind: "TernaryExpr", cond, thenExpr, elseExpr };
  }

  private parseLogicalOr(): ExprNode {
    let left = this.parseLogicalXor();
    while (this.match("||")) {
      left = { kind: "BinaryExpr", op: "||", left, right: this.parseLogicalXor() };
    }
    return left;
  }

  private parseLogicalXor(): ExprNode {
    let left = this.parseLogicalAnd();
    while (this.match("^^")) {
      left = { kind: "BinaryExpr", op: "^^", left, right: this.parseLogicalAnd() };
    }
    return left;
  }

  private parseLogicalAnd(): ExprNode {
    let left = this.parseBitOr();
    while (this.match("&&")) {
      left = { kind: "BinaryExpr", op: "&&", left, right: this.parseBitOr() };
    }
    return left;
  }

  private parseBitOr(): ExprNode {
    let left = this.parseBitXor();
    while (this.match("|")) {
      left = { kind: "BinaryExpr", op: "|", left, right: this.parseBitXor() };
    }
    return left;
  }

  private parseBitXor(): ExprNode {
    let left = this.parseBitAnd();
    while (this.match("^")) {
      left = { kind: "BinaryExpr", op: "^", left, right: this.parseBitAnd() };
    }
    return left;
  }

  private parseBitAnd(): ExprNode {
    let left = this.parseEquality();
    while (this.match("&")) {
      left = { kind: "BinaryExpr", op: "&", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): ExprNode {
    let left = this.parseRelational();
    while (this.peek().text === "==" || this.peek().text === "!=") {
      const op = this.next().text;
      left = { kind: "BinaryExpr", op, left, right: this.parseRelational() };
    }
    return left;
  }

  private parseRelational(): ExprNode {
    let left = this.parseShift();
    while (
      this.peek().text === "<" ||
      this.peek().text === ">" ||
      this.peek().text === "<=" ||
      this.peek().text === ">="
    ) {
      const op = this.next().text;
      left = { kind: "BinaryExpr", op, left, right: this.parseShift() };
    }
    return left;
  }

  private parseShift(): ExprNode {
    let left = this.parseAdditive();
    while (this.peek().text === "<<" || this.peek().text === ">>") {
      const op = this.next().text;
      left = { kind: "BinaryExpr", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): ExprNode {
    let left = this.parseMultiplicative();
    while (this.peek().text === "+" || this.peek().text === "-") {
      const op = this.next().text;
      left = { kind: "BinaryExpr", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): ExprNode {
    let left = this.parseUnary();
    while (this.peek().text === "*" || this.peek().text === "/" || this.peek().text === "%") {
      const op = this.next().text;
      left = { kind: "BinaryExpr", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    const t = this.peek().text;
    if (t === "+" || t === "-" || t === "!" || t === "~" || t === "++" || t === "--") {
      this.next();
      return { kind: "UnaryExpr", op: t, expr: this.parseUnary(), prefix: true };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): ExprNode {
    let expr = this.parsePrimary();
    while (true) {
      if (this.match("[")) {
        const index = this.parseExpression();
        this.expect("]");
        expr = { kind: "IndexExpr", object: expr, index };
      } else if (this.match(".")) {
        const field = this.expectIdent();
        if (this.match("(")) {
          const args = this.parseCallArgs();
          expr = { kind: "MethodCallExpr", object: expr, method: field, args };
        } else {
          expr = { kind: "MemberExpr", object: expr, field };
        }
      } else if (this.peek().text === "++" || this.peek().text === "--") {
        const op = this.next().text as "++" | "--";
        expr = { kind: "UnaryExpr", op, expr, prefix: false };
      } else {
        break;
      }
    }
    return expr;
  }

  private parseCallArgs(): ExprNode[] {
    const args: ExprNode[] = [];
    if (this.match(")")) return args;
    do {
      args.push(this.parseAssignment());
    } while (this.match(","));
    this.expect(")");
    return args;
  }

  private parsePrimary(): ExprNode {
    const tok = this.peek();
    if (tok.kind === TokKind.Int) {
      this.next();
      return { kind: "LiteralExpr", litKind: "int", raw: tok.text };
    }
    if (tok.kind === TokKind.Uint) {
      this.next();
      return { kind: "LiteralExpr", litKind: "uint", raw: tok.text };
    }
    if (tok.kind === TokKind.Float) {
      this.next();
      return { kind: "LiteralExpr", litKind: "float", raw: tok.text };
    }
    if (tok.kind === TokKind.Ident && (tok.text === "true" || tok.text === "false")) {
      this.next();
      return { kind: "LiteralExpr", litKind: "bool", raw: tok.text };
    }
    if (this.match("(")) {
      const expr = this.parseExpression();
      this.expect(")");
      return { kind: "ParenExpr", expr };
    }
    if (tok.kind === TokKind.Ident) {
      const name = this.next().text;
      // Array constructor: `float[10](...)` or `float[](...)`
      if (this.isTypeName(name) && this.peek().text === "[") {
        const saved = this.pos;
        const arrSize = this.parseArraySpec();
        if (this.match("(")) {
          const args = this.parseCallArgs();
          return { kind: "CallExpr", callee: name, calleeArraySize: arrSize, args };
        }
        this.pos = saved;
      }
      if (this.match("(")) {
        const args = this.parseCallArgs();
        return { kind: "CallExpr", callee: name, args };
      }
      return { kind: "IdentExpr", name };
    }
    const ctx = this.tokens
      .slice(Math.max(0, this.pos - 6), Math.min(this.tokens.length, this.pos + 6))
      .map((x) => x.text)
      .join(" ");
    throw new Error(`GLSL parser: unexpected token '${tok.text}' near: ${ctx}`);
  }
}

export function parseGLSLModule(source: string): ShaderModuleAST {
  return new Parser(tokenize(source)).parseModule();
}
