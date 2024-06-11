import {
  BlendFactor,
  BlendOperation,
  Color,
  CompareFunction,
  CullMode,
  RenderQueueType,
  RenderStateDataKey,
  StencilOperation,
  Vector4
} from "@galacean/engine";
import { IShaderPassInfo } from "@galacean/engine-design";
import { AstNodeUtils } from "../AstNodeUtils";
import { DiagnosticSeverity } from "../Constants";
import RuntimeContext from "../RuntimeContext";
import { BlendStatePropertyTokens } from "../parser/tokens/render-state";
import {
  IAddOperatorAstContent,
  IArrayIndexAstContent,
  IAssignableValueAstContent,
  IBlendFactorAstContent,
  IBlendOperationAstContent,
  IBooleanAstContent,
  ICompareFunctionAstContent,
  IConditionExprAstContent,
  ICullModeAstContent,
  IDeclarationWithoutAssignAstContent,
  IFnAddExprAstContent,
  IFnArgAstContent,
  IFnArgDecoratorAstContent,
  IFnArrayVariableAstContent,
  IFnAssignExprAstContent,
  IFnAssignStatementAstContent,
  IFnAstContent,
  IFnAtomicExprAstContent,
  IFnBlockStatementAstContent,
  IFnBodyAstContent,
  IFnCallAstContent,
  IFnCallStatementAstContent,
  IFnConditionStatementAstContent,
  IFnExpressionAstContent,
  IFnMacroConditionAstContent,
  IFnMacroConditionBodyAstContent,
  IFnMacroConditionElifBranchAstContent,
  IFnMacroConditionElseBranchAstContent,
  IFnMacroDefineAstContent,
  IFnMacroDefineVariableAstContent,
  IFnMacroUndefineAstContent,
  IFnMultiplicationExprAstContent,
  IFnRelationExprAstContent,
  IFnReturnStatementAstContent,
  IFnReturnTypeAstContent,
  IFnVariableAstContent,
  IFnVariableDeclarationAstContent,
  IFnVariableDeclarationStatementAstContent,
  IFnVariableDeclareUnitAstContent,
  IForLoopAstContent,
  IMultiplicationOperatorAstContent,
  INumberAstContent,
  IParenthesisAtomicAstContent,
  IPassPropertyAssignmentAstContent,
  IPrecisionAstContent,
  IRelationOperatorAstContent,
  IRenderQueueAstContent,
  IRenderStateDeclarationAstContent,
  IRenderStatePropertyItemAstContent,
  IRuleRenderQueueAssignmentAstContent,
  ISelfAssignAstContent,
  ISelfAssignOperatorAstContent,
  IShaderPropertyDeclareAstContent,
  IStencilOperationAstContent,
  IStructAstContent,
  IStructMacroConditionBodyAstContent,
  IStructMacroConditionElifBranchAstContent,
  IStructMacroConditionElseBranchAstContent,
  IStructMacroConditionalFieldAstContent,
  ITagAssignmentAstContent,
  ITagAstContent,
  ITernaryExpressionSuffixAstContent,
  ITupleNumber2,
  ITupleNumber3,
  ITupleNumber4,
  IUseMacroAstContent,
  IVariablePropertyAstContent,
  IVariableTypeAstContent
} from "./AstNodeContent";

/** @internal */
export class AstNode<T = any> {
  position: IPositionRange;
  content: T;
  id: string;

  _astType = "unknown";
  _inMacro = false;

  constructor(position: IPositionRange, content: T) {
    this.position = position;
    this.content = content;
    this.id = `${position.start.index}_${position.end.index}`;
  }

  getContentValue(context?: RuntimeContext): any {
    if (typeof this.content === "string") return this.content.replace(/"(.*)"/, "$1");
    if (typeof this.content !== "object") return this.content;
    throw { message: "NOT IMPLEMENTED", astNode: this, ...this.position };
  }

  serialize(context?: RuntimeContext, args?: any): string {
    this._beforeSerialization(context, args);
    const ret = this._doSerialization(context, args);
    this._afterSerialization(context);
    return ret;
  }

  protected _doSerialization(context?: RuntimeContext, args?: any): string {
    return this.content as string;
  }

  protected _beforeSerialization(context?: RuntimeContext, args?: any) {
    context?.setSerializingNode(this);
  }

