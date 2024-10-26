---
title: 脚本使用
---

编辑器导出的材质只有 [Material](/apis/core/#Material) 基础类，而通过代码可以创建引擎已经封装好的 [PBRMaterial](/apis/core/#PBRMaterial)，[UnlitMaterial](/apis/core/#UnlitMaterial)，[BlinnPhongMaterial](/apis/core/#BlinnPhongMaterial)。

## 获取材质

### 1. 从已有 renderer 中获取

```typescript
// 获取想要修改的 renderer
const renderer = entity.getComponent(MeshRenderer);

// 或者获取所有 renderer
const renderers = [];
entity.getComponentsIncludeChildren(MeshRenderer, renderers);

// 通过 `getMaterial` 获取当前 renderer 的第 i 个材质, 默认第 0 个。
const material = renderer.getMaterial();
```

### 2. 替换 renderer 中的材质

我们也可以直接替换材质类型，比如将模型重新赋予一个 PBR 材质：

```typescript
// 获取想要修改的 renderer
const renderer = entity.getComponent(MeshRenderer);

// 创建材质
const material = new PBRMaterial(engine);

// 通过 `setMaterial` 设置当前 renderer 的第 i 个材质, 默认第 0 个。
const material = renderer.setMaterial(material);
```

### 3. 创建内置材质

```typescript
const pbrMaterial = new PBRMaterial(engine);
const bpMaterial = new BlinnPhongMaterial(engine);
const unlitMaterial = new UnlitMaterial(engine);
```

### 4. 创建自定义材质

```typescript
// Shader.create 的具体步骤参考着色器教程
const customMaterial = new Material(engine, Shader.find("***"));
```

## 修改材质

### 1. 修改内置材质

```typescript
// 设置透明，引擎已经封装好对应渲染状态的设置
pbrMaterial.isTransparent = true;
// 设置透明度
pbrMaterial.baseColor.a = 0.5;
// 金属、粗糙度等其他配置
pbrMaterial.metallic = 1;
pbrMaterial.baseTexture = **;
```

### 2. 修改自定义材质

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
