import type {
  AssignExpr,
  BlockStmt,
  CallExpr,
  ExprNode,
  FunctionDecl,
  GlobalVarDecl,
  ParamDecl,
  ShaderModuleAST,
  StmtNode,
  StructDecl,
  StructField,
  SwitchStmt,
  TypeRef,
  UnaryExpr,
  UniformBlockDecl,
  VarDeclStmt
} from "./GLSLAst";
import { parseGLSLModule } from "./GLSLParser";
import {
  formatFloatLiteral,
  formatIntLiteral,
  formatUintLiteral,
  glslBaseToWGSL,
  glslTypeToWGSL,
  inferBinaryType,
  inferBuiltinReturnType,
  isSamplerOrTextureType,
  isScalarType,
  makeMatrixType,
  makeVectorType,
  matrixDims,
  scalarFamily,
  T_BOOL,
  T_FLOAT,
  T_INT,
  T_UINT,
  T_UNKNOWN,
  T_VEC2,
  T_VEC3,
  T_VEC4,
  T_VOID,
  typeKey,
  vectorSize,
  WGSL_RESERVED,
  type GType
} from "./WGSLTypeSystem";

export type ShaderStageKind = "vertex" | "fragment";

interface VarInfo {
  wgslName: string;
  type: GType;
  isPtr?: boolean; // true for out/inout function parameters (`ptr<function, T>`)
  isConst?: boolean; // true for WGSL `const` declarations
  uboVar?: string; // non-empty for members of anonymous uniform blocks (`uboVar.field`)
  isPrivate?: boolean; // true for `var<private>` module-scope globals
}

interface FnSignature {
  decl: FunctionDecl;
  wgslName: string;
  returnType: GType;
  paramTypes: GType[];
  paramModes: ("in" | "out" | "inout")[];
}

interface IOField {
  glslName: string;
  wgslVar: string;
  location: number;
  type: GType;
  flat: boolean;
  isInput: boolean;
}

interface StructInfo {
  wgslName: string;
  fields: Map<string, { wgslName: string; type: GType }>;
  fieldOrder: { glslName: string; wgslName: string; type: GType }[];
}

interface EmittedExpr {
  code: string;
  type: GType;
}

const GLSL_BUILTIN_INT_LIMITS: Record<string, number> = {
  gl_MaxVertexAttribs: 16,
  gl_MaxVertexUniformVectors: 256,
  gl_MaxVertexOutputVectors: 16,
  gl_MaxFragmentInputVectors: 15,
  gl_MaxVertexTextureImageUnits: 16,
  gl_MaxCombinedTextureImageUnits: 32,
  gl_MaxTextureImageUnits: 16,
  gl_MaxFragmentUniformVectors: 256,
  gl_MaxDrawBuffers: 8,
  gl_MinProgramTexelOffset: -8,
  gl_MaxProgramTexelOffset: 7
};

const TEXTURE_BUILTINS = new Set([
  "texture",
  "texture2D",
  "textureCube",
  "textureLod",
  "texture2DLod",
  "texture2DLodEXT",
  "textureCubeLod",
  "textureCubeLodEXT",
  "textureOffset",
  "textureLodOffset",
  "textureGrad",
  "textureGradOffset",
  "textureProj",
  "textureProjLod",
  "textureProjOffset",
  "textureProjLodOffset",
  "textureProjGrad",
  "textureProjGradOffset",
  "texelFetch",
  "texelFetchOffset",
  "textureSize"
]);

const SWIZZLE_CHARS = /^[xyzwrgba stpq]+$/;
const isValidSwizzle = (s: string): boolean =>
  s.length >= 1 && s.length <= 4 && (/^[xyzw]+$/.test(s) || /^[rgba]+$/.test(s) || /^[stpq]+$/.test(s));

const normalizeSwizzle = (s: string): string => {
  const map: Record<string, string> = {
    r: "x",
    g: "y",
    b: "z",
    a: "w",
    s: "x",
    t: "y",
    p: "z",
    q: "w"
  };
  let out = "";
  for (let i = 0; i < s.length; i++) out += map[s[i]] ?? s[i];
  return out;
};

class WGSLEmitter {
  private readonly stage: ShaderStageKind;
  private readonly structs = new Map<string, StructInfo>();
  private readonly structNameMap = new Map<string, string>();
  private readonly functions = new Map<string, FnSignature[]>();
  private readonly fnByDecl = new Map<FunctionDecl, FnSignature>();
  private readonly globalScope = new Map<string, VarInfo>();
  private readonly scopes: Map<string, VarInfo>[] = [];
  private readonly usedNames = new Set<string>();
  private readonly helpers = new Map<string, string>();

  private readonly inputs: IOField[] = [];
  private readonly outputs: IOField[] = [];
  private readonly uboStructs: string[] = [];
  private readonly globalDecls: string[] = [];
  private readonly globalInitStmts: string[] = [];

  // Builtin usage flags
  private usesPosition = false;
  private usesVertexIndex = false;
  private usesInstanceIndex = false;
  private usesFragCoord = false;
  private usesFrontFacing = false;
  private usesFragDepth = false;
  private usesPointSize = false;
  private usesPointCoord = false;

  private tempCounter = 0;
  private currentFn: FnSignature | null = null;
  private hoistQueue: string[] = [];

  constructor(stage: ShaderStageKind) {
    this.stage = stage;
    this.scopes.push(this.globalScope);
  }

  emit(ast: ShaderModuleAST): string {
    // 1. Collect all declared names so generated identifiers never collide
    this.collectAllNames(ast);

    // 2. Register structs, uniform blocks, globals, and function signatures
    for (const decl of ast.decls) {
      if (decl.kind === "StructDecl") this.registerStruct(decl);
    }
    for (const decl of ast.decls) {
      if (decl.kind === "UniformBlockDecl") this.registerUniformBlock(decl);
      else if (decl.kind === "GlobalVarDecl") this.registerGlobalVar(decl);
    }
    this.registerFunctions(ast);

    // 3. Scan builtins referenced across all function bodies
    for (const decl of ast.decls) {
      if (decl.kind === "FunctionDecl" && decl.body) this.scanBuiltinsInStmt(decl.body);
    }

    // 4. Emit struct definitions, UBO structs, globals, and functions
    const parts: string[] = [];
    for (const decl of ast.decls) {
      if (decl.kind === "StructDecl") {
        parts.push(this.emitStructDecl(decl));
      } else if (decl.kind === "UniformBlockDecl") {
        parts.push(this.emitUniformBlockDecl(decl));
      } else if (decl.kind === "GlobalVarDecl") {
        const s = this.emitGlobalVarDecl(decl);
        if (s) parts.push(s);
      }
    }

    // Emit private globals for stage IO and builtins
    const ioPrivates = this.emitStageIOPrivates();
    if (ioPrivates) parts.push(ioPrivates);

    // Emit user functions (definition order; rename `main` to `gs_user_main`)
    const fnParts: string[] = [];
    for (const decl of ast.decls) {
      if (decl.kind === "FunctionDecl" && decl.body) {
        fnParts.push(this.emitFunctionDecl(decl));
      }
    }

    // Emit entry point structs + `@vertex fn main` / `@fragment fn main`
    const entryCode = this.emitEntryPoint();

    // Assemble final module with helpers before functions
    const helperCode = Array.from(this.helpers.values());
    return [...parts, ...this.uboStructs, ...this.globalDecls, ...helperCode, ...fnParts, entryCode]
      .filter((s) => s.length > 0)
      .join("\n\n");
  }

  private collectAllNames(ast: ShaderModuleAST): void {
    const add = (n?: string) => {
      if (n) this.usedNames.add(n);
    };
    const walkExpr = (e: ExprNode | null | undefined) => {
      if (!e) return;
      switch (e.kind) {
        case "IdentExpr":
          add(e.name);
          break;
        case "CallExpr":
          add(e.callee);
          walkExpr(e.calleeArraySize);
          e.args.forEach(walkExpr);
          break;
        case "MemberExpr":
          walkExpr(e.object);
          add(e.field);
          break;
        case "MethodCallExpr":
          walkExpr(e.object);
          e.args.forEach(walkExpr);
          break;
        case "IndexExpr":
          walkExpr(e.object);
          walkExpr(e.index);
          break;
        case "UnaryExpr":
          walkExpr(e.expr);
          break;
        case "BinaryExpr":
        case "AssignExpr":
          walkExpr(e.left);
          walkExpr(e.right);
          break;
        case "TernaryExpr":
          walkExpr(e.cond);
          walkExpr(e.thenExpr);
          walkExpr(e.elseExpr);
          break;
        case "CommaExpr":
          e.exprs.forEach(walkExpr);
          break;
        case "InitListExpr":
          e.elements.forEach(walkExpr);
          break;
        case "ParenExpr":
          walkExpr(e.expr);
          break;
      }
    };
    const walkStmt = (s: StmtNode | null | undefined) => {
      if (!s) return;
      switch (s.kind) {
        case "BlockStmt":
          s.stmts.forEach(walkStmt);
          break;
        case "VarDeclStmt":
          s.declarators.forEach((d) => {
            add(d.name);
            walkExpr(d.arraySize);
            walkExpr(d.init);
          });
          break;
        case "ExprStmt":
          walkExpr(s.expr);
          break;
        case "IfStmt":
          walkExpr(s.cond);
          walkStmt(s.thenBranch);
          walkStmt(s.elseBranch);
          break;
        case "ForStmt":
          walkStmt(s.init);
          walkExpr(s.cond);
          walkExpr(s.step);
          walkStmt(s.body);
          break;
        case "WhileStmt":
        case "DoWhileStmt":
          walkExpr(s.cond);
          walkStmt(s.body);
          break;
        case "SwitchStmt":
          walkExpr(s.expr);
          s.cases.forEach((c) => {
            walkExpr(c.expr);
            c.stmts.forEach(walkStmt);
          });
          break;
        case "ReturnStmt":
          walkExpr(s.expr);
          break;
      }
    };
    for (const d of ast.decls) {
      if (d.kind === "StructDecl") {
        add(d.name);
        d.fields.forEach((f) => add(f.name));
      } else if (d.kind === "UniformBlockDecl") {
        add(d.blockName);
        add(d.instanceName);
        d.fields.forEach((f) => add(f.name));
      } else if (d.kind === "GlobalVarDecl") {
        d.declarators.forEach((x) => {
          add(x.name);
          walkExpr(x.init);
        });
      } else if (d.kind === "FunctionDecl") {
        add(d.name);
        d.params.forEach((p) => add(p.name));
        walkStmt(d.body);
      }
    }
  }

  private freshName(prefix: string): string {
    let name = `${prefix}_${this.tempCounter++}`;
    while (this.usedNames.has(name) || WGSL_RESERVED.has(name)) {
      name = `${prefix}_${this.tempCounter++}`;
    }
    this.usedNames.add(name);
    return name;
  }

  private safeIdent(name: string, allowRaw = false): string {
    if (allowRaw && !WGSL_RESERVED.has(name)) return name;
    if (!WGSL_RESERVED.has(name) && !name.startsWith("__")) return name;
    let candidate = `gs_id_${name.replace(/^_+/, "")}`;
    while (this.usedNames.has(candidate) || WGSL_RESERVED.has(candidate)) {
      candidate += "_";
    }
    this.usedNames.add(candidate);
    return candidate;
  }

  private safeFieldIdent(name: string): string {
    if (!WGSL_RESERVED.has(name) && !name.startsWith("__")) return name;
    return `gs_f_${name.replace(/^_+/, "")}`;
  }

  private resolveType(ref: TypeRef, declaratorArray?: ExprNode | null): GType {
    const arr = declaratorArray !== undefined ? declaratorArray : ref.arraySize;
    if (arr === undefined) return { base: ref.name };
    if (arr === null) return { base: ref.name, arraySize: "" };
    const size = this.evalConstExprString(arr);
    return { base: ref.name, arraySize: size };
  }

  private evalConstExprString(expr: ExprNode): string {
    const prevHoist = this.hoistQueue;
    this.hoistQueue = [];
    const res = this.emitExpr(expr).code;
    this.hoistQueue = prevHoist;
    return res;
  }

  private registerStruct(decl: StructDecl): void {
    const wgslName = this.safeIdent(decl.name);
    this.structNameMap.set(decl.name, wgslName);
    const fields = new Map<string, { wgslName: string; type: GType }>();
    const fieldOrder: { glslName: string; wgslName: string; type: GType }[] = [];
    for (const f of decl.fields) {
      const fType = this.resolveType(f.type, f.arraySize);
      const wgslField = this.safeFieldIdent(f.name);
      fields.set(f.name, { wgslName: wgslField, type: fType });
      fieldOrder.push({ glslName: f.name, wgslName: wgslField, type: fType });
    }
    this.structs.set(decl.name, { wgslName, fields, fieldOrder });
  }