  protected _afterSerialization(context?: RuntimeContext, args?: any) {
    context?.unsetSerializingNode();
  }

  private _jsonifyObject(obj: any, includePos: boolean, withClass = false) {
    if (typeof obj !== "object") return obj;
    const ret = {} as any;
    if (obj?._isAstNode) {
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

  /** @internal */
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

export class ReturnTypeAstNode extends AstNode<IFnReturnTypeAstContent> {
  override _astType = "ReturnType";
  override _doSerialization(context: RuntimeContext): string {
    return this.content.text;
  }
}

export class ObjectAstNode<T = any> extends AstNode<Record<string, AstNode<T>>> {
  override _doSerialization(context: RuntimeContext): string {
    const astList = Object.values(this.content)
      .sort((a, b) => AstNodeUtils.astSortAsc(a.position, b.position))
      .filter((item) => item._astType);

    return astList.map((ast) => ast.serialize(context)).join("\n");
  }
}

export class FnAstNode extends AstNode<IFnAstContent> {
  override _astType: string = "Function";

  override _beforeSerialization(context?: RuntimeContext, args?: any): void {
    context.functionAstStack.push({ fnAst: this, localDeclaration: [] });
  }

  override _doSerialization(context: RuntimeContext): string {
    let returnType: string;
    let args: string;
    let fnName: string;

    if (context.currentMainFnAst === this) {
      returnType = "void";
      args = "";
      fnName = "main";
    } else {
      returnType = this.content.returnType.serialize(context);
      args = this.content.args?.map((arg) => arg.serialize(context)).join(", ") ?? "";
      fnName = this.content.name;
    }
    const body = this.content.body.serialize(context);

    if (
      (this.content.returnType.content.text === "void" && this.content.returnStatement) ||
      (this.content.returnType.content.text !== "void" && !this.content.returnStatement)
    ) {
      context.addDiagnostic({
        severity: DiagnosticSeverity.Error,
        message: "Mismatched return type",
        token: this.position
      });
      throw "Mismatched return type";
    }

    let ret = `${returnType} ${fnName} (${args}) {\n${body}\n}`;
    const precision = this.content.precision?.serialize(context);
    if (precision) {
      ret = precision + " " + ret;
    }

    // All functions in glsl syntax are global functions
    if (context._parsingMacro) {
      context.setPassGlobal(this.content.name, {
        name: this.content.name,
        ast: this,
        referenced: false,
        inMacro: true
      });
    }

    return ret;
  }

  override _afterSerialization(context?: RuntimeContext, args?: any): void {
    context.functionAstStack.pop();
  }
}

export class FnBodyAstNode extends AstNode<IFnBodyAstContent> {
  override _astType: string = "FunctionBody";
  override _doSerialization(context: RuntimeContext): string {
    const statements = [...(this.content.macros ?? []), ...(this.content.statements ?? [])].sort(
      (a, b) => a.position.start.line - b.position.start.line
    );
    return statements.map((s) => s.serialize(context)).join("\n");
  }
}

export class UseMacroAstNode extends AstNode<IUseMacroAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    if (typeof this.content === "string") return this.content;
    return this.content.serialize(context);
  }
}

export class FnMacroDefineAstNode extends AstNode<IFnMacroDefineAstContent> {
  override _astType: string = "MacroDefine";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    if (context?.currentMainFnAst) context.referenceGlobal(this.content.variable.getVariableName());
    return `#define ${this.content.variable.serialize(context)} ${
      this.content.value?.serialize(context, { skipUniform: true, skipComma: true }) ?? ""
    }`;
  }

  override _beforeSerialization(context?: RuntimeContext, args?: any): void {
    context._parsingMacro = true;
  }

  override _afterSerialization(context?: RuntimeContext, args?: any): void {
    context._parsingMacro = false;
  }
}

export class FnMacroDefineVariableAstNode extends AstNode<IFnMacroDefineVariableAstContent> {
  getVariableName(): string {
    if (typeof this.content === "string") return this.content;
    return this.content.content.function;
  }

  override _doSerialization(context?: RuntimeContext, args?: any): string {
    if (typeof this.content === "string") return this.content;
    return this.content.serialize(context);
  }
}

