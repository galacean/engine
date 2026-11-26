/** Typed AST for GLSL ES 3.00 / Vulkan-GLSL stage source lowered to native WGSL. */

export interface LayoutQualifier {
  location?: number;
  set?: number;
  binding?: number;
  std140?: boolean;
  rowMajor?: boolean;
}

export interface TypeRef {
  name: string;
  arraySize?: ExprNode | null; // undefined = not array, null = unsized [], ExprNode = sized [N]
}

export interface StructField {
  layout?: LayoutQualifier;
  qualifiers: string[];
  type: TypeRef;
  name: string;
  arraySize?: ExprNode | null;
}

export interface VarDeclarator {
  name: string;
  arraySize?: ExprNode | null;
  init?: ExprNode;
}

export interface ParamDecl {
  qualifiers: string[]; // in, out, inout, const, highp, mediump, lowp
  type: TypeRef;
  name: string;
  arraySize?: ExprNode | null;
}

export type TopLevelDecl = StructDecl | UniformBlockDecl | GlobalVarDecl | FunctionDecl | PrecisionDecl;

export interface StructDecl {
  kind: "StructDecl";
  name: string;
  fields: StructField[];
}

export interface UniformBlockDecl {
  kind: "UniformBlockDecl";
  layout: LayoutQualifier;
  blockName: string;
  fields: StructField[];
  instanceName?: string;
}

export interface GlobalVarDecl {
  kind: "GlobalVarDecl";
  layout?: LayoutQualifier;
  qualifiers: string[];
  type: TypeRef;
  declarators: VarDeclarator[];
}

export interface FunctionDecl {
  kind: "FunctionDecl";
  returnType: TypeRef;
  name: string;
  params: ParamDecl[];
  body: BlockStmt | null;
}

export interface PrecisionDecl {
  kind: "PrecisionDecl";
}

export type StmtNode =
  | BlockStmt
  | VarDeclStmt
  | ExprStmt
  | IfStmt
  | ForStmt
  | WhileStmt
  | DoWhileStmt
  | SwitchStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | DiscardStmt;

export interface BlockStmt {
  kind: "BlockStmt";
  stmts: StmtNode[];
}

export interface VarDeclStmt {
  kind: "VarDeclStmt";
  qualifiers: string[];
  type: TypeRef;
  declarators: VarDeclarator[];
}

export interface ExprStmt {
  kind: "ExprStmt";
  expr: ExprNode | null;
}

export interface IfStmt {
  kind: "IfStmt";
  cond: ExprNode;
  thenBranch: StmtNode;
  elseBranch: StmtNode | null;
}

export interface ForStmt {
  kind: "ForStmt";
  init: VarDeclStmt | ExprStmt | null;
  cond: ExprNode | null;
  step: ExprNode | null;
  body: StmtNode;
}

export interface WhileStmt {
  kind: "WhileStmt";
  cond: ExprNode;
  body: StmtNode;
}

export interface DoWhileStmt {
  kind: "DoWhileStmt";
  body: StmtNode;
  cond: ExprNode;
}

export interface SwitchCase {
  expr: ExprNode | null; // null for `default:`
  stmts: StmtNode[];
}

export interface SwitchStmt {
  kind: "SwitchStmt";
  expr: ExprNode;
  cases: SwitchCase[];
}

export interface ReturnStmt {
  kind: "ReturnStmt";
  expr: ExprNode | null;
}

export interface BreakStmt {
  kind: "BreakStmt";
}

export interface ContinueStmt {
  kind: "ContinueStmt";
}

export interface DiscardStmt {
  kind: "DiscardStmt";
}

export type ExprNode =
  | LiteralExpr
  | IdentExpr
  | UnaryExpr
  | BinaryExpr
  | AssignExpr
  | TernaryExpr
  | CommaExpr
  | CallExpr
  | MemberExpr
  | MethodCallExpr
  | IndexExpr
  | InitListExpr
  | ParenExpr;

export interface LiteralExpr {
  kind: "LiteralExpr";
  litKind: "int" | "uint" | "float" | "bool";
  raw: string;
}

export interface IdentExpr {
  kind: "IdentExpr";
  name: string;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  op: "+" | "-" | "!" | "~" | "++" | "--";
  expr: ExprNode;
  prefix: boolean;
}

export interface BinaryExpr {
  kind: "BinaryExpr";
  op: string;
  left: ExprNode;
  right: ExprNode;
}

export interface AssignExpr {
  kind: "AssignExpr";
  op: string;
  left: ExprNode;
  right: ExprNode;
}

export interface TernaryExpr {
  kind: "TernaryExpr";
  cond: ExprNode;
  thenExpr: ExprNode;
  elseExpr: ExprNode;
}

export interface CommaExpr {
  kind: "CommaExpr";
  exprs: ExprNode[];
}

export interface CallExpr {
  kind: "CallExpr";
  callee: string;
  calleeArraySize?: ExprNode | null;
  args: ExprNode[];
}

export interface MemberExpr {
  kind: "MemberExpr";
  object: ExprNode;
  field: string;
}

export interface MethodCallExpr {
  kind: "MethodCallExpr";
  object: ExprNode;
  method: string;
  args: ExprNode[];
}

export interface IndexExpr {
  kind: "IndexExpr";
  object: ExprNode;
  index: ExprNode;
}

export interface InitListExpr {
  kind: "InitListExpr";
  elements: ExprNode[];
}

export interface ParenExpr {
  kind: "ParenExpr";
  expr: ExprNode;
}

export interface ShaderModuleAST {
  decls: TopLevelDecl[];
}