  private registerUniformBlock(decl: UniformBlockDecl): void {
    const structWgslName = decl.blockName;
    const fields = new Map<string, { wgslName: string; type: GType }>();
    const fieldOrder: { glslName: string; wgslName: string; type: GType }[] = [];
    for (const f of decl.fields) {
      const fType = this.resolveType(f.type, f.arraySize);
      const wgslField = this.safeFieldIdent(f.name);
      fields.set(f.name, { wgslName: wgslField, type: fType });
      fieldOrder.push({ glslName: f.name, wgslName: wgslField, type: fType });
    }
    this.structs.set(decl.blockName, { wgslName: structWgslName, fields, fieldOrder });

    if (decl.instanceName) {
      const instWgsl = this.safeIdent(decl.instanceName, true);
      this.globalScope.set(decl.instanceName, {
        wgslName: instWgsl,
        type: { base: decl.blockName }
      });
    } else {
      const uboVar = this.freshName(`gs_ubo_${decl.blockName}`);
      // Store uboVar on decl via map lookup in globalScope
      this.globalScope.set(`__ubo_var__${decl.blockName}`, { wgslName: uboVar, type: { base: decl.blockName } });
      for (const f of fieldOrder) {
        this.globalScope.set(f.glslName, {
          wgslName: f.wgslName,
          type: f.type,
          uboVar
        });
      }
    }
  }

  private registerGlobalVar(decl: GlobalVarDecl): void {
    const isUniform = decl.qualifiers.includes("uniform");
    const isIn = decl.qualifiers.includes("in");
    const isOut = decl.qualifiers.includes("out");
    const isConst = decl.qualifiers.includes("const");
    const isFlat = decl.qualifiers.includes("flat");

    for (const d of decl.declarators) {
      const type = this.resolveType(decl.type, d.arraySize);
      if (isUniform && isSamplerOrTextureType(type.base)) {
        // Keep exact texture/sampler variable name (already prefixed gs_wgpu_tex_/gs_wgpu_samp_)
        this.globalScope.set(d.name, { wgslName: d.name, type });
      } else if (isIn || isOut) {
        const wgslVar = this.safeIdent(d.name, true);
        const ioField: IOField = {
          glslName: d.name,
          wgslVar,
          location: decl.layout?.location ?? 0,
          type,
          flat: isFlat || this.isIntegerGType(type),
          isInput: isIn
        };
        if (isIn) this.inputs.push(ioField);
        else this.outputs.push(ioField);
        this.globalScope.set(d.name, { wgslName: wgslVar, type, isPrivate: true });
      } else if (isConst) {
        const wgslName = this.safeIdent(d.name);
        const isWgslConst = type.arraySize === undefined && !!d.init && this.isSimpleConstExpr(d.init);
        this.globalScope.set(d.name, {
          wgslName,
          type,
          isConst: isWgslConst,
          isPrivate: !isWgslConst
        });
      } else {
        const wgslName = this.safeIdent(d.name);
        this.globalScope.set(d.name, { wgslName, type, isPrivate: true });
      }
    }
  }

  private registerFunctions(ast: ShaderModuleAST): void {
    // First pass: count distinct signatures per function name
    const sigsByName = new Map<string, FnSignature[]>();
    for (const decl of ast.decls) {
      if (decl.kind !== "FunctionDecl") continue;
      const returnType = this.resolveType(decl.returnType);
      const paramTypes = decl.params.map((p) => this.resolveType(p.type, p.arraySize));
      const paramModes = decl.params.map((p) =>
        p.qualifiers.includes("inout") ? "inout" : p.qualifiers.includes("out") ? "out" : "in"
      );
      const list = sigsByName.get(decl.name) ?? [];
      // Match existing prototype with same param types
      const existing = list.find(
        (s) =>
          s.paramTypes.length === paramTypes.length &&
          s.paramTypes.every((pt, i) => typeKey(pt) === typeKey(paramTypes[i]))
      );
      if (existing) {
        if (decl.body) existing.decl = decl;
        this.fnByDecl.set(decl, existing);
        continue;
      }
      const sig: FnSignature = {
        decl,
        wgslName: "",
        returnType,
        paramTypes,
        paramModes
      };
      list.push(sig);
      sigsByName.set(decl.name, list);
      this.fnByDecl.set(decl, sig);
    }

    // Assign WGSL names: `main` -> `gs_user_main`, overloads get `_ovN` suffix
    for (const [name, list] of sigsByName) {
      list.forEach((sig, index) => {
        if (name === "main") {
          sig.wgslName = this.freshName("gs_user_main");
        } else if (index === 0) {
          sig.wgslName = this.safeIdent(name);
        } else {
          sig.wgslName = this.freshName(`${this.safeIdent(name)}_ov${index}`);
        }
      });
      this.functions.set(name, list);
    }
  }

  private scanBuiltinsInStmt(s: StmtNode | null | undefined): void {
    if (!s) return;
    switch (s.kind) {
      case "BlockStmt":
        s.stmts.forEach((x) => this.scanBuiltinsInStmt(x));
        break;
      case "VarDeclStmt":
        s.declarators.forEach((d) => {
          this.scanBuiltinsInExpr(d.arraySize);
          this.scanBuiltinsInExpr(d.init);
        });
        break;
      case "ExprStmt":
        this.scanBuiltinsInExpr(s.expr);
        break;
      case "IfStmt":
        this.scanBuiltinsInExpr(s.cond);
        this.scanBuiltinsInStmt(s.thenBranch);
        this.scanBuiltinsInStmt(s.elseBranch);
        break;
      case "ForStmt":
        this.scanBuiltinsInStmt(s.init);
        this.scanBuiltinsInExpr(s.cond);
        this.scanBuiltinsInExpr(s.step);
        this.scanBuiltinsInStmt(s.body);
        break;
      case "WhileStmt":
      case "DoWhileStmt":
        this.scanBuiltinsInExpr(s.cond);
        this.scanBuiltinsInStmt(s.body);
        break;
      case "SwitchStmt":
        this.scanBuiltinsInExpr(s.expr);
        s.cases.forEach((c) => {
          this.scanBuiltinsInExpr(c.expr);
          c.stmts.forEach((x) => this.scanBuiltinsInStmt(x));
        });
        break;
      case "ReturnStmt":
        this.scanBuiltinsInExpr(s.expr);
        break;
    }
  }

  private scanBuiltinsInExpr(e: ExprNode | null | undefined): void {
    if (!e) return;
    switch (e.kind) {
      case "IdentExpr":
        if (e.name === "gl_Position") this.usesPosition = true;
        else if (e.name === "gl_VertexIndex" || e.name === "gl_VertexID") this.usesVertexIndex = true;
        else if (e.name === "gl_InstanceIndex" || e.name === "gl_InstanceID") this.usesInstanceIndex = true;
        else if (e.name === "gl_FragCoord") this.usesFragCoord = true;
        else if (e.name === "gl_FrontFacing") this.usesFrontFacing = true;
        else if (e.name === "gl_FragDepth" || e.name === "gl_FragDepthEXT") this.usesFragDepth = true;
        else if (e.name === "gl_PointSize") this.usesPointSize = true;
        else if (e.name === "gl_PointCoord") this.usesPointCoord = true;
        break;
      case "UnaryExpr":
        this.scanBuiltinsInExpr(e.expr);
        break;
      case "BinaryExpr":
      case "AssignExpr":
        this.scanBuiltinsInExpr(e.left);
        this.scanBuiltinsInExpr(e.right);
        break;
      case "TernaryExpr":
        this.scanBuiltinsInExpr(e.cond);
        this.scanBuiltinsInExpr(e.thenExpr);
        this.scanBuiltinsInExpr(e.elseExpr);
        break;
      case "CommaExpr":
        e.exprs.forEach((x) => this.scanBuiltinsInExpr(x));
        break;
      case "CallExpr":
        e.args.forEach((x) => this.scanBuiltinsInExpr(x));
        break;
      case "MemberExpr":
        this.scanBuiltinsInExpr(e.object);
        break;
      case "MethodCallExpr":
        this.scanBuiltinsInExpr(e.object);
        e.args.forEach((x) => this.scanBuiltinsInExpr(x));
        break;
      case "IndexExpr":
        this.scanBuiltinsInExpr(e.object);
        this.scanBuiltinsInExpr(e.index);
        break;
      case "InitListExpr":
        e.elements.forEach((x) => this.scanBuiltinsInExpr(x));
        break;
      case "ParenExpr":
        this.scanBuiltinsInExpr(e.expr);
        break;
    }
  }

  private emitStructDecl(decl: StructDecl): string {
    const info = this.structs.get(decl.name)!;
    const fields = info.fieldOrder.map((f) => `  ${f.wgslName}: ${this.wgslType(f.type)},`).join("\n");
    return `struct ${info.wgslName} {\n${fields}\n}`;
  }

  private emitUniformBlockDecl(decl: UniformBlockDecl): string {
    const info = this.structs.get(decl.blockName)!;
    const fields = info.fieldOrder.map((f) => `  ${f.wgslName}: ${this.wgslType(f.type)},`).join("\n");
    const group = decl.layout.set ?? 0;
    const binding = decl.layout.binding ?? 0;
    const varName = decl.instanceName
      ? this.globalScope.get(decl.instanceName)!.wgslName
      : this.globalScope.get(`__ubo_var__${decl.blockName}`)!.wgslName;
    return `struct ${info.wgslName} {\n${fields}\n}\n@group(${group}) @binding(${binding}) var<uniform> ${varName}: ${info.wgslName};`;
  }

  private emitGlobalVarDecl(decl: GlobalVarDecl): string {
    const isUniform = decl.qualifiers.includes("uniform");
    const isIn = decl.qualifiers.includes("in");
    const isOut = decl.qualifiers.includes("out");
    if (isIn || isOut) return "";

    const lines: string[] = [];
    for (const d of decl.declarators) {
      const info = this.globalScope.get(d.name)!;
      if (isUniform && isSamplerOrTextureType(info.type.base)) {
        const group = decl.layout?.set ?? 0;
        const binding = decl.layout?.binding ?? 0;
        lines.push(`@group(${group}) @binding(${binding}) var ${info.wgslName}: ${this.wgslType(info.type)};`);
      } else if (info.isConst && d.init) {
        const init = this.emitInit(d.init, info.type);
        lines.push(`const ${info.wgslName}: ${this.wgslType(info.type)} = ${init};`);
      } else {
        const wType = this.wgslType(info.type);
        if (d.init && this.isSimpleConstExpr(d.init)) {
          const init = this.emitInit(d.init, info.type);
          lines.push(`var<private> ${info.wgslName}: ${wType} = ${init};`);
        } else if (d.init) {
          lines.push(`var<private> ${info.wgslName}: ${wType};`);
          this.globalInitStmts.push(`${info.wgslName} = ${this.emitInit(d.init, info.type)};`);
        } else {
          lines.push(`var<private> ${info.wgslName}: ${wType};`);
        }
      }
    }
    return lines.join("\n");
  }

  private emitStageIOPrivates(): string {
    const lines: string[] = [];
    for (const f of this.inputs) {
      lines.push(`var<private> ${f.wgslVar}: ${this.wgslType(f.type)};`);
    }
    for (const f of this.outputs) {
      lines.push(`var<private> ${f.wgslVar}: ${this.wgslType(f.type)};`);
    }
    if (this.stage === "vertex") {
      lines.push(`var<private> gs_gl_Position: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 1.0);`);
      if (this.usesVertexIndex) lines.push(`var<private> gs_gl_VertexIndex: u32;`);
      if (this.usesInstanceIndex) lines.push(`var<private> gs_gl_InstanceIndex: u32;`);
      if (this.usesPointSize) lines.push(`var<private> gs_gl_PointSize: f32 = 1.0;`);
    } else {
      if (this.usesFragCoord) lines.push(`var<private> gs_gl_FragCoord: vec4<f32>;`);
      if (this.usesFrontFacing) lines.push(`var<private> gs_gl_FrontFacing: bool;`);
      if (this.usesFragDepth) lines.push(`var<private> gs_gl_FragDepth: f32;`);
      if (this.usesPointCoord) lines.push(`var<private> gs_gl_PointCoord: vec2<f32> = vec2<f32>(0.5, 0.5);`);
    }
    return lines.join("\n");
  }

