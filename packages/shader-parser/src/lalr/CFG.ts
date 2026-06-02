// Context Free Grammar of Galacean Shader
import { ETokenType } from "../common";
import { Keyword } from "../common/enums/Keyword";
import { ASTNode } from "../parser/AST";
import { Grammar } from "../parser/Grammar";
import { GrammarSymbol, NoneTerminal } from "../parser/GrammarSymbol";
import SemanticAnalyzer, { TranslationRule } from "../parser/SemanticAnalyzer";
import GrammarUtils from "./Utils";

const productionAndRules: [GrammarSymbol[], TranslationRule | undefined][] = [
  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.gs_shader_program,
    [[NoneTerminal.global_declaration], [NoneTerminal.gs_shader_program, NoneTerminal.global_declaration]],
    ASTNode.GLShaderProgram.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.global_declaration,
    [
      [NoneTerminal.precision_specifier],
      [NoneTerminal.variable_declaration_statement],
      [NoneTerminal.struct_specifier],
      [NoneTerminal.function_definition],
      [NoneTerminal.global_macro_if_statement],
      [NoneTerminal.macro_undef],
      [NoneTerminal.macro_define],
      [Keyword.MACRO_DEFINE_EXPRESSION]
    ],
    ASTNode.GlobalDeclaration.pool
  ),

  // Expression-style `#define` — lexer emits either:
  //   `MACRO_DEFINE ID <value tokens> MACRO_DEFINE_END`                 (object macro)
  //   `MACRO_DEFINE ID MACRO_DEFINE_PARAMS <value tokens> MACRO_DEFINE_END` (function macro)
  //
  // The `(param1, param2, …)` block is captured by the lexer as a single opaque
  // `MACRO_DEFINE_PARAMS` token. Capturing in the lexer (rather than recursively in
  // the CFG via a `macro_define_param_list` non-terminal) avoids an LALR(1) conflict
  // between `macro_define_param_list` and the visually similar
  // `function_call_parameter_list` when the parser is in a state that could follow
  // either `LEFT_PAREN ID , ID` pattern.
  //
  // Empty-value `#define X\n` and function-like without body stay on the legacy
  // opaque `MACRO_DEFINE_EXPRESSION` path.
  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_define,
    [
      [Keyword.MACRO_DEFINE, ETokenType.ID, NoneTerminal.expression, Keyword.MACRO_DEFINE_END],
      [
        Keyword.MACRO_DEFINE,
        ETokenType.ID,
        Keyword.MACRO_DEFINE_PARAMS,
        NoneTerminal.expression,
        Keyword.MACRO_DEFINE_END
      ]
    ],
    ASTNode.MacroDefine.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_call_symbol,
    [[Keyword.MACRO_CALL]],
    ASTNode.MacroCallSymbol.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_call_function,
    [
      [NoneTerminal.macro_call_symbol, ETokenType.LEFT_PAREN, ETokenType.RIGHT_PAREN],
      [
        NoneTerminal.macro_call_symbol,
        ETokenType.LEFT_PAREN,
        NoneTerminal.function_call_parameter_list,
        ETokenType.RIGHT_PAREN
      ]
    ],
    ASTNode.MacroCallFunction.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_undef,
    [
      [Keyword.MACRO_UNDEF, ETokenType.ID],
      [Keyword.MACRO_UNDEF, Keyword.MACRO_CALL]
    ],
    ASTNode.MacroUndef.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_push_context,
    [
      [Keyword.MACRO_IF, Keyword.MACRO_CONDITIONAL_EXPRESSION],
      [Keyword.MACRO_IFDEF, ETokenType.ID],
      [Keyword.MACRO_IFNDEF, ETokenType.ID],
      [Keyword.MACRO_IFDEF, NoneTerminal.macro_call_symbol],
      [Keyword.MACRO_IFNDEF, NoneTerminal.macro_call_symbol]
    ],
    ASTNode.MacroPushContext.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_pop_context,
    [[Keyword.MACRO_ENDIF]],
    ASTNode.MacroPopContext.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_elif_expression,
    [[Keyword.MACRO_ELIF, Keyword.MACRO_CONDITIONAL_EXPRESSION]],
    ASTNode.MacroElifExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_else_expression,
    [[Keyword.MACRO_ELSE]],
    ASTNode.MacroElseExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.global_macro_declaration,
    [[NoneTerminal.global_declaration], [NoneTerminal.global_macro_declaration, NoneTerminal.global_declaration]],
    ASTNode.GlobalMacroDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.global_macro_if_statement,
    [
      [NoneTerminal.macro_push_context, NoneTerminal.global_macro_declaration, NoneTerminal.global_macro_branch],
      [NoneTerminal.macro_push_context, NoneTerminal.global_macro_branch]
    ],
    ASTNode.GlobalMacroIfStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.global_macro_branch,
    [
      [NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.global_macro_declaration, NoneTerminal.global_macro_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.global_macro_declaration, NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.global_macro_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.macro_pop_context]
    ],
    ASTNode.GlobalMacroBranch.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.variable_declaration,
    [
      [NoneTerminal.fully_specified_type, ETokenType.ID],
      [NoneTerminal.fully_specified_type, ETokenType.ID, NoneTerminal.array_specifier],
      [NoneTerminal.fully_specified_type, ETokenType.ID, ETokenType.EQUAL, NoneTerminal.initializer]
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
      [Keyword.VOID],
      [Keyword.FLOAT],
      [Keyword.BOOL],
      [Keyword.INT],
      [Keyword.UINT],
      [Keyword.VEC2],
      [Keyword.VEC3],
      [Keyword.VEC4],
      [Keyword.BVEC2],
      [Keyword.BVEC3],
      [Keyword.BVEC4],
      [Keyword.IVEC2],
      [Keyword.IVEC3],
      [Keyword.IVEC4],
      [Keyword.UVEC2],
      [Keyword.UVEC3],
      [Keyword.UVEC4],
      [Keyword.MAT2],
      [Keyword.MAT3],
      [Keyword.MAT4],
      [Keyword.MAT2X3],
      [Keyword.MAT2X4],
      [Keyword.MAT3X2],
      [Keyword.MAT3X4],
      [Keyword.MAT4X2],
      [Keyword.MAT4X3],
      [Keyword.SAMPLER2D],
      [Keyword.SAMPLER3D],
      [Keyword.SAMPLER_CUBE],
      [Keyword.SAMPLER2D_SHADOW],
      [Keyword.SAMPLER_CUBE_SHADOW],
      [Keyword.SAMPLER2D_ARRAY],
      [Keyword.SAMPLER2D_ARRAY_SHADOW],
      [Keyword.I_SAMPLER2D],
      [Keyword.I_SAMPLER3D],
      [Keyword.I_SAMPLER_CUBE],
      [Keyword.I_SAMPLER2D_ARRAY],
      [Keyword.U_SAMPLER2D],
      [Keyword.U_SAMPLER3D],
      [Keyword.U_SAMPLER_CUBE],
      [Keyword.U_SAMPLER2D_ARRAY]
    ],
    ASTNode.ExtBuiltinTypeSpecifierNonArray.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.type_specifier_nonarray,
    [
      // User-defined struct identifier
      [ETokenType.ID],
      // Built-in type keyword (float / vec3 / sampler2D / ...)
      [NoneTerminal.ext_builtin_type_specifier_nonarray],
      // Macro-as-type-alias (e.g. `#define FxaaFloat float; FxaaFloat x;`).
      // Routing through `macro_call_symbol` keeps the macro a first-class AST
      // node and lets the LALR table disambiguate from expression-position
      // macro calls.
      [NoneTerminal.macro_call_symbol]
    ],
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
      [Keyword.PRECISE]
    ],
    ASTNode.SingleTypeQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.storage_qualifier,
    [[Keyword.CONST], [Keyword.IN], [Keyword.INOUT], [Keyword.OUT], [Keyword.CENTROID]],
    ASTNode.StorageQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.interpolation_qualifier,
    [[Keyword.SMOOTH], [Keyword.FLAT]],
    ASTNode.InterpolationQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.invariant_qualifier,
    [[Keyword.INVARIANT]],
    ASTNode.InvariantQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.precision_qualifier,
    [[Keyword.HIGHP], [Keyword.MEDIUMP], [Keyword.LOWP]],
    ASTNode.PrecisionQualifier.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.struct_specifier,
    [
      [
        Keyword.STRUCT,
        ETokenType.ID,
        ETokenType.LEFT_BRACE,
        NoneTerminal.struct_declaration_list,
        ETokenType.RIGHT_BRACE,
        ETokenType.SEMICOLON
      ],
      [
        Keyword.STRUCT,
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
      [
        NoneTerminal.layout_qualifier,
        NoneTerminal.type_specifier,
        NoneTerminal.struct_declarator,
        ETokenType.SEMICOLON
      ],
      [NoneTerminal.macro_struct_declaration]
    ],
    ASTNode.StructDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_struct_declaration,
    [
      [NoneTerminal.macro_push_context, NoneTerminal.struct_declaration_list, NoneTerminal.macro_struct_branch],
      [NoneTerminal.macro_push_context, NoneTerminal.macro_struct_branch]
    ],
    ASTNode.MacroStructDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_struct_branch,
    [
      [NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.struct_declaration_list, NoneTerminal.macro_struct_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.struct_declaration_list, NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.macro_struct_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.macro_pop_context]
    ],
    ASTNode.MacroStructBranch.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.layout_qualifier,
    [
      [
        Keyword.LAYOUT,
        ETokenType.LEFT_PAREN,
        Keyword.LOCATION,
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
    ASTNode.ConditionalExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.logical_or_expression,
    [
      [NoneTerminal.logical_xor_expression],
      [NoneTerminal.logical_or_expression, ETokenType.OR_OP, NoneTerminal.logical_xor_expression]
    ],
    ASTNode.LogicalOrExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.logical_xor_expression,
    [
      [NoneTerminal.logical_and_expression],
      [NoneTerminal.logical_xor_expression, ETokenType.XOR_OP, NoneTerminal.logical_and_expression]
    ],
    ASTNode.LogicalXorExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.logical_and_expression,
    [
      [NoneTerminal.inclusive_or_expression],
      [NoneTerminal.logical_and_expression, ETokenType.AND_OP, NoneTerminal.inclusive_or_expression]
    ],
    ASTNode.LogicalAndExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.inclusive_or_expression,
    [
      [NoneTerminal.exclusive_or_expression],
      [NoneTerminal.inclusive_or_expression, ETokenType.VERTICAL_BAR, NoneTerminal.exclusive_or_expression]
    ],
    ASTNode.InclusiveOrExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.exclusive_or_expression,
    [
      [NoneTerminal.and_expression],
      [NoneTerminal.exclusive_or_expression, ETokenType.CARET, NoneTerminal.and_expression]
    ],
    ASTNode.ExclusiveOrExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.and_expression,
    [
      [NoneTerminal.equality_expression],
      [NoneTerminal.and_expression, ETokenType.AMPERSAND, NoneTerminal.equality_expression]
    ],
    ASTNode.AndExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.equality_expression,
    [
      [NoneTerminal.relational_expression],
      [NoneTerminal.equality_expression, ETokenType.EQ_OP, NoneTerminal.relational_expression],
      [NoneTerminal.equality_expression, ETokenType.NE_OP, NoneTerminal.relational_expression]
    ],
    ASTNode.EqualityExpression.pool
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
    ASTNode.RelationalExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.shift_expression,
    [
      [NoneTerminal.additive_expression],
      [NoneTerminal.shift_expression, ETokenType.LEFT_OP, NoneTerminal.additive_expression],
      [NoneTerminal.shift_expression, ETokenType.RIGHT_OP, NoneTerminal.additive_expression]
    ],
    ASTNode.ShiftExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.additive_expression,
    [
      [NoneTerminal.multiplicative_expression],
      [NoneTerminal.additive_expression, ETokenType.PLUS, NoneTerminal.multiplicative_expression],
      [NoneTerminal.additive_expression, ETokenType.DASH, NoneTerminal.multiplicative_expression]
    ],
    ASTNode.AdditiveExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.multiplicative_expression,
    [
      [NoneTerminal.unary_expression],
      [NoneTerminal.multiplicative_expression, ETokenType.STAR, NoneTerminal.unary_expression],
      [NoneTerminal.multiplicative_expression, ETokenType.SLASH, NoneTerminal.unary_expression],
      [NoneTerminal.multiplicative_expression, ETokenType.PERCENT, NoneTerminal.unary_expression]
    ],
    ASTNode.MultiplicativeExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.unary_expression,
    [
      [NoneTerminal.postfix_expression],
      [ETokenType.INC_OP, NoneTerminal.unary_expression],
      [ETokenType.DEC_OP, NoneTerminal.unary_expression],
      [NoneTerminal.unary_operator, NoneTerminal.unary_expression]
    ],
    ASTNode.UnaryExpression.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.unary_operator,
    [[ETokenType.PLUS], [ETokenType.DASH], [ETokenType.BANG], [ETokenType.TILDE]],
    ASTNode.UnaryOperator.pool
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
      [Keyword.True],
      [Keyword.False],
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
    ASTNode.AssignmentOperator.pool
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
      [NoneTerminal.function_identifier, Keyword.VOID, ETokenType.RIGHT_PAREN]
    ],
    ASTNode.FunctionCallGeneric.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.function_call_parameter_list,
    [
      [NoneTerminal.assignment_expression],
      [NoneTerminal.function_call_parameter_list, ETokenType.COMMA, NoneTerminal.assignment_expression],
      [NoneTerminal.macro_call_arg_block],
      [NoneTerminal.function_call_parameter_list, NoneTerminal.macro_call_arg_block]
    ],
    ASTNode.FunctionCallParameterList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_call_arg_case_list,
    [
      [NoneTerminal.assignment_expression],
      [ETokenType.COMMA, NoneTerminal.assignment_expression],
      [NoneTerminal.macro_call_arg_block],
      [NoneTerminal.macro_call_arg_case_list, NoneTerminal.macro_call_arg_block],
      [NoneTerminal.macro_call_arg_case_list, ETokenType.COMMA, NoneTerminal.assignment_expression]
    ],
    ASTNode.MacroCallArgCaseList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_call_arg_block,
    [
      [NoneTerminal.macro_push_context, NoneTerminal.macro_call_arg_branch],
      [NoneTerminal.macro_push_context, NoneTerminal.macro_call_arg_case_list, NoneTerminal.macro_call_arg_branch]
    ],
    ASTNode.MacroCallArgBlock.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_call_arg_branch,
    [
      [NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.macro_call_arg_case_list, NoneTerminal.macro_call_arg_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.macro_call_arg_case_list, NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.macro_call_arg_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.macro_pop_context]
    ],
    ASTNode.MacroCallArgBranch.pool
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
      [NoneTerminal.function_parameter_list, ETokenType.COMMA, NoneTerminal.parameter_declaration],
      [NoneTerminal.macro_param_block],
      [NoneTerminal.function_parameter_list, NoneTerminal.macro_param_block]
    ],
    ASTNode.FunctionParameterList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_param_case_list,
    [
      [NoneTerminal.parameter_declaration],
      [ETokenType.COMMA, NoneTerminal.parameter_declaration],
      [NoneTerminal.macro_param_block],
      [NoneTerminal.macro_param_case_list, NoneTerminal.macro_param_block],
      [NoneTerminal.macro_param_case_list, ETokenType.COMMA, NoneTerminal.parameter_declaration]
    ],
    ASTNode.MacroParamCaseList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_param_block,
    [
      [NoneTerminal.macro_push_context, NoneTerminal.macro_parameter_branch],
      [NoneTerminal.macro_push_context, NoneTerminal.macro_param_case_list, NoneTerminal.macro_parameter_branch]
    ],
    ASTNode.MacroParamBlock.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_parameter_branch,
    [
      [NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.macro_param_case_list, NoneTerminal.macro_parameter_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.macro_param_case_list, NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.macro_parameter_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.macro_pop_context]
    ],
    ASTNode.MacroParameterBranch.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.parameter_declaration,
    [
      [NoneTerminal.type_qualifier, NoneTerminal.parameter_declarator],
      [NoneTerminal.parameter_declarator],
      [NoneTerminal.macro_call_symbol],
      [NoneTerminal.macro_call_function]
    ],
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
    ASTNode.Statement.pool
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
    ASTNode.CompoundStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.simple_statement,
    [
      [NoneTerminal.declaration],
      [NoneTerminal.expression_statement],
      [NoneTerminal.selection_statement],
      [NoneTerminal.iteration_statement],
      [NoneTerminal.jump_statement],
      [NoneTerminal.macro_if_statement],
      [NoneTerminal.macro_undef],
      [NoneTerminal.macro_define],
      [Keyword.MACRO_DEFINE_EXPRESSION]
    ],
    ASTNode.SimpleStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.declaration,
    [
      [NoneTerminal.function_prototype, ETokenType.SEMICOLON],
      [NoneTerminal.init_declarator_list, ETokenType.SEMICOLON],
      [
        Keyword.PRECISION,
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
      [NoneTerminal.fully_specified_type, ETokenType.ID, ETokenType.EQUAL, NoneTerminal.initializer],
      // Declarator name collides with a `#define` from a sibling `#if expr` arm
      // whose value the lexer can't evaluate. Branch-mutex covers `#if`/`#else`
      // pairs; this variant is the fallback for cross-`#if` collisions (e.g.
      // FXAA's `#define lumaNW …` shadowing `FxaaFloat lumaNW = …`).
      [NoneTerminal.fully_specified_type, Keyword.MACRO_CALL],
      [NoneTerminal.fully_specified_type, Keyword.MACRO_CALL, ETokenType.EQUAL, NoneTerminal.initializer]
    ],
    ASTNode.SingleDeclaration.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.initializer,
    [
      [NoneTerminal.assignment_expression],
      [ETokenType.LEFT_BRACE, NoneTerminal.initializer_list, ETokenType.RIGHT_BRACE]
    ],
    ASTNode.Initializer.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.initializer_list,
    [[NoneTerminal.initializer], [NoneTerminal.initializer_list, ETokenType.COMMA, NoneTerminal.initializer]],
    ASTNode.InitializerList.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.expression_statement,
    [[ETokenType.SEMICOLON], [NoneTerminal.expression, ETokenType.SEMICOLON]],
    ASTNode.ExpressionStatement.pool
  ),

  // dangling else ambiguity
  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.selection_statement,
    [
      [Keyword.IF, ETokenType.LEFT_PAREN, NoneTerminal.expression, ETokenType.RIGHT_PAREN, NoneTerminal.statement],
      [
        Keyword.IF,
        ETokenType.LEFT_PAREN,
        NoneTerminal.expression,
        ETokenType.RIGHT_PAREN,
        NoneTerminal.statement,
        Keyword.ELSE,
        NoneTerminal.statement
      ]
    ],
    ASTNode.SelectionStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.iteration_statement,
    [
      [Keyword.WHILE, ETokenType.LEFT_PAREN, NoneTerminal.condition, ETokenType.RIGHT_PAREN, NoneTerminal.statement],
      [
        Keyword.FOR,
        ETokenType.LEFT_PAREN,
        NoneTerminal.for_init_statement,
        NoneTerminal.for_rest_statement,
        ETokenType.RIGHT_PAREN,
        NoneTerminal.statement
      ]
    ],
    ASTNode.IterationStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.precision_specifier,
    [
      [
        Keyword.PRECISION,
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
    ASTNode.ForInitStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.condition,
    [
      [NoneTerminal.expression],
      [NoneTerminal.fully_specified_type, ETokenType.ID, ETokenType.EQUAL, NoneTerminal.initializer]
    ],
    ASTNode.Condition.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.for_rest_statement,
    [
      [NoneTerminal.conditionopt, ETokenType.SEMICOLON],
      [NoneTerminal.conditionopt, ETokenType.SEMICOLON, NoneTerminal.expression]
    ],
    ASTNode.ForRestStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.conditionopt,
    [[ETokenType.EPSILON], [NoneTerminal.condition]],
    ASTNode.ConditionOpt.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.jump_statement,
    [
      [Keyword.CONTINUE, ETokenType.SEMICOLON],
      [Keyword.BREAK, ETokenType.SEMICOLON],
      [Keyword.RETURN, ETokenType.SEMICOLON],
      [Keyword.RETURN, NoneTerminal.expression, ETokenType.SEMICOLON],
      [Keyword.DISCARD, ETokenType.SEMICOLON]
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
    [[ETokenType.ID], [NoneTerminal.macro_call_symbol], [NoneTerminal.macro_call_function]],
    ASTNode.VariableIdentifier.pool
  ),

  // Macros ...
  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_if_statement,
    [
      [NoneTerminal.macro_push_context, NoneTerminal.statement_list, NoneTerminal.macro_branch],
      [NoneTerminal.macro_push_context, NoneTerminal.macro_branch]
    ],
    ASTNode.MacroIfStatement.pool
  ),

  ...GrammarUtils.createProductionWithOptions(
    NoneTerminal.macro_branch,
    [
      [NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.statement_list, NoneTerminal.macro_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.statement_list, NoneTerminal.macro_pop_context],
      [NoneTerminal.macro_elif_expression, NoneTerminal.macro_branch],
      [NoneTerminal.macro_else_expression, NoneTerminal.macro_pop_context]
    ],
    ASTNode.MacroBranch.pool
  )
];

const createGrammar = () =>
  Grammar.create(
    NoneTerminal.gs_shader_program,
    productionAndRules.map((item) => item[0])
  );

const addTranslationRule = (sa: SemanticAnalyzer) => {
  for (let i = 0; i < productionAndRules.length; i++) {
    const rule = productionAndRules[i][1];
    if (rule) {
      sa.addTranslationRule(i, rule);
    }
  }
};

export { addTranslationRule, createGrammar };