export class FnMacroUndefineAstNode extends AstNode<IFnMacroUndefineAstContent> {
  override _astType: string = "MacroUndef";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `#undef ${this.content.variable}`;
  }

  override _beforeSerialization(context?: RuntimeContext, args?: any): void {
    context._parsingMacro = true;
  }

  override _afterSerialization(context?: RuntimeContext, args?: any): void {
    context._parsingMacro = false;
  }
}

export class StructMacroConditionalFieldAstNode extends AstNode<IStructMacroConditionalFieldAstContent> {
  private _fields: DeclarationWithoutAssignAstNode[];
  get fields() {
    if (!this._fields) {
      this._fields = [];
      for (const v of this.content.body.content) {
        if (v instanceof DeclarationWithoutAssignAstNode) {
          this._fields.push(v);
        } else if (v instanceof StructMacroConditionalFieldAstNode) {
          this._fields.push(...v.fields);
        }
      }
    }
    return this._fields;
  }

  override _doSerialization(context?: RuntimeContext, args?: any): string {
    const body = this.content.body?.serialize(context) ?? "";
    const elifBranch = this.content.elifBranch?.serialize(context) ?? "";
    const elseBranch = this.content.elseBranch?.serialize(context) ?? "";
    return `${this.content.command} ${this.content.condition.serialize(context)}\n ${[body, elifBranch, elseBranch]
      .filter((item) => item)
      .join("\n")}\n#endif`;
  }
}

export class FnMacroConditionAstNode extends AstNode<IFnMacroConditionAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const body = this.content.body.serialize(context);
    const elifBranch = this.content.elifBranch?.map((item) => item.serialize(context)).join("\n") ?? "";
    const elseBranch = this.content.elseBranch?.serialize(context) ?? "";
    return `${this.content.command} ${this.content.condition.serialize(context)}\n ${[body, elifBranch, elseBranch]
      .filter((item) => item)
      .join("\n")}\n#endif`;
  }

  override _beforeSerialization(context?: RuntimeContext, args?: any): void {
    context._parsingMacro = true;
  }

  override _afterSerialization(context?: RuntimeContext, args?: any): void {
    context._parsingMacro = false;
  }
}

export class StructMacroConditionBodyAstNode extends AstNode<IStructMacroConditionBodyAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return this.content
      .map((item) => {
        const ret = item.serialize(context);
        if (item instanceof DeclarationWithoutAssignAstNode) {
          return `${ret};`;
        }
        return ret;
      })
      .join("\n");
  }
}

export class FnMacroConditionBodyAstNode extends AstNode<IFnMacroConditionBodyAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return this.content.map((item) => item.serialize(context)).join("\n");
  }
}

export class StructMacroConditionElifBranchAstNode extends AstNode<IStructMacroConditionElifBranchAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `#elif ${this.content.condition.serialize(context)}\n ${this.content.body.serialize(context)}`;
  }
}

export class FnMacroConditionElifBranchAstNode extends AstNode<IFnMacroConditionElifBranchAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `#elif ${this.content.condition.serialize(context)}\n  ${this.content.body.serialize(context)}`;
  }
}

export class FnMacroConditionElseBranchAstNode extends AstNode<IFnMacroConditionElseBranchAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `#else\n  ${this.content.body.serialize(context)}`;
  }
}

export class StructMacroConditionElseBranchAstNode extends AstNode<IStructMacroConditionElseBranchAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `#else\n  ${this.content.body.serialize(context)}`;
  }
}

export class FnVariableDeclarationStatementAstNode extends AstNode<IFnVariableDeclarationStatementAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `${this.content.serialize(context)};`;
  }
}

export class DiscardStatementAstNode extends AstNode {
  override _astType: string = "Discard";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return "discard;";
  }
}

export class BreakStatementAstNode extends AstNode {
  override _astType: string = "Break";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return "break;";
  }
}

export class ContinueStatementAstNode extends AstNode {
  override _astType: string = "Continue";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return "continue;";
  }
}

export class FnParenthesisAtomicAstNode extends AstNode<IParenthesisAtomicAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    let ret = `(${this.content.parenthesisNode.serialize(context)})`;
    if (this.content.property) {
      ret += `.${this.content.property.serialize(context)}`;
    }
    return ret;
  }
}