  private emitEntryPoint(): string {
    const mainSigs = this.functions.get("main");
    const userMain = mainSigs?.[0]?.wgslName;
    const bodyLines: string[] = [];
    for (const initStmt of this.globalInitStmts) {
      bodyLines.push(`  ${initStmt}`);
    }

    if (this.stage === "vertex") {
      const entryParams: string[] = [];
      for (const f of this.inputs) {
        const pName = this.freshName(`gs_in_${f.glslName}`);
        entryParams.push(`@location(${f.location}) ${pName}: ${this.wgslType(f.type)}`);
        bodyLines.push(`  ${f.wgslVar} = ${pName};`);
      }
      if (this.usesVertexIndex) {
        const pName = this.freshName("gs_vi");
        entryParams.push(`@builtin(vertex_index) ${pName}: u32`);
        bodyLines.push(`  gs_gl_VertexIndex = ${pName};`);
      }
      if (this.usesInstanceIndex) {
        const pName = this.freshName("gs_ii");
        entryParams.push(`@builtin(instance_index) ${pName}: u32`);
        bodyLines.push(`  gs_gl_InstanceIndex = ${pName};`);
      }
      if (userMain) bodyLines.push(`  ${userMain}();`);

      const outStructName = this.freshName("VertexOutput");
      const outFields: string[] = [`  @builtin(position) gs_position: vec4<f32>,`];
      const outArgs: string[] = [`gs_gl_Position`];
      for (const f of this.outputs) {
        const interp = f.flat ? " @interpolate(flat)" : "";
        const fieldName = this.safeFieldIdent(f.glslName);
        outFields.push(`  @location(${f.location})${interp} ${fieldName}: ${this.wgslType(f.type)},`);
        outArgs.push(f.wgslVar);
      }
      bodyLines.push(`  return ${outStructName}(${outArgs.join(", ")});`);
      return `struct ${outStructName} {\n${outFields.join("\n")}\n}\n@vertex fn main(${entryParams.join(", ")}) -> ${outStructName} {\n${bodyLines.join("\n")}\n}`;
    } else {
      const entryParams: string[] = [];
      if (this.usesFragCoord) {
        const pName = this.freshName("gs_fc");
        entryParams.push(`@builtin(position) ${pName}: vec4<f32>`);
        bodyLines.push(`  gs_gl_FragCoord = ${pName};`);
      }
      if (this.usesFrontFacing) {
        const pName = this.freshName("gs_ff");
        entryParams.push(`@builtin(front_facing) ${pName}: bool`);
        bodyLines.push(`  gs_gl_FrontFacing = ${pName};`);
      }
      for (const f of this.inputs) {
        const pName = this.freshName(`gs_in_${f.glslName}`);
        const interp = f.flat ? " @interpolate(flat)" : "";
        entryParams.push(`@location(${f.location})${interp} ${pName}: ${this.wgslType(f.type)}`);
        bodyLines.push(`  ${f.wgslVar} = ${pName};`);
      }
      if (userMain) bodyLines.push(`  ${userMain}();`);

      const hasOutputs = this.outputs.length > 0 || this.usesFragDepth;
      if (!hasOutputs) {
        return `@fragment fn main(${entryParams.join(", ")}) {\n${bodyLines.join("\n")}\n}`;
      }
      const outStructName = this.freshName("FragmentOutput");
      const outFields: string[] = [];
      const outArgs: string[] = [];
      for (const f of this.outputs) {
        const fieldName = this.safeFieldIdent(f.glslName);
        outFields.push(`  @location(${f.location}) ${fieldName}: ${this.wgslType(f.type)},`);
        outArgs.push(f.wgslVar);
      }
      if (this.usesFragDepth) {
        outFields.push(`  @builtin(frag_depth) gs_frag_depth: f32,`);
        outArgs.push(`gs_gl_FragDepth`);
      }
      bodyLines.push(`  return ${outStructName}(${outArgs.join(", ")});`);
      return `struct ${outStructName} {\n${outFields.join("\n")}\n}\n@fragment fn main(${entryParams.join(", ")}) -> ${outStructName} {\n${bodyLines.join("\n")}\n}`;
    }
  }

  private emitFunctionDecl(decl: FunctionDecl): string {
    const sig = this.fnByDecl.get(decl)!;
    this.currentFn = sig;
    const scope = new Map<string, VarInfo>();
    this.scopes.push(scope);

    // Detect which value parameters are mutated inside body
    const mutated = new Set<string>();
    if (decl.body) this.findMutatedVars(decl.body, mutated);

    const paramStrings: string[] = [];
    const prologue: string[] = [];

    decl.params.forEach((p, i) => {
      const pType = sig.paramTypes[i];
      const mode = sig.paramModes[i];
      const origName = p.name || `gs_unused_p_${i}`;
      const isOpaque = isSamplerOrTextureType(pType.base);
      const wgslParamBase = isOpaque ? origName : this.safeIdent(origName);

      if (mode === "out" || mode === "inout") {
        paramStrings.push(`${wgslParamBase}: ptr<function, ${this.wgslType(pType)}>`);
        scope.set(origName, { wgslName: wgslParamBase, type: pType, isPtr: true });
      } else if (!isOpaque && mutated.has(origName)) {
        const paramArg = this.freshName(`${wgslParamBase}_p`);
        paramStrings.push(`${paramArg}: ${this.wgslType(pType)}`);
        prologue.push(`  var ${wgslParamBase}: ${this.wgslType(pType)} = ${paramArg};`);
        scope.set(origName, { wgslName: wgslParamBase, type: pType });
      } else {
        paramStrings.push(`${wgslParamBase}: ${this.wgslType(pType)}`);
        scope.set(origName, { wgslName: wgslParamBase, type: pType });
      }
    });

    const retStr = sig.returnType.base === "void" ? "" : ` -> ${this.wgslType(sig.returnType)}`;
    const bodyLines = [...prologue, ...this.emitBlockStmts(decl.body!, "  ")];

    // If non-void function might fall off (e.g. after a switch), append fallback return
    if (sig.returnType.base !== "void" && !this.stmtsAlwaysTerminate(decl.body!.stmts)) {
      bodyLines.push(`  return ${this.zeroValue(sig.returnType)};`);
    }

    this.scopes.pop();
    this.currentFn = null;
    // Note: closing brace at column 0 is required by SamplerBindings.removeUnusedSamplers
    return `fn ${sig.wgslName}(${paramStrings.join(", ")})${retStr} {\n${bodyLines.join("\n")}\n}`;
  }

  private findMutatedVars(stmt: StmtNode, mutated: Set<string>): void {
    const markTarget = (e: ExprNode) => {
      let cur = e;
      while (cur.kind === "MemberExpr" || cur.kind === "IndexExpr" || cur.kind === "ParenExpr") {
        cur = cur.kind === "ParenExpr" ? cur.expr : cur.object;
      }
      if (cur.kind === "IdentExpr") mutated.add(cur.name);
    };
    const walkExpr = (e: ExprNode | null | undefined) => {
      if (!e) return;
      switch (e.kind) {
        case "AssignExpr":
          markTarget(e.left);
          walkExpr(e.left);
          walkExpr(e.right);
          break;
        case "UnaryExpr":
          if (e.op === "++" || e.op === "--") markTarget(e.expr);
          walkExpr(e.expr);
          break;
        case "CallExpr": {
          // Conservatively mark arguments passed to any function that has out/inout params
          const overloads = this.functions.get(e.callee);
          if (overloads?.some((s) => s.paramModes.some((m) => m !== "in"))) {
            e.args.forEach((arg, idx) => {
              if (overloads.some((s) => s.paramModes[idx] && s.paramModes[idx] !== "in")) {
                markTarget(arg);
              }
            });
          }
          e.args.forEach(walkExpr);
          break;
        }
        case "BinaryExpr":
          walkExpr(e.left);
          walkExpr(e.right);
          break;
        case "TernaryExpr":
          walkExpr(e.cond);
          walkExpr(e.thenExpr);
          walkExpr(e.elseExpr);
          break;
        case "CommaExpr":
          e.exprs.forEach(walkExpr);
          break;
        case "MemberExpr":
          walkExpr(e.object);
          break;
        case "MethodCallExpr":
          walkExpr(e.object);
          e.args.forEach(walkExpr);
          break;
        case "IndexExpr":
          walkExpr(e.object);
          walkExpr(e.index);
          break;
        case "InitListExpr":
          e.elements.forEach(walkExpr);
          break;
        case "ParenExpr":
          walkExpr(e.expr);
          break;
      }
    };
    const walkStmt = (s: StmtNode | null | undefined) => {
      if (!s) return;
      switch (s.kind) {
        case "BlockStmt":
          s.stmts.forEach(walkStmt);
          break;
        case "VarDeclStmt":
          s.declarators.forEach((d) => walkExpr(d.init));
          break;
        case "ExprStmt":
          walkExpr(s.expr);
          break;
        case "IfStmt":
          walkExpr(s.cond);
          walkStmt(s.thenBranch);
          walkStmt(s.elseBranch);
          break;
        case "ForStmt":
          walkStmt(s.init);
          walkExpr(s.cond);
          walkExpr(s.step);
          walkStmt(s.body);
          break;
        case "WhileStmt":
        case "DoWhileStmt":
          walkExpr(s.cond);
          walkStmt(s.body);
          break;
        case "SwitchStmt":
          walkExpr(s.expr);
          s.cases.forEach((c) => c.stmts.forEach(walkStmt));
          break;
        case "ReturnStmt":
          walkExpr(s.expr);
          break;
      }
    };
    walkStmt(stmt);
  }

  private emitBlockStmts(block: BlockStmt, indent: string, pushScope = false): string[] {
    if (pushScope) this.scopes.push(new Map());
    const out: string[] = [];
    for (const stmt of block.stmts) {
      const lines = this.emitStmt(stmt, indent);
      out.push(...lines);
      if (this.stmtUnconditionallyTerminates(stmt)) break;
    }
    if (pushScope) this.scopes.pop();
    return out;
  }

  private stmtUnconditionallyTerminates(s: StmtNode): boolean {
    if (s.kind === "ReturnStmt" || s.kind === "BreakStmt" || s.kind === "ContinueStmt" || s.kind === "DiscardStmt") {
      return true;
    }
    if (s.kind === "BlockStmt") return this.stmtsAlwaysTerminate(s.stmts);
    if (s.kind === "IfStmt" && s.elseBranch) {
      return this.stmtUnconditionallyTerminates(s.thenBranch) && this.stmtUnconditionallyTerminates(s.elseBranch);
    }
    return false;
  }

  private stmtsAlwaysTerminate(stmts: StmtNode[]): boolean {
    return stmts.some((s) => this.stmtUnconditionallyTerminates(s));
  }

  private withHoist(indent: string, fn: () => string[]): string[] {
    const saved = this.hoistQueue;
    this.hoistQueue = [];
    const main = fn();
    const hoisted = this.hoistQueue.map((line) => indent + line);
    this.hoistQueue = saved;
    return [...hoisted, ...main];
  }

  private emitStmt(stmt: StmtNode, indent: string): string[] {
    switch (stmt.kind) {
      case "BlockStmt": {
        const inner = this.emitBlockStmts(stmt, indent + "  ", true);
        return [`${indent}{`, ...inner, `${indent}}`];
      }
      case "VarDeclStmt":
        return this.emitVarDeclStmt(stmt, indent);
      case "ExprStmt":
        if (!stmt.expr) return [];
        return this.emitExprAsStmt(stmt.expr, indent);
      case "IfStmt":
        return this.withHoist(indent, () => {
          const cond = this.emitExpr(stmt.cond).code;
          const thenLines = this.emitStmtAsBlockBody(stmt.thenBranch, indent + "  ");
          if (!stmt.elseBranch) {
            return [`${indent}if (${cond}) {`, ...thenLines, `${indent}}`];
          }
          if (stmt.elseBranch.kind === "IfStmt") {
            const elseIfLines = this.emitStmt(stmt.elseBranch, indent);
            // If else-if hoisted anything, wrap in `else { ... }`
            if (elseIfLines[0].trimStart().startsWith("if (")) {
              elseIfLines[0] = `${indent}} else ${elseIfLines[0].trimStart()}`;
              return [`${indent}if (${cond}) {`, ...thenLines, ...elseIfLines];
            }
            const elseWrapped = this.emitStmt(stmt.elseBranch, indent + "  ");
            return [`${indent}if (${cond}) {`, ...thenLines, `${indent}} else {`, ...elseWrapped, `${indent}}`];
          }
          const elseLines = this.emitStmtAsBlockBody(stmt.elseBranch, indent + "  ");
          return [`${indent}if (${cond}) {`, ...thenLines, `${indent}} else {`, ...elseLines, `${indent}}`];
        });
      case "WhileStmt": {
        // Hoisting inside condition needs to re-run every iteration -> use `loop` if cond hoists
        const probe = this.withHoist(indent + "  ", () => [this.emitExpr(stmt.cond).code]);
        const bodyLines = this.emitStmtAsBlockBody(stmt.body, indent + "  ");
        if (probe.length === 1) {
          return [`${indent}while (${probe[0]}) {`, ...bodyLines, `${indent}}`];
        }
        const condCode = probe.pop()!;
        return [`${indent}loop {`, ...probe, `${indent}  if (!(${condCode})) { break; }`, ...bodyLines, `${indent}}`];
      }
      case "DoWhileStmt": {
        const bodyLines = this.emitStmtAsBlockBody(stmt.body, indent + "  ");
        const condLines = this.withHoist(indent + "    ", () => {
          const c = this.emitExpr(stmt.cond).code;
          return [`${indent}    break if !(${c});`];
        });
        return [`${indent}loop {`, ...bodyLines, `${indent}  continuing {`, ...condLines, `${indent}  }`, `${indent}}`];
      }
      case "ForStmt":
        return this.emitForStmt(stmt, indent);
      case "SwitchStmt":
        return this.emitSwitchStmt(stmt, indent);
      case "ReturnStmt":
        if (!stmt.expr) return [`${indent}return;`];
        return this.withHoist(indent, () => {
          const expected = this.currentFn?.returnType;
          const val = this.emitExpr(stmt.expr!);
          return [`${indent}return ${this.coerceExpr(val, expected)};`];
        });
      case "BreakStmt":
        return [`${indent}break;`];
      case "ContinueStmt":
        return [`${indent}continue;`];
      case "DiscardStmt":
        return [`${indent}discard;`];
    }
  }

