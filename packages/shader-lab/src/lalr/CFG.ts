// Context Free Grammar of Galacean ShaderLab

import { Grammar } from "../parser/Grammar";
import { NoneTerminal, GrammarSymbol } from "../parser/GrammarSymbol";
import GrammarUtils from "./Utils";
import { EKeyword, ETokenType } from "../common";
import SematicAnalyzer, { TranslationRule } from "../parser/SemanticAnalyzer";
import { ASTNode } from "../parser/AST";

const productionAndRules: [GrammarSymbol[], TranslationRule | undefined][] = [
  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.gs_shader_program,
    [[NoneTerminal.global_declaration], [NoneTerminal.gs_shader_program, NoneTerminal.global_declaration]],
    ASTNode.GLShaderProgram.pool
  ),

  ...GrammarUtils.createProductionWithOptions(NoneTerminal.global_declaration, [
    [NoneTerminal.precision_specifier],
    [NoneTerminal.variable_declaration_statement],
    [NoneTerminal.struct_specifier],
    [NoneTerminal.function_definition]
  ]),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.variable_declaration,
    [
      [NoneTerminal.fully_specified_type, ETokenType.ID],
      [NoneTerminal.fully_specified_type, ETokenType.ID, NoneTerminal.array_specifier]
    ],
    ASTNode.VariableDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.variable_declaration_list,
    [
      [NoneTerminal.variable_declaration],
      [NoneTerminal.variable_declaration_list, ETokenType.COMMA, ETokenType.ID],
      [NoneTerminal.variable_declaration_list, ETokenType.COMMA, ETokenType.ID, NoneTerminal.array_specifier]
    ],
    ASTNode.VariableDeclarationList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(NoneTerminal.variable_declaration_statement, [
    [NoneTerminal.variable_declaration_list, ETokenType.SEMICOLON]
  ]),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.ext_builtin_type_specifier_nonarray,
    [
      [EKeyword.VOID],
      [EKeyword.FLOAT],
      [EKeyword.BOOL],
      [EKeyword.INT],
      [EKeyword.UINT],
      [EKeyword.VEC2],
      [EKeyword.VEC3],
      [EKeyword.VEC4],
      [EKeyword.BVEC2],
      [EKeyword.BVEC3],
      [EKeyword.BVEC4],
      [EKeyword.IVEC2],
      [EKeyword.IVEC3],
      [EKeyword.IVEC4],
      [EKeyword.UVEC2],
      [EKeyword.UVEC3],
      [EKeyword.UVEC4],
      [EKeyword.MAT2],
      [EKeyword.MAT3],
      [EKeyword.MAT4],
      [EKeyword.MAT2X3],
      [EKeyword.MAT2X4],
      [EKeyword.MAT3X2],
      [EKeyword.MAT3X4],
      [EKeyword.MAT4X2],
      [EKeyword.MAT4X3],
      [EKeyword.SAMPLER2D],
      [EKeyword.SAMPLER3D],
      [EKeyword.SAMPLER_CUBE],
      [EKeyword.SAMPLER2D_SHADOW],
      [EKeyword.SAMPLER_CUBE_SHADOW],
      [EKeyword.SAMPLER2D_ARRAY],
      [EKeyword.SAMPLER2D_ARRAY_SHADOW],
      [EKeyword.I_SAMPLER2D],
      [EKeyword.I_SAMPLER3D],
      [EKeyword.I_SAMPLER_CUBE],
      [EKeyword.I_SAMPLER2D_ARRAY],
      [EKeyword.U_SAMPLER2D],
      [EKeyword.U_SAMPLER3D],
      [EKeyword.U_SAMPLER_CUBE],
      [EKeyword.U_SAMPLER2D_ARRAY]
    ],
    ASTNode.ExtBuiltinTypeSpecifierNonArray.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.type_specifier_nonarray,
    [[ETokenType.ID], [NoneTerminal.ext_builtin_type_specifier_nonarray]],
    ASTNode.TypeSpecifierNonArray.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.fully_specified_type,
    [[NoneTerminal.type_specifier], [NoneTerminal.type_qualifier, NoneTerminal.type_specifier]],
    ASTNode.FullySpecifiedType.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.type_specifier,
    [
      [NoneTerminal.type_specifier_nonarray],
      [NoneTerminal.ext_builtin_type_specifier_nonarray, NoneTerminal.array_specifier]
    ],
    ASTNode.TypeSpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.type_qualifier,
    [[NoneTerminal.single_type_qualifier], [NoneTerminal.type_qualifier, NoneTerminal.single_type_qualifier]],
    ASTNode.TypeQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.single_type_qualifier,
    [
      [NoneTerminal.storage_qualifier],
      [NoneTerminal.precision_qualifier],
      [NoneTerminal.interpolation_qualifier],
      [NoneTerminal.invariant_qualifier],
      [EKeyword.PRECISE]
    ],
    ASTNode.SingleTypeQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.storage_qualifier,
    [[EKeyword.CONST], [EKeyword.IN], [EKeyword.INOUT], [EKeyword.OUT], [EKeyword.CENTROID]],
    // #if _VERBOSE
    ASTNode.StorageQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.interpolation_qualifier,
    [[EKeyword.SMOOTH], [EKeyword.FLAT]],
    // #if _VERBOSE
    ASTNode.InterpolationQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.invariant_qualifier,
    [[EKeyword.INVARIANT]],
    // #if _VERBOSE
    ASTNode.InvariantQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.precision_qualifier,
    [[EKeyword.HIGHP], [EKeyword.MEDIUMP], [EKeyword.LOWP]],
    // #if _VERBOSE
    ASTNode.PrecisionQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.struct_specifier,
    [
      [
        EKeyword.STRUCT,
        ETokenType.ID,
        ETokenType.LEFT_BRACE,
        NoneTerminal.struct_declaration_list,
        ETokenType.RIGHT_BRACE,
        ETokenType.SEMICOLON
      ],
      [
        EKeyword.STRUCT,
        ETokenType.LEFT_BRACE,
        NoneTerminal.struct_declaration_list,
        ETokenType.RIGHT_BRACE,
        ETokenType.SEMICOLON
      ]
    ],
    ASTNode.StructSpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.struct_declaration_list,
    [[NoneTerminal.struct_declaration], [NoneTerminal.struct_declaration_list, NoneTerminal.struct_declaration]],
    ASTNode.StructDeclarationList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.struct_declaration,
    [
      [NoneTerminal.type_specifier, NoneTerminal.struct_declarator_list, ETokenType.SEMICOLON],
      [
        NoneTerminal.type_qualifier,
        NoneTerminal.type_specifier,
        NoneTerminal.struct_declarator_list,
        ETokenType.SEMICOLON
      ],
      [NoneTerminal.layout_qualifier, NoneTerminal.type_specifier, NoneTerminal.struct_declarator, ETokenType.SEMICOLON]
    ],
    ASTNode.StructDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.layout_qualifier,
    [
      [
        EKeyword.LAYOUT,
        ETokenType.LEFT_PAREN,
        EKeyword.LOCATION,
        ETokenType.EQUAL,
        ETokenType.INT_CONSTANT,
        ETokenType.RIGHT_PAREN
      ]
    ],
    ASTNode.LayoutQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.struct_declarator_list,
    [
      [NoneTerminal.struct_declarator],
      [NoneTerminal.struct_declarator_list, ETokenType.COMMA, NoneTerminal.struct_declarator]
    ],
    ASTNode.StructDeclaratorList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.struct_declarator,
    [[ETokenType.ID], [ETokenType.ID, NoneTerminal.array_specifier]],
    ASTNode.StructDeclarator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.array_specifier,
    [
      [ETokenType.LEFT_BRACKET, ETokenType.RIGHT_BRACKET],
      [ETokenType.LEFT_BRACKET, NoneTerminal.integer_constant_expression, ETokenType.RIGHT_BRACKET]
    ],
    ASTNode.ArraySpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.integer_constant_expression_operator,
    [[ETokenType.PLUS], [ETokenType.DASH], [ETokenType.STAR], [ETokenType.SLASH], [ETokenType.PERCENT]],
    ASTNode.IntegerConstantExpressionOperator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.integer_constant_expression,
    [
      [NoneTerminal.variable_identifier],
      [ETokenType.INT_CONSTANT],
      [
        NoneTerminal.integer_constant_expression,
        NoneTerminal.integer_constant_expression_operator,
        ETokenType.INT_CONSTANT
      ],
      [
        NoneTerminal.integer_constant_expression,
        NoneTerminal.integer_constant_expression_operator,
        NoneTerminal.variable_identifier
      ]
    ],
    ASTNode.IntegerConstantExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.conditional_expression,
    [
      [NoneTerminal.logical_or_expression],
      [
        NoneTerminal.logical_or_expression,
        ETokenType.QUESTION,
        NoneTerminal.expression,
        ETokenType.COLON,
        NoneTerminal.assignment_expression
      ]
    ],
    // #if _VERBOSE
    ASTNode.ConditionalExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.logical_or_expression,
    [
      [NoneTerminal.logical_xor_expression],
      [NoneTerminal.logical_or_expression, ETokenType.OR_OP, NoneTerminal.logical_xor_expression]
    ],
    // #if _VERBOSE
    ASTNode.LogicalOrExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.logical_xor_expression,
    [
      [NoneTerminal.logical_and_expression],
      [NoneTerminal.logical_xor_expression, ETokenType.XOR_OP, NoneTerminal.logical_and_expression]
    ],
    // #if _VERBOSE
    ASTNode.LogicalXorExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.logical_and_expression,
    [
      [NoneTerminal.inclusive_or_expression],
      [NoneTerminal.logical_and_expression, ETokenType.AND_OP, NoneTerminal.inclusive_or_expression]
    ],
    // #if _VERBOSE
    ASTNode.LogicalAndExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.inclusive_or_expression,
    [
      [NoneTerminal.exclusive_or_expression],
      [NoneTerminal.inclusive_or_expression, ETokenType.VERTICAL_BAR, NoneTerminal.exclusive_or_expression]
    ],
    // #if _VERBOSE
    ASTNode.InclusiveOrExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.exclusive_or_expression,
    [
      [NoneTerminal.and_expression],
      [NoneTerminal.exclusive_or_expression, ETokenType.CARET, NoneTerminal.and_expression]
    ],
    // #if _VERBOSE
    ASTNode.ExclusiveOrExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.and_expression,
    [
      [NoneTerminal.equality_expression],
      [NoneTerminal.and_expression, ETokenType.AMPERSAND, NoneTerminal.equality_expression]
    ],
    // #if _VERBOSE
    ASTNode.AndExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.equality_expression,
    [
      [NoneTerminal.relational_expression],
      [NoneTerminal.equality_expression, ETokenType.EQ_OP, NoneTerminal.relational_expression],
      [NoneTerminal.equality_expression, ETokenType.NE_OP, NoneTerminal.relational_expression]
    ],
    // #if _VERBOSE
    ASTNode.EqualityExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.relational_expression,
    [
      [NoneTerminal.shift_expression],
      [NoneTerminal.relational_expression, ETokenType.LEFT_ANGLE, NoneTerminal.shift_expression],
      [NoneTerminal.relational_expression, ETokenType.RIGHT_ANGLE, NoneTerminal.shift_expression],
      [NoneTerminal.relational_expression, ETokenType.LE_OP, NoneTerminal.shift_expression],
      [NoneTerminal.relational_expression, ETokenType.GE_OP, NoneTerminal.shift_expression]
    ],
    // #if _VERBOSE
    ASTNode.RelationalExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.shift_expression,
    [
      [NoneTerminal.additive_expression],
      [NoneTerminal.shift_expression, ETokenType.LEFT_OP, NoneTerminal.additive_expression],
      [NoneTerminal.shift_expression, ETokenType.RIGHT_OP, NoneTerminal.additive_expression]
    ],
    // #if _VERBOSE
    ASTNode.ShiftExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.additive_expression,
    [
      [NoneTerminal.multiplicative_expression],
      [NoneTerminal.additive_expression, ETokenType.PLUS, NoneTerminal.multiplicative_expression],
      [NoneTerminal.additive_expression, ETokenType.DASH, NoneTerminal.multiplicative_expression]
    ],
    // #if _VERBOSE
    ASTNode.AdditiveExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.multiplicative_expression,
    [
      [NoneTerminal.unary_expression],
      [NoneTerminal.multiplicative_expression, ETokenType.STAR, NoneTerminal.unary_expression],
      [NoneTerminal.multiplicative_expression, ETokenType.SLASH, NoneTerminal.unary_expression],
      [NoneTerminal.multiplicative_expression, ETokenType.PERCENT, NoneTerminal.unary_expression]
    ],
    // #if _VERBOSE
    ASTNode.MultiplicativeExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.unary_expression,
    [
      [NoneTerminal.postfix_expression],
      [ETokenType.INC_OP, NoneTerminal.unary_expression],
      [ETokenType.DEC_OP, NoneTerminal.unary_expression],
      [NoneTerminal.unary_operator, NoneTerminal.unary_expression]
    ],
    // #if _VERBOSE
    ASTNode.UnaryExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.unary_operator,
    [[ETokenType.PLUS], [ETokenType.DASH], [ETokenType.BANG], [ETokenType.TILDE]],
    // #if _VERBOSE
    ASTNode.UnaryOperator.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.postfix_expression,
    [
      [NoneTerminal.primary_expression],
      [NoneTerminal.postfix_expression, ETokenType.LEFT_BRACKET, NoneTerminal.expression, ETokenType.RIGHT_BRACKET],
      [NoneTerminal.function_call],
      [NoneTerminal.postfix_expression, ETokenType.DOT, ETokenType.ID],
      [NoneTerminal.postfix_expression, ETokenType.DOT, NoneTerminal.function_call],
      [NoneTerminal.postfix_expression, ETokenType.INC_OP],
      [NoneTerminal.postfix_expression, ETokenType.DEC_OP]
    ],
    ASTNode.PostfixExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.primary_expression,
    [
      [NoneTerminal.variable_identifier],
      [ETokenType.INT_CONSTANT],
      [ETokenType.FLOAT_CONSTANT],
      [EKeyword.TRUE],
      [EKeyword.FALSE],
      [ETokenType.LEFT_PAREN, NoneTerminal.expression, ETokenType.RIGHT_PAREN]
    ],
    ASTNode.PrimaryExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.expression,
    [
      [NoneTerminal.assignment_expression],
      [NoneTerminal.expression, ETokenType.COMMA, NoneTerminal.assignment_expression]
    ],
    ASTNode.Expression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.assignment_expression,
    [
      [NoneTerminal.conditional_expression],
      [NoneTerminal.unary_expression, NoneTerminal.assignment_operator, NoneTerminal.assignment_expression]
    ],
    ASTNode.AssignmentExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.assignment_operator,
    [
      [ETokenType.EQUAL],
      [ETokenType.MUL_ASSIGN],
      [ETokenType.DIV_ASSIGN],
      [ETokenType.MOD_ASSIGN],
      [ETokenType.ADD_ASSIGN],
      [ETokenType.SUB_ASSIGN],
      [ETokenType.LEFT_ASSIGN],
      [ETokenType.RIGHT_ASSIGN],
      [ETokenType.AND_ASSIGN],
      [ETokenType.XOR_ASSIGN],
      [ETokenType.OR_ASSIGN]
    ],
    // #if _VERBOSE
    ASTNode.AssignmentOperator.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_call,
    [[NoneTerminal.function_call_generic]],
    ASTNode.FunctionCall.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_call_generic,
    [
      [
        NoneTerminal.function_identifier,
        ETokenType.LEFT_PAREN,
        NoneTerminal.function_call_parameter_list,
        ETokenType.RIGHT_PAREN
      ],
      [NoneTerminal.function_identifier, ETokenType.LEFT_PAREN, ETokenType.RIGHT_PAREN],
      [NoneTerminal.function_identifier, EKeyword.VOID, ETokenType.RIGHT_PAREN]
    ],
    ASTNode.FunctionCallGeneric.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_call_parameter_list,
    [
      [NoneTerminal.assignment_expression],
      [NoneTerminal.function_call_parameter_list, ETokenType.COMMA, NoneTerminal.assignment_expression]
    ],
    ASTNode.FunctionCallParameterList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_identifier,
    [[NoneTerminal.type_specifier]],
    ASTNode.FunctionIdentifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_definition,
    [[NoneTerminal.function_prototype, NoneTerminal.compound_statement_no_scope]],
    ASTNode.FunctionDefinition.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_prototype,
    [[NoneTerminal.function_declarator, ETokenType.RIGHT_PAREN]],
    ASTNode.FunctionProtoType.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_declarator,
    [[NoneTerminal.function_header], [NoneTerminal.function_header, NoneTerminal.function_parameter_list]],
    ASTNode.FunctionDeclarator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_header,
    [[NoneTerminal.fully_specified_type, ETokenType.ID, ETokenType.LEFT_PAREN]],
    ASTNode.FunctionHeader.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_parameter_list,
    [
      [NoneTerminal.parameter_declaration],
      [NoneTerminal.function_parameter_list, ETokenType.COMMA, NoneTerminal.parameter_declaration]
    ],
    ASTNode.FunctionParameterList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.parameter_declaration,
    [[NoneTerminal.type_qualifier, NoneTerminal.parameter_declarator], [NoneTerminal.parameter_declarator]],
    ASTNode.ParameterDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.parameter_declarator,
    [
      [NoneTerminal.type_specifier, ETokenType.ID],
      [NoneTerminal.type_specifier, ETokenType.ID, NoneTerminal.array_specifier]
    ],
    ASTNode.ParameterDeclarator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.statement_list,
    [[NoneTerminal.statement], [NoneTerminal.statement_list, NoneTerminal.statement]],
    ASTNode.StatementList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.statement,
    [[NoneTerminal.compound_statement], [NoneTerminal.simple_statement]],
    // #if _VERBOSE
    ASTNode.Statement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.compound_statement_no_scope,
    [
      [ETokenType.LEFT_BRACE, ETokenType.RIGHT_BRACE],
      [ETokenType.LEFT_BRACE, NoneTerminal.statement_list, ETokenType.RIGHT_BRACE]
    ],
    ASTNode.CompoundStatementNoScope.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.compound_statement,
    [
      [ETokenType.LEFT_BRACE, ETokenType.RIGHT_BRACE],
      [NoneTerminal.scope_brace, NoneTerminal.statement_list, NoneTerminal.scope_end_brace]
    ],
    // #if _VERBOSE
    ASTNode.CompoundStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.simple_statement,
    [
      [NoneTerminal.declaration],
      [NoneTerminal.expression_statement],
      [NoneTerminal.selection_statement],
      [NoneTerminal.iteration_statement],
      [NoneTerminal.jump_statement]
    ],
    // #if _VERBOSE
    ASTNode.SimpleStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.declaration,
    [
      [NoneTerminal.function_prototype, ETokenType.SEMICOLON],
      [NoneTerminal.init_declarator_list, ETokenType.SEMICOLON],
      [
        EKeyword.PRECISION,
        NoneTerminal.precision_qualifier,
        NoneTerminal.ext_builtin_type_specifier_nonarray,
        ETokenType.SEMICOLON
      ],
      [NoneTerminal.type_qualifier, ETokenType.ID, ETokenType.SEMICOLON],
      [NoneTerminal.type_qualifier, ETokenType.ID, NoneTerminal.identifier_list, ETokenType.SEMICOLON]
    ],
    ASTNode.Declaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.identifier_list,
    [
      [ETokenType.COMMA, ETokenType.ID],
      [NoneTerminal.identifier_list, ETokenType.COMMA, ETokenType.ID]
    ],
    ASTNode.IdentifierList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.init_declarator_list,
    [
      [NoneTerminal.single_declaration],
      [NoneTerminal.init_declarator_list, ETokenType.COMMA, ETokenType.ID],
      [NoneTerminal.init_declarator_list, ETokenType.COMMA, ETokenType.ID, NoneTerminal.array_specifier],
      [
        NoneTerminal.init_declarator_list,
        ETokenType.COMMA,
        ETokenType.ID,
        NoneTerminal.array_specifier,
        ETokenType.EQUAL,
        NoneTerminal.initializer
      ],
      [NoneTerminal.init_declarator_list, ETokenType.COMMA, ETokenType.ID, ETokenType.EQUAL, NoneTerminal.initializer]
    ],
    ASTNode.InitDeclaratorList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.single_declaration,
    [
      [NoneTerminal.fully_specified_type, ETokenType.ID],
      [NoneTerminal.fully_specified_type, ETokenType.ID, NoneTerminal.array_specifier],
      [
        NoneTerminal.fully_specified_type,
        ETokenType.ID,
        NoneTerminal.array_specifier,
        ETokenType.EQUAL,
        NoneTerminal.initializer
      ],
      [NoneTerminal.fully_specified_type, ETokenType.ID, ETokenType.EQUAL, NoneTerminal.initializer]
    ],
    ASTNode.SingleDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.initializer,
    [
      [NoneTerminal.assignment_expression],
      [ETokenType.LEFT_BRACE, NoneTerminal.initializer_list, ETokenType.RIGHT_BRACE]
    ],
    // #if _VERBOSE
    ASTNode.Initializer.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.initializer_list,
    [[NoneTerminal.initializer], [NoneTerminal.initializer_list, ETokenType.COMMA, NoneTerminal.initializer]],
    // #if _VERBOSE
    ASTNode.InitializerList.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.expression_statement,
    [[ETokenType.SEMICOLON], [NoneTerminal.expression, ETokenType.SEMICOLON]],
    // #if _VERBOSE
    ASTNode.ExpressionStatement.pool
    // #endif
  ),

  // dangling else ambiguity
  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.selection_statement,
    [
      [EKeyword.IF, ETokenType.LEFT_PAREN, NoneTerminal.expression, ETokenType.RIGHT_PAREN, NoneTerminal.statement],
      [
        EKeyword.IF,
        ETokenType.LEFT_PAREN,
        NoneTerminal.expression,
        ETokenType.RIGHT_PAREN,
        NoneTerminal.statement,
        EKeyword.ELSE,
        NoneTerminal.statement
      ]
    ],
    // #if _VERBOSE
    ASTNode.SelectionStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.iteration_statement,
    [
      [EKeyword.WHILE, ETokenType.LEFT_PAREN, NoneTerminal.condition, ETokenType.RIGHT_PAREN, NoneTerminal.statement],
      [
        EKeyword.FOR,
        ETokenType.LEFT_PAREN,
        NoneTerminal.for_init_statement,
        NoneTerminal.for_rest_statement,
        ETokenType.RIGHT_PAREN,
        NoneTerminal.statement
      ]
    ],
    // #if _VERBOSE
    ASTNode.IterationStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.precision_specifier,
    [
      [
        EKeyword.PRECISION,
        NoneTerminal.precision_qualifier,
        NoneTerminal.ext_builtin_type_specifier_nonarray,
        ETokenType.SEMICOLON
      ]
    ],
    ASTNode.PrecisionSpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.for_init_statement,
    [[NoneTerminal.expression_statement], [NoneTerminal.declaration]],
    // #if _VERBOSE
    ASTNode.ForInitStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.condition,
    [
      [NoneTerminal.expression],
      [NoneTerminal.fully_specified_type, ETokenType.ID, ETokenType.EQUAL, NoneTerminal.initializer]
    ],
    // #if _VERBOSE
    ASTNode.Condition.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.for_rest_statement,
    [
      [NoneTerminal.conditionopt, ETokenType.SEMICOLON],
      [NoneTerminal.conditionopt, ETokenType.SEMICOLON, NoneTerminal.expression]
    ],
    // #if _VERBOSE
    ASTNode.ForRestStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.conditionopt,
    [[ETokenType.EPSILON], [NoneTerminal.condition]],
    // #if _VERBOSE
    ASTNode.ConditionOpt.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.jump_statement,
    [
      [EKeyword.CONTINUE, ETokenType.SEMICOLON],
      [EKeyword.BREAK, ETokenType.SEMICOLON],
      [EKeyword.RETURN, ETokenType.SEMICOLON],
      [EKeyword.RETURN, NoneTerminal.expression, ETokenType.SEMICOLON],
      [EKeyword.DISCARD, ETokenType.SEMICOLON]
    ],
    ASTNode.JumpStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.scope_brace,
    [[ETokenType.LEFT_BRACE]],
    ASTNode.ScopeBrace.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.scope_end_brace,
    [[ETokenType.RIGHT_BRACE]],
    ASTNode.ScopeEndBrace.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.variable_identifier,
    [[ETokenType.ID]],
    ASTNode.VariableIdentifier.pool
  )
];

const createGrammar = () =>
  Grammar.create(
    NoneTerminal.gs_shader_program,
    productionAndRules.map((item) => item[0])
  );

const addTranslationRule = (sa: SematicAnalyzer) => {
  for (let i = 0; i < productionAndRules.length; i++) {
    const rule = productionAndRules[i][1];
    if (rule) {
      sa.addTranslationRule(i, rule);
    }
  }
};

export { createGrammar, addTranslationRule };
