import { DiagnosticSeverity } from "../constants";
import RuntimeContext from "../context";
import { astSortAsc } from "../utils";
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

export class ReturnTypeAstNode extends AstNode<IFnReturnTypeAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    if (this.content.isCustom) {
      context.findGlobal(this.content.text);
    }
    return this.content.text;
  }
}

export class ObjectAstNode<T = any> extends AstNode<Record<string, AstNode<T>>> {
  override _doSerialization(context: RuntimeContext): string {
    const astList = Object.values(this.content)
      .sort(astSortAsc)
      .filter((item) => item.constructor.name !== "AstNode");
    return astList.map((ast) => ast.serialize(context)).join("\n");
  }
}

export class FnAstNode extends AstNode<IFnAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    context.functionAstStack.push({ fnAst: this, localDeclaration: [] });

    let returnType: string;
    let args: string;
    let fnName: string;

    if (context.currentMainFnAst === this) {
      returnType = "void";
      args = "";
      fnName = "main";
    } else {
      returnType = this.content.returnType.serialize(context);
      args = this.content.args.map((arg) => arg.serialize(context)).join(", ");
      fnName = this.content.name;
    }
    const body = this.content.body.serialize(context);

    context.functionAstStack.pop();
    return `${returnType} ${fnName} (${args}) {\n${body}\n}`;
  }
}

export class FnBodyAstNode extends AstNode<IFnBodyAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const statements = [...(this.content.macros ?? []), ...(this.content.statements ?? [])].sort(
      (a, b) => a.position.start.line - b.position.start.line
    );
    return statements.map((s) => s.serialize(context)).join("\n");
  }
}

export class FnMacroDefineAstNode extends AstNode<IFnMacroDefineAstContent> {}

export class FnMacroIncludeAstNode extends AstNode<IFnMacroIncludeAstContent> {}

export class FnMacroConditionAstNode extends AstNode<IFnMacroConditionAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const body = this.content.body.serialize(context);
    const branch = this.content.branch?.serialize(context) ?? "";
    return `${this.content.command} ${this.content.identifier}\n  ${body}\n${branch}\n#endif`;
  }
}

export class FnMacroConditionBranchAstNode extends AstNode<IFnMacroConditionBranchAstContent> {}

export class FnCallAstNode extends AstNode<IFnCallAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    if (this.content.isCustom) {
      if (!context.referenceGlobal(this.content.function)) {
        context.diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: "Not found function definition",
          token: this.position
        });
      }
    }
    const args = this.content.args.map((item) => item.serialize(context)).join(", ");
    return `${this.content.function}(${args})`;
  }
}

export class FnConditionStatementAstNode extends AstNode<IFnConditionStatementAstContent> {}

export class FnBlockStatementAstNode extends AstNode<IFnBlockStatementAstContent> {}

export class RelationOperatorAstNode extends AstNode<IRelationOperatorAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content.text;
  }
}

export class RelationExprAstNode extends AstNode<IFnRelationExprAstContent> {}

export class FnAssignStatementAstNode extends AstNode<IFnAssignStatementAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const { value } = this.content;
    const valueStr = value.serialize(context);
    return `${this.content.assignee.serialize(context)} ${this.content.operator} ${valueStr};`;
  }
}

export class AddOperatorAstNode extends AstNode<IAddOperatorAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class MultiplcationOperatorAstNode extends AstNode<IMultiplcationOperatorAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class AddExpreAstNode extends AstNode<IFnAddExprAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const orderItemList = [...this.content.operands, ...this.content.operators].sort(astSortAsc);
    return orderItemList.map((item) => item.serialize(context)).join(" ");
  }
}

export class MutliplicationExprAstNode extends AstNode<IFnMultiplicationExprAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const orderItemList = [...this.content.operands, ...this.content.operators].sort(astSortAsc);
    return orderItemList.map((item) => item.serialize(context)).join(" ");
  }
}

export class FnAtomicExprAstNode extends AstNode<IFnAtomicExprAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const signStr = this.content.sign?.serialize(context) ?? "";
    return signStr + this.content.RuleFnAtomicExpr.serialize(context);
  }
}