  private emitStmtAsBlockBody(stmt: StmtNode, indent: string): string[] {
    if (stmt.kind === "BlockStmt") {
      return this.emitBlockStmts(stmt, indent, true);
    }
    this.scopes.push(new Map());
    const lines = this.emitStmt(stmt, indent);
    this.scopes.pop();
    return lines;
  }

  private emitVarDeclStmt(stmt: VarDeclStmt, indent: string): string[] {
    const isConst = stmt.qualifiers.includes("const");
    const out: string[] = [];
    const curScope = this.scopes[this.scopes.length - 1];

    for (const d of stmt.declarators) {
      const type = this.resolveType(stmt.type, d.arraySize);
      const wgslName = this.safeIdent(d.name);
      const wType = this.wgslType(type);
      const lines = this.withHoist(indent, () => {
        if (d.init) {
          const init = this.emitInit(d.init, type);
          const useConst = isConst && type.arraySize === undefined && this.isSimpleConstExpr(d.init);
          const kw = useConst ? "const" : isConst && type.arraySize === undefined ? "let" : "var";
          return [`${indent}${kw} ${wgslName}: ${wType} = ${init};`];
        }
        return [`${indent}var ${wgslName}: ${wType};`];
      });
      curScope.set(d.name, {
        wgslName,
        type,
        isConst: isConst && type.arraySize === undefined && !!d.init && this.isSimpleConstExpr(d.init)
      });
      out.push(...lines);
    }
    return out;
  }

  private emitForStmt(stmt: Extract<StmtNode, { kind: "ForStmt" }>, indent: string): string[] {
    this.scopes.push(new Map());
    const outerLines: string[] = [];

    // Try native WGSL `for (init; cond; step)` when init/cond/step are simple (single stmt, no hoists)
    let initStr = "";
    let initHoisted = false;
    if (stmt.init) {
      if (stmt.init.kind === "VarDeclStmt" && stmt.init.declarators.length === 1) {
        const declLines = this.emitVarDeclStmt(stmt.init, "");
        if (declLines.length === 1) {
          initStr = declLines[0].replace(/;\s*$/, "");
        } else {
          outerLines.push(...declLines.map((l) => indent + "  " + l));
          initHoisted = true;
        }
      } else {
        const initLines = this.emitStmt(stmt.init, indent + "  ");
        outerLines.push(...initLines);
        initHoisted = true;
      }
    }

    let condStr = "";
    let condHoistLines: string[] = [];
    if (stmt.cond) {
      const saved = this.hoistQueue;
      this.hoistQueue = [];
      condStr = this.emitExpr(stmt.cond).code;
      condHoistLines = this.hoistQueue;
      this.hoistQueue = saved;
    }

    let stepStr = "";
    let stepLines: string[] = [];
    if (stmt.step) {
      const emitted = this.emitExprAsStmt(stmt.step, "");
      if (emitted.length === 1 && !emitted[0].includes("\n")) {
        stepStr = emitted[0].replace(/;\s*$/, "");
      } else {
        stepLines = emitted;
      }
    }

    const bodyIndent = initHoisted ? indent + "    " : indent + "  ";
    const bodyLines = this.emitStmtAsBlockBody(stmt.body, bodyIndent);
    this.scopes.pop();

    const loopIndent = initHoisted ? indent + "  " : indent;
    let loopBlock: string[];
    if (condHoistLines.length === 0 && stepLines.length === 0) {
      loopBlock = [`${loopIndent}for (${initStr}; ${condStr}; ${stepStr}) {`, ...bodyLines, `${loopIndent}}`];
    } else {
      // General WGSL `loop { ... continuing { ... } }` preserves `continue` semantics!
      const header: string[] = [];
      if (stmt.cond) {
        header.push(...condHoistLines.map((l) => `${loopIndent}  ${l}`));
        header.push(`${loopIndent}  if (!(${condStr})) { break; }`);
      }
      const cont = stepLines.length
        ? [`${loopIndent}  continuing {`, ...stepLines.map((l) => `${loopIndent}    ${l}`), `${loopIndent}  }`]
        : stepStr
          ? [`${loopIndent}  continuing {`, `${loopIndent}    ${stepStr};`, `${loopIndent}  }`]
          : [];
      loopBlock = [`${loopIndent}loop {`, ...header, ...bodyLines, ...cont, `${loopIndent}}`];
    }

    if (initHoisted) {
      return [`${indent}{`, ...outerLines, ...loopBlock, `${indent}}`];
    }
    return loopBlock;
  }

  private emitSwitchStmt(stmt: SwitchStmt, indent: string): string[] {
    // Hoist any direct VarDeclStmts inside switch cases into an enclosing block so
    // fallthrough arms share the same WGSL scope (matching GLSL switch scoping).
    this.scopes.push(new Map());
    const hoistedDeclLines: string[] = [];
    const hoistedVarMap = new Map<VarDeclStmt, StmtNode[]>();

    for (const c of stmt.cases) {
      for (const s of c.stmts) {
        if (s.kind === "VarDeclStmt") {
          const replacements: StmtNode[] = [];
          const curScope = this.scopes[this.scopes.length - 1];
          for (const d of s.declarators) {
            const type = this.resolveType(s.type, d.arraySize);
            const wgslName = this.safeIdent(d.name);
            curScope.set(d.name, { wgslName, type });
            hoistedDeclLines.push(`${indent}  var ${wgslName}: ${this.wgslType(type)};`);
            if (d.init) {
              replacements.push({
                kind: "ExprStmt",
                expr: { kind: "AssignExpr", op: "=", left: { kind: "IdentExpr", name: d.name }, right: d.init }
              });
            }
          }
          hoistedVarMap.set(s, replacements);
        }
      }
    }

    const expandCaseStmts = (stmts: StmtNode[]): StmtNode[] => {
      const res: StmtNode[] = [];
      for (const s of stmts) {
        const rep = hoistedVarMap.get(s as VarDeclStmt);
        if (rep) res.push(...rep);
        else res.push(s);
      }
      return res;
    };

    const expandedCases = stmt.cases.map((c) => ({
      expr: c.expr,
      stmts: expandCaseStmts(c.stmts)
    }));

    const hasDefault = expandedCases.some((c) => c.expr === null);
    const hasHoistedDecls = hoistedDeclLines.length > 0;
    const swIndent = hasHoistedDecls ? indent + "  " : indent;

    const swLines = this.withHoist(swIndent, () => {
      const sel = this.emitExpr(stmt.expr).code;
      const out: string[] = [`${swIndent}switch (${sel}) {`];

      // Group empty-body cases with the next arm, and inline fallthrough tails for non-empty arms
      let i = 0;
      while (i < expandedCases.length) {
        const labels: (ExprNode | null)[] = [];
        while (i < expandedCases.length - 1 && expandedCases[i].stmts.length === 0) {
          labels.push(expandedCases[i].expr);
          i++;
        }
        labels.push(expandedCases[i].expr);

        // Collect statements from arm i onward until an arm unconditionally terminates or ends
        const armStmts: StmtNode[] = [];
        for (let j = i; j < expandedCases.length; j++) {
          armStmts.push(...expandedCases[j].stmts);
          if (this.stmtsAlwaysTerminate(expandedCases[j].stmts)) break;
        }

        const hasDef = labels.some((l) => l === null);
        const nonDef = labels.filter((l): l is ExprNode => l !== null).map((l) => this.emitExpr(l).code);
        const selectorParts = [...nonDef, ...(hasDef ? ["default"] : [])];
        const header =
          hasDef && nonDef.length === 0
            ? `${swIndent}  default: {`
            : `${swIndent}  case ${selectorParts.join(", ")}: {`;

        out.push(header);
        const emitted = this.emitBlockStmts({ kind: "BlockStmt", stmts: armStmts }, swIndent + "    ", true);
        out.push(...emitted);
        out.push(`${swIndent}  }`);
        i++;
      }

      if (!hasDefault) {
        out.push(`${swIndent}  default: {}`);
      }
      out.push(`${swIndent}}`);
      return out;
    });

    this.scopes.pop();
    if (hasHoistedDecls) {
      return [`${indent}{`, ...hoistedDeclLines, ...swLines, `${indent}}`];
    }
    return swLines;
  }

  private emitExprAsStmt(expr: ExprNode, indent: string): string[] {
    // Handle comma expression statement: `a = 1, b = 2;`
    if (expr.kind === "CommaExpr") {
      const lines: string[] = [];
      for (const sub of expr.exprs) {
        lines.push(...this.emitExprAsStmt(sub, indent));
      }
      return lines;
    }
    // Handle standalone `++x;` / `x++;` / `--x;` / `x--;`
    if (expr.kind === "UnaryExpr" && (expr.op === "++" || expr.op === "--")) {
      return this.withHoist(indent, () => {
        const target = this.emitExpr(expr.expr);
        const step = target.type.base === "float" ? "1.0" : target.type.base === "uint" ? "1u" : "1";
        const op = expr.op === "++" ? "+=" : "-=";
        return [`${indent}${target.code} ${op} ${step};`];
      });
    }
    // Handle assignment statement (including multi-component swizzle assignment!)
    if (expr.kind === "AssignExpr") {
      return this.withHoist(indent, () => this.emitAssignStmtLines(expr, indent));
    }
    // Standalone function call statement
    if (expr.kind === "CallExpr") {
      return this.withHoist(indent, () => {
        const res = this.emitCallExpr(expr, true);
        return res.code ? [`${indent}${res.code};`] : [];
      });
    }
    // Any other expression statement (discard value if non-void)
    return this.withHoist(indent, () => {
      const res = this.emitExpr(expr);
      if (!res.code || res.type.base === "void") return [];
      return [`${indent}_ = ${res.code};`];
    });
  }

  private emitAssignStmtLines(expr: AssignExpr, indent: string): string[] {
    // Check for multi-component swizzle assignment: `v.xyz = rhs;` or `v.xy += rhs;`
    if (expr.left.kind === "MemberExpr" && isValidSwizzle(expr.left.field) && expr.left.field.length >= 2) {
      const objType = this.inferExprType(expr.left.object);
      if (vectorSize(objType) > 0) {
        const swiz = normalizeSwizzle(expr.left.field);
        const fam = scalarFamily(objType) ?? "float";
        const swizType = makeVectorType(fam, swiz.length);
        // Save index if lhs object is indexed (e.g. `arr[i].xy = ...`)
        const baseObjCode = this.emitLValueBaseStable(expr.left.object);
        const rhs = this.emitExpr(expr.right);
        const rhsCoerced = this.coerceExpr(rhs, swizType);
        const tmp = this.freshName("gs_sw");
        const lines: string[] = [];
        if (expr.op === "=") {
          lines.push(`${indent}let ${tmp} = ${rhsCoerced};`);
        } else {
          const binOp = expr.op.slice(0, -1);
          lines.push(`${indent}let ${tmp} = (${baseObjCode}.${swiz}) ${binOp} (${rhsCoerced});`);
        }
        const lanes = "xyzw";
        for (let k = 0; k < swiz.length; k++) {
          lines.push(`${indent}${baseObjCode}.${swiz[k]} = ${tmp}.${lanes[k]};`);
        }
        return lines;
      }
    }

    const left = this.emitExpr(expr.left);
    const right = this.emitExpr(expr.right);

    // Handle matrix /= scalar -> matrix = matrix * (1.0 / scalar)
    if (expr.op === "/=" && matrixDims(left.type) && isScalarType(right.type)) {
      return [`${indent}${left.code} = ${left.code} * (1.0 / (${right.code}));`];
    }
    // Handle `vec *= mat` or `vec += scalar` etc.: expand when types differ to avoid WGSL compound-assign restrictions
    if (expr.op !== "=" && typeKey(left.type) !== typeKey(right.type)) {
      const binOp = expr.op.slice(0, -1);
      const rhsBin = this.emitBinaryOp(binOp, left, right);
      return [`${indent}${left.code} = ${this.coerceExpr(rhsBin, left.type)};`];
    }
    if (expr.op === "=") {
      return [`${indent}${left.code} = ${this.coerceExpr(right, left.type)};`];
    }
    // Shift compound assignment `<<=` / `>>=`: RHS must be u32/vecN<u32> matching LHS shape
    if (expr.op === "<<=" || expr.op === ">>=") {
      const rhsU = this.coerceShiftRhs(right, left.type, expr.right);
      return [`${indent}${left.code} ${expr.op} ${rhsU};`];
    }
    return [`${indent}${left.code} ${expr.op} ${this.coerceExpr(right, left.type)};`];
  }

  /** Emits an l-value base expression, hoisting any dynamic subscript indices into `let` bindings so the base can be referenced multiple times safely. */
  private emitLValueBaseStable(expr: ExprNode): string {
    if (expr.kind === "IndexExpr") {
      const base = this.emitLValueBaseStable(expr.object);
      const idx = this.emitExpr(expr.index);
      if (expr.index.kind === "LiteralExpr" || expr.index.kind === "IdentExpr") {
        return `${base}[${idx.code}]`;
      }
      const tmp = this.freshName("gs_idx");
      this.hoistQueue.push(`let ${tmp} = ${idx.code};`);
      return `${base}[${tmp}]`;
    }
    if (expr.kind === "MemberExpr") {
      const base = this.emitLValueBaseStable(expr.object);
      const objType = this.inferExprType(expr.object);
      const sInfo = this.structs.get(objType.base);
      const fieldName = sInfo?.fields.get(expr.field)?.wgslName ?? expr.field;
      return `${base}.${fieldName}`;
    }
    if (expr.kind === "ParenExpr") return this.emitLValueBaseStable(expr.expr);
    return this.emitExpr(expr).code;
  }

