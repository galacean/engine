// For cft conflict test, used by bison

%token shader
%token subshader
%token pass
%token id
%token render_queue_type
%token pipeline_stage
%token blend_state
%token depth_state
%token stencil_state
%token raster_state
%token EditorProperties
%token EditorMacros
%token tags
%token ReplacementTag
%token LightMode
%token INT_CONSTANT
%token FLOAT_CONSTANT
%token true
%token false

%token UsePass
%token VertexShader
%token FragmentShader

%token void
%token float
%token int
%token mat4
%token struct
%token highp
%token mediemp
%token lowp

%token const
%token in
%token out
%token inout
%token centroid

%token SMOOTH
%token FLAT

%token PRECISE
%token PRECISION

%token INVARIANT

%token Off
%token On

%token or
%token xor
%token and
%token eq
%token neq
%token ge
%token le
%token left_op
%token right_op
%token INC_OP
%token DEC_OP

%token MUL_ASSIGN
%token DIV_ASSIGN
%token MOD_ASSIGN
%token ADD_ASSIGN
%token SUB_ASSIGN
%token LEFT_ASSIGN
%token RIGHT_ASSIGN
%token AND_ASSIGN
%token XOR_ASSIGN
%token OR_ASSIGN

%token IF ELSE WHILE FOR

%token CONTINUE BREAK RETURN DISCARD


%token string_const 

%%
gs_shader_program:
    shader string_const '{' gs_shader_global_declaration_list '}'
    ;

gs_editor_prop_declaration:
    EditorProperties '{' gs_editor_prop_item_list '}'
    ;

gs_editor_macro_declaration:
    EditorMacros '{' gs_editor_macro_item_list '}'
    ;

gs_editor_prop_group:
    id '(' string_const ')' '{' gs_editor_prop_item_list '}'
    ;

gs_editor_macro_group:
    id '(' string_const ')' '{' gs_editor_macro_item_list '}'
    ;

gs_editor_prop_item_list:
    gs_editor_prop_item ';'
    | gs_editor_prop_group
    | gs_editor_prop_item_list gs_editor_prop_item ';'
    | gs_editor_prop_item_list gs_editor_prop_group
    ;

gs_editor_macro_item_list:
    gs_editor_macro_item ';'
    | gs_editor_macro_group
    | gs_editor_macro_item_list gs_editor_macro_item ';'
    | gs_editor_macro_item_list gs_editor_macro_group
    ;

gs_editor_prop_item:
    id '(' string_const ',' gs_editor_prop_type ')'
    | id '(' string_const ',' gs_editor_prop_type ')' '=' gs_editor_prop_type_param
    | id '(' string_const ',' gs_editor_prop_type ')' '=' '(' gs_editor_prop_type_param_list ')'
    ;

gs_editor_macro_item:
    gs_editor_macro_item_declarator
    | '[' Off ']' gs_editor_macro_item_declarator
    | '[' On ']' gs_editor_macro_item_declarator
    ;

gs_editor_macro_item_declarator:
    gs_editor_prop_item
    | id '(' string_const ')'
    ;

gs_editor_prop_type:
    id
    | id '(' gs_editor_prop_type_param_list ')'
    ;

gs_editor_prop_type_param:
    INT_CONSTANT
    | '-' INT_CONSTANT
    | FLOAT_CONSTANT
    | '-' FLOAT_CONSTANT
    | true
    | false
    ;

gs_editor_prop_type_param_list:
    gs_editor_prop_type_param
    | gs_editor_prop_type_param_list ',' gs_editor_prop_type_param
    ;

gs_common_global_declaration:
    gs_variable_declaration
    | gs_render_queue_assignment
    | gs_render_state_assignment
    | struct_specifier
    | function_definition
    | gs_render_state_declaration
    ;

gs_shader_global_declaration:
    gs_common_global_declaration
    | gs_editor_prop_declaration
    | gs_editor_macro_declaration
    | gs_subshader_program
    ;

gs_shader_global_declaration_list:
    gs_shader_global_declaration
    | gs_shader_global_declaration_list gs_shader_global_declaration
    ;


gs_subshader_program:
    subshader string_const subshader_scope_brace gs_subshader_global_declaration_list scope_end_brace
    ;

gs_subshader_global_declaration_list:
    gs_subshader_global_declaration
    | gs_subshader_global_declaration_list gs_subshader_global_declaration
    ;

gs_subshader_global_declaration:
    gs_common_global_declaration
    | gs_tag_specifier
    | gs_pass_program
    | gs_use_pass_declaration
    ;

gs_tag_specifier:
    tags '{' gs_tag_assignment_list  '}';

gs_tag_assignment_list:
    /** empty */
    | gs_tag_assignment
    | gs_tag_assignment_list ',' gs_tag_assignment
    ;

gs_tag_assignment:
    gs_tag_id '=' gs_tag_value
    ;

gs_tag_id:
    /** TODO:  */
    ReplacementTag
    | LightMode
    | pipeline_stage
    ;

// TODO: 
gs_tag_value:
    string_const
    | INT_CONSTANT
    | true
    | false
    ;

