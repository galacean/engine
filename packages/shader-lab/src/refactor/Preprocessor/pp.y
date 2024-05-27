%token hash_define
%token hash_undef
%token hash_if
%token hash_ifdef
%token hash_ifndef
%token hash_else
%token hash_elif
%token hash_endif
%token hash_include
%token defined
%token id
%token line_remain
%token INT_CONSTANT
%token left_op
%token right_op
%token ge
%token le
%token eq
%token neq
%token and
%token or
%token chunk

%%
root:
  macro_expression_list
  ;

macro_expression_list:
  macro_expression
  | macro_expression macro_expression_list
  ;

macro_expression:
  chunk
  | define_macro
  | undef_macro
  | if_macro
  | ifdef_macro
  | ifndef_macro
  | include_macro
  ;

define_macro:
  hash_define id line_remain
  | hash_define id '(' macro_param_list ')' line_remain

macro_param_list:
  id
  | id ',' macro_param_list
  ;

undef_macro:
  hash_undef id
  ;

pp_constant:
  INT_CONSTANT
  | id
  | defined id
  | defined '(' id ')'
  ;

pp_parenthes_expression:
  pp_constant
  | '(' pp_parenthes_expression ')'
  ;

pp_unary_expression:
  pp_parenthes_expression
  | '+' pp_parenthes_expression
  | '-' pp_parenthes_expression
  | '!' pp_parenthes_expression
  ;

pp_multicative_expression:
  pp_unary_expression
  | pp_unary_expression '*' pp_multicative_expression
  | pp_unary_expression '/' pp_multicative_expression
  | pp_unary_expression '%' pp_multicative_expression
  ;

pp_additive_expression:
  pp_multicative_expression
  | pp_multicative_expression '+' pp_additive_expression
  | pp_multicative_expression '-' pp_additive_expression
  ;

pp_shift_expression:
  pp_additive_expression
  | pp_additive_expression left_op pp_shift_expression 
  | pp_additive_expression right_op pp_shift_expression 
  ;

pp_relational_expression:
  pp_shift_expression
  | pp_shift_expression '>' pp_relational_expression
  | pp_shift_expression '<' pp_relational_expression
  | pp_shift_expression ge pp_relational_expression 
  | pp_shift_expression le pp_relational_expression 
  ;

pp_equality_expression:
  pp_relational_expression
  | pp_relational_expression eq pp_equality_expression
  | pp_relational_expression neq pp_equality_expression
  ;

pp_logical_and_expression:
  pp_equality_expression
  | pp_equality_expression and pp_logical_and_expression
  ;

pp_logical_or_expression:
  pp_logical_and_expression
  | pp_logical_and_expression or pp_logical_or_expression
  ;

pp_constant_expression:
  pp_logical_or_expression
  ;

if_macro:
  hash_if pp_constant_expression macro_expression branch_macro hash_endif
  ;

branch_macro:
  /** empty */
  | hash_else macro_expression
  | hash_elif pp_constant_expression macro_expression branch_macro
  ;

ifdef_macro:
  hash_ifdef id macro_expression branch_macro hash_endif
  ;

ifndef_macro:
  hash_ifndef id macro_expression branch_macro hash_endif
  ;

include_macro:
  hash_include '"' id '"'
%%