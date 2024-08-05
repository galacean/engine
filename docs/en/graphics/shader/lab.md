---
order: 5
title: Shader Lab
type: Shader
group: Graphics/Shader
---

`ShaderLab` is a Shader wrapper language designed for the Galacean engine. It allows developers to write custom Shaders using familiar [GLSL](https://www.khronos.org/files/opengles_shading_language.pdf) syntax while providing additional advanced abstractions and management features to enhance development efficiency. Through ShaderLab, developers can more conveniently define material properties, rendering configurations, and other effects. While ShaderLab introduces convenience for writing shaders, it does not replace GLSL but is compatible with it. Developers can write native GLSL code blocks within the ShaderLab framework to enjoy the advantages of both. The workflow for using ShaderLab is as follows:

```mermaid
flowchart LR
   Create Shader --> Edit ShaderLab --> Debug ShaderLab
```

Here is a simple example of using ShaderLab, which includes two Shaders. The `normal` Shader defines a vertex shader that only implements MVP transformation and specifies a fragment shader for pixel color using Uniform variables. Additionally, the `lines` Shader is an example from [shadertoy](https://www.shadertoy.com/view/DtXfDr) transformed using ShaderLab.

<playground src="shader-lab-simple.ts"></playground>

## Create Shader

#### Create in Editor

In the editor, you can add 3 types of ShaderLab templates: Custom, `PBR`, and Shader Fragment.

  <img src="https://mdn.alipayobjects.com/huamei_aftkdx/afts/img/A*MiW5RYzGUhwAAAAAAAAAAAAADteEAQ/original" style="zoom:50%;">

Among them, **Custom** and **`PBR`** are Shader templates written using ShaderLab syntax, while **Shader Fragment** is for convenient code snippet reuse. In ShaderLab, you can use the `include` macro to reference code snippets for later automatic expansion and replacement during the compilation process. See the syntax standard module for detailed usage.

#### Create in Script

Currently, `ShaderLab` is not integrated into the engine's core package. You need to pass the newly created `ShaderLab` object during engine initialization; otherwise, the engine cannot interpret Shaders written using ShaderLab syntax.

1. Initialize `ShaderLab`

```ts
import { ShaderLab } from '@galacean/engine-shaderlab';

const shaderLab = new ShaderLab();
// 使用ShaderLab初始化Engine
const engine = await WebGLEngine.create({ canvas: 'canvas', shaderLab });
```

2. Create Shader

```glsl
// Create Shader directly using ShaderLab
const shader = Shader.create(galaceanShaderCode);
```

## Writing `ShaderLab`

### Edit Shaders in Editor

Double-click on the Shader asset created in the previous step to navigate to the code editing page.

> A Galacean VSCode plugin will be released in future versions, providing syntax checking, auto-completion, and code synchronization features for `ShaderLab`. Stay tuned.

   <img src="https://mdn.alipayobjects.com/huamei_aftkdx/afts/img/A*Djs2RJsoPawAAAAAAAAAAAAADteEAQ/original" style="zoom:50%;">

### Syntax Standards

The syntax skeleton of `ShaderLab` is as follows, with detailed explanations and usage of each module in the following sections.

```glsl
Shader "ShaderName" {
  ...
  SubShader "SubShaderName" {
    ...
    Pass "PassName" {
      ...
    }
    ...
  }
  ...
}
```

#### Shader

```glsl
Shader "ShaderName" {
  ...
  // 全局变量区：变量声明，结构体声明，渲染状态声明，材质属性定义
  ...
  SubShader "SubShaderName" {
    ...
  }
  ...
}
```

In ShaderLab, a `Shader` is a collection encapsulating shader programs and other engine rendering settings related information in the traditional rendering pipeline. It allows defining multiple shader programs within the same `Shader` object and instructs Galacean on how to use them during the rendering process. The `Shader` object has a nested structure containing `SubShader` and `Pass` substructures.

#### Material Property Definition

```glsl
// Uniform
EditorProperties
{
  material_BaseColor("Offset unit scale", Color) = (1,1,1,1);
  ...

  Header("Emissive")
  {
    material_EmissiveColor("Emissive color", Color) = (1,1,1,1);
    ...
  }
  ...
}

// 宏
EditorMacros
{
  [On] UV_OFFSET("UV Offset", Range(1,100)) = 10;
  ...
}
```

This module is used to define the UI display of the material bound to this Shader in the editor Inspector panel. ShaderLab material properties separate macro properties and other Uniform properties using `EditorProperties` and `EditorMacros` for declaration. The declaration format is as follows:

1. Uniform Properties

   ```glsl
   EditorProperties {
     propertyName("label in Inspector", type) [= defaultValue];
     ...
     [ Header("blockName") {
         propertyName("label in Inspector", type) [= defaultValue];
         ...
     } ]
   }
   ```

   > You can use nested `Header` blocks to categorize material properties hierarchically.

   Supported types include

   | Type | Example |
   | :-: | :-- |
   | Bool | propertyName("Property Description", Boolean) = true; |
   | Int | propertyName("Property Description", Int) = 1; <br/>propertyName("Property Description", Range(0,8)) = 1 |
   | Float | propertyName("Property Description", Float) = 0.5; <br/>propertyName("Property Description", Range(0.0, 1.0)) = 0.5; |
   | Texture2D | propertyName("Property Description", Texture2D); |
   | TextureCube | propertyName("Property Description", TextureCube); |
   | Color | propertyName("Property Description", Color) = (0.25, 0.5, 0.5, 1); |
   | Vector2 | propertyName("Property Description", Vector2) = (0.25, 0.5); |
   | Vector3 | propertyName("Property Description", Vector3) = (0.25, 0.5, 0.5); |
   | Vector4 | propertyName("Property Description", Vector4) = (0.25, 0.5, 0.5, 1.0); |

2. Macro Properties

   ```glsl
   EditorMacros {
     [\[Off/On\]] propertyName("label in Inspector"[, type]) [= defaultValue];
     ...
     [ Header("blockName") {
         [\[Off/On\]] propertyName("label in Inspector"[, type]) [= defaultValue];
         ...
     } ]
   }
   ```

   All include enabling and disabling functionality, initialized through the `[On/Off]` directive, with types including

   | Type | Example |
   | :-: | :-- |
   | None (Toggle Macro) | macroName("Macro Description"); |
   | Bool | macroName("Macro Description", Boolean) = true; |
   | Int | macroName("Macro Description", Int) = 1; <br/> macroName("Macro Description", Range(0,8)) = 1; |
   | Float | macroName("Macro Description", Float) = 0.5; <br/> macroName("Macro Description", Range(0.0, 1.0)) = 0.5; |
   | Color | macroName("Macro Description", Color) = (0.25, 0.5, 0.5, 1); |
   | Vector2 | macroName("Macro Description", Vector2) = (0.25, 0.5); |
   | Vector3 | macroName("Macro Description", Vector3) = (0.25, 0.5, 0.5); |
   | Vector4 | macroName("Macro Description", Vector4) = (0.25, 0.5, 0.5, 1.0); |

> Note that the current version of ShaderLab material properties module only defines the Inspector UI panel for the material bound to this Shader in the editor and does not automatically declare corresponding global variables in your `ShaderPass` code. If the variable is referenced in the `ShaderPass` code, it needs to be explicitly declared and supplemented in the global variable module (see below).

#### Global Variables

Four types of global variables can be declared in ShaderLab: RenderState, structs, functions, and single variables.

- RenderState

  Includes BlendState, DepthState, StencilState, RasterState

  - BlendState

    ```glsl
    BlendState {
      Enabled[n]: bool;
      ColorBlendOperation[n]: BlendOperation;
      AlphaBlendOperation[n]: BlendOperation;
      SourceColorBlendFactor[n]: BlendFactor;
      SourceAlphaBlendFactor[n]: BlendFactor;
      DestinationColorBlendFactor[n]: BlendFactor;
      DestinationAlphaBlendFactor[n]: BlendFactor;
      ColorWriteMask[n]: float // 0xffffffff
      BlendColor: vec4;
      AlphaToCoverage: bool;
    }
    ```

[n] can be omitted. When using MRT, [n] specifies a certain MRT rendering state. Omitting it sets all MRT states. BlendOperation and BlendFactor enumerations are equivalent to the engine API.

- DepthState

    ```glsl
    DepthState {
      Enabled: bool;
      WriteEnabled: bool;
      CompareFunction: CompareFunction;
    }
    ```

    CompareFunction enumeration is equivalent to the engine API.

- StencilState

    ```glsl
    StencilState {
      Enabled: bool;
      ReferenceValue: int;
      Mask: float; // 0xffffffff
      WriteMask: float; // 0xffffffff
      CompareFunctionFront: CompareFunction;
      CompareFunctionBack: CompareFunction;
      PassOperationFront: StencilOperation;
      PassOperationBack: StencilOperation;
      FailOperationFront: StencilOperation;
      FailOperationBack: StencilOperation;
      ZFailOperationFront: StencilOperation;
      ZFailOperationBack: StencilOperation;
    }
    ```

    CompareFunction and StencilOperation enumerations are equivalent to the engine API.

- RasterState

    ```glsl
    RasterState {
      CullMode: CullMode;
      DepthBias: float;
      SlopeScaledDepthBias: float;
    }
    ```

    CullMode enumeration is equivalent to the engine API.

Setting `BlendState` in `ShaderLab` example:

```glsl
Shader "Demo" {
    ...
    BlendState customBlendState
    {
      Enabled = true;
      // 常量复制方式
      SourceColorBlendFactor = BlendFactor.SourceColor;
      // 变量赋值方式
      DestinationColorBlendFactor = material_DstBlend;
    }
    ...
    Pass "0" {
      ...
      BlendState = customBlendState;
      ...
    }
  }
```

The above example demonstrates two ways to assign values to the BlendState property: *constant assignment* and *variable assignment*:

- Constant assignment refers to assigning the corresponding engine enumeration variable on the right side of the assignment statement, such as: BlendFactor.SourceColor
- Variable assignment refers to assigning any variable name on the right side of the assignment statement, and the specific value of the variable is specified by the user at runtime through the ShaderData.setInt("material_DstBlend", BlendFactor.SourceColor) API using a script.

- Structs, Functions

  Equivalent to the syntax in glsl.

- Single Variable

  ```glsl
  [lowp/mediump/highp] variableType variableName;
  ```

Similar to other programming languages, global variables in ShaderLab also have scope and name overriding rules. In ShaderLab, the scope of global variables is limited to the SubShader or Pass module in which they are declared. The name overriding rule means that if there is a global variable with the same name inside a Pass, the global variable within the Pass will override the global variable with the same name in the SubShader.

#### SubShader

```glsl
SubShader "SubShaderName" {
  ...
  // 全局变量区：变量声明，结构体声明，渲染状态声明
  ...
  Tags {ReplaceTag = "opaque"}

  UsePass "ShaderName/SubShaderName/PassName"

  Pass "PassName" {
    ...
  }
}
```

A `Shader` object can contain multiple SubShaders, but at least one SubShader. It represents a specific implementation of a rendering pipeline, defining multiple implementation steps (Passes) of a rendering effect. The current SubShader can be specified by custom tags, such as `ReplaceTag`, in conjunction with [`Camera.setReplacementShader`](/apis/core/#Camera) to specify shaders that may need to be replaced.

- `UsePass` Directive

  If a SubShader contains multiple Passes, you can reuse other Pass objects using the `UsePass` directive, such as the built-in PBR Pass: `UsePass "pbr/Default/Forward"`

  | Built-in Shader |         Pass Path         |
  | :-------------: | :-----------------------: |
  |       PBR       |    pbr/Default/Forward    |
  |      Unlit      |   unlit/Default/Forward   |
  |     Skybox      |  skybox/Default/Forward   |
  | Particle-shader | particle-shader/Default/Forward |
  |   SpriteMask    | SpriteMask/Default/Forward |
  |     Sprite      |   Sprite/Default/Forward   |

#### Pass

```glsl
Pass "PassName" {
  Tag {PipelineStage = "ShadowCaster"}

  ...
  // 全局变量区：公共变量声明，结构体声明，函数声明
  ...

  // 渲染管线和渲染状态设置

  // 指定顶点着色器和片元着色器  强调glsl语言
  VertexShader = vert;

  // 指定渲染队列
  RenderQueueType = RenderQueueType.Transparent;
}
```

`Pass` is the basic element of a `Shader` object. A simple shader object may only contain one Pass, but more complex shaders can contain multiple Passes. It defines the operations performed at specific stages of the rendering pipeline, such as shader programs running on the GPU, rendering states, and rendering pipeline-related settings.

- Rendering State Specification

  It can be specified in two ways:

  1. Direct assignment

     ```
     BlendState = blendState;
     ```


  2. Pass declaration in the global variable scope

     ```
     BlendState blendState {
       RenderStateProperty = Value;
     }
     ```

- Uniform variable specification

  Declare directly as a global variable

  ```glsl
  mediump vec4 u_color;
  float material_AlphaCutoff;
  mat4 renderer_ModelMat;
  vec3 u_lightDir;
  ```

- Attribute variable declaration

  Specify through defining the structure of the vertex shader function input parameters

  ```glsl
  struct a2v {
    vec4 POSITION;
  }

  v2f vert(a2v o) {
    ...
  }
  ```

- Varying variable declaration

  Specify through defining the structure of the vertex shader output parameters and the fragment shader input parameters

  ```glsl
  struct v2f {
    vec3 color;
  }

  v2f vert(a2v o) {
    ...
  }
  void frag(v2f i) {
    ...
  }
  ```

- Vertex and fragment shader specification

  Specify the shader entry functions explicitly through `VertexShader` and `FragmentShader`

  ```
  VertexShader = vert;
  FragmentShader = frag;
  ```

- Render queue setting

  Specify through the `RenderQueueType` directive, where `RenderQueueType` is equivalent to the engine API.

  ```
  RenderQueueType = RenderQueueType.Transparent;
  ```

#### `include` macro

For code reuse convenience, in ShaderLab, you can use the `include` macro as shown below for code snippet references, which will be automatically expanded and replaced during the subsequent compilation process.

```glsl
#include "{includeKey}"
```

To enable code snippets to be referenced through the `include` macro, we have 2 ways to declare code snippets:

1. Create shaders / shader fragments in the editor

The `includeKey` of the created code snippet is the file path in the project, such as `/Root/Effect.glsl`

2. Explicitly register code snippets in scripts

```ts
import { ShaderFactory } from '@galacean/engine';

const commonSource = `// shader chunk`;
ShaderFactory.registerInclude('includeKey', commonSource);
```

#### Unsupported GLSL syntax formats currently

1. The 0 before and after the decimal point in floating-point numbers cannot be omitted

   - ❌ `float n = 1. + .9;`
   - ✅ `float n = 1.0 + 0.9;`

2. When assigning a function call return value as a property in a variable assignment statement, the function call needs to be enclosed in parentheses

   - ❌ `float a3 = texture2D(u_texture, (p.xy * 0.4 + um) * u_water_scale).x;`
   - ✅ `float a3 = (texture2D(u_texture, (p.xy * 0.4 + um) * u_water_scale)).x;`

3. If / for conditional statements should not omit "{}" when there is only one line of code after the statement

   - ❌
     ```
     if(dis < EPS || dis > MAX_DIS)
       break;
     ```
   - ✅
     ```
     if(dis < EPS || dis > MAX_DIS) {
       break;
     }
     ```

## Material binding shader

After creating custom shader assets using `ShaderLab`, we can achieve user-defined materials by binding the shader to a newly created material.

<img src="https://mdn.alipayobjects.com/huamei_aftkdx/afts/img/A*tVDOTq0ms2gAAAAAAAAAAAAADteEAQ/original" style="zoom:50%;">

- Reflecting material properties in `ShaderLab`

If we write a `Material Property Definition` module in `ShaderLab`, the properties defined in the module will be exposed in the Inspector panel of the material asset bound with this shader

<img src="https://mdn.alipayobjects.com/huamei_aftkdx/afts/img/A*38UISKqK2WUAAAAAAAAAAAAADteEAQ/original" style="zoom:50%">

## An example of implementing planar shadows using multi-pass technique

<playground src="shader-lab.ts"></playground>