  private emitInit(expr: ExprNode, targetType: GType): string {
    if (expr.kind === "InitListExpr") {
      if (targetType.arraySize !== undefined) {
        const elemType: GType = { base: targetType.base };
        const items = expr.elements.map((e) => this.emitInit(e, elemType));
        return `${this.wgslType(targetType)}(${items.join(", ")})`;
      }
      const sInfo = this.structs.get(targetType.base);
      if (sInfo) {
        const items = expr.elements.map((e, i) => this.emitInit(e, sInfo.fieldOrder[i]?.type ?? T_UNKNOWN));
        return `${sInfo.wgslName}(${items.join(", ")})`;
      }
      const m = matrixDims(targetType);
      if (m) {
        const colType = makeVectorType("float", m.rows);
        const items = expr.elements.map((e) => this.emitInit(e, colType));
        return `${this.wgslType(targetType)}(${items.join(", ")})`;
      }
      const vn = vectorSize(targetType);
      if (vn > 0) {
        const elemType: GType = { base: scalarFamily(targetType) ?? "float" };
        const items = expr.elements.map((e) => this.emitInit(e, elemType));
        return `${this.wgslType(targetType)}(${items.join(", ")})`;
      }
      const elemType: GType = { base: targetType.base };
      const items = expr.elements.map((e) => this.emitInit(e, elemType));
      return `${this.wgslType(targetType)}(${items.join(", ")})`;
    }
    const res = this.emitExpr(expr);
    return this.coerceExpr(res, targetType);
  }

  private emitExpr(expr: ExprNode): EmittedExpr {
    switch (expr.kind) {
      case "LiteralExpr": {
        if (expr.litKind === "float") return { code: formatFloatLiteral(expr.raw), type: T_FLOAT };
        if (expr.litKind === "uint") return { code: formatUintLiteral(expr.raw), type: T_UINT };
        if (expr.litKind === "int") return { code: formatIntLiteral(expr.raw), type: T_INT };
        return { code: expr.raw, type: T_BOOL };
      }
      case "IdentExpr":
        return this.emitIdentExpr(expr.name);
      case "ParenExpr": {
        const inner = this.emitExpr(expr.expr);
        return { code: `(${inner.code})`, type: inner.type };
      }
      case "MemberExpr":
        return this.emitMemberExpr(expr.object, expr.field);
      case "IndexExpr":
        return this.emitIndexExpr(expr.object, expr.index);
      case "MethodCallExpr":
        if (expr.method === "length" && expr.args.length === 0) {
          const objType = this.inferExprType(expr.object);
          if (objType.arraySize) return { code: `i32(${objType.arraySize})`, type: T_INT };
          const vn = vectorSize(objType);
          if (vn > 0) return { code: `${vn}i`, type: T_INT };
          const md = matrixDims(objType);
          if (md) return { code: `${md.cols}i`, type: T_INT };
        }
        throw new Error(`Unsupported GLSL method call '.${expr.method}()'`);
      case "UnaryExpr":
        return this.emitUnaryExpr(expr);
      case "BinaryExpr": {
        const left = this.emitExpr(expr.left);
        const right = this.emitExpr(expr.right);
        return this.emitBinaryOp(expr.op, left, right, expr.right);
      }
      case "AssignExpr": {
        // Assignment used inside an expression: hoist assignment and return lhs
        const lines = this.emitAssignStmtLines(expr, "");
        for (const l of lines) this.hoistQueue.push(l);
        return this.emitExpr(expr.left);
      }
      case "CommaExpr": {
        for (let i = 0; i < expr.exprs.length - 1; i++) {
          const lines = this.emitExprAsStmt(expr.exprs[i], "");
          for (const l of lines) this.hoistQueue.push(l);
        }
        return this.emitExpr(expr.exprs[expr.exprs.length - 1]);
      }
      case "TernaryExpr":
        return this.emitTernaryExpr(expr.cond, expr.thenExpr, expr.elseExpr);
      case "CallExpr":
        return this.emitCallExpr(expr, false);
      case "InitListExpr":
        throw new Error("Initializer list must appear in a typed declaration context.");
    }
  }

  private emitIdentExpr(name: string): EmittedExpr {
    // Builtins
    if (name === "gl_Position") return { code: "gs_gl_Position", type: T_VEC4 };
    if (name === "gl_VertexIndex") return { code: "gs_gl_VertexIndex", type: T_UINT };
    if (name === "gl_VertexID") return { code: "i32(gs_gl_VertexIndex)", type: T_INT };
    if (name === "gl_InstanceIndex") return { code: "gs_gl_InstanceIndex", type: T_UINT };
    if (name === "gl_InstanceID") return { code: "i32(gs_gl_InstanceIndex)", type: T_INT };
    if (name === "gl_FragCoord") return { code: "gs_gl_FragCoord", type: T_VEC4 };
    if (name === "gl_FrontFacing") return { code: "gs_gl_FrontFacing", type: T_BOOL };
    if (name === "gl_FragDepth" || name === "gl_FragDepthEXT") return { code: "gs_gl_FragDepth", type: T_FLOAT };
    if (name === "gl_PointSize") return { code: "gs_gl_PointSize", type: T_FLOAT };
    if (name === "gl_PointCoord") return { code: "gs_gl_PointCoord", type: T_VEC2 };
    const builtinLimit = GLSL_BUILTIN_INT_LIMITS[name];
    if (builtinLimit !== undefined) return { code: `${builtinLimit}i`, type: T_INT };

    const info = this.lookupVar(name);
    if (!info) {
      return { code: this.safeIdent(name), type: T_UNKNOWN };
    }
    if (info.uboVar) {
      return { code: `${info.uboVar}.${info.wgslName}`, type: info.type };
    }
    if (info.isPtr) {
      return { code: `(*${info.wgslName})`, type: info.type };
    }
    return { code: info.wgslName, type: info.type };
  }

  private emitMemberExpr(object: ExprNode, field: string): EmittedExpr {
    const obj = this.emitExpr(object);
    const sInfo = this.structs.get(obj.type.base);
    if (sInfo && !obj.type.arraySize) {
      const f = sInfo.fields.get(field);
      if (f) return { code: `${obj.code}.${f.wgslName}`, type: f.type };
      throw new Error(`Struct '${obj.type.base}' has no member '${field}'.`);
    }
    // Vector swizzle
    if (vectorSize(obj.type) > 0 && isValidSwizzle(field)) {
      const fam = scalarFamily(obj.type) ?? "float";
      const swiz = normalizeSwizzle(field);
      const resType = makeVectorType(fam, swiz.length);
      return { code: `${obj.code}.${swiz}`, type: resType };
    }
    return { code: `${obj.code}.${this.safeFieldIdent(field)}`, type: T_UNKNOWN };
  }

  private emitIndexExpr(object: ExprNode, index: ExprNode): EmittedExpr {
    const obj = this.emitExpr(object);
    const idx = this.emitExpr(index);
    let elemType: GType = T_UNKNOWN;
    if (obj.type.arraySize !== undefined) {
      elemType = { base: obj.type.base };
    } else {
      const m = matrixDims(obj.type);
      if (m) elemType = makeVectorType("float", m.rows);
      else if (vectorSize(obj.type) > 0) elemType = { base: scalarFamily(obj.type) ?? "float" };
    }
    return { code: `${obj.code}[${idx.code}]`, type: elemType };
  }

  private emitUnaryExpr(expr: UnaryExpr): EmittedExpr {
    if (expr.op === "++" || expr.op === "--") {
      const target = this.emitLValueBaseStable(expr.expr);
      const tType = this.inferExprType(expr.expr);
      const step = tType.base === "float" ? "1.0" : tType.base === "uint" ? "1u" : "1";
      const op = expr.op === "++" ? "+=" : "-=";
      if (expr.prefix) {
        this.hoistQueue.push(`${target} ${op} ${step};`);
        return { code: target, type: tType };
      } else {
        const tmp = this.freshName("gs_post");
        this.hoistQueue.push(`let ${tmp} = ${target};`);
        this.hoistQueue.push(`${target} ${op} ${step};`);
        return { code: tmp, type: tType };
      }
    }
    const inner = this.emitExpr(expr.expr);
    if (expr.op === "+") return inner;
    if (expr.op === "-" && matrixDims(inner.type)) {
      return { code: `(${inner.code} * -1.0)`, type: inner.type };
    }
    return { code: `(${expr.op}${inner.code})`, type: inner.type };
  }

  private emitBinaryOp(op: string, left: EmittedExpr, right: EmittedExpr, rightNode?: ExprNode): EmittedExpr {
    if (op === "^^") {
      return { code: `((${left.code}) != (${right.code}))`, type: T_BOOL };
    }
    if (op === "==" || op === "!=") {
      // Vector == / != returns scalar bool in GLSL, vecN<bool> in WGSL
      if (vectorSize(left.type) > 0 || vectorSize(right.type) > 0) {
        const fn = op === "==" ? "all" : "any";
        return { code: `${fn}((${left.code}) ${op} (${right.code}))`, type: T_BOOL };
      }
      // Matrix == / !=
      const lm = matrixDims(left.type);
      if (lm) {
        const cmp = Array.from(
          { length: lm.cols },
          (_, c) => `all((${left.code})[${c}] == (${right.code})[${c}])`
        ).join(" && ");
        return { code: op === "==" ? `(${cmp})` : `!(${cmp})`, type: T_BOOL };
      }
      // Fixed-size array == / !=
      if (left.type.arraySize && /^\d+$/.test(left.type.arraySize)) {
        const count = Number(left.type.arraySize);
        const elemType: GType = { base: left.type.base };
        const cmp = Array.from(
          { length: count },
          (_, i) =>
            this.emitBinaryOp(
              "==",
              { code: `(${left.code})[${i}]`, type: elemType },
              { code: `(${right.code})[${i}]`, type: elemType }
            ).code
        ).join(" && ");
        return { code: op === "==" ? `(${cmp})` : `!(${cmp})`, type: T_BOOL };
      }
      // Struct == / !=
      const sInfo = this.structs.get(left.type.base);
      if (sInfo && !left.type.arraySize) {
        const cmp = sInfo.fieldOrder
          .map(
            (f) =>
              this.emitBinaryOp(
                "==",
                { code: `(${left.code}).${f.wgslName}`, type: f.type },
                { code: `(${right.code}).${f.wgslName}`, type: f.type }
              ).code
          )
          .join(" && ");
        return { code: op === "==" ? `(${cmp})` : `!(${cmp})`, type: T_BOOL };
      }
      return { code: `((${left.code}) ${op} (${right.code}))`, type: T_BOOL };
    }
    if (op === "&" || op === "|" || op === "^") {
      const target = vectorSize(left.type) >= vectorSize(right.type) ? left.type : right.type;
      const lhsCode = this.broadcastToMatch(left, target);
      const rhsCode = this.broadcastToMatch(right, target);
      return { code: `((${lhsCode}) ${op} (${rhsCode}))`, type: target };
    }
    if (op === "<<" || op === ">>") {
      const rhs = this.coerceShiftRhs(right, left.type, rightNode);
      return { code: `((${left.code}) ${op} (${rhs}))`, type: left.type };
    }
    if (op === "/" && matrixDims(left.type) && isScalarType(right.type)) {
      return { code: `((${left.code}) * (1.0 / (${right.code})))`, type: left.type };
    }
    const resType = inferBinaryType(op, left.type, right.type);
    return { code: `((${left.code}) ${op} (${right.code}))`, type: resType };
  }

  private coerceShiftRhs(right: EmittedExpr, leftType: GType, rightNode?: ExprNode): string {
    const ln = vectorSize(leftType);
    const rn = vectorSize(right.type);
    if (ln > 0) {
      if (rn === ln && right.type.base.startsWith("uvec")) return right.code;
      return `vec${ln}<u32>(${right.code})`;
    }
    if (rightNode?.kind === "LiteralExpr" && (rightNode.litKind === "int" || rightNode.litKind === "uint")) {
      return right.code;
    }
    if (right.type.base === "uint") return right.code;
    return `u32(${right.code})`;
  }

