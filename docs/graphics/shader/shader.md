---
order: 0
title: 着色器总览
type: 着色器
group: 网格
label: Graphics/Shader
---

在[材质教程](/docs/graphics-material-composition) 中提到，着色器可以编写顶点、片元代码来决定渲染管线输出到屏幕上像素的颜色。

<img src="https://gw.alipayobjects.com/zos/OasisHub/a3f74864-241e-4cd8-9ad4-733c2a0b2cc2/image-20240206153815596.png" alt="image-20240206153815596" style="zoom:50%;" />

本节包含以下相关信息：

- 内置着色器
  - [PBR](/docs/graphics-shader-pbr)
  - [Unlit](/docs/graphics-shader-unlit)
  - [Blinn Phong](/docs/graphics-shader-blinnPhong)
- [自定义着色器](/docs/graphics-shader-custom)
- [Shader Lab](/docs/graphics-shader-lab)


```glsl
const float PI = 3.1415926535897932384626433832795;

uniform vec3 lightDirection;
uniform vec3 lightColour;
uniform vec2 lightBias;
uniform mat4 projectionViewMatrix;

vec3 calcSpecularLighting(vec3 toCamVector, vec3 toLightVector, vec3 normal){
	vec3 reflectedLightDirection = reflect(-toLightVector, normal);
	float specularFactor = dot(reflectedLightDirection , toCamVector);
	specularFactor = max(specularFactor,0.0);
	specularFactor = pow(specularFactor, shineDamper);
	return specularFactor * specularReflectivity * lightColour;
}

void main(void){
	
	vec3 currentVertex = vec3(in_position.x, height, in_position.y);
	vec3 vertex1 = currentVertex + vec3(in_indicators.x, 0.0, in_indicators.y);
	vec3 vertex2 = currentVertex + vec3(in_indicators.z, 0.0, in_indicators.w);
}
```

## 内置着色器

| 类型 | 描述 |
| :-- | :-- |
| [Unlit ](/docs/graphics-material-Unlit) | Unlit 材质适用于烘焙好的模型渲染，她只需要设置一张基本纹理或者颜色，即可展现离线渲染得到的高质量渲染结果，但是缺点是无法实时展现光影交互，因为 Unlit 由纹理决定渲染，不受任何光照影响，可参考 [烘焙教程](/docs/graphics-bake-blender) 和 [导出 Unlit 教程](/docs/graphics-material-Unlit) |
| [Blinn Phong ](/docs/graphics-material-BlinnPhong) | Blinn Phong 材质适用于那些对真实感没有那么高要求的场景，虽然没有遵循物理，但是其高效的渲染算法和基本齐全的光学部分，可以适用很多的场景。 |
| [PBR ](/docs/graphics-material-PBR) | PBR 材质适合需要真实感渲染的应用场景，因为 PBR 是基于物理的渲染，遵循能量守恒，开发者通过调整金属度、粗糙度、灯光等参数，能够保证渲染效果都是物理正确的。 |

以下属性在内置着色器中可以直接使用。

<img src="https://gw.alipayobjects.com/zos/OasisHub/94cf8176-569d-4605-bd73-967b03316c3d/image-20240206173751409.png" alt="image-20240206173751409" style="zoom:50%;" />

| 参数 | 应用 |
| :-- | :-- |
| [isTransparent](/apis/core/#BaseMaterial-isTransparent) | 是否透明。可以设置材质是否透明。如果设置为透明，可以通过 [BlendMode](/apis/core/#BaseMaterial-blendMode) 来设置颜色混合模式。 |
| [alphaCutoff](/apis/core/#BaseMaterial-alphaCutoff) | 透明度裁剪值。可以设置裁剪值，在着色器中，透明度小于此数值的片元将会被裁减，参考 [案例](${examples}blend-mode) |
| [renderFace](/apis/core/#BaseMaterial-renderFace) | 渲染面。可以决定渲染正面、背面、双面。 |
| [blendMode](/apis/core/#BaseMaterial-blendMode) | 颜色混合模式。当设置材质为透明后，可以设置此枚举来决定颜色混合模式，参考 [案例](${examples}blend-mode) |
| [tilingOffset](/apis/core/#BlinnPhongMaterial-tilingOffset) | 纹理坐标的缩放与偏移。是一个 Vector4 数据，分别控制纹理坐标在 uv 方向上的缩放和偏移，参考 [案例](${examples}tiling-offset) |