export class FnCallAstNode extends AstNode<IFnCallAstContent> {
  override _astType: string = "FunctionCall";
  override _doSerialization(context: RuntimeContext): string {
    if (this.content.isCustom) {
      if (!context.referenceGlobal(this.content.function)) {
        context.addDiagnostic({
          severity: DiagnosticSeverity.Warning,
          message: `Not found function definition: ${this.content.function}`,
          token: this.position
        });
      }
    }
    const args = this.content.args?.map((item) => item.serialize(context)).join(", ") ?? "";
    return `${this.content.function}(${args})`;
  }

  override getContentValue(context: RuntimeContext) {
    switch (this.content.function) {
      case "vec4":
        const args1 = this.content.args.map((item) => Number(item.serialize(context)));
        if (context.payload?.parsingRenderState) {
          return new Color(...args1);
        }
        return new Vector4(...args1);
      case "Color":
        const args2 = this.content.args.map((item) => Number(item.serialize(context)));
        return new Color(...args2);
      default:
        throw `Not supported builtin function ${this.content.function}`;
    }
  }
}

export class FnConditionStatementAstNode extends AstNode<IFnConditionStatementAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    const elseIfBranches = this.content.elseIfBranches?.map((item) => "else " + item.serialize(context)) ?? "";
    const elseBranch = this.content.elseBranch ? "else " + this.content.elseBranch?.serialize(context) : "";
    const body = this.content.body.serialize(context);
    const relation = this.content.relation.serialize(context);
    return `if (${relation})
${body}
${elseIfBranches}
${elseBranch}`;
  }
}

export class FnBlockStatementAstNode extends AstNode<IFnBlockStatementAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `{ 
  ${this.content.serialize(context)}
}`;
  }
}

export class RelationOperatorAstNode extends AstNode<IRelationOperatorAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class ConditionExprAstNode extends AstNode<IConditionExprAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    const expressionList = this.content.expressionList.map((item) => item.serialize(context));
    const operatorList = this.content.operatorList?.map((item) => item.serialize(context));
    let ret = expressionList[0];
    for (let i = 1; i < expressionList.length; i++) {
      ret += ` ${operatorList[i - 1]} ${expressionList[i]}`;
    }
    if (this.content.ternarySuffix) {
      ret += this.content.ternarySuffix.serialize(context);
    }

    return ret;
  }
}

export class RelationExprAstNode extends AstNode<IFnRelationExprAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    let ret = this.content.leftOperand.serialize(context);
    if (this.content.operator) {
      ret += ` ${this.content.operator?.serialize(context)} ${this.content.rightOperand?.serialize(context)}`;
    }
    return ret;
  }
}

export class FnAssignStatementAstNode extends AstNode<IFnAssignStatementAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return this.content.serialize(context) + ";";
  }
}

export class FnAssignExprAstNode extends AstNode<IFnAssignExprAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const { value } = this.content;
    let valueStr = "";
    if (value) {
      for (let i = 0; i < value.length; i++) {
        const op = this.content.operator[i];
        const v = this.content.value[i];
        valueStr += ` ${op} ${v.serialize(context)}`;
      }
    }
    return `${this.content.assignee.serialize(context)} ${valueStr}`.trimEnd();
  }
}

export class AddOperatorAstNode extends AstNode<IAddOperatorAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class MultiplicationOperatorAstNode extends AstNode<IMultiplicationOperatorAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}

export class FnExpressionAstNode extends AstNode<IFnExpressionAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    let ret = this.content.expr.serialize(context);
    if (this.content.ternaryExprSuffix) {
      ret += ` ${this.content.ternaryExprSuffix.serialize(context)}`;
    }
    return ret;
  }
}

export class TernaryExpressionSuffixAstNode extends AstNode<ITernaryExpressionSuffixAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `? ${this.content.positiveExpr.serialize(context)} : ${this.content.negativeExpr.serialize(context)}`;
  }
}

export class AddExprAstNode extends AstNode<IFnAddExprAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const orderItemList = [...this.content.operands, ...this.content.operators].sort((a, b) =>
      AstNodeUtils.astSortAsc(a.position, b.position)
    );
    return orderItemList.map((item) => item.serialize(context)).join(" ");
  }
}

export class MultiplicationExprAstNode extends AstNode<IFnMultiplicationExprAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const orderItemList = [...this.content.operands, ...this.content.operators].sort((a, b) =>
      AstNodeUtils.astSortAsc(a.position, b.position)
    );
    return orderItemList.map((item) => item.serialize(context)).join(" ");
  }
}

