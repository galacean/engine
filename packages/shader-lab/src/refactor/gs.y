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

%token Vector2
%token Vector3
%token Vector4
%token Color

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

%token TODO

/** TODO: 需要再lexer新增规则 */
%token string_const 

%%
gl_shader_program:
    shader string_const '{' gl_shader_global_declaration_list '}'
    ;

gl_editor_prop_declaration:
    EditorProperties '{' /** TODO */ TODO '}'
    ;

gl_editor_macro_declaration:
    EditorMacros '{' /** TODO */ TODO '}'
    ;

gl_common_global_declaration:
    gl_variable_declaration
    | gl_render_queue_assignment
    | gl_render_state_assignment
    | struct_specifier
    | function_definition
    | gl_render_state_declaration
    ;

// 此外还包含变量声明、函数声明、渲染状态声明、结构体声明
gl_shader_global_declaration:
    gl_common_global_declaration
    | gl_editor_prop_declaration
    | gl_editor_macro_declaration
    | gl_subshader_program
    ;

gl_shader_global_declaration_list:
    gl_shader_global_declaration
    | gl_shader_global_declaration_list gl_shader_global_declaration
    ;


gl_subshader_program:
    subshader string_const subshader_scope_brace gl_subshader_global_declaration_list scope_end_brace
    ;

gl_subshader_global_declaration_list:
    gl_subshader_global_declaration
    | gl_subshader_global_declaration_list gl_subshader_global_declaration
    ;

gl_subshader_global_declaration:
    gl_common_global_declaration
    | gl_tag_specifier
    | gl_pass_program
    | gl_use_pass_declaration
    ;

gl_tag_specifier:
    tags '{' gl_tag_assignment_list  '}';

gl_tag_assignment_list:
    /** empty */
    | gl_tag_assignment
    | gl_tag_assignment_list ',' gl_tag_assignment
    ;

gl_tag_assignment:
    gl_tag_id '=' gl_tag_value
    ;

gl_tag_id:
    /** 待补充 */
    ReplacementTag
    | LightMode
    | pipeline_stage
    ;

// TODO: 需确认
gl_tag_value:
    string_const
    | INT_CONSTANT
    | true
    | false
    ;

gl_pass_program:
    pass string_const pass_scope_brace gl_pass_global_declaration_list scope_end_brace
    ;

gl_pass_global_declaration_list:
    gl_pass_global_declaration
    | gl_pass_global_declaration_list gl_pass_global_declaration
    ;

gl_pass_global_declaration:
    gl_common_global_declaration
    | gl_main_shader_assignment
    | gl_tag_specifier
    // 精度声明
    | precision_specifier
    ;

gl_use_pass_declaration:
    UsePass string_const
    ;

gl_render_state_declarator:
    blend_state
    | depth_state
    | stencil_state
    | raster_state
    ;

gl_render_state_assignment:
    gl_render_state_declarator '=' id ';'
    | gl_render_state_declarator '{' gl_render_state_prop_list '}'
    ;

gl_render_state_declaration:
    gl_render_state_declarator id '{' gl_render_state_prop_list '}'
    ;

gl_render_state_prop_list:
    gl_render_state_prop_assignment
    | gl_render_state_prop_assignment gl_render_state_prop_list
    ;

// 语义分析检测key值
gl_render_state_prop_assignment:
    gl_render_state_prop '=' id ';'
    gl_render_state_prop '=' true ';'
    gl_render_state_prop '=' false ';'
    gl_render_state_prop '=' INT_CONSTANT ';'
    gl_render_state_prop '=' FLOAT_CONSTANT ';'
    gl_render_state_prop '=' id '.' id ';'
    gl_render_state_prop '=' gl_engine_type_init ';'
    ;

// TODO: 补充
gl_engine_type:
    Vector2
    | Vector3
    | Vector4
    | Color
    ;

gl_engine_type_init:
    gl_engine_type '(' gl_engine_type_init_param_list ')'
    ;

gl_engine_type_init_param_list:
    INT_CONSTANT
    | FLOAT_CONSTANT
    | gl_engine_type_init_param_list ',' INT_CONSTANT
    | gl_engine_type_init_param_list ',' FLOAT_CONSTANT
    ;

gl_render_state_prop:
    id '[' INT_CONSTANT ']'
    | id
    ;

gl_mian_shader_entry:
    VertexShader
    | FragmentShader
    ;

gl_main_shader_assignment:
    gl_mian_shader_entry '=' id ';'
    ;

gl_render_queue_assignment:
    render_queue_type '=' id ';'
    ;

// 语义分析检查id类型，比如BlendFactor/RenderQueueType
gl_variable_declaration:
    fully_specified_type id ';'
    | render_queue_type id;
    ;

// 语义分析声明检查
variable_identifier:
    id
    ;

precision_specifier:
    // 精度声明
    PRECISION precision_qualifier ext_builtin_type_specifier_nonarray ';'
    ;

// TODO: more
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

// TODO: current
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
    // interface block #4.3.7 ，引擎暂不支持
    | type_qualifier id '{' struct_declaration_list '}' ';'
    | type_qualifier id '{' struct_declaration_list '}' id ';'
    | type_qualifier id '{' struct_declaration_list '}' id array_specifier ';'
    // invariant qualifier #4.6.1
    | type_qualifier id ';'
    | type_qualifier id identifier_list ';'
    ;

/* interface_block:
    type_qualifier */

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

// dangling else ambiguity
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
