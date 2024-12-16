// Context Free Grammar of Galacean ShaderLab

import { Grammar } from "../parser/Grammar";
import { ENonTerminal, GrammarSymbol } from "../parser/GrammarSymbol";
import GrammarUtils from "./Utils";
import { EKeyword, ETokenType } from "../common";
import SematicAnalyzer, { TranslationRule } from "../parser/SemanticAnalyzer";
import { ASTNode } from "../parser/AST";

const productionAndRules: [GrammarSymbol[], TranslationRule | undefined][] = [
  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.gs_shader_program,
    [[ENonTerminal.global_declaration], [ENonTerminal.gs_shader_program, ENonTerminal.global_declaration]],
    ASTNode.GLShaderProgram.pool
  ),

  ...GrammarUtils.createProductionWithOptions(ENonTerminal.global_declaration, [
    [ENonTerminal.precision_specifier],
    [ENonTerminal.variable_declaration_statement],
    [ENonTerminal.struct_specifier],
    [ENonTerminal.function_definition]
  ]),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.variable_declaration,
    [
      [ENonTerminal.fully_specified_type, ETokenType.ID],
      [ENonTerminal.fully_specified_type, ETokenType.ID, ENonTerminal.array_specifier]
    ],
    ASTNode.VariableDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.variable_declaration_list,
    [
      [ENonTerminal.variable_declaration],
      [ENonTerminal.variable_declaration_list, ETokenType.COMMA, ETokenType.ID],
      [ENonTerminal.variable_declaration_list, ETokenType.COMMA, ETokenType.ID, ENonTerminal.array_specifier]
    ],
    ASTNode.VariableDeclarationList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(ENonTerminal.variable_declaration_statement, [
    [ENonTerminal.variable_declaration_list, ETokenType.SEMICOLON]
  ]),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.ext_builtin_type_specifier_nonarray,
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
    ENonTerminal.type_specifier_nonarray,
    [[ETokenType.ID], [ENonTerminal.ext_builtin_type_specifier_nonarray]],
    ASTNode.TypeSpecifierNonArray.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.fully_specified_type,
    [[ENonTerminal.type_specifier], [ENonTerminal.type_qualifier, ENonTerminal.type_specifier]],
    ASTNode.FullySpecifiedType.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.type_specifier,
    [
      [ENonTerminal.type_specifier_nonarray],
      [ENonTerminal.ext_builtin_type_specifier_nonarray, ENonTerminal.array_specifier]
    ],
    ASTNode.TypeSpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.type_qualifier,
    [[ENonTerminal.single_type_qualifier], [ENonTerminal.type_qualifier, ENonTerminal.single_type_qualifier]],
    ASTNode.TypeQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.single_type_qualifier,
    [
      [ENonTerminal.storage_qualifier],
      [ENonTerminal.precision_qualifier],
      [ENonTerminal.interpolation_qualifier],
      [ENonTerminal.invariant_qualifier],
      [EKeyword.PRECISE]
    ],
    ASTNode.SingleTypeQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.storage_qualifier,
    [[EKeyword.CONST], [EKeyword.IN], [EKeyword.INOUT], [EKeyword.OUT], [EKeyword.CENTROID]],
    // #if _VERBOSE
    ASTNode.StorageQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.interpolation_qualifier,
    [[EKeyword.SMOOTH], [EKeyword.FLAT]],
    // #if _VERBOSE
    ASTNode.InterpolationQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.invariant_qualifier,
    [[EKeyword.INVARIANT]],
    // #if _VERBOSE
    ASTNode.InvariantQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.precision_qualifier,
    [[EKeyword.HIGHP], [EKeyword.MEDIUMP], [EKeyword.LOWP]],
    // #if _VERBOSE
    ASTNode.PrecisionQualifier.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.struct_specifier,
    [
      [
        EKeyword.STRUCT,
        ETokenType.ID,
        ETokenType.LEFT_BRACE,
        ENonTerminal.struct_declaration_list,
        ETokenType.RIGHT_BRACE,
        ETokenType.SEMICOLON
      ],
      [
        EKeyword.STRUCT,
        ETokenType.LEFT_BRACE,
        ENonTerminal.struct_declaration_list,
        ETokenType.RIGHT_BRACE,
        ETokenType.SEMICOLON
      ]
    ],
    ASTNode.StructSpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.struct_declaration_list,
    [[ENonTerminal.struct_declaration], [ENonTerminal.struct_declaration_list, ENonTerminal.struct_declaration]],
    ASTNode.StructDeclarationList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.struct_declaration,
    [
      [ENonTerminal.type_specifier, ENonTerminal.struct_declarator_list, ETokenType.SEMICOLON],
      [
        ENonTerminal.type_qualifier,
        ENonTerminal.type_specifier,
        ENonTerminal.struct_declarator_list,
        ETokenType.SEMICOLON
      ]
    ],
    ASTNode.StructDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.struct_declarator_list,
    [
      [ENonTerminal.struct_declarator],
      [ENonTerminal.struct_declarator_list, ETokenType.COMMA, ENonTerminal.struct_declarator]
    ],
    ASTNode.StructDeclaratorList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.struct_declarator,
    [[ETokenType.ID], [ETokenType.ID, ENonTerminal.array_specifier]],
    ASTNode.StructDeclarator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.array_specifier,
    [
      [ETokenType.LEFT_BRACKET, ETokenType.RIGHT_BRACKET],
      [ETokenType.LEFT_BRACKET, ENonTerminal.integer_constant_expression, ETokenType.RIGHT_BRACKET]
    ],
    ASTNode.ArraySpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.integer_constant_expression_operator,
    [[ETokenType.PLUS], [ETokenType.DASH], [ETokenType.STAR], [ETokenType.SLASH], [ETokenType.PERCENT]],
    ASTNode.IntegerConstantExpressionOperator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.integer_constant_expression,
    [
      [ENonTerminal.variable_identifier],
      [ETokenType.INT_CONSTANT],
      [
        ENonTerminal.integer_constant_expression,
        ENonTerminal.integer_constant_expression_operator,
        ETokenType.INT_CONSTANT
      ],
      [
        ENonTerminal.integer_constant_expression,
        ENonTerminal.integer_constant_expression_operator,
        ENonTerminal.variable_identifier
      ]
    ],
    ASTNode.IntegerConstantExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.conditional_expression,
    [
      [ENonTerminal.logical_or_expression],
      [
        ENonTerminal.logical_or_expression,
        ETokenType.QUESTION,
        ENonTerminal.expression,
        ETokenType.COLON,
        ENonTerminal.assignment_expression
      ]
    ],
    // #if _VERBOSE
    ASTNode.ConditionalExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.logical_or_expression,
    [
      [ENonTerminal.logical_xor_expression],
      [ENonTerminal.logical_or_expression, ETokenType.OR_OP, ENonTerminal.logical_xor_expression]
    ],
    // #if _VERBOSE
    ASTNode.LogicalOrExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.logical_xor_expression,
    [
      [ENonTerminal.logical_and_expression],
      [ENonTerminal.logical_xor_expression, ETokenType.XOR_OP, ENonTerminal.logical_and_expression]
    ],
    // #if _VERBOSE
    ASTNode.LogicalXorExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.logical_and_expression,
    [
      [ENonTerminal.inclusive_or_expression],
      [ENonTerminal.logical_and_expression, ETokenType.AND_OP, ENonTerminal.inclusive_or_expression]
    ],
    // #if _VERBOSE
    ASTNode.LogicalAndExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.inclusive_or_expression,
    [
      [ENonTerminal.exclusive_or_expression],
      [ENonTerminal.inclusive_or_expression, ETokenType.VERTICAL_BAR, ENonTerminal.exclusive_or_expression]
    ],
    // #if _VERBOSE
    ASTNode.InclusiveOrExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.exclusive_or_expression,
    [
      [ENonTerminal.and_expression],
      [ENonTerminal.exclusive_or_expression, ETokenType.CARET, ENonTerminal.and_expression]
    ],
    // #if _VERBOSE
    ASTNode.ExclusiveOrExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.and_expression,
    [
      [ENonTerminal.equality_expression],
      [ENonTerminal.and_expression, ETokenType.AMPERSAND, ENonTerminal.equality_expression]
    ],
    // #if _VERBOSE
    ASTNode.AndExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.equality_expression,
    [
      [ENonTerminal.relational_expression],
      [ENonTerminal.equality_expression, ETokenType.EQ_OP, ENonTerminal.relational_expression],
      [ENonTerminal.equality_expression, ETokenType.NE_OP, ENonTerminal.relational_expression]
    ],
    // #if _VERBOSE
    ASTNode.EqualityExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.relational_expression,
    [
      [ENonTerminal.shift_expression],
      [ENonTerminal.relational_expression, ETokenType.LEFT_ANGLE, ENonTerminal.shift_expression],
      [ENonTerminal.relational_expression, ETokenType.RIGHT_ANGLE, ENonTerminal.shift_expression],
      [ENonTerminal.relational_expression, ETokenType.LE_OP, ENonTerminal.shift_expression],
      [ENonTerminal.relational_expression, ETokenType.GE_OP, ENonTerminal.shift_expression]
    ],
    // #if _VERBOSE
    ASTNode.RelationalExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.shift_expression,
    [
      [ENonTerminal.additive_expression],
      [ENonTerminal.shift_expression, ETokenType.LEFT_OP, ENonTerminal.additive_expression],
      [ENonTerminal.shift_expression, ETokenType.RIGHT_OP, ENonTerminal.additive_expression]
    ],
    // #if _VERBOSE
    ASTNode.ShiftExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.additive_expression,
    [
      [ENonTerminal.multiplicative_expression],
      [ENonTerminal.additive_expression, ETokenType.PLUS, ENonTerminal.multiplicative_expression],
      [ENonTerminal.additive_expression, ETokenType.DASH, ENonTerminal.multiplicative_expression]
    ],
    // #if _VERBOSE
    ASTNode.AdditiveExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.multiplicative_expression,
    [
      [ENonTerminal.unary_expression],
      [ENonTerminal.multiplicative_expression, ETokenType.STAR, ENonTerminal.unary_expression],
      [ENonTerminal.multiplicative_expression, ETokenType.SLASH, ENonTerminal.unary_expression],
      [ENonTerminal.multiplicative_expression, ETokenType.PERCENT, ENonTerminal.unary_expression]
    ],
    // #if _VERBOSE
    ASTNode.MultiplicativeExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.unary_expression,
    [
      [ENonTerminal.postfix_expression],
      [ETokenType.INC_OP, ENonTerminal.unary_expression],
      [ETokenType.DEC_OP, ENonTerminal.unary_expression],
      [ENonTerminal.unary_operator, ENonTerminal.unary_expression]
    ],
    // #if _VERBOSE
    ASTNode.UnaryExpression.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.unary_operator,
    [[ETokenType.PLUS], [ETokenType.DASH], [ETokenType.BANG], [ETokenType.TILDE]],
    // #if _VERBOSE
    ASTNode.UnaryOperator.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.postfix_expression,
    [
      [ENonTerminal.primary_expression],
      [ENonTerminal.postfix_expression, ETokenType.LEFT_BRACKET, ENonTerminal.expression, ETokenType.RIGHT_BRACKET],
      [ENonTerminal.function_call],
      [ENonTerminal.postfix_expression, ETokenType.DOT, ETokenType.ID],
      [ENonTerminal.postfix_expression, ETokenType.DOT, ENonTerminal.function_call],
      [ENonTerminal.postfix_expression, ETokenType.INC_OP],
      [ENonTerminal.postfix_expression, ETokenType.DEC_OP]
    ],
    ASTNode.PostfixExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.primary_expression,
    [
      [ENonTerminal.variable_identifier],
      [ETokenType.INT_CONSTANT],
      [ETokenType.FLOAT_CONSTANT],
      [EKeyword.TRUE],
      [EKeyword.FALSE],
      [ETokenType.LEFT_PAREN, ENonTerminal.expression, ETokenType.RIGHT_PAREN]
    ],
    ASTNode.PrimaryExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.expression,
    [
      [ENonTerminal.assignment_expression],
      [ENonTerminal.expression, ETokenType.COMMA, ENonTerminal.assignment_expression]
    ],
    ASTNode.Expression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.assignment_expression,
    [
      [ENonTerminal.conditional_expression],
      [ENonTerminal.unary_expression, ENonTerminal.assignment_operator, ENonTerminal.assignment_expression]
    ],
    ASTNode.AssignmentExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.assignment_operator,
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
    ENonTerminal.function_call,
    [[ENonTerminal.function_call_generic]],
    ASTNode.FunctionCall.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_call_generic,
    [
      [
        ENonTerminal.function_identifier,
        ETokenType.LEFT_PAREN,
        ENonTerminal.function_call_parameter_list,
        ETokenType.RIGHT_PAREN
      ],
      [ENonTerminal.function_identifier, ETokenType.LEFT_PAREN, ETokenType.RIGHT_PAREN],
      [ENonTerminal.function_identifier, EKeyword.VOID, ETokenType.RIGHT_PAREN]
    ],
    ASTNode.FunctionCallGeneric.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_call_parameter_list,
    [
      [ENonTerminal.assignment_expression],
      [ENonTerminal.function_call_parameter_list, ETokenType.COMMA, ENonTerminal.assignment_expression]
    ],
    ASTNode.FunctionCallParameterList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_identifier,
    [[ENonTerminal.type_specifier]],
    ASTNode.FunctionIdentifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_definition,
    [[ENonTerminal.function_prototype, ENonTerminal.compound_statement_no_scope]],
    ASTNode.FunctionDefinition.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_prototype,
    [[ENonTerminal.function_declarator, ETokenType.RIGHT_PAREN]],
    ASTNode.FunctionProtoType.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_declarator,
    [[ENonTerminal.function_header], [ENonTerminal.function_header, ENonTerminal.function_parameter_list]],
    ASTNode.FunctionDeclarator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_header,
    [[ENonTerminal.fully_specified_type, ETokenType.ID, ETokenType.LEFT_PAREN]],
    ASTNode.FunctionHeader.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.function_parameter_list,
    [
      [ENonTerminal.parameter_declaration],
      [ENonTerminal.function_parameter_list, ETokenType.COMMA, ENonTerminal.parameter_declaration]
    ],
    ASTNode.FunctionParameterList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.parameter_declaration,
    [[ENonTerminal.type_qualifier, ENonTerminal.parameter_declarator], [ENonTerminal.parameter_declarator]],
    ASTNode.ParameterDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.parameter_declarator,
    [
      [ENonTerminal.type_specifier, ETokenType.ID],
      [ENonTerminal.type_specifier, ETokenType.ID, ENonTerminal.array_specifier]
    ],
    ASTNode.ParameterDeclarator.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.statement_list,
    [[ENonTerminal.statement], [ENonTerminal.statement_list, ENonTerminal.statement]],
    ASTNode.StatementList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.statement,
    [[ENonTerminal.compound_statement], [ENonTerminal.simple_statement]],
    // #if _VERBOSE
    ASTNode.Statement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.compound_statement_no_scope,
    [
      [ETokenType.LEFT_BRACE, ETokenType.RIGHT_BRACE],
      [ETokenType.LEFT_BRACE, ENonTerminal.statement_list, ETokenType.RIGHT_BRACE]
    ],
    ASTNode.CompoundStatementNoScope.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.compound_statement,
    [
      [ETokenType.LEFT_BRACE, ETokenType.RIGHT_BRACE],
      [ENonTerminal.scope_brace, ENonTerminal.statement_list, ENonTerminal.scope_end_brace]
    ],
    // #if _VERBOSE
    ASTNode.CompoundStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.simple_statement,
    [
      [ENonTerminal.declaration],
      [ENonTerminal.expression_statement],
      [ENonTerminal.selection_statement],
      [ENonTerminal.iteration_statement],
      [ENonTerminal.jump_statement]
    ],
    // #if _VERBOSE
    ASTNode.SimpleStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.declaration,
    [
      [ENonTerminal.function_prototype, ETokenType.SEMICOLON],
      [ENonTerminal.init_declarator_list, ETokenType.SEMICOLON],
      [
        EKeyword.PRECISION,
        ENonTerminal.precision_qualifier,
        ENonTerminal.ext_builtin_type_specifier_nonarray,
        ETokenType.SEMICOLON
      ],
      [ENonTerminal.type_qualifier, ETokenType.ID, ETokenType.SEMICOLON],
      [ENonTerminal.type_qualifier, ETokenType.ID, ENonTerminal.identifier_list, ETokenType.SEMICOLON]
    ],
    ASTNode.Declaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.identifier_list,
    [
      [ETokenType.COMMA, ETokenType.ID],
      [ENonTerminal.identifier_list, ETokenType.COMMA, ETokenType.ID]
    ],
    ASTNode.IdentifierList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.init_declarator_list,
    [
      [ENonTerminal.single_declaration],
      [ENonTerminal.init_declarator_list, ETokenType.COMMA, ETokenType.ID],
      [ENonTerminal.init_declarator_list, ETokenType.COMMA, ETokenType.ID, ENonTerminal.array_specifier],
      [
        ENonTerminal.init_declarator_list,
        ETokenType.COMMA,
        ETokenType.ID,
        ENonTerminal.array_specifier,
        ETokenType.EQUAL,
        ENonTerminal.initializer
      ],
      [ENonTerminal.init_declarator_list, ETokenType.COMMA, ETokenType.ID, ETokenType.EQUAL, ENonTerminal.initializer]
    ],
    ASTNode.InitDeclaratorList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.single_declaration,
    [
      [ENonTerminal.fully_specified_type, ETokenType.ID],
      [ENonTerminal.fully_specified_type, ETokenType.ID, ENonTerminal.array_specifier],
      [
        ENonTerminal.fully_specified_type,
        ETokenType.ID,
        ENonTerminal.array_specifier,
        ETokenType.EQUAL,
        ENonTerminal.initializer
      ],
      [ENonTerminal.fully_specified_type, ETokenType.ID, ETokenType.EQUAL, ENonTerminal.initializer]
    ],
    ASTNode.SingleDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.initializer,
    [
      [ENonTerminal.assignment_expression],
      [ETokenType.LEFT_BRACE, ENonTerminal.initializer_list, ETokenType.RIGHT_BRACE]
    ],
    // #if _VERBOSE
    ASTNode.Initializer.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.initializer_list,
    [[ENonTerminal.initializer], [ENonTerminal.initializer_list, ETokenType.COMMA, ENonTerminal.initializer]],
    // #if _VERBOSE
    ASTNode.InitializerList.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.expression_statement,
    [[ETokenType.SEMICOLON], [ENonTerminal.expression, ETokenType.SEMICOLON]],
    // #if _VERBOSE
    ASTNode.ExpressionStatement.pool
    // #endif
  ),

  // dangling else ambiguity
  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.selection_statement,
    [
      [EKeyword.IF, ETokenType.LEFT_PAREN, ENonTerminal.expression, ETokenType.RIGHT_PAREN, ENonTerminal.statement],
      [
        EKeyword.IF,
        ETokenType.LEFT_PAREN,
        ENonTerminal.expression,
        ETokenType.RIGHT_PAREN,
        ENonTerminal.statement,
        EKeyword.ELSE,
        ENonTerminal.statement
      ]
    ],
    // #if _VERBOSE
    ASTNode.SelectionStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.iteration_statement,
    [
      [EKeyword.WHILE, ETokenType.LEFT_PAREN, ENonTerminal.condition, ETokenType.RIGHT_PAREN, ENonTerminal.statement],
      [
        EKeyword.FOR,
        ETokenType.LEFT_PAREN,
        ENonTerminal.for_init_statement,
        ENonTerminal.for_rest_statement,
        ETokenType.RIGHT_PAREN,
        ENonTerminal.statement
      ]
    ],
    // #if _VERBOSE
    ASTNode.IterationStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.precision_specifier,
    [
      [
        EKeyword.PRECISION,
        ENonTerminal.precision_qualifier,
        ENonTerminal.ext_builtin_type_specifier_nonarray,
        ETokenType.SEMICOLON
      ]
    ],
    ASTNode.PrecisionSpecifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.for_init_statement,
    [[ENonTerminal.expression_statement], [ENonTerminal.declaration]],
    // #if _VERBOSE
    ASTNode.ForInitStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.condition,
    [
      [ENonTerminal.expression],
      [ENonTerminal.fully_specified_type, ETokenType.ID, ETokenType.EQUAL, ENonTerminal.initializer]
    ],
    // #if _VERBOSE
    ASTNode.Condition.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.for_rest_statement,
    [
      [ENonTerminal.conditionopt, ETokenType.SEMICOLON],
      [ENonTerminal.conditionopt, ETokenType.SEMICOLON, ENonTerminal.expression]
    ],
    // #if _VERBOSE
    ASTNode.ForRestStatement.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.conditionopt,
    [[ETokenType.EPSILON], [ENonTerminal.condition]],
    // #if _VERBOSE
    ASTNode.ConditionOpt.pool
    // #endif
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.jump_statement,
    [
      [EKeyword.CONTINUE, ETokenType.SEMICOLON],
      [EKeyword.BREAK, ETokenType.SEMICOLON],
      [EKeyword.RETURN, ETokenType.SEMICOLON],
      [EKeyword.RETURN, ENonTerminal.expression, ETokenType.SEMICOLON],
      [EKeyword.DISCARD, ETokenType.SEMICOLON]
    ],
    ASTNode.JumpStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.scope_brace,
    [[ETokenType.LEFT_BRACE]],
    ASTNode.ScopeBrace.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.scope_end_brace,
    [[ETokenType.RIGHT_BRACE]],
    ASTNode.ScopeEndBrace.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    ENonTerminal.variable_identifier,
    [[ETokenType.ID]],
    ASTNode.VariableIdentifier.pool
  )
];

const createGrammar = () =>
  Grammar.create(
    ENonTerminal.gs_shader_program,
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
