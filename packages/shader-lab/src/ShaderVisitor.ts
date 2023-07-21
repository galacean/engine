import { CstNode } from "chevrotain";
import { ShaderParser } from "./parser/ShaderParser";
import { AstNodeUtils } from "./AstNodeUtils";
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
  VariableTypeAstNode,
  ObjectAstNode
} from "./ast-node";
import { IPassAstContent, IPosition, IPositionRange, IShaderAstContent, ISubShaderAstContent } from "./ast-node/";
import {
  ICstNodeVisitor,
  _ruleShaderCstChildren,
  _ruleFnMultiplicationExprCstChildren,
  _ruleAddOperatorCstChildren,
  _ruleAssignableValueCstChildren,
  _ruleBooleanCstChildren,
  _ruleDeclarationCstChildren,
  _ruleFnAddExprCstChildren,
  _ruleFnArgCstChildren,
  _ruleFnAssignLOCstChildren,
  _ruleFnAssignStatementCstChildren,
  _ruleFnAtomicExprCstChildren,
  _ruleFnBlockStatementCstChildren,
  _ruleFnBodyCstChildren,
  _ruleFnCallCstChildren,
  _ruleFnConditionStatementCstChildren,
  _ruleFnCstChildren,
  _ruleFnExpressionCstChildren,
  _ruleFnMacroConditionBranchCstChildren,
  _ruleFnMacroConditionCstChildren,
  _ruleFnMacroCstChildren,
  _ruleFnMacroDefineCstChildren,
  _ruleFnMacroIncludeCstChildren,
  _ruleFnParenthesisExprCstChildren,
  _ruleFnRelationExprCstChildren,
  _ruleFnReturnStatementCstChildren,
  _ruleFnReturnTypeCstChildren,
  _ruleFnStatementCstChildren,
  _ruleFnVariableCstChildren,
  _ruleFnVariableDeclarationCstChildren,
  _ruleMultiplicationOperatorCstChildren,
  _ruleNumberCstChildren,
  _rulePropertyCstChildren,
  _rulePropertyItemCstChildren,
  _rulePropertyItemValueCstChildren,
  _ruleRangeCstChildren,
  _ruleRelationOperatorCstChildren,
  _ruleRenderStateDeclarationCstChildren,
  _ruleShaderPassCstChildren,
  _ruleStatePropertyAssignCstChildren,
  _ruleStructCstChildren,
  _ruleSubShaderCstChildren,
  _ruleSubShaderPassPropertyAssignmentCstChildren,
  _ruleTagAssignmentCstChildren,
  _ruleTagCstChildren,
  _ruleTupleFloat4CstChildren,
  _ruleTupleInt4CstChildren,
  _ruleVariableTypeCstChildren
} from "./types";

export const parser = new ShaderParser();

const ShaderVisitorConstructor = parser.getBaseCstVisitorConstructorWithDefaults<any, AstNode>();

export class ShaderVisitor extends ShaderVisitorConstructor implements Partial<ICstNodeVisitor<any, AstNode>> {
  constructor() {
    super();
    this.validateVisitor();
  }

