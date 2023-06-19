import RuntimeContext from "../context";
import {
  AstNode,
  IAddOperatorAstContent,
  IAssignableValueAstContent,
  IBooleanAstContent,
  IDeclarationAstContent,
  IFnAddExprAstContent,
  IFnArgAstContent,
  IFnAssignLOAstContent,
  IFnAssignStatementAstContent,
  IFnAstContent,
  IFnAtomicExprAstContent,
  IFnBlockStatementAstContent,
  IFnBodyAstContent,
  IFnCallAstContent,
  IFnConditionStatementAstContent,
  IFnMacroConditionAstContent,
  IFnMacroConditionBranchAstContent,
  IFnMacroDefineAstContent,
  IFnMacroIncludeAstContent,
  IFnMultiplicationExprAstContent,
  IFnRelationExprAstContent,
  IFnReturnStatementAstContent,
  IFnReturnTypeAstContent,
  IFnVariableAstContent,
  IFnVariableDeclarationAstContent,
  IMultiplcationOperatorAstContent,
  INumberAstContent,
  IPassPropertyAssignmentAstContent,
  IPropertyAstContent,
  IPropertyItemAstContent,
  IRelationOperatorAstContent,
  IRenderStateDeclarationAstContent,
  IStatePropertyAssignAstContent,
  IStructAstContent,
  ITagAssignmentAstContent,
  ITagAstContent,
  ITupleNumber2,
  ITupleNumber3,
  ITupleNumber4,
  IVariableTypeAstContent
} from "./types";
export declare class ReturnTypeAstNode extends AstNode<IFnReturnTypeAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class ObjectAstNode<T = any> extends AstNode<Record<string, AstNode<T>>> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnAstNode extends AstNode<IFnAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnBodyAstNode extends AstNode<IFnBodyAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnMacroDefineAstNode extends AstNode<IFnMacroDefineAstContent> {}
export declare class FnMacroIncludeAstNode extends AstNode<IFnMacroIncludeAstContent> {}
export declare class FnMacroConditionAstNode extends AstNode<IFnMacroConditionAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnMacroConditionBranchAstNode extends AstNode<IFnMacroConditionBranchAstContent> {}
export declare class FnCallAstNode extends AstNode<IFnCallAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnConditionStatementAstNode extends AstNode<IFnConditionStatementAstContent> {}
export declare class FnBlockStatementAstNode extends AstNode<IFnBlockStatementAstContent> {}
export declare class RelationOperatorAstNode extends AstNode<IRelationOperatorAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class RelationExprAstNode extends AstNode<IFnRelationExprAstContent> {}
export declare class FnAssignStatementAstNode extends AstNode<IFnAssignStatementAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class AddOperatorAstNode extends AstNode<IAddOperatorAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class MultiplcationOperatorAstNode extends AstNode<IMultiplcationOperatorAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class AddExpreAstNode extends AstNode<IFnAddExprAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class MutliplicationExprAstNode extends AstNode<IFnMultiplicationExprAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnAtomicExprAstNode extends AstNode<IFnAtomicExprAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class NumberAstNode extends AstNode<INumberAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class BooleanAstNode extends AstNode<IBooleanAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class AssignLoAstNode extends AstNode<IFnAssignLOAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnVariableAstNode extends AstNode<IFnVariableAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnReturnStatemtneAstNode extends AstNode<IFnReturnStatementAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class FnArgAstNode extends AstNode<IFnArgAstContent> {
  _doSerialization(context: RuntimeContext, args?: any): string;
}
export declare class RenderStateDeclarationAstNode extends AstNode<IRenderStateDeclarationAstContent> {}
export declare class StatePropertyAssignAstNode extends AstNode<IStatePropertyAssignAstContent> {}
export declare class AssignableValueAstNode extends AstNode<IAssignableValueAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class VariableTypeAstNode extends AstNode<IVariableTypeAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class VariableDeclarationAstNode extends AstNode<IFnVariableDeclarationAstContent> {
  _doSerialization(
    context: RuntimeContext,
    opts?: {
      global: boolean;
    }
  ): string;
}
export declare class DeclarationAstNode extends AstNode<IDeclarationAstContent> {}
export declare class StructAstNode extends AstNode<IStructAstContent> {}
export declare class PassPropertyAssignmentAstNode extends AstNode<IPassPropertyAssignmentAstContent> {}
export declare class TagAssignmentAstNode extends AstNode<ITagAssignmentAstContent> {
  _doSerialization(context: RuntimeContext): string;
}
export declare class TagAstNode extends AstNode<ITagAstContent> {}
export declare class PropertyItemAstNode extends AstNode<IPropertyItemAstContent> {}
export declare class PropertyAstNode extends AstNode<IPropertyAstContent> {}
export declare class TupleNumber4AstNode extends AstNode<ITupleNumber4> {}
export declare class TupleNumber3AstNode extends AstNode<ITupleNumber3> {}
export declare class TupleNumber2AstNode extends AstNode<ITupleNumber2> {}
export declare class RangeAstNode extends AstNode<ITupleNumber2> {}
export { AstNode };
