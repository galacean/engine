---
order: 4
title: Script Parameters
type: Script
label: Script
---

Script parameters are a very useful feature in the script system. With this feature, you can expose parameters in the script to the editor, allowing you to configure them in the scene editor. You can directly modify various properties of the script on the interface without the need to delve into the code. This intuitive editing method allows non-professional developers to easily debug various states in the script.

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

In the above code, we use the `@inspect` decorator to declare a property named `rotate` of type `Number` and expose it to the editor.

![Properties Panel](https://mdn.alipayobjects.com/huamei_fvsq9p/afts/img/A*n22bR7-lZ5QAAAAAAAAAAAAADqiTAQ/original)

## Parameter Types

Currently supported parameter types are:

- `Number`: Number type
- `Input`: Input box
- `Slider`: Slider
- `Boolean`: Boolean type
- `Vector2`: Two-dimensional vector
- `Vector3`: Three-dimensional vector
- `Vector4`: Four-dimensional vector
- `Rect`: Rectangle
- `Color`: Color picker, supports RGBA
- `AssetPicker`: Asset picker
- `Select`: Dropdown selector
- `Textarea`: Multi-line text input box

## Parameter Configuration

The second parameter of the `@inspect` decorator is an object used to configure various properties of the corresponding type of parameter. Different parameter types have different options. For example, `Number` and `Slider` have `min` and `max` configurations, while `Select` has an `options` configuration. To learn more about the configurable properties, you can refer to [@galaean/editor-decorators](https://www.npmjs.com/package/@galacean/editor-decorators?activeTab=readme). Below is an example using a number selector to explain the meanings of various configurations.

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