  private emitTernaryExpr(condNode: ExprNode, thenNode: ExprNode, elseNode: ExprNode): EmittedExpr {
    const cond = this.emitExpr(condNode);
    const thenType = this.inferExprType(thenNode);
    const elseType = this.inferExprType(elseNode);
    const resType = thenType.base !== "unknown" ? thenType : elseType;
    const canSelect =
      (isScalarType(resType) || vectorSize(resType) > 0) &&
      !this.hasSideEffects(thenNode) &&
      !this.hasSideEffects(elseNode);

    if (canSelect) {
      const t = this.emitExpr(thenNode);
      const e = this.emitExpr(elseNode);
      // WGSL `select(falseVal, trueVal, cond)`!
      return {
        code: `select(${this.coerceExpr(e, resType)}, ${this.coerceExpr(t, resType)}, ${cond.code})`,
        type: resType
      };
    }

    // Hoist `var _t: T; if (cond) { _t = then; } else { _t = else; }`
    const tmp = this.freshName("gs_sel");
    this.hoistQueue.push(`var ${tmp}: ${this.wgslType(resType)};`);
    const thenBody = this.withHoist("  ", () => {
      const t = this.emitExpr(thenNode);
      return [`  ${tmp} = ${this.coerceExpr(t, resType)};`];
    });
    const elseBody = this.withHoist("  ", () => {
      const e = this.emitExpr(elseNode);
      return [`  ${tmp} = ${this.coerceExpr(e, resType)};`];
    });
    this.hoistQueue.push(`if (${cond.code}) {\n${thenBody.join("\n")}\n} else {\n${elseBody.join("\n")}\n}`);
    return { code: tmp, type: resType };
  }

  private hasSideEffects(e: ExprNode): boolean {
    switch (e.kind) {
      case "AssignExpr":
        return true;
      case "UnaryExpr":
        return e.op === "++" || e.op === "--" || this.hasSideEffects(e.expr);
      case "CallExpr": {
        const overloads = this.functions.get(e.callee);
        if (overloads && overloads.length > 0) return true; // user call may mutate globals/out params
        return e.args.some((a) => this.hasSideEffects(a));
      }
      case "BinaryExpr":
        return this.hasSideEffects(e.left) || this.hasSideEffects(e.right);
      case "TernaryExpr":
        return this.hasSideEffects(e.cond) || this.hasSideEffects(e.thenExpr) || this.hasSideEffects(e.elseExpr);
      case "CommaExpr":
        return e.exprs.some((x) => this.hasSideEffects(x));
      case "MemberExpr":
        return this.hasSideEffects(e.object);
      case "IndexExpr":
        return this.hasSideEffects(e.object) || this.hasSideEffects(e.index);
      case "ParenExpr":
        return this.hasSideEffects(e.expr);
      default:
        return false;
    }
  }

  private emitCallExpr(expr: CallExpr, isStatement: boolean): EmittedExpr {
    const callee = expr.callee;

    // 1. Array constructor: `float[10](...)` or `float[](...)`
    if (expr.calleeArraySize !== undefined) {
      const count = expr.calleeArraySize ? this.evalConstExprString(expr.calleeArraySize) : String(expr.args.length);
      const elemType: GType = { base: callee };
      const arrType: GType = { base: callee, arraySize: count };
      const args = expr.args.map((a) => this.coerceExpr(this.emitExpr(a), elemType));
      return { code: `${this.wgslType(arrType)}(${args.join(", ")})`, type: arrType };
    }

    // 2. Texture sampling / fetch / size builtins
    if (TEXTURE_BUILTINS.has(callee)) {
      return this.emitTextureBuiltin(callee, expr.args);
    }

    // 3. Struct constructor
    const structInfo = this.structs.get(callee);
    if (structInfo) {
      const args = expr.args.map((a, i) => {
        const fType = structInfo.fieldOrder[i]?.type;
        return this.coerceExpr(this.emitExpr(a), fType);
      });
      return { code: `${structInfo.wgslName}(${args.join(", ")})`, type: { base: callee } };
    }

    // 4. GLSL type constructors (scalar, vector, matrix)
    if (/^(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?)$/.test(callee)) {
      return this.emitTypeConstructor(callee, expr.args);
    }

    // 5. User-defined function call (with overload resolution + out/inout copy-in/copy-out!)
    const overloads = this.functions.get(callee);
    if (overloads && overloads.length > 0) {
      return this.emitUserFunctionCall(overloads, expr.args, isStatement);
    }

    // 6. Standard GLSL builtin function
    return this.emitStandardBuiltin(callee, expr.args);
  }

  private emitTypeConstructor(target: string, argNodes: ExprNode[]): EmittedExpr {
    const targetType: GType = { base: target };
    const args = argNodes.map((a) => this.emitExpr(a));

    // Scalar constructor (`float(x)`, `int(x)`, `uint(x)`, `bool(x)`)
    if (isScalarType(targetType)) {
      const wScalar = glslBaseToWGSL(target);
      if (args.length === 0) return { code: `${wScalar}(0)`, type: targetType };
      const a0 = args[0];
      if (vectorSize(a0.type) > 0) {
        return { code: `${wScalar}((${a0.code}).x)`, type: targetType };
      }
      if (matrixDims(a0.type)) {
        return { code: `${wScalar}((${a0.code})[0][0])`, type: targetType };
      }
      return { code: `${wScalar}(${a0.code})`, type: targetType };
    }

    // Vector constructor (`vec2/3/4`, `ivec2/3/4`, `uvec2/3/4`, `bvec2/3/4`)
    const targetVecN = vectorSize(targetType);
    if (targetVecN > 0) {
      const wVec = glslBaseToWGSL(target);
      const targetFam = scalarFamily(targetType)!;
      const wScalar = glslBaseToWGSL(targetFam);
      if (args.length === 0) return { code: `${wVec}()`, type: targetType };
      if (args.length === 1) {
        const a0 = args[0];
        const srcN = vectorSize(a0.type);
        if (srcN > targetVecN) {
          const sw = "xyzw".slice(0, targetVecN);
          return { code: `${wVec}((${a0.code}).${sw})`, type: targetType };
        }
        if (srcN === targetVecN) {
          return scalarFamily(a0.type) === targetFam
            ? { code: a0.code, type: targetType }
            : { code: `${wVec}(${a0.code})`, type: targetType };
        }
        if (isScalarType(a0.type) || a0.type.base === "unknown") {
          return {
            code: `${wVec}(${scalarFamily(a0.type) === targetFam ? a0.code : `${wScalar}(${a0.code})`})`,
            type: targetType
          };
        }
      }
      // Multi-arg vector constructor: convert element families if needed
      const converted = args.map((a) => {
        const af = scalarFamily(a.type);
        if (af && af !== targetFam) {
          const an = vectorSize(a.type);
          return an > 0 ? `vec${an}<${wScalar}>(${a.code})` : `${wScalar}(${a.code})`;
        }
        return a.code;
      });
      return { code: `${wVec}(${converted.join(", ")})`, type: targetType };
    }

    // Matrix constructor (`mat2/3/4`, `matCxR`)
    const dims = matrixDims(targetType)!;
    const wMat = glslBaseToWGSL(target);
    if (args.length === 0) return { code: `${wMat}()`, type: targetType };
    if (args.length === 1) {
      const a0 = args[0];
      const srcMat = matrixDims(a0.type);
      if (srcMat) {
        if (srcMat.cols === dims.cols && srcMat.rows === dims.rows) {
          return { code: a0.code, type: targetType };
        }
        return {
          code: `${this.ensureMatFromMatHelper(dims.cols, dims.rows, srcMat.cols, srcMat.rows)}(${a0.code})`,
          type: targetType
        };
      }
      // Diagonal scalar matrix constructor: `mat3(1.0)`
      return { code: `${this.ensureMatDiagHelper(dims.cols, dims.rows)}(f32(${a0.code}))`, type: targetType };
    }

    // Check if arguments are all exact column vectors OR all scalars
    const allColVecs = args.length === dims.cols && args.every((a) => vectorSize(a.type) === dims.rows);
    const allScalars = args.length === dims.cols * dims.rows && args.every((a) => isScalarType(a.type));
    if (allColVecs || allScalars) {
      return { code: `${wMat}(${args.map((a) => a.code).join(", ")})`, type: targetType };
    }

    // Mixed vector/scalar arguments -> extract scalar lanes into flat C*R args
    const lanes: string[] = [];
    for (const a of args) {
      const n = vectorSize(a.type);
      if (n > 0) {
        const tmp = this.freshName("gs_mc");
        this.hoistQueue.push(`let ${tmp} = ${a.code};`);
        for (let k = 0; k < n; k++) lanes.push(`f32(${tmp}.${"xyzw"[k]})`);
      } else {
        lanes.push(`f32(${a.code})`);
      }
    }
    return { code: `${wMat}(${lanes.slice(0, dims.cols * dims.rows).join(", ")})`, type: targetType };
  }

