// For cft conflict test, used by bison

%token shader
%token subshader
%token pass
%token string_const
%token id
%token render_queue_type
%token blend_state
%token depth_state
%token stencil_state
%token raster_state
%token tags
%token INT_CONSTANT
%token FLOAT_CONSTANT
%token true
%token false
%token engine_type
%token render_state_prop_type
%token UsePass
%token Color_init
%token VertextShader
%token FragmentShader

%token plain_statements

%%
shader_program:
  shader string_const '{' shader_statements '}'
  ;

shader_statements:
  shader_statement
  | shader_statement shader_statements
  ;

shader_statement:
  plain_statements
  | global_declaration_in_shader
  | subshader string_const '{' subshader_statements '}'
  ;

subshader_statements:
  subshader_statement
  | subshader_statement subshader_statements
  ;

subshader_statement:
  global_declaration
  | UsePass string_const
  | pass string_const '{' pass_statements '}'
  | plain_statements
  ;

pass_statements:
  global_declaration
  | plain_statements
  | main_shader_assignment
  ;

main_shader_assignment:
    VertextShader '=' id ';'
    FragmentShader '=' id ';'
    ;

global_declaration_in_shader:
  // Engine type
  variable_declaration
  | render_state_assignment
  | render_state_declaration
  ;


global_declaration:
  // Engine type 
  variable_declaration
  | render_queue_assignment
  | render_state_assignment
  | render_state_declaration
  | tag_specifier
  ;

tag_specifier:
    tags '{' tag_assignment_list  '}'
    ;

tag_assignment_list:
    /** empty */
    | tag_assignment
    | tag_assignment_list ',' tag_assignment
    ;

tag_assignment:
    id '=' tag_value
    ;

tag_value:
  string_const
    | INT_CONSTANT
    | true
    | false
    ;

render_queue_assignment:
  render_queue_type '=' id ';'
  ;

variable_type:
  engine_type
  | render_state_prop_type
  | render_queue_type
  ;

render_state_assignment:
    render_state_declarator '=' id ';'
    | render_state_declarator '{' render_state_prop_list '}'
    ;

render_state_declaration:
    render_state_declarator id '{' render_state_prop_list '}'
    ;

variable_declaration:
  variable_type id ';'
  ;

render_state_declarator:
    blend_state
    | depth_state
    | stencil_state
    | raster_state
    ;

render_state_prop_list:
    render_state_prop_assignment
    | render_state_prop_assignment render_state_prop_list
    ;

render_state_prop_assignment:
    render_state_prop '=' id ';'
    render_state_prop '=' true ';'
    render_state_prop '=' false ';'
    render_state_prop '=' INT_CONSTANT ';'
    render_state_prop '=' FLOAT_CONSTANT ';'
    render_state_prop '=' id '.' id ';'
    render_state_prop '=' Color_init;
    ;

render_state_prop:
    render_state_prop_type '[' INT_CONSTANT ']'
    | render_state_prop_type
    ;
%%