export class FnAtomicExprAstNode extends AstNode<IFnAtomicExprAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    const signStr = this.content.sign?.serialize(context) ?? "";
    return signStr + this.content.RuleFnAtomicExpr.serialize(context);
  }

  override getContentValue() {
    const expressionValue = this.content.RuleFnAtomicExpr.getContentValue();
    if (typeof expressionValue === "number") {
      return expressionValue * (this.content.sign?.content === "-" ? -1 : 1);
    }
    return expressionValue;
  }
}

export class NumberAstNode extends AstNode<INumberAstContent> {
  override _astType: string = "Number";
  override _doSerialization(context: RuntimeContext): string {
    return this.content.text;
  }

  override getContentValue() {
    return this.content.value;
  }
}

export class BooleanAstNode extends AstNode<IBooleanAstContent> {
  override _astType: string = "Boolean";
  override _doSerialization(context: RuntimeContext): string {
    return this.content.text;
  }

  override getContentValue() {
    return this.content.value;
  }
}

export class FnVariableAstNode extends AstNode<IFnVariableAstContent> {
  override _astType: string = "Variable";
  override _doSerialization(context: RuntimeContext): string {
    const objName = this.content.variable;
    const propName = this.content.properties?.[0].content;

    const propList = [...(this.content.properties ?? []), ...(this.content.indexes ?? [])]
      .sort((a, b) => AstNodeUtils.astSortAsc(a.position, b.position))
      .map((item) => item.serialize(context))
      .join("");

    if (propName) {
      if (objName === context.varyingStructInfo.objectName) {
        const ref = context.varyingStructInfo.reference?.find(
          (ref) => ref.property.content.variableNode.content.variable === propName
        );
        ref && (ref.referenced = true);
        return propList;
      } else {
        const attribStruct = context.attributeStructListInfo.find((struct) => struct.objectName === objName);
        if (attribStruct) {
          const ref = attribStruct.reference.find(
            (ref) => ref.property.content.variableNode.content.variable === propName
          );
          ref && (ref.referenced = true);
          return propList;
        }
      }
    }
    if (!context.findLocal(objName)) {
      if (!context.referenceGlobal(objName)) {
        context.addDiagnostic({
          severity: DiagnosticSeverity.Error,
          message: `Not found variable definition: ${objName}`,
          token: this.position
        });
      }
    }

    return objName + propList;
  }
}

export class FnArrayVariableAstNode extends AstNode<IFnArrayVariableAstContent> {
  override _astType: string = "ArrayVariable";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return this.content.variable;
  }
}

export class FnReturnStatementAstNode extends AstNode<IFnReturnStatementAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    context.currentFunctionInfo.fnAst.content.returnStatement = this;
    if (context.currentFunctionInfo.fnAst === context.currentMainFnAst) {
      return "";
    }
    return `return ${this.content.prefix ?? ""}${this.content.body.serialize(context)};`;
  }
}

export class FnCallStatementAstNode extends AstNode<IFnCallStatementAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `${this.content.serialize(context)};`;
  }
}

export class FnArgDecoratorAstNode extends AstNode<IFnArgDecoratorAstContent> {}

export class FnArgAstNode extends AstNode<IFnArgAstContent> {
  override _astType: string = "FunctionArgument";
  override _doSerialization(context: RuntimeContext, args?: any): string {
    context.currentFunctionInfo.localDeclaration.push(
      new VariableDeclarationAstNode(this.position, {
        variableList: [
          new FnVariableDeclareUnitAstNode(this.position, {
            variable: new FnArrayVariableAstNode(this.position, { variable: this.content.name })
          })
        ],
        type: this.content.type
      })
    );
    const arrayIndex = this.content.arrayIndex ? this.content.arrayIndex.serialize(context) : "";
    return `${this.content.decorator?.content ?? ""} ${this.content.type.serialize(context)} ${
      this.content.name
    }${arrayIndex}`;
  }
}

