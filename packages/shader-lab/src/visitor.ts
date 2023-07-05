import {
  ICstNodeVisitor,
  RuleAddOperatorCstChildren,
  RuleAssignableValueCstChildren,
  RuleBooleanCstChildren,
  RuleDeclarationCstChildren,
  RuleFnAddExprCstChildren,
  RuleFnArgCstChildren,
  RuleFnAssignLOCstChildren,
  RuleFnAssignStatementCstChildren,
  RuleFnAtomicExprCstChildren,
  RuleFnBlockStatementCstChildren,
  RuleFnBodyCstChildren,
  RuleFnCallCstChildren,
  RuleFnConditionStatementCstChildren,
  RuleFnCstChildren,
  RuleFnExpressionCstChildren,
  RuleFnMacroConditionBranchCstChildren,
  RuleFnMacroConditionCstChildren,
  RuleFnMacroCstChildren,
  RuleFnMacroDefineCstChildren,
  RuleFnMacroIncludeCstChildren,
  RuleFnMultiplicationExprCstChildren,
  RuleFnParenthesisExprCstChildren,
  RuleFnRelationExprCstChildren,
  RuleFnReturnStatementCstChildren,
  RuleFnReturnTypeCstChildren,
  RuleFnStatementCstChildren,
  RuleFnVariableCstChildren,
  RuleFnVariableDeclarationCstChildren,
  RuleMultiplicationOperatorCstChildren,
  RuleNumberCstChildren,
  RulePropertyCstChildren,
  RulePropertyItemCstChildren,
  RulePropertyItemValueCstChildren,
  RuleRangeCstChildren,
  RuleRelationOperatorCstChildren,
  RuleRenderStateDeclarationCstChildren,
  RuleShaderCstChildren,
  RuleShaderPassCstChildren,
  RuleStatePropertyAssignCstChildren,
  RuleStructCstChildren,
  RuleSubShaderCstChildren,
  RuleTagAssignmentCstChildren,
  RuleTagCstChildren,
  RuleVariableTypeCstChildren,
  SubShaderPassPropertyAssignmentCstChildren,
  TupleFloat4CstChildren,
  TupleInt4CstChildren
} from "./types";
import { CstNode } from "chevrotain";
import { ShaderParser } from "./parser";
import { defaultVisit, extractCstToken, getTokenPosition, getOrTypeCstNodePosition } from "./utils";

import {
  AddExprAstNode,
  AddOperatorAstNode,
  AssignLoAstNode,
  AssignableValueAstNode,
  AstNode,
  BooleanAstNode,
  DeclarationAstNode,
  FnArgAstNode,
  FnAssignStatementAstNode,
  FnAstNode,
  FnAtomicExprAstNode,
  FnBlockStatementAstNode,
  FnBodyAstNode,
  FnCallAstNode,
  FnConditionStatementAstNode,
  FnMacroConditionAstNode,
  FnMacroConditionBranchAstNode,
  FnMacroDefineAstNode,
  FnMacroIncludeAstNode,
  FnReturnStatementAstNode,
  FnVariableAstNode,
  MultiplicationOperatorAstNode,
  MultiplicationExprAstNode,
  NumberAstNode,
  PassPropertyAssignmentAstNode,
  PropertyAstNode,
  PropertyItemAstNode,
  RangeAstNode,
  RelationExprAstNode,
  RelationOperatorAstNode,
  RenderStateDeclarationAstNode,
  ReturnTypeAstNode,
  StatePropertyAssignAstNode,
  StructAstNode,
  TagAssignmentAstNode,
  TagAstNode,
  TupleNumber4AstNode,
  VariableDeclarationAstNode,
  VariableTypeAstNode
} from "./astNode";
import { IPassAstContent, IPosition, IPositionRange, IShaderAstContent, ISubShaderAstContent } from "./astNode/types";

export {};
export const parser = new ShaderParser();

const ShaderVisitorConstructor = parser.getBaseCstVisitorConstructorWithDefaults<any, AstNode>();

export class ShaderVisitor extends ShaderVisitorConstructor implements Partial<ICstNodeVisitor<any, AstNode>> {
  constructor() {
    super();
    this.validateVisitor();
  }