gs_pass_program:
    pass string_const pass_scope_brace gs_pass_global_declaration_list scope_end_brace
    ;

gs_pass_global_declaration_list:
    gs_pass_global_declaration
    | gs_pass_global_declaration_list gs_pass_global_declaration
    ;

gs_pass_global_declaration:
    gs_common_global_declaration
    | gs_main_shader_assignment
    | gs_tag_specifier
    | precision_specifier
    ;

gs_use_pass_declaration:
    UsePass string_const
    ;

gs_render_state_declarator:
    blend_state
    | depth_state
    | stencil_state
    | raster_state
    ;

gs_render_state_assignment:
    gs_render_state_declarator '=' id ';'
    | gs_render_state_declarator '{' gs_render_state_prop_list '}'
    ;

gs_render_state_declaration:
    gs_render_state_declarator id '{' gs_render_state_prop_list '}'
    ;

gs_render_state_prop_list:
    gs_render_state_prop_assignment
    | gs_render_state_prop_assignment gs_render_state_prop_list
    ;

gs_render_state_prop_assignment:
    gs_render_state_prop '=' id ';'
    gs_render_state_prop '=' true ';'
    gs_render_state_prop '=' false ';'
    gs_render_state_prop '=' INT_CONSTANT ';'
    gs_render_state_prop '=' FLOAT_CONSTANT ';'
    gs_render_state_prop '=' id '.' id ';'
    gs_render_state_prop '=' gs_engine_type_init ';'
    ;

gs_engine_type:
    id
    ;

gs_engine_type_init:
    gs_engine_type '(' gs_engine_type_init_param_list ')'
    ;

gs_engine_type_init_param_list:
    INT_CONSTANT
    | FLOAT_CONSTANT
    | gs_engine_type_init_param_list ',' INT_CONSTANT
    | gs_engine_type_init_param_list ',' FLOAT_CONSTANT
    ;

gs_render_state_prop:
    id '[' INT_CONSTANT ']'
    | id
    ;

gs_mian_shader_entry:
    VertexShader
    | FragmentShader
    ;

gs_main_shader_assignment:
    gs_mian_shader_entry '=' id ';'
    ;

gs_render_queue_assignment:
    render_queue_type '=' id ';'
    ;

gs_variable_declaration:
    fully_specified_type id ';'
    | fully_specified_type id array_specifier ';'
    | render_queue_type id ';'
    ;

variable_identifier:
    id
    ;

precision_specifier:
    PRECISION precision_qualifier ext_builtin_type_specifier_nonarray ';'
    ;

ext_builtin_type_specifier_nonarray:
    void
    | float
    | int 
    | mat4
    ;

type_specifier_nonarray:
    ext_builtin_type_specifier_nonarray
    | id
    ;

struct_specifier:
    struct id '{' struct_declaration_list '}' ;
    | struct '{' struct_declaration_list '}' ;
    ;

struct_declaration_list:
    struct_declaration
    | struct_declaration_list struct_declaration
    ;

struct_declaration:
    type_specifier struct_declarator_list ';'
    | type_qualifier type_specifier struct_declaration_list ';'
    ;

struct_declarator_list:
    struct_declarator
    | struct_declarator_list ',' struct_declarator
    ;

struct_declarator:
    id
    | id array_specifier
    ;

array_specifier:
    '[' ']'
    | '[' integer_constant_expression ']'
    ;

type_specifier:
    type_specifier_nonarray
    | ext_builtin_type_specifier_nonarray array_specifier
    ;

precision_qualifier:
    highp
    | mediemp
    | lowp
    ;

type_qualifier:
    single_type_qualifier
    | type_qualifier single_type_qualifier
    ;

single_type_qualifier:
    storage_qualifier
    | precision_qualifier
    | interpolation_qualifier
    | invariant_qualifier 
    | PRECISE
    ;

storage_qualifier:
    const
    | in
    | out
    | inout
    | centroid
    ;

interpolation_qualifier:
    SMOOTH
    | FLAT
    ;

invariant_qualifier:
    INVARIANT
    ;

integer_constant_expression_operator:
    '+'
    | '-'
    | '*'
    | '/'
    | '%'
    ;

integer_constant_expression:
    variable_identifier
    | INT_CONSTANT
    | integer_constant_expression integer_constant_expression_operator INT_CONSTANT
    | integer_constant_expression integer_constant_expression_operator variable_identifier
    ;

conditional_expression:
    logical_or_expression
    | logical_or_expression '?' expression ':' assignment_expression
    ;

logical_or_expression:
    logical_xor_expression
    | logical_or_expression or logical_xor_expression
    ;

logical_xor_expression:
    logical_and_expression
    | logical_xor_expression xor logical_and_expression
    ;

logical_and_expression:
    inclusive_or_expression
    | logical_and_expression and inclusive_or_expression
    ;

inclusive_or_expression:
    exclusive_or_expression
    | inclusive_or_expression '|' exclusive_or_expression
    ;

exclusive_or_expression:
    and_expression
    | exclusive_or_expression '^' and_expression
    ;

and_expression:
    equality_expression
    | and_expression '&' equality_expression
    ;