export class NumberAstNode extends AstNode<INumberAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class BooleanAstNode extends AstNode<IBooleanAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class AssignLoAstNode extends AstNode<IFnAssignLOAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class FnVariableAstNode extends AstNode<IFnVariableAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const objName = this.content[0];
    const propName = this.content[1];
    if (propName) {
      if (objName === context.varyingStructInfo.objectName) {
        const ref = context.varyingStructInfo.reference.find((ref) => ref.property.content.variable === propName);
        ref && (ref.referenced = true);
        return this.content.slice(1).join(".");
      } else {
        const attribStruct = context.attributeStructListInfo.find((struct) => struct.objectName === objName);
        if (attribStruct) {
          const ref = attribStruct.reference.find((ref) => ref.property.content.variable === propName);
          ref && (ref.referenced = true);
          return this.content.slice(1).join(".");
        }
      }
    }

    if (!context.findLocal(objName)) {
      if (!context.referenceGlobal(objName)) {
        context.diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: "Not found variable definition",
          token: this.position
        });
      }
    }

    return this.content.join(".");
  }
}

export class FnReturnStatemtneAstNode extends AstNode<IFnReturnStatementAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    if (context.currentFunctionInfo.fnAst === context.currentMainFnAst) {
      return "";
    }
    return `return ${this.content.serialize(context)};`;
  }
}

export class FnArgAstNode extends AstNode<IFnArgAstContent> {
  override _doSerialization(context: RuntimeContext, args?: any): string {
    context.currentFunctionInfo.localDeclaration.push(
      new DeclarationAstNode({
        position: this.position,
        content: {
          variable: this.content.name,
          type: new VariableTypeAstNode({ position: this.position, content: this.content.type })
        }
      })
    );
    return `${this.content.type.text} ${this.content.name}`;
  }
}

export class RenderStateDeclarationAstNode extends AstNode<IRenderStateDeclarationAstContent> {}

export class StatePropertyAssignAstNode extends AstNode<IStatePropertyAssignAstContent> {}

export class AssignableValueAstNode extends AstNode<IAssignableValueAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}
export class VariableTypeAstNode extends AstNode<IVariableTypeAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content.text;
  }
}

export class VariableDeclarationAstNode extends AstNode<IFnVariableDeclarationAstContent> {
  override _doSerialization(context: RuntimeContext, opts?: { global: boolean }): string {
    if (context.currentFunctionInfo) {
      context.currentFunctionInfo.localDeclaration.push(this);
    }
    const typeNode = this.content.type;
    if (typeNode.content.text === context.varyingTypeAstNode.content.text) {
      if (this.content.default) {
        context.diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: "不应该给 varying 对象赋值",
          token: this.content.default.position
        });
      }
      context.varyingStructInfo.objectName = this.content.variable;

      return "";
    }
    if (typeNode.content.isCustom) {
      if (!context.referenceGlobal(typeNode.content.text)) {
        context.diagnostics.push({
          severity: DiagnosticSeverity.Error,
          message: `Undefined type ${typeNode.content.text}`,
          token: this.position
        });
      }
    }
    let ret = `${typeNode.content.text} ${this.content.variable}`;
    if (opts?.global) {
      ret = "uniform " + ret;
    }
    if (this.content.default) {
      ret += " = " + this.content.default.serialize(context);
    }
    return ret + ";";
  }
}

export class DeclarationAstNode extends AstNode<IDeclarationAstContent> {}

export class StructAstNode extends AstNode<IStructAstContent> {}

export class PassPropertyAssignmentAstNode extends AstNode<IPassPropertyAssignmentAstContent> {}

export class TagAssignmentAstNode extends AstNode<ITagAssignmentAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return `${this.content.tag} = ${this.content.value}`;
  }
}

export class TagAstNode extends AstNode<ITagAstContent> {
  toObj(): Record<string, any> {
    const ret = {} as any;
    for (const t of this.content) {
      ret[t.content.tag] = t.content.value.replace(/"(.*)"/, "$1");
    }
    return ret;
  }
}

export class PropertyItemAstNode extends AstNode<IPropertyItemAstContent> {}

export class PropertyAstNode extends AstNode<IPropertyAstContent> {}

export class TupleNumber4AstNode extends AstNode<ITupleNumber4> {}

export class TupleNumber3AstNode extends AstNode<ITupleNumber3> {}

export class TupleNumber2AstNode extends AstNode<ITupleNumber2> {}

export class RangeAstNode extends AstNode<ITupleNumber2> {}

export { AstNode };
