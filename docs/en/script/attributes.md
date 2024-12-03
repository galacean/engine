---
order: 4
title: Script Parameters
type: Script
label: Script
---

Script parameters are a very useful feature in the script system. With this feature, you can expose parameters in the script to the editor, allowing them to be configured in the scene editor. You can directly modify various properties of the script in the interface without delving into the code. This intuitive editing method allows non-professional developers to easily debug various states in the script.

## Basic Usage

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

In the above code, we declare a `rotate` property of type `Number` using the `@inspect` decorator and expose it to the editor.

![Property Panel](https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*n22bR7-lZ5QAAAAAAAAAAAAADqiTAQ/original)

## Parameter Types

Currently supported parameter types are:

- `Number`: Number type
- `Input`: Input box
- `Slider`: Slider
- `Boolean`: Boolean type
- `Vector2`: 2D vector
- `Vector3`: 3D vector
- `Vector4`: 4D vector
- `Rect`: Rectangle
- `Color`: Color picker, supports RGBA
- `AssetPicker`: Asset picker
- `Select`: Dropdown selector
- `Textarea`: Multi-line text input box

## Parameter Configuration

The second parameter of the `@inspect` decorator is an object used to configure various properties of the corresponding type parameter. Different parameter types have different options. For example, `Number` and `Slider` have `min` and `max` configurations, and `Select` has `options` configuration. For more configurable properties, you can check [@galaean/editor-decorators](https://www.npmjs.com/package/@galacean/editor-decorators?activeTab=readme). Below, taking the number selector as an example, we introduce the meaning of each configuration.

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