export class RenderStateDeclarationAstNode extends AstNode<IRenderStateDeclarationAstContent> {
  override _astType: string = "RenderState";
  override getContentValue(context?: RuntimeContext): {
    variable: string;
    properties: IShaderPassInfo["renderStates"];
    renderStateType: string;
  } {
    const properties: IShaderPassInfo["renderStates"] = [{}, {}];
    for (const prop of this.content.properties) {
      const propContent = prop.getContentValue(context);
      let _propertyKey = this.content.renderStateType + propContent.property;
      if (
        this.content.renderStateType === "BlendState" &&
        (!!BlendStatePropertyTokens[propContent.property] || propContent.property === "Enabled")
      ) {
        _propertyKey += propContent.index ?? "0";
      }
      const renderStateKey = RenderStateDataKey[_propertyKey];
      if (renderStateKey === undefined) {
        context?.addDiagnostic({
          severity: DiagnosticSeverity.Error,
          message: "invalid render state key",
          token: prop.position
        });
        return;
      }

      if (propContent.isVariable) {
        properties[1][renderStateKey] = propContent.value;
      } else {
        properties[0][renderStateKey] = propContent.value;
      }
    }

    return {
      renderStateType: this.content.renderStateType as any,
      properties,
      variable: this.content.variable
    };
  }
}

export class RenderStatePropertyItemAstNode extends AstNode<IRenderStatePropertyItemAstContent> {
  /** Where the value is a variable */
  isVariable: boolean;

  override getContentValue(context?: RuntimeContext) {
    const isVariable = this.isVariable;
    if (isVariable && context) {
      const global = context.findGlobal(this.content.value.content);
      if (!global) {
        context.addDiagnostic({
          severity: DiagnosticSeverity.Warning,
          message: "not found variable definition",
          token: this.content.value.position
        });
      }
    }
    return {
      property: this.content.property,
      index: this.content.index,
      value: this.content.value.getContentValue(context),
      isVariable
    };
  }
}

export class AssignableValueAstNode extends AstNode<IAssignableValueAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return this.content;
  }
}
export class VariableTypeAstNode extends AstNode<IVariableTypeAstContent> {
  override _astType: string = "VariableType";
  override _doSerialization(context: RuntimeContext): string {
    context.referenceGlobal(this.content.text);
    return this.content.text;
  }
}

export class VariableDeclarationAstNode extends AstNode<IFnVariableDeclarationAstContent> {
  override _astType: string = "VariableDeclaration";
  override _doSerialization(context: RuntimeContext, opts?: { skipUniform: boolean; skipComma: boolean }): string {
    if (context.currentFunctionInfo) {
      context.currentFunctionInfo.localDeclaration.push(this);
    }
    const typeNode = this.content.type;
    if (typeNode.content.text === context.varyingTypeAstNode.content.text) {
      context.varyingStructInfo.objectName = this.content.variableList[0].getVariableName();

      return "";
    }
    if (typeNode.content.isCustom) {
      if (!context.referenceGlobal(typeNode.content.text)) {
        context.addDiagnostic({
          severity: DiagnosticSeverity.Error,
          message: `Undefined type ${typeNode.content.text}`,
          token: this.position
        });
      }
    }
    const variableList = this.content.variableList.map((item) => item.serialize(context));
    let ret = `${typeNode.content.text} ${variableList.join(",")}`;
    if (this.content.typeQualifier) {
      ret = this.content.typeQualifier + ret;
    }
    if (this.content.precision) {
      ret = `${this.content.precision.serialize(context)} ${ret}`;
    }
    if (context.isParsingGlobal() && !opts?.skipUniform) {
      ret = "uniform " + ret;
    }

    return opts?.skipComma ? ret : ret + ";";
  }
}

export class FnVariableDeclareUnitAstNode extends AstNode<IFnVariableDeclareUnitAstContent> {
  getVariableName() {
    return this.content.variable.content.variable;
  }

  override _doSerialization(context?: RuntimeContext, args?: any): string {
    const variable = this.content.variable.serialize(context);
    if (this.content.default) {
      return `${variable} = ${this.content.default.serialize(context)}`;
    }
    return variable;
  }
}

export class PrecisionAstNode extends AstNode<IPrecisionAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return this.content;
  }
}

export class ShaderPropertyDeclareAstNode extends AstNode<IShaderPropertyDeclareAstContent> {
  override _astType: string = "ShaderProperty";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `uniform ${this.content.prefix?.serialize(context) ?? ""} ${this.content.declare.serialize(context)};`;
  }

  getVariable() {
    return this.content.declare.content.variableNode.content.variable;
  }
}

