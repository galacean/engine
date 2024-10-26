---
title: Custom Shaders
---

There may be some special rendering requirements in the business, such as water flow effects, which need to be implemented through **custom shaders** (Shader).

<playground src="shader-water.ts"></playground>

## Creating Shaders

The [Shader class](/apis/core/#Shader) encapsulates vertex shaders, fragment shaders, shader precompilation, platform precision, and platform differences. Its creation and use are very convenient, and users only need to focus on the shader algorithm itself without worrying about what precision to use or which version of GLSL to write. Here is a simple demo:

```javascript
import { Material, Shader, Color } from "@galacean/engine";

//-- Shader 代码
const vertexSource = `
  uniform mat4 renderer_MVPMat;

  attribute vec3 POSITION; 

  void main() {
    gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
  }
  `;

const fragmentSource = `
  uniform vec4 u_color;

  void main() {
    gl_FragColor = u_color;
  }
  `;

// 创建自定义 shader（整个 runtime 只需要创建一次）
Shader.create("demo", vertexSource, fragmentSource);

// 创建材质
const material = new Material(engine, Shader.find("demo"));
```

`Shader.create()` is used to add the shader to the engine's cache pool, so it only needs to be created once during the entire runtime. After that, it can be repeatedly used through [Shader.find(name)](/apis/galacean/#Shader-find).

> Note: The engine has already pre-created blinn-phong, pbr, shadow-map, shadow, skybox, framebuffer-picker-color, and trail shaders. Users can directly use these built-in shaders and cannot create them with the same name.

In the above example, because we did not upload the `u_color` variable, the fragment output is still black (the default value of the uniform). Next, we will introduce the built-in shader variables of the engine and how to upload custom variables.

## Built-in Shader Variables

Above, we assigned a shader to the material, and the program can start rendering at this point.

> It should be noted that there are two types of variables in shader code: **per-vertex** `attribute` variables and **per-shader** `uniform` variables. (After GLSL300, they are unified as in variables)

The engine has automatically uploaded some commonly used variables, which users can directly use in the shader code, such as vertex data and MVP data. Below are the variables uploaded by default by the engine.

### Vertex Inputs

| Per-vertex Data  | Attribute Name | Data Type |
| :--------------- | :------------- | :-------- |
| Vertex           | POSITION       | vec3      |
| Normal           | NORMAL         | vec3      |
| Tangent          | TANGENT        | vec4      |
| Vertex Color     | COLOR_0        | vec4      |
| Bone Index       | JOINTS_0       | vec4      |
| Bone Weight      | WEIGHTS_0      | vec4      |
| First Texture Coord | TEXCOORD_0 | vec2      |
| Second Texture Coord | TEXCOORD_1 | vec2      |

### Properties

#### Renderer

| Name               | Type | Description             |
| :----------------- | :--- | ----------------------- |
| renderer_LocalMat  | mat4 | Model local coordinate matrix |
| renderer_ModelMat  | mat4 | Model world coordinate matrix |
| renderer_MVMat     | mat4 | Model view matrix       |
| renderer_MVPMat    | mat4 | Model view projection matrix |
| renderer_NormalMat | mat4 | Normal matrix           |

#### Camera

| Name                     | Type      | Description                                                            |
| :----------------------- | :-------- | ---------------------------------------------------------------------- |
| camera_ViewMat           | mat4      | View matrix                                                            |
| camera_ProjMat           | mat4      | Projection matrix                                                      |
| camera_VPMat             | mat4      | View projection matrix                                                 |
| camera_ViewInvMat        | mat4      | Inverse view matrix                                                    |
| camera_Position          | vec3      | Camera position                                                        |
| camera_DepthTexture      | sampler2D | Depth information texture                                              |
| camera_DepthBufferParams | Vec4      | Camera depth buffer parameters: (x: 1.0 - far / near, y: far / near, z: 0, w: 0) |
| camera_ProjectionParams  | Vec4      | Projection matrix parameters: (x: flipProjection ? -1 : 1, y: near, z: far, w: 0) |

#### Time

| Name              | Type | Description                                                      |
| :---------------- | :--- | :--------------------------------------------------------------- |
| scene_ElapsedTime | vec4 | Total time elapsed since the engine started: (x: t, y: sin(t), z: cos(t), w: 0) |
| scene_DeltaTime   | vec4 | Time interval since the last frame: (x: dt, y: 0, z: 0, w: 0)    |

#### Fog

| Name | Type | Description |
| :-- | :-- | :-- |
| scene_FogColor | vec4 | Color of the fog |
| scene_FogParams | vec4 | Fog parameters: (x: -1/(end-start), y: end/(end-start), z: density / ln(2), w: density / sqr(ln(2)) |

## Upload Shader Data

> For uploading per-vertex data, please refer to [Mesh Renderer](/en/docs/graphics/mesh/modelMesh), which will not be repeated here.

In addition to built-in variables, we can upload any custom-named variables in the shader. All we need to do is use the correct interface according to the shader data type. All upload interfaces are stored in [ShaderData](/apis/core/#ShaderData), and the shaderData instance objects are stored in the engine's four main classes: [Scene](/apis/core/#Scene), [Camera](/apis/core/#Camera), [Renderer](/apis/core/#Renderer), and [Material](/apis/core/#Material). We just need to call the interfaces on these shaderData to upload variables, and the engine will automatically assemble these data at the underlying level and perform optimizations such as redundancy checks.

![](https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*ijQMQJM_Vy0AAAAAAAAAAAAADleLAQ/original)

### Benefits of Separating Shader Data

Shader data is stored separately in the engine's four main classes: [Scene](/apis/core/#Scene), [Camera](/apis/core/#Camera), [Renderer](/apis/core/#Renderer), and [Material](/apis/core/#Material). One of the benefits of this approach is that the underlying layer can upload a specific block of uniform data based on the upload timing, improving performance. Additionally, separating material-independent shader data allows for shared materials. For example, two renderers sharing one material can both manipulate the same shader without affecting each other's rendering results because this part of the shader data upload comes from the shaderData of the two renderers.

Example:

```typescript
const renderer1ShaderData = renderer1.shaderData;
const renderer2ShaderData = renderer2.shaderData;
const materialShaderData = material.shaderData;

materialShaderData.setColor("material_color", new Color(1, 0, 0, 1));
renderer1ShaderData.setFloat("u_progross", 0.5);
renderer2ShaderData.setFloat("u_progross", 0.8);
```

### Calling Interfaces

The types of shader data and their respective API calls are as follows:

| Shader Type | ShaderData API |
| :-- | :-- |
| `bool`, `int` | setInt(value: number) |
| `float` | setFloat(value: number) |
| `bvec2`, `ivec2`, `vec2` | setVector2(value: Vector2) |
| `bvec3`, `ivec3`, `vec3` | setVector3(value: Vector3) |
| `bvec4`, `ivec4`, `vec4` | setVector4(value: Vector4) |
| `mat4` | setMatrix(value: Matrix) |
| `float[]`, `vec2[]`, `vec3[]`, `vec4[]`, `mat4[]` | setFloatArray(value: Float32Array) |
| `bool[]`, `int[]`, `bvec2[]`, `bvec3[]`, `bvec4[]`, `ivec2[]`, `ivec3[]`, `ivec4[]` | setIntArray(value: Int32Array) |
| `sampler2D`, `samplerCube` | setTexture(value: Texture) |
| `sampler2D[]`, `samplerCube[]` | setTextureArray(value: Texture[]) |

The code demonstration is as follows:

```glsl
// shader

uniform float u_float;
uniform int u_int;
uniform bool u_bool;
uniform vec2 u_vec2;
uniform vec3 u_vec3;
uniform vec4 u_vec4;
uniform mat4 u_matrix;
uniform int u_intArray[10];
uniform float u_floatArray[10];
uniform sampler2D u_sampler2D;
uniform samplerCube u_samplerCube;
uniform sampler2D u_samplerArray[2];

// GLSL 300:
// in float u_float;
// ...
```

```typescript
// shaderData 可以分别保存在 scene 、camera 、renderer、 material 中。
const shaderData = material.shaderData;

shaderData.setFloat("u_float", 1.5);
shaderData.setInt("u_int", 1);
shaderData.setInt("u_bool", 1);
shaderData.setVector2("u_vec2", new Vector2(1, 1));
shaderData.setVector3("u_vec3", new Vector3(1, 1, 1));
shaderData.setVector4("u_vec4", new Vector4(1, 1, 1, 1));
shaderData.setMatrix("u_matrix", new Matrix());
shaderData.setIntArray("u_intArray", new Int32Array(10));
shaderData.setFloatArray("u_floatArray", new Float32Array(10));
shaderData.setTexture("u_sampler2D", texture2D);
shaderData.setTexture("u_samplerCube", textureCube);
shaderData.setTextureArray("u_samplerArray", [texture2D, textureCube]);
```

> **Note**: For performance considerations, the engine does not currently support struct array uploads or individual element uploads of arrays.

### Macro Switches

In addition to uniform variables, the engine also treats [macro definitions](https://www.wikiwand.com/en/OpenGL_Shading_Language) in shaders as a type of variable. This is because enabling/disabling macro definitions will generate different shader variants, which will also affect the rendering results.

For example, if there are these macro-related operations in the shader:

```glsl
#ifdef DISCARD
	discard;
#endif

#ifdef LIGHT_COUNT
	uniform vec4 u_color[ LIGHT_COUNT ];
#endif
```

They are also controlled through [ShaderData](/apis/core/#Shader-enableMacro):

```typescript
// 开启宏开关
shaderData.enableMacro("DISCARD");
// 关闭宏开关
shaderData.disableMacro("DISCARD");

// 开启变量宏
shaderData.enableMacro("LIGHT_COUNT", "3");

// 切换变量宏。这里底层会自动 disable 上一个宏，即 “LIGHT_COUNT 3”
shaderData.enableMacro("LIGHT_COUNT", "2");

// 关闭变量宏
shaderData.disableMacro("LIGHT_COUNT");
```

## Encapsulating Custom Materials

This section combines all the content above to provide users with a simple encapsulation example. We hope it will be helpful to you:

```typescript
import { Material, Shader, Color, Texture2D, BlendFactor, RenderQueueType } from "@galacean/engine";

//-- Shader 代码
const vertexSource = `
  uniform mat4 renderer_MVPMat;

  attribute vec3 POSITION; 
  attribute vec2 TEXCOORD_0;
  varying vec2 v_uv;

  void main() {
    gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
    v_uv = TEXCOORD_0;
  }
  `;

const fragmentSource = `
  uniform vec4 u_color;
  varying vec2 v_uv;

  #ifdef TEXTURE
    uniform sampler2D u_texture;
  #endif

  void main() {
    vec4 color = u_color;

    #ifdef TEXTURE
      color *= texture2D(u_texture, v_uv);
    #endif

    gl_FragColor = color;

  }
  `;

Shader.create("demo", vertexSource, fragmentSource);

export class CustomMaterial extends Material {
  set texture(value: Texture2D) {
    if (value) {
      this.shaderData.enableMacro("TEXTURE");
      this.shaderData.setTexture("u_texture", value);
    } else {
      this.shaderData.disableMacro("TEXTURE");
    }
  }

  set color(val: Color) {
    this.shaderData.setColor("u_color", val);
  }

  // make it transparent
  set transparent() {
    const target = this.renderState.blendState.targetBlendState;
    const depthState = this.renderState.depthState;

    target.enabled = true;
    target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    depthState.writeEnabled = false;
    this.renderQueueType = RenderQueueType.Transparent;
  }

  constructor(engine: Engine) {
    super(engine, Shader.find("demo"));
  }
}
```
