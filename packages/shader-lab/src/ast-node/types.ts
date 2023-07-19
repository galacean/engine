import {
  AddOperatorAstNode,
  AssignLoAstNode,
  AssignableValueAstNode,
  DeclarationAstNode,
  FnArgAstNode,
  FnAstNode,
  FnAtomicExprAstNode,
  FnVariableAstNode,
  MultiplicationOperatorAstNode,
  MultiplicationExprAstNode,
  ObjectAstNode,
  PassPropertyAssignmentAstNode,
  PropertyItemAstNode,
  ReturnTypeAstNode,
  StatePropertyAssignAstNode,
  StructAstNode,
  TagAssignmentAstNode,
  TagAstNode,
  VariableDeclarationAstNode,
  VariableTypeAstNode
} from ".";
import RuntimeContext from "../RuntimeContext";

export interface IPosition {
  line: number;
  offset: number;
}

export interface IPositionRange {
  start: IPosition;
  end: IPosition;
}

export interface IAstInfo<T = any> {
  position: IPositionRange;
  content: T;
}

export class AstNode<T = any> implements IAstInfo<T> {
  position: IPositionRange;
  content: T;

  /** @internal */
  private _isAstNode = true;

  constructor(ast: IAstInfo<T>) {
    this.position = ast.position;
    this.content = ast.content;
  }

  /** @internal */
  _doSerialization(context: RuntimeContext, args?: any): string {
    throw { message: "NOT IMPLEMENTED", astNode: this, ...this.position };
  }

  /** @internal */
  _beforeSerialization(context: RuntimeContext, args?: any) {
    context.serializingAstNode = this;
  }

  serialize(context: RuntimeContext, args?: any): string {
    this._beforeSerialization(context, args);
    return this._doSerialization(context, args);
  }

  private _jsonifyObject(obj: any, includePos: boolean, withClass = false) {
    if (typeof obj !== "object") return obj;
    const ret = {} as any;
    if (obj._isAstNode) {
      return obj.toJson(includePos, withClass);
    }
    for (const k in obj) {
      let v = obj[k];
      if (v === null || v === undefined) continue;
      if (v._isAstNode) {
        v = v.toJson(includePos, withClass);
      } else if (Array.isArray(v)) {
        v = v.map((i) => this._jsonifyObject(i, includePos, withClass));
      } else if (typeof v === "object") {
        v = this._jsonifyObject(v, includePos, withClass);
      }
      ret[k] = v;
    }

    return ret;
  }

  toJson(includePos = false, withClass = false) {
    let res: any;
    if (Array.isArray(this.content)) {
      res = this.content.map((item) => this._jsonifyObject(item, includePos, withClass));
    } else if (typeof this.content === "object") {
      res = this._jsonifyObject(this.content, includePos, withClass);
    } else {
      res = this.content;
    }
    let ret: any = { content: res };
    if (includePos) {
      ret.position = this.position;
    }
    if (withClass) {
      ret.Class = this.constructor.name;
    }
    return ret;
  }
}

export interface IShaderAstContent {
  name: string;
  editorProperties?: AstNode<Array<PropertyItemAstNode>>;
  subShader: Array<AstNode<ISubShaderAstContent>>;
}

export interface IPropertyItemAstContent {
  name: string;
  desc: string;
  type: string;
  default: Record<string, any>;
}

export interface ISubShaderAstContent {
  tags?: TagAstNode;
  pass: Array<AstNode<IPassAstContent>>;
}

export interface ITagAssignmentAstContent {
  tag: string;
  value: string;
}

export interface IFunctionAstContent {
  returnType: AstNode;
  name: string;
  args: Array<AstNode>;
  body: AstNode;
}

export interface IPassAstContent {
  name: string;
  tags: TagAstNode;
  properties: Array<PassPropertyAssignmentAstNode>;
  structs: Array<StructAstNode>;
  variables: Array<VariableDeclarationAstNode>;
  functions: Array<FnAstNode>;
}

