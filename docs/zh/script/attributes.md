---
order: 4
title: 脚本参数
type: 脚本
label: Script
---

脚本参数是脚本系统中一个非常实用的功能。使用此功能，你可以将脚本中的参数暴露给编辑器，从而可以在场景编辑器中进行配置。你可以直接在界面上修改脚本的各项属性，而无需深入代码进行修改。这种直观的编辑方式可以让非专业开发人员也能够便捷的调试脚本中的各种状态。

## 基本用法

```typescript
import { Script } from '@galacean/engine';
import { inspect } from "@galacean/editor-decorators";

export default class extends Script {
  @inspect('Number')
  rotate = 1;

  onUpdate(deltaTime: number) {
    this.entity.transform.rotate(this.rotate, this.rotate, this.rotate);
  }
}
```

在上面的代码中，我们借助 `@inspect` 装饰器声明了一个类型为 `Number` 的 `rotate` 属性，并且将其暴露给了编辑器。

![属性面板](https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*n22bR7-lZ5QAAAAAAAAAAAAADqiTAQ/original)

## 参数类型

目前支持的参数类型有：

- `Number`：数字类型
- `Input`：输入框
- `Slider`：滑动条
- `Boolean`：布尔类型
- `Vector2`：二维向量
- `Vector3`：三维向量
- `Vector4`：四维向量
- `Rect`：矩形
- `Color`：颜色选择器，支持 RGBA
- `AssetPicker`：资源选择器
- `Select`：下拉选择器
- `Textarea`：多行文本输入框

## 参数配置

`@inspect` 装饰器的第二个参数是一个对象，用于配置所对应类型参数的各项属性。不同的参数类型对应的选项是不同的。比如 `Number` 和 `Slider` 具有 `min` `max` 配置，`Select` 有 `options` 配置。 想要了解更多的可配置属性可以查看 [@galaean/editor-decorators](https://www.npmjs.com/package/@galacean/editor-decorators?activeTab=readme) 。下面以数字选择器为例，介绍一下各项配置的含义。

```typescript
import { Script } from '@galacean/engine';
import { inspect } from "@galacean/editor-decorators";

export default class extends Script {
  @inspect('Number', {
    min: 0, // 最小值
    max: 10, // 最大值
    dragStep: 0.1, // 拖拽步长
    property: 'rotate', // 对应到引擎对象的属性名，默认为装饰器所修饰的属性名
    label: 'Rotate', // 在检查器面板中显示的名称，默认为装饰器所修饰的属性名
    info: 'Rotate speed', // 在检查器面板中显示的描述信息
  })
  rotate = 1;

  onUpdate(deltaTime: number) {
    this.entity.transform.rotate(this.rotate, this.rotate, this.rotate);
  }
}
```

