# Loader 资产后缀名

> 数据来源:`packages/loader/src/*Loader.ts` 的 `@resourceLoader` 装饰器。共 25 个 loader,37 个后缀名(去重后 `mesh` 只算一个)。

## 分类说明

### 模型/场景
3D 资源入口:场景、预制体、项目、glTF 模型、网格。
```
.gltf
.glb
.mesh
.prefab
.project
.scene
```

### 纹理
2D 贴图、立方体贴图、压缩纹理。
```
.tex
.png
.jpg
.jpeg
.webp
.hdr
.ktx
.ktx2
```

### 材质
材质资源。
```
.mat
```

### 物理材质
物理材质资源。
```
.physMat
```

### 动画
动画片段、动画控制器。
```
.anim
.animCtrl
```

### 环境光照
环境光贴图、渲染目标。
```
.ambLight
.renderTarget
```

### 着色器
着色器代码。
```
.shader
.shaderc
```

### 字体
位图字体、源字体。
```
.font
.ttf
.otf
.woff
```

### 精灵/UI
精灵图、图集。
```
.sprite
.atlas
```

### 音频
音频文件。
```
.mp3
.ogg
.wav
.m4a
.aac
.flac
```

### 数据/通用
JSON、文本、二进制缓冲。
```
.json
.txt
.bin
```

## 全部(comma-separated)

```
.aac,.ambLight,.anim,.animCtrl,.atlas,.bin,.flac,.gltf,.glb,.hdr,.jpg,.jpeg,.json,.ktx,.ktx2,.m4a,.mat,.mesh,.mp3,.ogg,.otf,.physMat,.png,.prefab,.project,.renderTarget,.scene,.shader,.shaderc,.sprite,.tex,.ttf,.txt,.wav,.webp,.woff,.font
```