export interface ITypeAstContent {
  text: string;
  isCustom: boolean;
}

export interface IFnReturnTypeAstContent {
  text: string;
  isCustom: boolean;
}

export interface IFnAstContent {
  returnType: ReturnTypeAstNode;
  name: string;
  args: Array<FnArgAstNode>;
  body: AstNode;
}

export interface IFnBodyAstContent {
  statements: Array<AstNode>;
  macros: Array<AstNode>;
}

export interface IFnMacroDefineAstContent {
  variable: string;
  value?: AstNode;
}

export interface IFnMacroIncludeAstContent {
  name: string;
}

export interface IFnMacroConditionAstContent {
  command: string;
  identifier: string;
  body: AstNode<IFnBodyAstContent>;
  branch?: AstNode;
}

export interface IFnMacroConditionBranchAstContent {
  declare: string;
  body: AstNode<IFnBodyAstContent>;
}

export interface IFnCallAstContent {
  function: string;
  args: Array<AstNode>;
  isCustom: boolean;
}

export interface IFnConditionStatementAstContent {
  relation: AstNode;
  body: AstNode<IFnBlockStatementAstContent>;
  elseBranch: AstNode<IFnBlockStatementAstContent>;
  elseIfBranches: Array<AstNode<IFnConditionStatementAstContent>>;
}

export interface IFnRelationExprAstContent {
  operands: Array<AstNode>;
  operator: AstNode<IRelationOperatorAstContent>;
}

export type IFnBlockStatementAstContent = AstNode<IFnBodyAstContent>;

export interface IRelationOperatorAstContent {
  text: string;
}

export interface IFnAssignStatementAstContent {
  assignee: AssignLoAstNode | FnVariableAstNode;
  value: AstNode;
  operator: string;
}

export type IFnExpressionAstContent = AstNode<IFnAddExprAstContent>;

export type IFnAddExprAstContent = {
  operators: Array<AddOperatorAstNode>;
  operands: Array<MultiplicationExprAstNode>;
};

export interface IFnMultiplicationExprAstContent {
  operators: Array<MultiplicationOperatorAstNode>;
  operands: Array<FnAtomicExprAstNode>;
}

export type IMultiplicationOperatorAstContent = string;

export type IAddOperatorAstContent = string;

export interface IFnAtomicExprAstContent {
  sign?: AddOperatorAstNode;
  RuleFnAtomicExpr: AstNode;
}

export type INumberAstContent = string;
export type IBooleanAstContent = string;
export type IFnAssignLOAstContent = string;

export type IFnVariableAstContent = Array<string>;
export type IFnReturnStatementAstContent = ObjectAstNode;

export interface IFnArgAstContent {
  name: string;
  type: {
    isCustom: boolean;
    text: string;
  };
}

export interface IRenderStateDeclarationAstContent {
  name: string;
  type: string;
  properties: Array<StatePropertyAssignAstNode>;
}

export interface IStatePropertyAssignAstContent {
  name: string;
  value: AssignableValueAstNode;
}

export type IAssignableValueAstContent = string;

export interface IVariableTypeAstContent {
  text: string;
  isCustom: boolean;
}

export interface IFnVariableDeclarationAstContent {
  type: VariableTypeAstNode;
  variable: string;
  default?: AstNode;
}

export interface IDeclarationAstContent {
  type: VariableTypeAstNode;
  variable: string;
}

export interface IStructAstContent {
  name: string;
  variables: Array<DeclarationAstNode>;
}

export interface IPassPropertyAssignmentAstContent {
  type: string;
  value: string;
}

export interface ITagAssignmentAstContent {
  tag: string;
  value: string;
}

export type ITagAstContent = Array<TagAssignmentAstNode>;

export type IPropertyAstContent = Array<PropertyItemAstNode>;

export type ITupleNumber4 = [number, number, number, number];
export type ITupleNumber3 = [number, number, number];
export type ITupleNumber2 = [number, number];