  _ruleShader(ctx: _ruleShaderCstChildren, param?: any) {
    const editorProperties = ctx._ruleProperty ? this.visit(ctx._ruleProperty) : undefined;

    const subShader = ctx._ruleSubShader?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.Shader[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
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

  _ruleSubShader(ctx: _ruleSubShaderCstChildren, param?: any) {
    const tags = ctx._ruleTag ? (this.visit(ctx._ruleTag) as TagAstNode) : undefined;

    const pass = ctx._ruleShaderPass?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.SubShader[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    const content = {
      tags,
      pass
    };

    return new AstNode<ISubShaderAstContent>({ position, content });
  }

  _ruleShaderPass(ctx: _ruleShaderPassCstChildren) {
    const tags = ctx._ruleTag ? (this.visit(ctx._ruleTag) as TagAstNode) : undefined;
    const properties = ctx._ruleSubShaderPassPropertyAssignment?.map((item) => this.visit(item));
    const structs = ctx._ruleStruct?.map((item) => {
      const ret = this.visit(item);
      return ret;
    });
    const variables: any = ctx._ruleFnVariableDeclaration?.map((item) => {
      const ret = this.visit(item);
      return ret;
    });
    const renderStates = ctx._ruleRenderStateDeclaration?.map((item) => this.visit(item));
    const functions = ctx._ruleFn?.map((item) => {
      const ret = this.visit(item);
      return ret;
    });

    const defines = ctx._ruleFnMacroDefine?.map((item) => this.visit(item));

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
      start: AstNodeUtils.getTokenPosition(ctx.Pass[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    return new AstNode<IPassAstContent>({ content, position });
  }

  _ruleFnReturnType(children: _ruleFnReturnTypeCstChildren, param?: any) {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new ReturnTypeAstNode({
      position,
      content: {
        text: AstNodeUtils.extractCstToken(children),
        isCustom: !!children._ruleVariableType?.[0].children.Identifier
      }
    });
  }

  _ruleFn(ctx: _ruleFnCstChildren) {
    const args = ctx._ruleFnArg?.map((item) => this.visit(item));
    const body = this.visit(ctx._ruleFnBody);

    const returnType = this.visit(ctx._ruleFnReturnType);
    const position: IPositionRange = {
      start: returnType.position.start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
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

  _ruleFnBody(ctx: _ruleFnBodyCstChildren) {
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

    const statements = ctx._ruleFnStatement?.map(iterate);
    const macros = ctx._ruleFnMacro?.map(iterate);

    return new FnBodyAstNode({
      content: { statements, macros },
      position: { start, end }
    });
  }

  _ruleFnMacro(children: _ruleFnMacroCstChildren, param?: any) {
    return AstNodeUtils.defaultVisit.bind(this)(children);
  }

  _ruleFnMacroDefine(children: _ruleFnMacroDefineCstChildren, param?: any) {
    const value = children._ruleAssignableValue ? this.visit(children._ruleAssignableValue) : undefined;

    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.m_define[0]).start,
      end: value ? value.position.end : AstNodeUtils.getTokenPosition(children.Identifier[0]).end
    };

    return new FnMacroDefineAstNode({
      position,
      content: {
        variable: children.Identifier[0].image,
        value
      }
    });
  }

  _ruleFnMacroInclude(children: _ruleFnMacroIncludeCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.m_include[0]).start,
      end: AstNodeUtils.getTokenPosition(children.ValueString[0]).end
    };

    return new FnMacroIncludeAstNode({
      position,
      content: {
        name: children.ValueString[0].image.replace(/"(.*)"/, "$1")
      }
    });
  }

  _ruleFnMacroCondition(children: _ruleFnMacroConditionCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(children._ruleFnMacroConditionDeclare[0]).start,
      end: AstNodeUtils.getTokenPosition(children.m_endif[0]).end
    };

    const branch = children._ruleFnMacroConditionBranch && this.visit(children._ruleFnMacroConditionBranch);

    return new FnMacroConditionAstNode({
      position,
      content: {
        command: AstNodeUtils.extractCstToken(children._ruleFnMacroConditionDeclare[0]),
        identifier: children.Identifier[0].image,
        body: this.visit(children._ruleFnBody),
        branch
      }
    });
  }

  _ruleFnMacroConditionBranch(children: _ruleFnMacroConditionBranchCstChildren, param?: any) {
    const body = this.visit(children._ruleFnBody);

    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(children._ruleFnMacroConditionBranchDeclare[0]).start,
      end: body.position.end
    };

    return new FnMacroConditionBranchAstNode({
      position,
      content: {
        declare: AstNodeUtils.extractCstToken(children._ruleFnMacroConditionBranchDeclare[0]),
        body
      }
    });
  }

  _ruleFnStatement(ctx: _ruleFnStatementCstChildren) {
    return AstNodeUtils.defaultVisit.bind(this)(ctx);
  }

  _ruleFnCall(ctx: _ruleFnCallCstChildren) {
    const isCustom = !!ctx._ruleFnCallVariable[0].children.Identifier;
    const args = ctx._ruleAssignableValue?.map((item) => {
      return this.visit(item);
    });

    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleFnCallVariable[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RBracket[0]).end
    };

    const content = {
      function: AstNodeUtils.extractCstToken(ctx._ruleFnCallVariable[0]),
      args,
      isCustom
    };

    return new FnCallAstNode({ position, content });
  }