export class DeclarationWithoutAssignAstNode extends AstNode<IDeclarationWithoutAssignAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `${this.content.type.serialize(context)} ${this.content.variableNode.serialize(context)}`;
  }
}

export class StructAstNode extends AstNode<IStructAstContent> {
  override _astType: string = "Struct";

  override _doSerialization(context?: RuntimeContext, args?: any): string {
    const variables = this.content.variables
      .map((item) => {
        let ret = item.serialize(context);
        if (item instanceof DeclarationWithoutAssignAstNode) {
          ret += ";";
        }
        return ret;
      })
      .join("\n");
    return `struct ${this.content.name} {
      ${variables}
    };`;
  }
}

export class PassPropertyAssignmentAstNode extends AstNode<IPassPropertyAssignmentAstContent> {}

export class TagAssignmentAstNode extends AstNode<ITagAssignmentAstContent> {
  override _doSerialization(context: RuntimeContext): string {
    return `${this.content.tag} = ${this.content.value}`;
  }
}

export class TagAstNode extends AstNode<ITagAstContent> {
  override _astType: string = "Tag";
  override getContentValue(context?: RuntimeContext) {
    const ret = {} as IShaderPassInfo["tags"];
    for (const t of this.content) {
      ret[t.content.tag] = t.content.value.getContentValue();
    }
    return ret;
  }
}

export class TupleNumber4AstNode extends AstNode<ITupleNumber4> {}

export class TupleNumber3AstNode extends AstNode<ITupleNumber3> {}

export class TupleNumber2AstNode extends AstNode<ITupleNumber2> {}

export class CullModeAstNode extends AstNode<ICullModeAstContent> {
  override _astType: string = "CullMode";
  override getContentValue() {
    const prop = this.content.split(".")[1];
    return CullMode[prop];
  }
}

export class BlendFactorAstNode extends AstNode<IBlendFactorAstContent> {
  override _astType: string = "BlendFactor";
  override getContentValue() {
    const prop = this.content.split(".")[1];
    return BlendFactor[prop];
  }
}

export class BlendOperationAstNode extends AstNode<IBlendOperationAstContent> {
  override _astType: string = "BlendOperation";
  override getContentValue() {
    const prop = this.content.split(".")[1];
    return BlendOperation[prop];
  }
}

export class StencilOperationAstNode extends AstNode<IStencilOperationAstContent> {
  override _astType: string = "StencilOperation";
  override getContentValue() {
    const prop = this.content.split(".")[1];
    return StencilOperation[prop];
  }
}

export class CompareFunctionAstNode extends AstNode<ICompareFunctionAstContent> {
  override _astType: string = "CompareFunction";
  override getContentValue() {
    const prop = this.content.split(".")[1];
    return CompareFunction[prop];
  }
}

export class RenderQueueValueAstNode extends AstNode<IRenderQueueAstContent> {
  override _astType: string = "RenderQueue";
  isVariable: boolean;

  override getContentValue() {
    if (this.isVariable) return this.content;
    const prop = this.content.split(".")[1];
    return RenderQueueType[prop];
  }
}

export class RenderQueueAssignmentAstNode extends AstNode<IRuleRenderQueueAssignmentAstContent> {}

export class ForLoopAstNode extends AstNode<IForLoopAstContent> {
  override _astType: string = "ForLoop";
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `for (${this.content.init.serialize(context)} ${this.content.condition.serialize(
      context
    )}; ${this.content.update.serialize(context)}) ${this.content.body.serialize(context)}`;
  }
}

export class ArrayIndexAstNode extends AstNode<IArrayIndexAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `[${this.content?.serialize(context) ?? ""}]`;
  }
}

export class VariablePropertyAstNode extends AstNode<IVariablePropertyAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return `.${this.content}`;
  }
}

export class SelfAssignAstNode extends AstNode<ISelfAssignAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return [this.content.operator, this.content.variable]
      .filter((item) => !!item)
      .sort((a, b) => AstNodeUtils.astSortAsc(a.position, b.position))
      .map((item) => item.serialize(context))
      .join("");
  }
}

export class SelfAssignOperatorAstNode extends AstNode<ISelfAssignOperatorAstContent> {
  override _doSerialization(context?: RuntimeContext, args?: any): string {
    return this.content;
  }
}