  RuleShader(ctx: RuleShaderCstChildren) {
    const editorProperties = ctx.RuleProperty ? this.visit(ctx.RuleProperty) : undefined;

    const subShader = ctx.RuleSubShader?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: getTokenPosition(ctx.Shader[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    const ast = {
      position,
      content: {
        name: ctx.ValueString[0].image.replace(/"(.*)"/, "$1"),
        editorProperties,
        subShader
      }
    };
    return new AstNode<IShaderAstContent>(ast);
  }

  RuleSubShader(ctx: RuleSubShaderCstChildren) {
    const tags = ctx.RuleTag ? (this.visit(ctx.RuleTag) as TagAstNode) : undefined;

    const pass = ctx.RuleShaderPass?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: getTokenPosition(ctx.SubShader[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    const content = {
      name: ctx.ValueString[0].image.replace(/"(.*)"/, "$1"),
      tags,
      pass
    };

    return new AstNode<ISubShaderAstContent>({ position, content });
  }

  RuleShaderPass(ctx: RuleShaderPassCstChildren) {
    const tags = ctx.RuleTag ? (this.visit(ctx.RuleTag) as TagAstNode) : undefined;
    const properties = ctx.SubShaderPassPropertyAssignment?.map((item) => this.visit(item));
    const structs = ctx.RuleStruct?.map((item) => {
      const ret = this.visit(item);
      return ret;
    });
    const variables: any = ctx.RuleFnVariableDeclaration?.map((item) => {
      const ret = this.visit(item);
      return ret;
    });
    const renderStates = ctx.RuleRenderStateDeclaration?.map((item) => this.visit(item));
    const functions = ctx.RuleFn?.map((item) => {
      const ret = this.visit(item);
      return ret;
    });

    const defines = ctx.RuleFnMacroDefine?.map((item) => this.visit(item));

    const content = {
      name: ctx.ValueString[0].image.replace(/"(.*)"/, "$1"),
      tags,
      properties,
      structs,
      variables,
      defines,
      renderStates,
      functions
    };

    const position: IPositionRange = {
      start: getTokenPosition(ctx.Pass[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    return new AstNode<IPassAstContent>({ content, position });
  }

  RuleFnReturnType(children: RuleFnReturnTypeCstChildren, param?: any) {
    const position = getOrTypeCstNodePosition({ children });
    return new ReturnTypeAstNode({
      position,
      content: {
        text: extractCstToken(children),
        isCustom: !!children.RuleVariableType?.[0].children.Identifier
      }
    });
  }

  RuleFn(ctx: RuleFnCstChildren) {
    const args = ctx.RuleFnArg?.map((item) => this.visit(item));
    const body = this.visit(ctx.RuleFnBody);

    const returnType = this.visit(ctx.RuleFnReturnType);
    const position: IPositionRange = {
      start: returnType.position.start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    return new FnAstNode({
      position,
      content: {
        returnType,
        name: ctx.Identifier[0].image,
        args,
        body
      }
    });
  }

  RuleFnBody(ctx: RuleFnBodyCstChildren) {
    let start: IPosition = { line: Number.MAX_SAFE_INTEGER, offset: -1 },
      end: IPosition = { line: 0, offset: -1 };

    const iterate = (item: CstNode) => {
      const astInfo = this.visit(item);
      if (astInfo.position.start.line < start.line) {
        start = astInfo.position.start;
      }
      if (astInfo.position.end.line > end.line) {
        end = astInfo.position.end;
      }
      return astInfo;
    };

    const statements = ctx.RuleFnStatement?.map(iterate);
    const macros = ctx.RuleFnMacro?.map(iterate);

    return new FnBodyAstNode({
      content: { statements, macros },
      position: { start, end }
    });
  }

  RuleFnMacro(children: RuleFnMacroCstChildren, param?: any) {
    return defaultVisit.bind(this)(children);
  }

  RuleFnMacroDefine(children: RuleFnMacroDefineCstChildren, param?: any) {
    const value = children.RuleAssignableValue ? this.visit(children.RuleAssignableValue) : undefined;

    const position: IPositionRange = {
      start: getTokenPosition(children.m_define[0]).start,
      end: value ? value.position.end : getTokenPosition(children.Identifier[0]).end
    };

    return new FnMacroDefineAstNode({
      position,
      content: {
        variable: children.Identifier[0].image,
        value
      }
    });
  }

  RuleFnMacroInclude(children: RuleFnMacroIncludeCstChildren, param?: any) {
    const position: IPositionRange = {
      start: getTokenPosition(children.m_include[0]).start,
      end: getTokenPosition(children.ValueString[0]).end
    };

    return new FnMacroIncludeAstNode({
      position,
      content: {
        name: children.ValueString[0].image.replace(/"(.*)"/, "$1")
      }
    });
  }

  RuleFnMacroCondition(children: RuleFnMacroConditionCstChildren, param?: any) {
    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(children.RuleFnMacroConditionDeclare[0]).start,
      end: getTokenPosition(children.m_endif[0]).end
    };

    const branch = children.RuleFnMacroConditionBranch && this.visit(children.RuleFnMacroConditionBranch);

    return new FnMacroConditionAstNode({
      position,
      content: {
        command: extractCstToken(children.RuleFnMacroConditionDeclare[0]),
        identifier: children.Identifier[0].image,
        body: this.visit(children.RuleFnBody),
        branch
      }
    });
  }

  RuleFnMacroConditionBranch(children: RuleFnMacroConditionBranchCstChildren, param?: any) {
    const body = this.visit(children.RuleFnBody);

    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(children.RuleFnMacroConditionBranchDeclare[0]).start,
      end: body.position.end
    };

    return new FnMacroConditionBranchAstNode({
      position,
      content: {
        declare: extractCstToken(children.RuleFnMacroConditionBranchDeclare[0]),
        body
      }
    });
  }

  RuleFnStatement(ctx: RuleFnStatementCstChildren) {
    return defaultVisit.bind(this)(ctx);
  }

  RuleFnCall(ctx: RuleFnCallCstChildren) {
    const isCustom = !!ctx.RuleFnCallVariable[0].children.Identifier;
    const args = ctx.RuleAssignableValue?.map((item) => {
      return this.visit(item);
    });

    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(ctx.RuleFnCallVariable[0]).start,
      end: getTokenPosition(ctx.RBracket[0]).end
    };

    const content = {
      function: extractCstToken(ctx.RuleFnCallVariable[0]),
      args,
      isCustom
    };

    return new FnCallAstNode({ position, content });
  }

  RuleFnConditionStatement(ctx: RuleFnConditionStatementCstChildren) {
    const blocks = ctx.RuleFnBlockStatement.map((item) => this.visit(item)).sort(
      (a, b) => a.position.start.line - b.position.start.line
    );
    const [body, elseBranch] = blocks;
    const elseIfBranches = ctx.RuleFnConditionStatement?.map((item) => this.visit(item)).sort(
      (a, b) => a.position.start.line - b.position.start.line
    );

    let end: IPosition = elseIfBranches[elseIfBranches.length - 1]?.position.end;
    const blockEnd = blocks[blocks.length - 1].position.end;

    end = end && end.line > blockEnd.line ? end : blockEnd;

    const position: IPositionRange = {
      start: getTokenPosition(ctx.if[0]).start,
      end
    };

    return new FnConditionStatementAstNode({
      position,
      content: {
        relation: this.visit(ctx.RuleFnRelationExpr),
        body,
        elseBranch,
        elseIfBranches
      }
    });
  }

  RuleFnRelationExpr(ctx: RuleFnRelationExprCstChildren) {
    const operands = ctx.RuleFnAddExpr.map((item) => this.visit(item));
    const position: IPositionRange = {
      start: operands[0].position.start,
      end: operands[1].position.end
    };

    return new RelationExprAstNode({
      position,
      content: {
        operator: this.visit(ctx.RuleRelationOperator),
        operands
      }
    });
  }

  RuleRelationOperator(children: RuleRelationOperatorCstChildren, param?: any) {
    const position = getOrTypeCstNodePosition({ children });
    return new RelationOperatorAstNode({ position, content: extractCstToken(children) });
  }

  RuleFnBlockStatement(ctx: RuleFnBlockStatementCstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.LCurly[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    return new FnBlockStatementAstNode({ position, content: this.visit(ctx.RuleFnBody) });
  }

  RuleFnAssignStatement(ctx: RuleFnAssignStatementCstChildren) {
    const assignee = this.visit(ctx.RuleFnAssignLO);

    const position: IPositionRange = {
      start: assignee.position.start,
      end: getTokenPosition(ctx.Semicolon[0]).end
    };

    return new FnAssignStatementAstNode({
      position,
      content: {
        operator: extractCstToken(ctx.RuleFnAssignmentOperator[0]),
        assignee,
        value: this.visit(ctx.RuleFnExpression)
      }
    });
  }

  RuleFnExpression(ctx: RuleFnExpressionCstChildren) {
    return this.visit(ctx.RuleFnAddExpr);
  }

  RuleAddOperator(children: RuleAddOperatorCstChildren, param?: any) {
    const position = getOrTypeCstNodePosition({ children });
    return new AddOperatorAstNode({
      content: extractCstToken(children),
      position
    });
  }

  RuleFnAddExpr(ctx: RuleFnAddExprCstChildren) {
    if (ctx.RuleAddOperator) {
      const operands = ctx.RuleFnMultiplicationExpr?.map((item) => this.visit(item));

      const position: IPositionRange = {
        start: operands[0].position.start,
        end: operands[1].position.end
      };

      return new AddExprAstNode({
        content: {
          operators: ctx.RuleAddOperator.map((item) => this.visit(item)),
          operands
        },
        position
      });
    }

    return this.visit(ctx.RuleFnMultiplicationExpr);
  }

  RuleMultiplicationOperator(children: RuleMultiplicationOperatorCstChildren, param?: any) {
    return new MultiplicationOperatorAstNode({
      content: extractCstToken(children),
      position: getOrTypeCstNodePosition({ children })
    });
  }

  RuleFnMultiplicationExpr(ctx: RuleFnMultiplicationExprCstChildren) {
    if (ctx.RuleMultiplicationOperator) {
      const operands = ctx.RuleFnAtomicExpr?.map((item) => this.visit(item));

      const position: IPositionRange = {
        start: operands[0].position.start,
        end: operands[1].position.end
      };

      return new MultiplicationExprAstNode({
        content: {
          operators: ctx.RuleMultiplicationOperator.map((item) => this.visit(item)),
          operands
        },
        position
      });
    }
    return this.visit(ctx.RuleFnAtomicExpr);
  }

  RuleFnAtomicExpr(ctx: RuleFnAtomicExprCstChildren) {
    const exprAst = defaultVisit.bind(this)(ctx);
    const position = exprAst.position;
    let sign: AddOperatorAstNode | undefined;

    if (ctx.RuleAddOperator) {
      sign = this.visit(ctx.RuleAddOperator);
      position.start = sign.position.start;
      delete exprAst.content.RuleAddOperator;
    }

    return new FnAtomicExprAstNode({
      content: { sign, RuleFnAtomicExpr: exprAst },
      position
    });
  }

  RuleFnParenthesisExpr(ctx: RuleFnParenthesisExprCstChildren) {
    return this.visit(ctx.RuleFnAddExpr);
  }

  RuleNumber(children: RuleNumberCstChildren) {
    return new NumberAstNode({
      content: extractCstToken(children),
      position: getOrTypeCstNodePosition({ children })
    });
  }

  RuleBoolean(children: RuleBooleanCstChildren, param?: any) {
    const position = getOrTypeCstNodePosition({ children });
    return new BooleanAstNode({
      content: extractCstToken(children),
      position
    });
  }

  RuleFnAssignLO(ctx: RuleFnAssignLOCstChildren) {
    if (ctx.RuleFnVariable) {
      return this.visit(ctx.RuleFnVariable);
    }

    const token = ctx.gl_FragColor ?? ctx.gl_Position;
    return new AssignLoAstNode({
      content: token?.[0].image,
      position: getOrTypeCstNodePosition({ children: ctx })
    });
  }

  RuleFnVariable(ctx: RuleFnVariableCstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.Identifier[0]).start,
      end: getTokenPosition(ctx.Identifier[ctx.Identifier.length - 1]).end
    };
    return new FnVariableAstNode({
      content: ctx.Identifier.map((item) => item.image),
      position
    });
  }

  RuleFnReturnStatement(ctx: RuleFnReturnStatementCstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.return[0]).start,
      end: getTokenPosition(ctx.Semicolon[0]).end
    };

    return new FnReturnStatementAstNode({ position, content: defaultVisit.bind(this)(ctx) });
  }

  RuleFnArg(ctx: RuleFnArgCstChildren) {
    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(ctx.RuleVariableType[0]).start,
      end: getTokenPosition(ctx.Identifier[0]).end
    };

    return new FnArgAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        type: {
          isCustom: !!ctx.RuleVariableType[0].children.Identifier,
          text: extractCstToken(ctx.RuleVariableType[0])
        }
      }
    });
  }

  RuleRenderStateDeclaration(ctx: RuleRenderStateDeclarationCstChildren) {
    const properties = ctx.RuleStatePropertyAssign?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(ctx.RuleRenderStateType[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    return new RenderStateDeclarationAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        type: extractCstToken(ctx.RuleRenderStateType[0]),
        properties
      }
    });
  }

  RuleAssignableValue(children: RuleAssignableValueCstChildren, param?: any) {
    if (children.RuleFnAddExpr) {
      return this.visit(children.RuleFnAddExpr);
    }

    const position = getOrTypeCstNodePosition({ children });
    return new AssignableValueAstNode({ position, content: extractCstToken(children) });
  }

  RuleStatePropertyAssign(ctx: RuleStatePropertyAssignCstChildren) {
    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(ctx.RuleStateProperty[0]).start,
      end: getOrTypeCstNodePosition(ctx.RuleAssignableValue[0]).end
    };

    return new StatePropertyAssignAstNode({
      position,
      content: {
        name: extractCstToken(ctx.RuleStateProperty[0]),
        value: this.visit(ctx.RuleAssignableValue)
      }
    });
  }

  RuleFnVariableDeclaration(ctx: RuleFnVariableDeclarationCstChildren) {
    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(ctx.RuleVariableType[0]).start,
      end: getTokenPosition(ctx.Semicolon[0]).end
    };

    return new VariableDeclarationAstNode({
      position,
      content: {
        type: this.visit(ctx.RuleVariableType),
        variable: ctx.Identifier[0].image,
        default: ctx.RuleFnExpression ? this.visit(ctx.RuleFnExpression) : undefined
      }
    });
  }

  RuleStruct(ctx: RuleStructCstChildren) {
    const variables = ctx.RuleDeclaration?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: getTokenPosition(ctx.struct[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    return new StructAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        variables
      }
    });
  }

  RuleVariableType(children: RuleVariableTypeCstChildren, param?: any) {
    const position: IPositionRange = getOrTypeCstNodePosition({ children });
    return new VariableTypeAstNode({
      position,
      content: {
        text: extractCstToken(children),
        isCustom: !!children.Identifier
      }
    });
  }

  RuleDeclaration(ctx: RuleDeclarationCstChildren) {
    const type = this.visit(ctx.RuleVariableType);

    const position: IPositionRange = {
      start: type.position.start,
      end: getTokenPosition(ctx.Identifier[0]).end
    };

    return new DeclarationAstNode({
      position,
      content: {
        type,
        variable: ctx.Identifier[0].image
      }
    });
  }

  SubShaderPassPropertyAssignment(ctx: SubShaderPassPropertyAssignmentCstChildren) {
    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(ctx.RuleShaderPassPropertyType[0]).start,
      end: getTokenPosition(ctx.Semicolon[0]).end
    };

    return new PassPropertyAssignmentAstNode({
      position,
      content: {
        type: extractCstToken(ctx.RuleShaderPassPropertyType[0]),
        value: ctx.Identifier[0].image
      }
    });
  }

  RuleTag(ctx: RuleTagCstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.Tags[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    return new TagAstNode({
      content: ctx.RuleTagAssignment?.map((item) => this.visit(item)),
      position
    });
  }

  RuleTagAssignment(ctx: RuleTagAssignmentCstChildren) {
    const position: IPositionRange = {
      start: getOrTypeCstNodePosition(ctx.RuleTagType[0]).start,
      end: getTokenPosition(ctx.ValueString[0]).end
    };

    return new TagAssignmentAstNode({
      position,
      content: {
        tag: extractCstToken(ctx.RuleTagType[0]),
        value: ctx.ValueString[0].image
      }
    });
  }

  RuleProperty(ctx: RulePropertyCstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.EditorProperties[0]).start,
      end: getTokenPosition(ctx.RCurly[0]).end
    };

    return new PropertyAstNode({
      content: ctx.RulePropertyItem?.map((item) => this.visit(item)),
      position
    });
  }

  RulePropertyItem(ctx: RulePropertyItemCstChildren, param?: any) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.Identifier[0]).start,
      end: getTokenPosition(ctx.Semicolon[0]).end
    };

    return new PropertyItemAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        desc: ctx.ValueString[0].image,
        type: extractCstToken(ctx.RulePropertyItemType[0]),
        default: this.visit(ctx.RulePropertyItemValue)
      }
    });
  }

  RulePropertyItemValue(ctx: RulePropertyItemValueCstChildren) {
    return defaultVisit.bind(this)(ctx);
  }

  TupleFloat4(ctx: TupleFloat4CstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.LBracket[0]).start,
      end: getTokenPosition(ctx.RBracket[0]).end
    };
    return new TupleNumber4AstNode({ position, content: ctx.ValueFloat.map((n) => Number(n)) as any });
  }

  TupleInt4(ctx: TupleInt4CstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.LBracket[0]).start,
      end: getTokenPosition(ctx.RBracket[0]).end
    };

    const astInfo = { position, content: ctx.ValueInt.map((n) => Number(n.image)) };
    return new TupleNumber4AstNode(astInfo as any);
  }

  RuleRange(ctx: RuleRangeCstChildren) {
    const position: IPositionRange = {
      start: getTokenPosition(ctx.Range[0]).start,
      end: getTokenPosition(ctx.RBracket[0]).end
    };
    return new RangeAstNode({ position, content: ctx.ValueInt.map((int) => Number(int.image)) as any });
  }
}
