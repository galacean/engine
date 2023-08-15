import { CstNode } from "chevrotain";
import { ShaderParser } from "./parser/ShaderParser";
import { AstNodeUtils } from "./AstNodeUtils";
import {
  AddExprAstNode,
  AddOperatorAstNode,
  AssignableValueAstNode,
  AstNode,
  BooleanAstNode,
  FnArgAstNode,
  FnAstNode,
  FnAtomicExprAstNode,
  FnBlockStatementAstNode,
  FnBodyAstNode,
  FnCallAstNode,
  FnConditionStatementAstNode,
  FnMacroConditionAstNode,
  FnMacroDefineAstNode,
  // FnMacroIncludeAstNode,
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
  StructAstNode,
  TagAssignmentAstNode,
  TagAstNode,
  TupleNumber4AstNode,
  VariableDeclarationAstNode,
  VariableTypeAstNode,
  ObjectAstNode,
  RenderStatePropertyItemAstNode,
  StencilOperationAstNode,
  CompareFunctionAstNode,
  CullModeAstNode,
  BlendFactorAstNode,
  BlendOperationAstNode,
  DiscardStatementAstNode,
  ConditionExprAstNode,
  FnMacroConditionElifBranchAstNode,
  FnMacroConditionElseBranchAstNode,
  FnMacroUndefineAstNode,
  DeclarationWithoutAssignAstNode,
  ForLoopAstNode,
  ArrayIndexAstNode,
  VariablePropertyAstNode,
  SelfAssignOperatorAstNode,
  SelfAssignAstNode,
  FnAssignExprAstNode,
  FnAssignStatementAstNode,
  PrecisionAstNode,
  ShaderPropertyDeclareAstNode
} from "./ast-node";
import { IPassAstContent, IPosition, IPositionRange, IShaderAstContent, ISubShaderAstContent } from "./ast-node/";
import {
  ICstNodeVisitor,
  _ruleShaderCstChildren,
  _ruleFnMultiplicationExprCstChildren,
  _ruleAddOperatorCstChildren,
  _ruleAssignableValueCstChildren,
  _ruleBooleanCstChildren,
  _ruleFnAddExprCstChildren,
  _ruleFnArgCstChildren,
  _ruleFnAtomicExprCstChildren,
  _ruleFnBlockStatementCstChildren,
  _ruleFnBodyCstChildren,
  _ruleFnCallCstChildren,
  _ruleFnConditionStatementCstChildren,
  _ruleFnCstChildren,
  _ruleFnExpressionCstChildren,
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
  _ruleStructCstChildren,
  _ruleSubShaderCstChildren,
  _ruleTagAssignmentCstChildren,
  _ruleTagCstChildren,
  _ruleTupleFloat4CstChildren,
  _ruleTupleInt4CstChildren,
  _ruleVariableTypeCstChildren,
  _ruleBlendStatePropertyDeclarationCstChildren,
  _ruleBlendPropertyItemCstChildren,
  _ruleBlendStatePropertyCstChildren,
  _ruleDepthSatePropertyDeclarationCstChildren,
  _ruleStencilStatePropertyDeclarationCstChildren,
  _ruleStencilStatePropertyItemCstChildren,
  _ruleDepthStatePropertyItemCstChildren,
  _rulePassPropertyAssignmentCstChildren,
  _ruleBlendStateValueCstChildren,
  _ruleDepthStateValueCstChildren,
  _ruleStencilStateValueCstChildren,
  _ruleStencilOperationCstChildren,
  _ruleCompareFunctionCstChildren,
  _ruleCullModeCstChildren,
  _ruleBlendFactorCstChildren,
  _ruleBlendOperationCstChildren,
  _ruleRasterStatePropertyDeclarationCstChildren,
  _ruleStencilStatePropertyCstChildren,
  _ruleRasterStatePropertyItemCstChildren,
  _ruleRasterStateValueCstChildren,
  _ruleReturnBodyCstChildren,
  _ruleTagAssignableValueCstChildren,
  _ruleDiscardStatementCstChildren,
  _ruleConditionExprCstChildren,
  _ruleMacroConditionElifBranchCstChildren,
  _ruleFnMacroConditionElseBranchCstChildren,
  _ruleFnMacroUndefineCstChildren,
  _ruleDeclarationWithoutAssignCstChildren,
  _ruleFnAssignExprCstChildren,
  _ruleForLoopStatementCstChildren,
  _ruleFnSelfAssignExprCstChildren,
  _ruleArrayIndexCstChildren,
  _ruleFnVariablePropertyCstChildren,
  _ruleFnSelfOperatorCstChildren,
  _ruleFnAssignStatementCstChildren,
  _rulePrecisionPrefixCstChildren,
  _ruleShaderPropertyDeclareCstChildren
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

    return new AstNode<IShaderAstContent>({
      position,
      content: {
        name: ctx.ValueString[0].image.replace(/"(.*)"/, "$1"),
        editorProperties,
        subShader,
        variables: ctx._ruleShaderPropertyDeclare?.map((item) => this.visit(item) as any),
        functions: ctx._ruleFn?.map((item) => this.visit(item)),
        structs: ctx._ruleStruct?.map((item) => this.visit(item)),
        tags: ctx._ruleTag ? (this.visit(ctx._ruleTag) as TagAstNode) : undefined,
        renderStates: ctx._ruleRenderStateDeclaration?.map((item) => this.visit(item))
      }
    });
  }

  _ruleShaderPropertyDeclare(children: _ruleShaderPropertyDeclareCstChildren, param?: any) {
    const declare = this.visit(children._ruleDeclarationWithoutAssign);
    const precision = this.visit(children._rulePrecisionPrefix);
    return new ShaderPropertyDeclareAstNode({ position: declare.position, content: { prefix: precision, declare } });
  }

  _rulePrecisionPrefix(children: _rulePrecisionPrefixCstChildren, param?: any) {
    const position: IPositionRange = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new PrecisionAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleSubShader(ctx: _ruleSubShaderCstChildren, param?: any) {
    const tags = ctx._ruleTag ? (this.visit(ctx._ruleTag) as TagAstNode) : undefined;

    const pass = ctx._ruleShaderPass?.map((item) => this.visit(item));

    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.SubShader[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.RCurly[0]).end
    };

    return new AstNode<ISubShaderAstContent>({
      position,
      content: {
        tags,
        pass,
        variables: ctx._ruleShaderPropertyDeclare?.map((item) => this.visit(item) as any),
        functions: ctx._ruleFn?.map((item) => this.visit(item)),
        structs: ctx._ruleStruct?.map((item) => this.visit(item)),
        renderStates: ctx._ruleRenderStateDeclaration?.map((item) => this.visit(item))
      }
    });
  }

  _ruleShaderPass(ctx: _ruleShaderPassCstChildren) {
    const tags = ctx._ruleTag ? (this.visit(ctx._ruleTag) as TagAstNode) : undefined;
    const properties = ctx._rulePassPropertyAssignment?.map((item) => this.visit(item));
    const structs = ctx._ruleStruct?.map((item) => {
      const ret = this.visit(item);
      return ret;
    });
    const variables: any = ctx._ruleShaderPropertyDeclare?.map((item) => {
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

  _ruleFnMacroUndefine(children: _ruleFnMacroUndefineCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.m_undefine[0]).start,
      end: AstNodeUtils.getTokenPosition(children.Identifier[0]).end
    };
    return new FnMacroUndefineAstNode({ position, content: { variable: children.Identifier[0].image } });
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

  // _ruleFnMacroInclude(children: _ruleFnMacroIncludeCstChildren, param?: any) {
  //   const position: IPositionRange = {
  //     start: AstNodeUtils.getTokenPosition(children.m_include[0]).start,
  //     end: AstNodeUtils.getTokenPosition(children.ValueString[0]).end
  //   };

  //   return new FnMacroIncludeAstNode({
  //     position,
  //     content: {
  //       name: children.ValueString[0].image.replace(/"(.*)"/, "$1")
  //     }
  //   });
  // }

  _ruleFnMacroCondition(children: _ruleFnMacroConditionCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(children._ruleFnMacroConditionDeclare[0]).start,
      end: AstNodeUtils.getTokenPosition(children.m_endif[0]).end
    };

    return new FnMacroConditionAstNode({
      position,
      content: {
        command: AstNodeUtils.extractCstToken(children._ruleFnMacroConditionDeclare[0]),
        condition: this.visit(children._ruleConditionExpr),
        body: this.visit(children._ruleFnBody),
        elifBranch: children._ruleMacroConditionElifBranch
          ? this.visit(children._ruleMacroConditionElifBranch)
          : undefined,
        elseBranch: children._ruleFnMacroConditionElseBranch
          ? this.visit(children._ruleFnMacroConditionElseBranch)
          : undefined
      }
    });
  }

  _ruleMacroConditionElifBranch(children: _ruleMacroConditionElifBranchCstChildren, param?: any) {
    const body = this.visit(children._ruleFnBody);
    const condition = this.visit(children._ruleConditionExpr);
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.m_elif[0]).start,
      end: body.position.end
    };

    return new FnMacroConditionElifBranchAstNode({ position, content: { condition, body } });
  }

  _ruleFnMacroConditionElseBranch(children: _ruleFnMacroConditionElseBranchCstChildren, param?: any) {
    const body = this.visit(children._ruleFnBody);
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.m_else[0]).start,
      end: body.position.end
    };
    return new FnMacroConditionElseBranchAstNode({ position, content: { body } });
  }

  _ruleFnStatement(ctx: _ruleFnStatementCstChildren) {
    return AstNodeUtils.defaultVisit.bind(this)(ctx);
  }

  _ruleDiscardStatement(children: _ruleDiscardStatementCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.discard[0]).start,
      end: AstNodeUtils.getTokenPosition(children.Semicolon[0]).end
    };
    return new DiscardStatementAstNode({ position, content: null });
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

    let end: IPosition = elseIfBranches?.[elseIfBranches?.length - 1]?.position.end;
    const blockEnd = blocks[blocks.length - 1].position.end;

    end = end && end.line > blockEnd.line ? end : blockEnd;

    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.if[0]).start,
      end
    };

    return new FnConditionStatementAstNode({
      position,
      content: {
        relation: this.visit(ctx._ruleConditionExpr),
        body,
        elseBranch,
        elseIfBranches
      }
    });
  }

  _ruleConditionExpr(children: _ruleConditionExprCstChildren, param?: any) {
    const leftExpr = this.visit(children._ruleFnRelationExpr[0]);
    let position: IPositionRange;
    if (children._ruleRelationOperator) {
      const rightExpr = this.visit(children._ruleFnRelationExpr[1]);
      const operator = this.visit(children._ruleRelationOperator);

      position = {
        start: leftExpr.position.start,
        end: rightExpr.position.end
      };
      return new ConditionExprAstNode({ position, content: { leftExpr, rightExpr, operator } });
    }
    position = leftExpr.position;
    return new ConditionExprAstNode({ position, content: { leftExpr } });
  }

  _ruleFnRelationExpr(ctx: _ruleFnRelationExprCstChildren) {
    const operands = ctx._ruleFnAddExpr.map((item) => this.visit(item));
    let position: IPositionRange;
    if (ctx._ruleRelationOperator) {
      position = {
        start: operands[0].position.start,
        end: operands[1].position.end
      };
    } else {
      position = operands[0].position;
    }

    return new RelationExprAstNode({
      position,
      content: {
        operator: ctx._ruleRelationOperator ? this.visit(ctx._ruleRelationOperator) : undefined,
        leftOperand: operands[0],
        rightOperand: operands[1]
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

  _ruleFnAssignStatement(children: _ruleFnAssignStatementCstChildren, param?: any) {
    const content = this.visit(children._ruleFnAssignExpr);
    return new FnAssignStatementAstNode({ position: content.position, content });
  }

  _ruleFnAssignExpr(children: _ruleFnAssignExprCstChildren, param?: any) {
    const assignee = this.visit(children._ruleFnSelfAssignExpr);
    const value = this.visit(children._ruleFnExpression);

    const position: IPositionRange = {
      start: assignee.position.start,
      end: value?.position.end ?? assignee.position.end
    };

    return new FnAssignExprAstNode({
      position,
      content: {
        operator: AstNodeUtils.extractCstToken(children._ruleFnAssignmentOperator?.[0]),
        assignee,
        value
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
      content: { sign, RuleFnAtomicExpr: Object.values(exprAst.content)[0] },
      position
    });
  }

  _ruleFnParenthesisExpr(ctx: _ruleFnParenthesisExprCstChildren) {
    return this.visit(ctx._ruleConditionExpr);
  }

  _ruleForLoopStatement(children: _ruleForLoopStatementCstChildren, param?: any) {
    const init = this.visit(children._ruleFnVariableDeclaration);
    const condition = this.visit(children._ruleConditionExpr);
    const update = this.visit(children._ruleFnAssignExpr);
    const body = this.visit(children._ruleFnBlockStatement);
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.for[0]).start,
      end: body.position.end
    };
    return new ForLoopAstNode({ position, content: { init, condition, update, body } });
  }

  _ruleFnSelfAssignExpr(children: _ruleFnSelfAssignExprCstChildren, param?: any) {
    const variable = this.visit(children._ruleFnVariable);
    const operator = this.visit(children._ruleFnSelfOperator);
    return new SelfAssignAstNode({ position: variable.position, content: { operator, variable } });
  }

  _ruleFnSelfOperator(children: _ruleFnSelfOperatorCstChildren, param?: any) {
    const position: IPositionRange = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new SelfAssignOperatorAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleNumber(children: _ruleNumberCstChildren) {
    const text: string = AstNodeUtils.extractCstToken(children);
    return new NumberAstNode({
      content: { text, value: Number(text) },
      position: AstNodeUtils.getOrTypeCstNodePosition({ children })
    });
  }

  _ruleBoolean(children: _ruleBooleanCstChildren, param?: any) {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    const text: string = AstNodeUtils.extractCstToken(children);
    return new BooleanAstNode({
      content: { text, value: text.toLowerCase() === "true" },
      position
    });
  }

  _ruleFnVariable(ctx: _ruleFnVariableCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.Identifier[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Identifier[ctx.Identifier.length - 1]).end
    };
    const indexes = ctx._ruleArrayIndex?.map((item) => this.visit(item));
    const properties = ctx._ruleFnVariableProperty?.map((item) => this.visit(item));
    return new FnVariableAstNode({
      content: { variable: ctx.Identifier[0].image, indexes, properties },
      position
    });
  }

  _ruleArrayIndex(children: _ruleArrayIndexCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.LSquareBracket[0]).start,
      end: AstNodeUtils.getTokenPosition(children.RSquareBracket[0]).end
    };
    return new ArrayIndexAstNode({
      position,
      content: children.ValueInt ? Number(children.ValueInt[0].image) : children.Identifier[0].image
    });
  }

  _ruleFnVariableProperty(children: _ruleFnVariablePropertyCstChildren, param?: any) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(children.Dot[0]).start,
      end: AstNodeUtils.getTokenPosition(children.Identifier[0]).end
    };
    return new VariablePropertyAstNode({ position, content: children.Identifier[0].image });
  }

  _ruleFnReturnStatement(ctx: _ruleFnReturnStatementCstChildren) {
    const position: IPositionRange = {
      start: AstNodeUtils.getTokenPosition(ctx.return[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Semicolon[0]).end
    };

    return new FnReturnStatementAstNode({ position, content: this.visit(ctx._ruleReturnBody) });
  }

  _ruleReturnBody(children: _ruleReturnBodyCstChildren, param?: any) {
    const ret: ObjectAstNode<any> = AstNodeUtils.defaultVisit.bind(this)(children).content;
    return Object.values(ret)[0];
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

  _ruleBlendPropertyItem(children: _ruleBlendPropertyItemCstChildren, param?: any) {
    const property = AstNodeUtils.extractCstToken(children._ruleBlendStateProperty[0]);
    const index = children.ValueInt?.[0].image;
    const value = this.visit(children._ruleBlendStateValue);
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(children._ruleBlendStateProperty[0]).start,
      end: AstNodeUtils.getOrTypeCstNodePosition(children._ruleBlendStateValue[0]).end
    };
    const ret = new RenderStatePropertyItemAstNode({
      position,
      content: { property, index: index ? Number(index) : undefined, value }
    });
    ret.isVariable = !!children._ruleBlendStateValue[0].children.Identifier;
    return ret;
  }

  _ruleBlendStateValue(children: _ruleBlendStateValueCstChildren, param?: any): AstNode<any> {
    const astNodeObj: Record<string, AstNode> = AstNodeUtils.defaultVisit.bind(this)(children).content;
    return Object.values(astNodeObj)[0];
  }

  _ruleBlendStatePropertyDeclaration(children: _ruleBlendStatePropertyDeclarationCstChildren, param?: any) {
    const position: IPositionRange = {
      start: { line: children.BlendState[0].startLine, offset: children.BlendState[0].startOffset },
      end: { line: children.RCurly[0].endLine, offset: children.RCurly[0].endOffset }
    };

    const variable = children.Identifier?.[0].image;
    const renderStateType = children.BlendState[0].image;
    const properties = children._ruleBlendPropertyItem?.map((item) =>
      this.visit(item)
    ) as RenderStatePropertyItemAstNode[];
    return new RenderStateDeclarationAstNode({ position, content: { variable, renderStateType, properties } });
  }

  _ruleDepthStatePropertyItem(children: _ruleDepthStatePropertyItemCstChildren, param?: any) {
    const property = AstNodeUtils.extractCstToken(children._ruleDepthStateProperty[0]);
    const value = this.visit(children._ruleDepthStateValue);
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(children._ruleDepthStateProperty[0]).start,
      end: AstNodeUtils.getOrTypeCstNodePosition(children._ruleDepthStateValue[0]).end
    };
    const ret = new RenderStatePropertyItemAstNode({
      position,
      content: { property, value }
    });
    ret.isVariable = !!children._ruleDepthStateValue[0].children.Identifier;
    return ret;
  }

  _ruleDepthStateValue(children: _ruleDepthStateValueCstChildren, param?: any): AstNode<any> {
    const astNodeObj: Record<string, AstNode> = AstNodeUtils.defaultVisit.bind(this)(children).content;
    return Object.values(astNodeObj)[0];
  }

  _ruleRasterStateValue(children: _ruleRasterStateValueCstChildren, param?: any) {
    const astNodeObj: Record<string, AstNode> = AstNodeUtils.defaultVisit.bind(this)(children).content;
    return Object.values(astNodeObj)[0];
  }

  _ruleRasterStatePropertyItem(children: _ruleRasterStatePropertyItemCstChildren, param?: any) {
    const property = AstNodeUtils.extractCstToken(children._ruleRasterStateProperty[0]);
    const value = this.visit(children._ruleRasterStateValue);
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(children._ruleRasterStateProperty[0]).start,
      end: AstNodeUtils.getOrTypeCstNodePosition(children._ruleRasterStateValue[0]).end
    };
    const ret = new RenderStatePropertyItemAstNode({ position, content: { property, value } });
    ret.isVariable = !!children._ruleRasterStateValue[0].children.Identifier;
    return ret;
  }

  _ruleRasterStatePropertyDeclaration(children: _ruleRasterStatePropertyDeclarationCstChildren, param?: any) {
    const position: IPositionRange = {
      start: { line: children.RasterState[0].startLine, offset: children.RasterState[0].startOffset },
      end: { line: children.RCurly[0].startLine, offset: children.RCurly[0].startOffset }
    };

    const variable = children.Identifier?.[0].image;
    const renderStateType = children.RasterState[0].image;
    const properties = children._ruleRasterStatePropertyItem?.map((item) =>
      this.visit(item)
    ) as RenderStatePropertyItemAstNode[];
    return new RenderStateDeclarationAstNode({ position, content: { variable, renderStateType, properties } });
  }

  _ruleDepthSatePropertyDeclaration(children: _ruleDepthSatePropertyDeclarationCstChildren, param?: any) {
    const position: IPositionRange = {
      start: { line: children.DepthState[0].startLine, offset: children.DepthState[0].startOffset },
      end: { line: children.RCurly[0].startLine, offset: children.RCurly[0].startOffset }
    };

    const variable = children.Identifier?.[0].image;
    const renderStateType = children.DepthState[0].image;
    const properties = children._ruleDepthStatePropertyItem?.map((item) =>
      this.visit(item)
    ) as RenderStatePropertyItemAstNode[];
    return new RenderStateDeclarationAstNode({ position, content: { variable, renderStateType, properties } });
  }

  _ruleStencilStatePropertyItem(children: _ruleStencilStatePropertyItemCstChildren, param?: any) {
    const property = AstNodeUtils.extractCstToken(children._ruleStencilStateProperty[0]);
    const value = this.visit(children._ruleStencilStateValue);
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(children._ruleStencilStateProperty[0]).start,
      end: AstNodeUtils.getOrTypeCstNodePosition(children._ruleStencilStateValue[0]).end
    };
    const ret = new RenderStatePropertyItemAstNode({
      position,
      content: { property, value }
    });
    ret.isVariable = !!children._ruleStencilStateValue[0].children.Identifier;
    return ret;
  }

  _ruleStencilStateValue(children: _ruleStencilStateValueCstChildren, param?: any): AstNode<any> {
    const astNodeObj: Record<string, AstNode> = AstNodeUtils.defaultVisit.bind(this)(children).content;
    return Object.values(astNodeObj)[0];
  }

  _ruleCompareFunction(children: _ruleCompareFunctionCstChildren, param?: any) {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new CompareFunctionAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleCullMode(children: _ruleCullModeCstChildren, param?: any) {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new CullModeAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleBlendFactor(children: _ruleBlendFactorCstChildren, param?: any): AstNode<any> {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new BlendFactorAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleBlendOperation(children: _ruleBlendOperationCstChildren, param?: any): AstNode<any> {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new BlendOperationAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleStencilOperation(children: _ruleStencilOperationCstChildren, param?: any): AstNode<any> {
    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new StencilOperationAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
  }

  _ruleStencilStatePropertyDeclaration(children: _ruleStencilStatePropertyDeclarationCstChildren, param?: any) {
    const position: IPositionRange = {
      start: { line: children.StencilState[0].startLine, offset: children.StencilState[0].startOffset },
      end: { line: children.RCurly[0].startLine, offset: children.RCurly[0].startOffset }
    };

    const variable = children.Identifier?.[0].image;
    const renderStateType = children.StencilState[0].image;
    const properties = children._ruleStencilStatePropertyItem?.map((item) =>
      this.visit(item)
    ) as RenderStatePropertyItemAstNode[];
    return new RenderStateDeclarationAstNode({ position, content: { variable, renderStateType, properties } });
  }

  _ruleRenderStateDeclaration(ctx: _ruleRenderStateDeclarationCstChildren) {
    const ret: ObjectAstNode<RenderStateDeclarationAstNode> = AstNodeUtils.defaultVisit.bind(this)(ctx);
    return Object.values(ret.content)[0];
  }

  _ruleAssignableValue(children: _ruleAssignableValueCstChildren, param?: any) {
    if (children._ruleFnAddExpr) {
      return this.visit(children._ruleFnAddExpr);
    }
    if (children._ruleBoolean) {
      return this.visit(children._ruleBoolean);
    }

    const position = AstNodeUtils.getOrTypeCstNodePosition({ children });
    return new AssignableValueAstNode({ position, content: AstNodeUtils.extractCstToken(children) });
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
        variable: this.visit(ctx._ruleFnVariable),
        default: ctx._ruleFnExpression ? this.visit(ctx._ruleFnExpression) : undefined
      }
    });
  }

  _ruleStruct(ctx: _ruleStructCstChildren) {
    const variables = ctx._ruleDeclarationWithoutAssign?.map((item) => this.visit(item));

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

  _ruleDeclarationWithoutAssign(ctx: _ruleDeclarationWithoutAssignCstChildren) {
    const type = this.visit(ctx._ruleVariableType);
    const variable = this.visit(ctx._ruleFnVariable);

    const position: IPositionRange = {
      start: type.position.start,
      end: variable.position.end
    };

    return new DeclarationWithoutAssignAstNode({
      position,
      content: {
        type,
        variableNode: variable
      }
    });
  }

  _rulePassPropertyAssignment(ctx: _rulePassPropertyAssignmentCstChildren, param?: any): AstNode<any> {
    const position: IPositionRange = {
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleShaderPassPropertyType[0]).start,
      end: AstNodeUtils.getTokenPosition(ctx.Semicolon[0]).end
    };

    return new PassPropertyAssignmentAstNode({
      position,
      content: {
        type: AstNodeUtils.extractCstToken(ctx._ruleShaderPassPropertyType[0]),
        value: this.visit(ctx._ruleFnVariable)
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
      start: AstNodeUtils.getOrTypeCstNodePosition(ctx.Identifier[0]).start,
      end: AstNodeUtils.getOrTypeCstNodePosition(ctx._ruleTagAssignableValue[0]).end
    };

    return new TagAssignmentAstNode({
      position,
      content: {
        tag: ctx.Identifier[0].image,
        value: this.visit(ctx._ruleTagAssignableValue)
      }
    });
  }

  _ruleTagAssignableValue(children: _ruleTagAssignableValueCstChildren, param?: any): AstNode<any> {
    const astNodeObj: Record<string, AstNode> = AstNodeUtils.defaultVisit.bind(this)(children).content;
    return Object.values(astNodeObj)[0];
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