  _ruleFnConditionStatement(ctx: _ruleFnConditionStatementCstChildren) {
    const blocks = ctx._ruleFnBlockStatement
      .map((item) => this.visit(item))
      .sort((a, b) => a.position.start.line - b.position.start.line);
    const [body, elseBranch] = blocks;
    const elseIfBranches = ctx._ruleFnConditionStatement
      ?.map((item) => this.visit(item))
      .sort((a, b) => a.position.start.line - b.position.start.line);

    let end: IPosition = elseIfBranches[elseIfBranches.length - 1]?.position.end;
    const blockEnd = blocks[blocks.length - 1].position.end;

    end = end && end.line > blockEnd.line ? end : blockEnd;

    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.if[0]).start,
      end
    };

    return new FnConditionStatementAstNode({
      position,
      content: {
        relation: this.visit(ctx._ruleFnRelationExpr),
        body,
        elseBranch,
        elseIfBranches
      }
    });
  }

  _ruleFnRelationExpr(ctx: _ruleFnRelationExprCstChildren) {
    const operands = ctx._ruleFnAddExpr.map((item) => this.visit(item));
    const position: IPositionRange = {
      start: operands[0].position.start,
      end: operands[1].position.end
    };

    return new RelationExprAstNode({
      position,
      content: {
        operator: this.visit(ctx._ruleRelationOperator),
        operands
      }
    });
  }

  _ruleRelationOperator(children: _ruleRelationOperatorCstChildren, param?: any) {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new RelationOperatorAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleFnBlockStatement(ctx: _ruleFnBlockStatementCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.LCurly[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    return new FnBlockStatementAstNode({ position, content: this.visit(ctx._ruleFnBody) });
  }

  _ruleFnAssignStatement(ctx: _ruleFnAssignStatementCstChildren) {
    const assignee = this.visit(ctx._ruleFnAssignLO);

    const position: IPositionRange = {
      start: assignee.position.start,
      end: AstNodeUtils.getTokenPosition(ctx.Semicolon[0]).end
    };

    return new FnAssignStatementAstNode({
      position,
      content: {
        operator: AstNodeUtils.extractCstToken(ctx._ruleFnAssignmentOperator[0]),
        assignee,
        value: this.visit(ctx._ruleFnExpression)
      }
    });
  }

  _ruleFnExpression(ctx: _ruleFnExpressionCstChildren) {
    return this.visit(ctx._ruleFnAddExpr);
  }

  _ruleAddOperator(children: _ruleAddOperatorCstChildren, param?: any) {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new AddOperatorAstNode({
      content: AstNodeUtils.extractCstToken(children),
      position
    });
  }

  _ruleFnAddExpr(ctx: _ruleFnAddExprCstChildren) {
    if (ctx._ruleAddOperator) {
      const operands = ctx._ruleFnMultiplicationExpr?.map((item) => this.visit(item));

      const position: IPositionRange = {
        start: operands[0].position.start,
        end: operands[1].position.end
      };

      return new AddExprAstNode({
        content: {
          operators: ctx._ruleAddOperator.map((item) => this.visit(item)),
          operands
        },
        position
      });
    }

    return this.visit(ctx._ruleFnMultiplicationExpr);
  }

  _ruleMultiplicationOperator(children: _ruleMultiplicationOperatorCstChildren, param?: any) {
    return new MultiplicationOperatorAstNode({
      content: AstNodeUtils.extractCstToken(children),
      position: AstNodeUtils.getOrTypeCstNodePosition({ children })
    });
  }

  _ruleFnMultiplicationExpr(ctx: _ruleFnMultiplicationExprCstChildren) {
    if (ctx._ruleMultiplicationOperator) {
      const operands = ctx._ruleFnAtomicExpr?.map((item) => this.visit(item));

      const position: IPositionRange = {
        start: operands[0].position.start,
        end: operands[1].position.end
      };

      return new MultiplicationExprAstNode({
        content: {
          operators: ctx._ruleMultiplicationOperator.map((item) => this.visit(item)),
          operands
        },
        position
      });
    }
    return this.visit(ctx._ruleFnAtomicExpr);
  }

  _ruleFnAtomicExpr(ctx: _ruleFnAtomicExprCstChildren) {
    const exprAst: ObjectAstNode<any> = AstNodeUtils.defaultVisit.bind(this)(ctx);
    const position = exprAst.position;
    let sign: AddOperatorAstNode | undefined;

    if (ctx._ruleAddOperator) {
      sign = this.visit(ctx._ruleAddOperator);
      position.start = sign.position.start;
      delete exprAst.content._ruleAddOperator;
    }

    return new FnAtomicExprAstNode({
      content: { sign, RuleFnAtomicExpr: exprAst },
      position
    });
  }

  _ruleFnParenthesisExpr(ctx: _ruleFnParenthesisExprCstChildren) {
    return this.visit(ctx._ruleFnAddExpr);
  }

  _ruleNumber(children: _ruleNumberCstChildren) {
    return new NumberAstNode({
      content: AstNodeUtils.extractCstToken(children),
      position: AstNodeUtils.getOrTypeCstNodePosition({ children })
    });
  }

  _ruleBoolean(children: _ruleBooleanCstChildren, param?: any) {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new BooleanAstNode({
      content: AstNodeUtils.extractCstToken(children),
      position
    });
  }

  _ruleFnAssignLO(ctx: _ruleFnAssignLOCstChildren) {
    if (ctx._ruleFnVariable) {
      return this.visit(ctx._ruleFnVariable);
    }

    const token = ctx.gl_FragColor ?? ctx.gl_Position;
    return new AssignLoAstNode({
      content: token?.[0].image,
      position: AstNodeUtils.getOrTypeCstNodePosition({ children: ctx })
    });
  }

  _ruleFnVariable(ctx: _ruleFnVariableCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.Identifier[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Identifier[ctx.Identifier.length - 1]).end
    };
    return new FnVariableAstNode({
      content: ctx.Identifier.map((item) => item.image),
      position
    });
  }

  _ruleFnReturnStatement(ctx: _ruleFnReturnStatementCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.return[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Semicolon[0]).end
    };

    return new FnReturnStatementAstNode({ position, content: AstNodeUtils.defaultVisit.bind(this)(ctx) });
  }

  _ruleFnArg(ctx: _ruleFnArgCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleVariableType[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Identifier[0]).end
    };

    return new FnArgAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        type: {
          isCustom: !!ctx._ruleVariableType[0].children.Identifier,
          text: AstNodeUtils.extractCstToken(ctx._ruleVariableType[0])
        }
      }
    });
  }

  _ruleRenderStateDeclaration(ctx: _ruleRenderStateDeclarationCstChildren) {
    const properties = ctx._ruleStatePropertyAssign?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleRenderStateType[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    return new RenderStateDeclarationAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        type: AstNodeUtils.extractCstToken(ctx._ruleRenderStateType[0]),
        properties
      }
    });
  }

  _ruleAssignableValue(children: _ruleAssignableValueCstChildren, param?: any) {
    if (children._ruleFnAddExpr) {
      return this.visit(children._ruleFnAddExpr);
    }

    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new AssignableValueAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleStatePropertyAssign(ctx: _ruleStatePropertyAssignCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleStateProperty[0]).start,
      end: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleAssignableValue[0]).end
    };

    return new StatePropertyAssignAstNode({
      position,
      content: {
        name: AstNodeUtils.extractCstToken(ctx._ruleStateProperty[0]),
        value: this.visit(ctx._ruleAssignableValue)
      }
    });
  }

  _ruleFnVariableDeclaration(ctx: _ruleFnVariableDeclarationCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleVariableType[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Semicolon[0]).end
    };

    return new VariableDeclarationAstNode({
      position,
      content: {
        type: this.visit(ctx._ruleVariableType),
        variable: ctx.Identifier[0].image,
        default: ctx._ruleFnExpression ? this.visit(ctx._ruleFnExpression) : undefined
      }
    });
  }

  _ruleStruct(ctx: _ruleStructCstChildren) {
    const variables = ctx._ruleDeclaration?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.struct[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    return new StructAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        variables
      }
    });
  }

  _ruleVariableType(children: _ruleVariableTypeCstChildren, param?: any) {
    const position: IPositionRange = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new VariableTypeAstNode({
      position,
      content: {
        text: AstNodeUtils.extractCstToken(children),
        isCustom: !!children.Identifier
      }
    });
  }

  _ruleDeclaration(ctx: _ruleDeclarationCstChildren) {
    const type = this.visit(ctx._ruleVariableType);

    const position: IPositionRange = {
      start: type.position.start,
      end: AstNodeUtils.getTokenPosition(ctx.Identifier[0]).end
    };

    return new DeclarationAstNode({
      position,
      content: {
        type,
        variable: ctx.Identifier[0].image
      }
    });
  }

  _ruleSubShaderPassPropertyAssignment(ctx: _ruleSubShaderPassPropertyAssignmentCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleShaderPassPropertyType[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Semicolon[0]).end
    };

    return new PassPropertyAssignmentAstNode({
      position,
      content: {
        type: AstNodeUtils.extractCstToken(ctx._ruleShaderPassPropertyType[0]),
        value: ctx.Identifier[0].image
      }
    });
  }

  _ruleTag(ctx: _ruleTagCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.Tags[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    return new TagAstNode({
      content: ctx._ruleTagAssignment?.map((item) => this.visit(item)),
      position
    });
  }

  _ruleTagAssignment(ctx: _ruleTagAssignmentCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleTagType[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.ValueString[0]).end
    };

    return new TagAssignmentAstNode({
      position,
      content: {
        tag: AstNodeUtils.extractCstToken(ctx._ruleTagType[0]),
        value: ctx.ValueString[0].image
      }
    });
  }

  _ruleProperty(ctx: _rulePropertyCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.EditorProperties[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    return new PropertyAstNode({
      content: ctx._rulePropertyItem?.map((item) => this.visit(item)),
      position
    });
  }

  _rulePropertyItem(ctx: _rulePropertyItemCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.Identifier[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Semicolon[0]).end
    };

    return new PropertyItemAstNode({
      position,
      content: {
        name: ctx.Identifier[0].image,
        desc: ctx.ValueString[0].image,
        type: AstNodeUtils.extractCstToken(ctx._rulePropertyItemType[0]),
        default: this.visit(ctx._rulePropertyItemValue)
      }
    });
  }

  _rulePropertyItemValue(ctx: _rulePropertyItemValueCstChildren) {
    return AstNodeUtils.defaultVisit.bind(this)(ctx);
  }

  _ruleTupleFloat4(ctx: _ruleTupleFloat4CstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.LBracket[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RBracket[0]).end
    };
    return new TupleNumber4AstNode({ position, content: ctx.ValueFloat.map((n) => Number(n)) as any });
  }

  _ruleTupleInt4(ctx: _ruleTupleInt4CstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.LBracket[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RBracket[0]).end
    };

    const astInfo = { position, content: ctx.ValueInt.map((n) => Number(n.image)) };
    return new TupleNumber4AstNode(astInfo as any);
  }

  _ruleRange(ctx: _ruleRangeCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.Range[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RBracket[0]).end
    };
    return new RangeAstNode({ position, content: ctx.ValueInt.map((int) => Number(int.image)) as any });
  }
}