equality_expression:
    relational_expression
    | equality_expression eq relational_expression
    | equality_expression neq relational_expression
    ;

relational_expression:
    shift_expression
    | relational_expression '<' shift_expression
    | relational_expression '>' shift_expression
    | relational_expression le shift_expression
    | relational_expression ge shift_expression
    ;

shift_expression:
    additive_expression
    | shift_expression left_op additive_expression
    | shift_expression right_op additive_expression
    ;

additive_expression:
    multiplicative_expression
    | additive_expression '+' multiplicative_expression
    | additive_expression '-' multiplicative_expression
    ;

multiplicative_expression:
    unary_expression
    | multiplicative_expression '*' unary_expression
    | multiplicative_expression '/' unary_expression
    | multiplicative_expression '%' unary_expression
    ;

unary_expression:
    postfix_expression
    | INC_OP unary_expression
    | DEC_OP unary_expression
    | unary_operator unary_expression

unary_operator:
    '+'
    | '-'
    | '!'
    | '~'
    ;

postfix_expression:
    primary_expression
    | postfix_expression '[' expression ']'
    | function_call
    | postfix_expression '.' id
    | postfix_expression '.' function_call
    | postfix_expression INC_OP
    | postfix_expression DEC_OP
    ;

primary_expression:
    variable_identifier
    | INT_CONSTANT
    | FLOAT_CONSTANT
    | true
    | false
    | '(' expression ')'
    ;

expression:
    assignment_expression
    | expression ',' assignment_expression
    ;

assignment_expression:
    conditional_expression
    | unary_expression assignment_operator assignment_expression
    ;

assignment_operator:
    '='
    | MUL_ASSIGN
    | DIV_ASSIGN
    | MOD_ASSIGN
    | ADD_ASSIGN
    | SUB_ASSIGN
    | LEFT_ASSIGN
    | RIGHT_ASSIGN
    | AND_ASSIGN
    | XOR_ASSIGN
    | OR_ASSIGN
    ;

function_call:
    function_call_generic
    ;

function_call_generic:
    function_identifier '(' function_call_parameter_list ')'
    | function_identifier '(' ')'
    | function_identifier '(' void ')'
    ;

function_call_parameter_list:
    assignment_expression
    | function_call_parameter_list ',' assignment_expression

function_identifier:
    type_specifier
    ;

function_definition:
    function_prototype compound_statement_no_scope
    ;

function_prototype:
    function_declarator ')'
    ;

function_declarator:
    function_header
    | function_header function_parameter_list
    ;

function_header:
    fully_specified_type id '('
    ;

fully_specified_type:
    type_specifier
    | type_qualifier type_specifier
    ;

function_parameter_list:
    parameter_declaration
    | function_parameter_list ',' parameter_declaration
    ;

parameter_declaration:
    type_qualifier parameter_declarator
    | parameter_declarator
    ;

parameter_declarator:
    type_specifier id
    | type_specifier id array_specifier
    ;

statement_list:
    statement
    | statement_list statement
    ;

statement:
    compound_statement
    | simple_statement
    ;

compound_statement_no_scope:
    '{' '}'
    | '{' statement_list '}'

compound_statement:
    '{' '}'
    | scope_brace statement_list scope_end_brace
    ;

simple_statement:
    declaration
    | expression_statement
    | selection_statement
    | iteration_statement
    | jump_statement
    ;

declaration:
    function_prototype ';'
    | init_declarator_list ';'
    | type_qualifier id ';'
    | type_qualifier id identifier_list ';'
    | precision_specifier
    ;

identifier_list:
    ',' id
    | identifier_list ',' id
    ;

init_declarator_list:
    single_declaration
    | init_declarator_list ',' id
    | init_declarator_list ',' id array_specifier
    | init_declarator_list ',' id array_specifier '=' initializer
    | init_declarator_list ',' id '=' initializer
    ;

single_declaration:
    fully_specified_type id
    | fully_specified_type id array_specifier
    | fully_specified_type id '=' initializer
    | fully_specified_type id array_specifier '=' initializer
    ;

initializer:
    assignment_expression
    | '{' initializer_list '}'
    ;

initializer_list:
    initializer
    | initializer_list ',' initializer
    ;

expression_statement:
    ';'
    | expression ';'
    ;

// Dangling else ambiguity
selection_statement:
    IF '(' expression ')' statement
    | IF '(' expression ')' statement ELSE statement
    ;

iteration_statement:
    WHILE '(' condition ')' statement
    | FOR '(' for_init_statement for_rest_statement ')' statement
    ;

for_init_statement:
    expression_statement
    | declaration
    ;

condition:
    expression
    | fully_specified_type id '=' initializer
    ;

for_rest_statement:
    conditionopt ';'
    | conditionopt ';' expression
    ;

conditionopt:
    /** empty */
    | condition
    ;

jump_statement:
    CONTINUE ';'
    | BREAK ';'
    | RETURN ';'
    | RETURN expression ';'
    | DISCARD ';'
    ;

subshader_scope_brace:
    scope_brace
    ;

pass_scope_brace:
    scope_brace
    ;

scope_brace:
    '{'
    ;

scope_end_brace:
    '}'
    ;
%%