  private ensureMatDiagHelper(cols: number, rows: number): string {
    const key = `gs_mat${cols}x${rows}_diag`;
    if (!this.helpers.has(key)) {
      const colExprs = Array.from({ length: cols }, (_, c) => {
        const elems = Array.from({ length: rows }, (_, r) => (r === c ? "s" : "0.0")).join(", ");
        return `vec${rows}<f32>(${elems})`;
      }).join(", ");
      this.helpers.set(
        key,
        `fn ${key}(s: f32) -> mat${cols}x${rows}<f32> {\n  return mat${cols}x${rows}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private ensureMatFromMatHelper(tc: number, tr: number, sc: number, sr: number): string {
    const key = `gs_mat${tc}x${tr}_from_${sc}x${sr}`;
    if (!this.helpers.has(key)) {
      const colExprs = Array.from({ length: tc }, (_, c) => {
        const elems = Array.from({ length: tr }, (_, r) => {
          if (c < sc && r < sr) return `m[${c}][${r}]`;
          return c === r ? "1.0" : "0.0";
        }).join(", ");
        return `vec${tr}<f32>(${elems})`;
      }).join(", ");
      this.helpers.set(
        key,
        `fn ${key}(m: mat${sc}x${sr}<f32>) -> mat${tc}x${tr}<f32> {\n  return mat${tc}x${tr}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private ensureInverseHelper(n: 2 | 3 | 4): string {
    const key = `gs_inverse_mat${n}`;
    if (this.helpers.has(key)) return key;
    if (n === 2) {
      this.helpers.set(
        key,
        `fn ${key}(m: mat2x2<f32>) -> mat2x2<f32> {\n  let d = m[0][0] * m[1][1] - m[1][0] * m[0][1];\n  return mat2x2<f32>(vec2<f32>(m[1][1], -m[0][1]), vec2<f32>(-m[1][0], m[0][0])) * (1.0 / d);\n}`
      );
    } else if (n === 3) {
      this.helpers.set(
        key,
        `fn ${key}(m: mat3x3<f32>) -> mat3x3<f32> {
  let c0 = cross(m[1], m[2]);
  let c1 = cross(m[2], m[0]);
  let c2 = cross(m[0], m[1]);
  let invDet = 1.0 / dot(m[0], c0);
  return transpose(mat3x3<f32>(c0, c1, c2)) * invDet;
}`
      );
    } else {
      this.helpers.set(
        key,
        `fn ${key}(m: mat4x4<f32>) -> mat4x4<f32> {
  let c00 = m[2][2] * m[3][3] - m[3][2] * m[2][3];
  let c02 = m[1][2] * m[3][3] - m[3][2] * m[1][3];
  let c03 = m[1][2] * m[2][3] - m[2][2] * m[1][3];
  let c04 = m[2][1] * m[3][3] - m[3][1] * m[2][3];
  let c06 = m[1][1] * m[3][3] - m[3][1] * m[1][3];
  let c07 = m[1][1] * m[2][3] - m[2][1] * m[1][3];
  let c08 = m[2][1] * m[3][2] - m[3][1] * m[2][2];
  let c10 = m[1][1] * m[3][2] - m[3][1] * m[1][2];
  let c11 = m[1][1] * m[2][2] - m[2][1] * m[1][2];
  let c12 = m[2][0] * m[3][3] - m[3][0] * m[2][3];
  let c14 = m[1][0] * m[3][3] - m[3][0] * m[1][3];
  let c15 = m[1][0] * m[2][3] - m[2][0] * m[1][3];
  let c16 = m[2][0] * m[3][2] - m[3][0] * m[2][2];
  let c18 = m[1][0] * m[3][2] - m[3][0] * m[1][2];
  let c19 = m[1][0] * m[2][2] - m[2][0] * m[1][2];
  let c20 = m[2][0] * m[3][1] - m[3][0] * m[2][1];
  let c22 = m[1][0] * m[3][1] - m[3][0] * m[1][1];
  let c23 = m[1][0] * m[2][1] - m[2][0] * m[1][1];
  let f0 = vec4<f32>(c00, c00, c02, c03);
  let f1 = vec4<f32>(c04, c04, c06, c07);
  let f2 = vec4<f32>(c08, c08, c10, c11);
  let f3 = vec4<f32>(c12, c12, c14, c15);
  let f4 = vec4<f32>(c16, c16, c18, c19);
  let f5 = vec4<f32>(c20, c20, c22, c23);
  let v0 = vec4<f32>(m[1][0], m[0][0], m[0][0], m[0][0]);
  let v1 = vec4<f32>(m[1][1], m[0][1], m[0][1], m[0][1]);
  let v2 = vec4<f32>(m[1][2], m[0][2], m[0][2], m[0][2]);
  let v3 = vec4<f32>(m[1][3], m[0][3], m[0][3], m[0][3]);
  let i0 = v1 * f0 - v2 * f1 + v3 * f2;
  let i1 = v0 * f0 - v2 * f3 + v3 * f4;
  let i2 = v0 * f1 - v1 * f3 + v3 * f5;
  let i3 = v0 * f2 - v1 * f4 + v2 * f5;
  let sA = vec4<f32>(1.0, -1.0, 1.0, -1.0);
  let sB = vec4<f32>(-1.0, 1.0, -1.0, 1.0);
  let inv = mat4x4<f32>(i0 * sA, i1 * sB, i2 * sA, i3 * sB);
  let row0 = vec4<f32>(inv[0][0], inv[1][0], inv[2][0], inv[3][0]);
  let det = dot(m[0], row0);
  return inv * (1.0 / det);
}`
      );
    }
    return key;
  }

  private ensureModHelper(type: GType): string {
    const wType = glslBaseToWGSL(type.base);
    const key = `gs_mod_${type.base}`;
    if (!this.helpers.has(key)) {
      this.helpers.set(key, `fn ${key}(x: ${wType}, y: ${wType}) -> ${wType} {\n  return x - y * floor(x / y);\n}`);
    }
    return key;
  }

  private ensureMatrixCompMultHelper(cols: number, rows: number): string {
    const key = `gs_matCompMult_${cols}x${rows}`;
    if (!this.helpers.has(key)) {
      const colExprs = Array.from({ length: cols }, (_, c) => `a[${c}] * b[${c}]`).join(", ");
      this.helpers.set(
        key,
        `fn ${key}(a: mat${cols}x${rows}<f32>, b: mat${cols}x${rows}<f32>) -> mat${cols}x${rows}<f32> {\n  return mat${cols}x${rows}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private ensureOuterProductHelper(rows: number, cols: number): string {
    const key = `gs_outerProduct_${cols}x${rows}`;
    if (!this.helpers.has(key)) {
      const colExprs = Array.from({ length: cols }, (_, c) => `a * b[${c}]`).join(", ");
      this.helpers.set(
        key,
        `fn ${key}(a: vec${rows}<f32>, b: vec${cols}<f32>) -> mat${cols}x${rows}<f32> {\n  return mat${cols}x${rows}<f32>(${colExprs});\n}`
      );
    }
    return key;
  }

  private emitUserFunctionCall(overloads: FnSignature[], argNodes: ExprNode[], isStatement: boolean): EmittedExpr {
    const inferredTypes = argNodes.map((a) => this.inferExprType(a));
    // Pick best matching overload
    let sig = overloads.find(
      (s) =>
        s.paramTypes.length === argNodes.length &&
        s.paramTypes.every((pt, i) => typeKey(pt) === typeKey(inferredTypes[i]))
    );
    if (!sig) {
      sig = overloads.find((s) => s.paramTypes.length === argNodes.length) ?? overloads[0];
    }

    const hasOutParams = sig.paramModes.some((m) => m !== "in");
    if (!hasOutParams) {
      const args = argNodes.map((a, i) => this.coerceExpr(this.emitExpr(a), sig!.paramTypes[i]));
      return { code: `${sig.wgslName}(${args.join(", ")})`, type: sig.returnType };
    }

    // GLSL copy-in / copy-out semantics for `out` and `inout` parameters:
    // Use local function-address-space temporaries for every out/inout arg so
    // var<private>, swizzles (v.zw), indexed vector lanes (v[2*i]), struct fields,
    // array elements, and aliased arguments ALL obey WGSL pointer & aliasing rules!
    const callArgs: string[] = [];
    const writebacks: string[] = [];

    for (let i = 0; i < argNodes.length; i++) {
      const mode = sig.paramModes[i] ?? "in";
      const paramType = sig.paramTypes[i];
      if (mode === "in") {
        callArgs.push(this.coerceExpr(this.emitExpr(argNodes[i]), paramType));
        continue;
      }

      const argNode = argNodes[i];
      const tmp = this.freshName("gs_oa");
      const wType = this.wgslType(paramType);

      // Check if argument is a multi-component swizzle (e.g. `value.zw`)
      if (
        argNode.kind === "MemberExpr" &&
        isValidSwizzle(argNode.field) &&
        argNode.field.length >= 2 &&
        vectorSize(this.inferExprType(argNode.object)) > 0
      ) {
        const baseStable = this.emitLValueBaseStable(argNode.object);
        const swiz = normalizeSwizzle(argNode.field);
        if (mode === "inout") {
          this.hoistQueue.push(`var ${tmp}: ${wType} = ${baseStable}.${swiz};`);
        } else {
          this.hoistQueue.push(`var ${tmp}: ${wType};`);
        }
        callArgs.push(`&${tmp}`);
        const lanes = "xyzw";
        for (let k = 0; k < swiz.length; k++) {
          writebacks.push(`${baseStable}.${swiz[k]} = ${tmp}.${lanes[k]};`);
        }
      } else {
        const stableTarget = this.emitLValueBaseStable(argNode);
        if (mode === "inout") {
          this.hoistQueue.push(`var ${tmp}: ${wType} = ${stableTarget};`);
        } else {
          this.hoistQueue.push(`var ${tmp}: ${wType};`);
        }
        callArgs.push(`&${tmp}`);
        writebacks.push(`${stableTarget} = ${tmp};`);
      }
    }

    const callCode = `${sig.wgslName}(${callArgs.join(", ")})`;
    if (isStatement || sig.returnType.base === "void") {
      this.hoistQueue.push(`${callCode};`);
      for (const wb of writebacks) this.hoistQueue.push(wb);
      return { code: "", type: T_VOID };
    }
    const retTmp = this.freshName("gs_or");
    this.hoistQueue.push(`let ${retTmp} = ${callCode};`);
    for (const wb of writebacks) this.hoistQueue.push(wb);
    return { code: retTmp, type: sig.returnType };
  }

  private emitStandardBuiltin(name: string, argNodes: ExprNode[]): EmittedExpr {
    const args = argNodes.map((a) => this.emitExpr(a));
    const argTypes = args.map((a) => a.type);
    const retType = inferBuiltinReturnType(name, argTypes);

    switch (name) {
      case "inversesqrt":
        return { code: `inverseSqrt(${args[0].code})`, type: retType };
      case "atan":
        return args.length === 2
          ? { code: `atan2(${args[0].code}, ${args[1].code})`, type: retType }
          : { code: `atan(${args[0].code})`, type: retType };
      case "dFdx":
        return { code: `dpdx(${args[0].code})`, type: retType };
      case "dFdy":
        return { code: `dpdy(${args[0].code})`, type: retType };
      case "fwidth":
        return { code: `fwidth(${args[0].code})`, type: retType };
      case "roundEven":
        return { code: `round(${args[0].code})`, type: retType };
      case "faceforward":
        return { code: `faceForward(${args.map((a) => a.code).join(", ")})`, type: retType };
      case "mod": {
        const x = args[0];
        const y = this.broadcastToMatch(args[1], x.type);
        const helper = this.ensureModHelper(x.type);
        return { code: `${helper}(${x.code}, ${y})`, type: x.type };
      }
      case "min":
      case "max": {
        const target = vectorSize(args[0].type) >= vectorSize(args[1].type) ? args[0].type : args[1].type;
        return {
          code: `${name}(${this.broadcastToMatch(args[0], target)}, ${this.broadcastToMatch(args[1], target)})`,
          type: target
        };
      }
      case "clamp": {
        const target = args[0].type;
        return {
          code: `clamp(${args[0].code}, ${this.broadcastToMatch(args[1], target)}, ${this.broadcastToMatch(args[2], target)})`,
          type: target
        };
      }
      case "step": {
        const target = args[1].type;
        return { code: `step(${this.broadcastToMatch(args[0], target)}, ${args[1].code})`, type: target };
      }
      case "smoothstep": {
        const target = args[2].type;
        return {
          code: `smoothstep(${this.broadcastToMatch(args[0], target)}, ${this.broadcastToMatch(args[1], target)}, ${args[2].code})`,
          type: target
        };
      }
      case "pow": {
        const target = args[0].type;
        return { code: `pow(${args[0].code}, ${this.broadcastToMatch(args[1], target)})`, type: target };
      }
      case "mix": {
        // GLSL `mix(a, b, bool/bvec)` -> WGSL `select(a, b, c)`
        if (scalarFamily(args[2].type) === "bool") {
          return { code: `select(${args[0].code}, ${args[1].code}, ${args[2].code})`, type: args[0].type };
        }
        return { code: `mix(${args[0].code}, ${args[1].code}, ${args[2].code})`, type: args[0].type };
      }
      case "lessThan":
        return { code: `((${args[0].code}) < (${args[1].code}))`, type: retType };
      case "lessThanEqual":
        return { code: `((${args[0].code}) <= (${args[1].code}))`, type: retType };
      case "greaterThan":
        return { code: `((${args[0].code}) > (${args[1].code}))`, type: retType };
      case "greaterThanEqual":
        return { code: `((${args[0].code}) >= (${args[1].code}))`, type: retType };
      case "equal":
        return { code: `((${args[0].code}) == (${args[1].code}))`, type: retType };
      case "notEqual":
        return { code: `((${args[0].code}) != (${args[1].code}))`, type: retType };
      case "not":
        return { code: `(!(${args[0].code}))`, type: retType };
      case "isnan":
        return { code: `((${args[0].code}) != (${args[0].code}))`, type: retType };
      case "isinf": {
        const a0 = args[0];
        const infBound =
          vectorSize(a0.type) > 0 ? `vec${vectorSize(a0.type)}<f32>(0x1.fffffep+127f)` : `0x1.fffffep+127f`;
        return { code: `(abs(${a0.code}) > ${infBound})`, type: retType };
      }
      case "floatBitsToUint":
        return { code: `bitcast<${glslBaseToWGSL(retType.base)}>(${args[0].code})`, type: retType };
      case "floatBitsToInt":
        return { code: `bitcast<${glslBaseToWGSL(retType.base)}>(${args[0].code})`, type: retType };
      case "uintBitsToFloat":
      case "intBitsToFloat":
        return { code: `bitcast<${glslBaseToWGSL(retType.base)}>(${args[0].code})`, type: retType };
      case "packSnorm2x16":
        return { code: `pack2x16snorm(${args[0].code})`, type: T_UINT };
      case "unpackSnorm2x16":
        return { code: `unpack2x16snorm(${args[0].code})`, type: T_VEC2 };
      case "packUnorm2x16":
        return { code: `pack2x16unorm(${args[0].code})`, type: T_UINT };
      case "unpackUnorm2x16":
        return { code: `unpack2x16unorm(${args[0].code})`, type: T_VEC2 };
      case "packHalf2x16":
        return { code: `pack2x16float(${args[0].code})`, type: T_UINT };
      case "unpackHalf2x16":
        return { code: `unpack2x16float(${args[0].code})`, type: T_VEC2 };
      case "inverse": {
        const dims = matrixDims(args[0].type);
        const n = (dims?.cols ?? 4) as 2 | 3 | 4;
        return { code: `${this.ensureInverseHelper(n)}(${args[0].code})`, type: args[0].type };
      }
      case "matrixCompMult": {
        const dims = matrixDims(args[0].type)!;
        return {
          code: `${this.ensureMatrixCompMultHelper(dims.cols, dims.rows)}(${args[0].code}, ${args[1].code})`,
          type: args[0].type
        };
      }
      case "outerProduct": {
        const r = vectorSize(args[0].type);
        const c = vectorSize(args[1].type);
        return {
          code: `${this.ensureOuterProductHelper(r, c)}(${args[0].code}, ${args[1].code})`,
          type: makeMatrixType(c, r)
        };
      }
      default:
        return { code: `${name}(${args.map((a) => a.code).join(", ")})`, type: retType };
    }
  }

  private emitTextureBuiltin(fn: string, argNodes: ExprNode[]): EmittedExpr {
    // First argument is `samplerType(texExpr, sampExpr)` (produced by WGSLBackend) or a sampler identifier
    const sArg = argNodes[0];
    let samplerType = "sampler2D";
    let texCode = "";
    let sampCode = "";

    if (sArg.kind === "CallExpr" && isSamplerOrTextureType(sArg.callee) && sArg.args.length === 2) {
      samplerType = sArg.callee;
      texCode = this.emitExpr(sArg.args[0]).code;
      sampCode = this.emitExpr(sArg.args[1]).code;
    } else {
      const emitted = this.emitExpr(sArg);
      samplerType = emitted.type.base;
      texCode = emitted.code;
      sampCode = emitted.code;
    }

    const isShadow = samplerType.endsWith("Shadow");
    const isArray = samplerType.includes("Array");
    const isCube = samplerType.includes("Cube");
    const is3D = samplerType.includes("3D");
    const isInt = samplerType.startsWith("i");
    const isUint = samplerType.startsWith("u");
    const sampleRet: GType = isShadow ? T_FLOAT : isInt ? { base: "ivec4" } : isUint ? { base: "uvec4" } : T_VEC4;
    const rest = argNodes.slice(1).map((a) => this.emitExpr(a));

    // textureSize(s, lod) -> vec2<i32>(textureDimensions(tex, lod)) (or vec3<i32> for 3D/2DArray)
    if (fn === "textureSize") {
      const lod = rest[0] ? `, ${rest[0].code}` : "";
      if (is3D) return { code: `vec3<i32>(textureDimensions(${texCode}${lod}))`, type: { base: "ivec3" } };
      if (isArray) {
        return {
          code: `vec3<i32>(vec2<i32>(textureDimensions(${texCode}${lod})), i32(textureNumLayers(${texCode})))`,
          type: { base: "ivec3" }
        };
      }
      return { code: `vec2<i32>(textureDimensions(${texCode}${lod}))`, type: { base: "ivec2" } };
    }

    // texelFetch(s, P, lod) / texelFetchOffset(s, P, lod, offset)
    if (fn === "texelFetch" || fn === "texelFetchOffset") {
      const coord = rest[0].code;
      const lod = rest[1].code;
      const offset = rest[2]?.code;
      if (isArray) {
        const tmp = this.freshName("gs_tc");
        this.hoistQueue.push(`let ${tmp} = ${coord};`);
        const xy = offset ? `(${tmp}.xy + ${offset})` : `${tmp}.xy`;
        return { code: `textureLoad(${texCode}, ${xy}, ${tmp}.z, ${lod})`, type: sampleRet };
      }
      const p = offset ? `(${coord} + ${offset})` : coord;
      return { code: `textureLoad(${texCode}, ${p}, ${lod})`, type: sampleRet };
    }

    // Helper to split coord for sampler2DArray / sampler2DShadow / samplerCubeShadow / sampler2DArrayShadow
    const splitCoord = (coord: EmittedExpr): { uv: string; extra?: string } => {
      if (isShadow && isCube) {
        const tmp = this.freshName("gs_sc");
        this.hoistQueue.push(`let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xyz`, extra: `${tmp}.w` };
      }
      if (isShadow && !isArray) {
        const tmp = this.freshName("gs_sc");
        this.hoistQueue.push(`let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xy`, extra: `${tmp}.z` };
      }
      if (isArray && isShadow) {
        const tmp = this.freshName("gs_sc");
        this.hoistQueue.push(`let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xy`, extra: `i32(round(${tmp}.z)), ${tmp}.w` };
      }
      if (isArray) {
        const tmp = this.freshName("gs_tc");
        this.hoistQueue.push(`let ${tmp} = ${coord.code};`);
        return { uv: `${tmp}.xy`, extra: `i32(round(${tmp}.z))` };
      }
      return { uv: coord.code };
    };

    // textureProj* variants
    if (fn.startsWith("textureProj")) {
      const p = rest[0];
      const tmp = this.freshName("gs_tp");
      this.hoistQueue.push(`let ${tmp} = ${p.code};`);
      const denom = vectorSize(p.type) === 3 ? `${tmp}.z` : `${tmp}.w`;
      const uv = is3D ? `(${tmp}.xyz / ${denom})` : `(${tmp}.xy / ${denom})`;
      const cmp = isShadow ? `, (${tmp}.z / ${tmp}.w)` : "";
      const hasLod = fn.includes("Lod");
      const hasGrad = fn.includes("Grad");
      const hasOffset = fn.includes("Offset");
      if (isShadow) {
        const offIdx = hasGrad ? 3 : hasLod ? 2 : 1;
        const off = hasOffset && rest[offIdx] ? `, ${rest[offIdx].code}` : "";
        const wgslFn = hasLod || this.stage === "vertex" ? "textureSampleCompareLevel" : "textureSampleCompare";
        return { code: `${wgslFn}(${texCode}, ${sampCode}, ${uv}${cmp}${off})`, type: T_FLOAT };
      }
      if (hasLod) {
        const lod = rest[1].code;
        const off = hasOffset ? `, ${rest[2].code}` : "";
        return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${uv}, ${lod}${off})`, type: sampleRet };
      }
      if (hasGrad) {
        const ddx = rest[1].code;
        const ddy = rest[2].code;
        const off = hasOffset ? `, ${rest[3].code}` : "";
        return { code: `textureSampleGrad(${texCode}, ${sampCode}, ${uv}, ${ddx}, ${ddy}${off})`, type: sampleRet };
      }
      const off = hasOffset ? `, ${rest[1].code}` : "";
      const biasIdx = hasOffset ? 2 : 1;
      if (rest[biasIdx]) {
        return {
          code: `textureSampleBias(${texCode}, ${sampCode}, ${uv}, ${rest[biasIdx].code}${off})`,
          type: sampleRet
        };
      }
      if (this.stage === "vertex") {
        return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${uv}, 0.0${off})`, type: sampleRet };
      }
      return { code: `textureSample(${texCode}, ${sampCode}, ${uv}${off})`, type: sampleRet };
    }

    // textureLod / texture2DLod / textureCubeLod / textureLodOffset
    if (fn.includes("Lod")) {
      const { uv, extra } = splitCoord(rest[0]);
      const lod = rest[1].code;
      const off = fn.endsWith("Offset") ? `, ${rest[2].code}` : "";
      if (isShadow) {
        return {
          code: `textureSampleCompareLevel(${texCode}, ${sampCode}, ${uv}, ${extra}${off})`,
          type: T_FLOAT
        };
      }
      const mid = extra ? `${uv}, ${extra}` : uv;
      return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${mid}, ${lod}${off})`, type: sampleRet };
    }

    // textureGrad / textureGradOffset
    if (fn.includes("Grad")) {
      const { uv, extra } = splitCoord(rest[0]);
      const ddx = rest[1].code;
      const ddy = rest[2].code;
      const off = fn.endsWith("Offset") ? `, ${rest[3].code}` : "";
      if (isShadow) {
        const wgslFn = this.stage === "vertex" ? "textureSampleCompareLevel" : "textureSampleCompare";
        return { code: `${wgslFn}(${texCode}, ${sampCode}, ${uv}, ${extra}${off})`, type: T_FLOAT };
      }
      const mid = extra ? `${uv}, ${extra}` : uv;
      return { code: `textureSampleGrad(${texCode}, ${sampCode}, ${mid}, ${ddx}, ${ddy}${off})`, type: sampleRet };
    }

    // texture / texture2D / textureCube / textureOffset
    const { uv, extra } = splitCoord(rest[0]);
    const isOffset = fn === "textureOffset";
    const off = isOffset ? `, ${rest[1].code}` : "";
    const bias = rest[isOffset ? 2 : 1];

    if (isShadow) {
      const wgslFn = this.stage === "vertex" ? "textureSampleCompareLevel" : "textureSampleCompare";
      return { code: `${wgslFn}(${texCode}, ${sampCode}, ${uv}, ${extra}${off})`, type: T_FLOAT };
    }
    const mid = extra ? `${uv}, ${extra}` : uv;
    if (bias) {
      return { code: `textureSampleBias(${texCode}, ${sampCode}, ${mid}, ${bias.code}${off})`, type: sampleRet };
    }
    if (this.stage === "vertex") {
      return { code: `textureSampleLevel(${texCode}, ${sampCode}, ${mid}, 0.0${off})`, type: sampleRet };
    }
    return { code: `textureSample(${texCode}, ${sampCode}, ${mid}${off})`, type: sampleRet };
  }

  private broadcastToMatch(expr: EmittedExpr, target: GType): string {
    const tn = vectorSize(target);
    if (tn > 0 && isScalarType(expr.type)) {
      const fam = scalarFamily(target) ?? "float";
      return `vec${tn}<${glslBaseToWGSL(fam)}>(${expr.code})`;
    }
    return expr.code;
  }

  private coerceExpr(expr: EmittedExpr, expected?: GType): string {
    if (!expected || expected.base === "unknown" || expected.base === "void") return expr.code;
    if (typeKey(expr.type) === typeKey(expected)) return expr.code;
    // Scalar family conversions when literal/unknown vs explicit target
    if (isScalarType(expected) && isScalarType(expr.type) && expr.type.base !== expected.base) {
      return `${glslBaseToWGSL(expected.base)}(${expr.code})`;
    }
    return expr.code;
  }

  private inferExprType(expr: ExprNode): GType {
    switch (expr.kind) {
      case "LiteralExpr":
        return expr.litKind === "float"
          ? T_FLOAT
          : expr.litKind === "uint"
            ? T_UINT
            : expr.litKind === "int"
              ? T_INT
              : T_BOOL;
      case "IdentExpr": {
        if (expr.name === "gl_Position" || expr.name === "gl_FragCoord") return T_VEC4;
        if (expr.name === "gl_VertexIndex" || expr.name === "gl_InstanceIndex") return T_UINT;
        if (expr.name === "gl_VertexID" || expr.name === "gl_InstanceID") return T_INT;
        if (expr.name === "gl_FrontFacing") return T_BOOL;
        if (expr.name === "gl_FragDepth" || expr.name === "gl_FragDepthEXT" || expr.name === "gl_PointSize")
          return T_FLOAT;
        if (expr.name === "gl_PointCoord") return T_VEC2;
        if (GLSL_BUILTIN_INT_LIMITS[expr.name] !== undefined) return T_INT;
        return this.lookupVar(expr.name)?.type ?? T_UNKNOWN;
      }
      case "ParenExpr":
        return this.inferExprType(expr.expr);
      case "MemberExpr": {
        const ot = this.inferExprType(expr.object);
        const sInfo = this.structs.get(ot.base);
        if (sInfo && !ot.arraySize) return sInfo.fields.get(expr.field)?.type ?? T_UNKNOWN;
        if (vectorSize(ot) > 0 && isValidSwizzle(expr.field)) {
          return makeVectorType(scalarFamily(ot) ?? "float", expr.field.length);
        }
        return T_UNKNOWN;
      }
      case "IndexExpr": {
        const ot = this.inferExprType(expr.object);
        if (ot.arraySize !== undefined) return { base: ot.base };
        const m = matrixDims(ot);
        if (m) return makeVectorType("float", m.rows);
        if (vectorSize(ot) > 0) return { base: scalarFamily(ot) ?? "float" };
        return T_UNKNOWN;
      }
      case "MethodCallExpr":
        return expr.method === "length" ? T_INT : T_UNKNOWN;
      case "UnaryExpr":
        return expr.op === "!" ? T_BOOL : this.inferExprType(expr.expr);
      case "BinaryExpr":
        return inferBinaryType(expr.op, this.inferExprType(expr.left), this.inferExprType(expr.right));
      case "AssignExpr":
        return this.inferExprType(expr.left);
      case "CommaExpr":
        return this.inferExprType(expr.exprs[expr.exprs.length - 1]);
      case "TernaryExpr": {
        const t = this.inferExprType(expr.thenExpr);
        return t.base !== "unknown" ? t : this.inferExprType(expr.elseExpr);
      }
      case "CallExpr": {
        if (expr.calleeArraySize !== undefined) {
          return { base: expr.callee, arraySize: String(expr.args.length) };
        }
        if (this.structs.has(expr.callee)) return { base: expr.callee };
        const overloads = this.functions.get(expr.callee);
        if (overloads?.length) {
          const argTypes = expr.args.map((a) => this.inferExprType(a));
          const match =
            overloads.find(
              (s) =>
                s.paramTypes.length === argTypes.length &&
                s.paramTypes.every((pt, i) => typeKey(pt) === typeKey(argTypes[i]))
            ) ?? overloads.find((s) => s.paramTypes.length === argTypes.length);
          return (match ?? overloads[0]).returnType;
        }
        return inferBuiltinReturnType(
          expr.callee,
          expr.args.map((a) => this.inferExprType(a))
        );
      }
      default:
        return T_UNKNOWN;
    }
  }

  private lookupVar(name: string): VarInfo | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const hit = this.scopes[i].get(name);
      if (hit) return hit;
    }
    return undefined;
  }

