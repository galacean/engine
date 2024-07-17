---
order: 3
title: Script Usage
type: Material
group: Mesh
label: Graphics/Material
---

The materials exported by the editor only include the basic [Material](/apis/core/#Material) class, while you can create the engine's pre-packaged [PBRMaterial](/apis/core/#PBRMaterial), [UnlitMaterial](/apis/core/#UnlitMaterial), [BlinnPhongMaterial](/apis/core/#BlinnPhongMaterial) through code.

## Get Material

### 1. Get from an existing renderer

```typescript
// 获取想要修改的 renderer
const renderer = entity.getComponent(MeshRenderer);

// 或者获取所有 renderer
const renderers = [];
entity.getComponentsIncludeChildren(MeshRenderer, renderers);

// 通过 `getMaterial` 获取当前 renderer 的第 i 个材质, 默认第 0 个。
const material = renderer.getMaterial();
```

### 2. Replace the material in the renderer

You can also directly replace the material type, for example, assign a PBR material to a model:

```typescript
// 获取想要修改的 renderer
const renderer = entity.getComponent(MeshRenderer);

// 创建材质
const material = new PBRMaterial(engine);

// 通过 `setMaterial` 设置当前 renderer 的第 i 个材质, 默认第 0 个。
const material = renderer.setMaterial(material);
```

### 3. Create built-in materials

```typescript
const pbrMaterial = new PBRMaterial(engine);
const bpMaterial = new BlinnPhongMaterial(engine);
const unlitMaterial = new UnlitMaterial(engine);
```

### 4. Create custom materials

```typescript
// Refer to the shader tutorial for the specific steps of Shader.create
const customMaterial = new Material(engine, Shader.find("***"));
```

## Modify Material

### 1. Modify built-in materials

```typescript
// 设置透明，引擎已经封装好对应渲染状态的设置
pbrMaterial.isTransparent = true;
// 设置透明度
pbrMaterial.baseColor.a = 0.5;
// 金属、粗糙度等其他配置
pbrMaterial.metallic = 1;
pbrMaterial.baseTexture = **;
```

### 2. Modify custom materials

```typescript
const shaderData = material.shaderData;
// 获取想要设置的着色器数据
const baseColor = shaderData.setFloat("material_BaseColor");

// 修改着色器数据
baseColor.a = 0.5;
shaderData.setTexture("material_BaseTexture", texture);
shaderData.enable("MATERIAL_HAS_BASETEXTURE");
// 更多的着色器操作，详见着色器文档
```
