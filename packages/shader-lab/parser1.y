// For cft conflict test, used by bison

%token shader
%token subshader
%token pass
%token string_const

%token plain_statements

%%
shader_program:
  shader string_const '{' shader_statements '}'
  ;

shader_statements:
  shader_statement
  | shader_statement shader_statements

shader_statement:
  plain_statements
  | subshader string_const '{' subshader_statements '}'
  ;

subshader_statements:
  subshader_statement
  | subshader_statement subshader_statements

subshader_statement:
  plain_statements
  | pass string_const '{' plain_statements '}'
%%