  private isIntegerGType(t: GType): boolean {
    const f = scalarFamily(t);
    return f === "int" || f === "uint";
  }

  private wgslType(t: GType): string {
    return glslTypeToWGSL(t, this.structNameMap);
  }

  private zeroValue(t: GType): string {
    return `${this.wgslType(t)}()`;
  }

  private isSimpleConstExpr(e: ExprNode): boolean {
    switch (e.kind) {
      case "LiteralExpr":
        return true;
      case "IdentExpr":
        return !!this.lookupVar(e.name)?.isConst;
      case "ParenExpr":
        return this.isSimpleConstExpr(e.expr);
      case "UnaryExpr":
        return e.op !== "++" && e.op !== "--" && this.isSimpleConstExpr(e.expr);
      case "BinaryExpr":
        return this.isSimpleConstExpr(e.left) && this.isSimpleConstExpr(e.right);
      case "TernaryExpr":
        return (
          this.isSimpleConstExpr(e.cond) && this.isSimpleConstExpr(e.thenExpr) && this.isSimpleConstExpr(e.elseExpr)
        );
      case "CallExpr":
        if (this.functions.has(e.callee) || TEXTURE_BUILTINS.has(e.callee)) return false;
        return e.args.every((a) => this.isSimpleConstExpr(a));
      case "InitListExpr":
        return e.elements.every((a) => this.isSimpleConstExpr(a));
      default:
        return false;
    }
  }
}

export function translateGLSLToWGSL(source: string, stage: ShaderStageKind): string {
  const ast = parseGLSLModule(source);
  return new WGSLEmitter(stage).emit(ast);
}
