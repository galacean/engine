---
order: 5
title: 克隆
type: 核心
label: Core
---


节点克隆是运行时的常用功能，同时节点克隆也会附带克隆其绑定的组件。例如在初始化阶段根据配置动态创建一定数量相同的实体,然后根据逻辑规则摆放到场景不同的位置。这里会对脚本的克隆细节进行详细讲解。

## 实体的克隆
非常简单，直接调用实体的 [clone()](/apis/design/#IClone-clone) 方法即可完成实体以及附属组件的克隆。
```typescript
const cloneEntity = entity.clone();
```

## 脚本的克隆
脚本的本质也是组件，所以当我们调用实体的 [clone()](/apis/design/#IClone-clone) 函数时，引擎不仅会对引擎内置组件进行克隆，还会对自定义脚本进行克隆。引擎内置组件的克隆规则官方已经完成定制，同样我们也将脚本的克隆能力和规则定制开放给了开发者。脚本字段默认的克隆方式为浅拷贝，例如我们对脚本的字段值进行修改后再克隆，克隆后的脚本将保持修改后的值,无需增加任何额外的编码。以下为自定义脚本的克隆案例：
```typescript
// define a custom script
class CustomScript extends Script{
  /** boolean type.*/
  a:boolean = false;
  
  /** number type.*/
  b:number = 1;
  
  /** class type.*/
  c:Vector3 = new Vector3(0,0,0);
}

// Init entity and script
const entity = engine.createEntity();
const script = entity.addComponent(CustomScript);
script.a = true;
script.b = 2;
script.c.set(1,1,1);

// Clone logic
const cloneEntity = entity.clone();
const cloneScript = cloneEntity.getComponent(CustomScript);
console.log(cloneScript.a); // output is true.
console.log(cloneScript.b); // output is 2.
console.log(cloneScript.c); // output is (1,1,1).
```
### 克隆装饰器
除了默认的克隆方式外，引擎还提供了“克隆装饰器“对脚本字段的克隆方式进行定制。引擎内置四种克隆装饰：

| 装饰器名称 | 装饰器释义 |
| :--- | :--- |
| [ignoreClone](/apis/core/#ignoreClone) | 克隆时对字段进行忽略。 |
| [assignmentClone](/apis/core/#assignmentClone) | ( 默认值，和不添加任何克隆装饰器等效) 克隆时对字段进行赋值。如果是基本类型则会拷贝值，如果是引用类型则会拷贝其引用地址。 |
| [shallowClone](/apis/core/#shallowClone) | 克隆时对字段进行浅克隆。克隆后会保持自身引用独立，并使用赋值的方式克隆其内部所有字段（如果内部字段是基本类型则会拷贝值，如果内部字段是引用类型则会拷贝其引用地址）。|
| [deepClone](/apis/core/#deepClone) | 克隆时对字段进行深克隆。克隆后会保持自身引用独立，并且其内部所有深层字段均保持完全独立。|

我们将上面的案例稍加修改,分别对 `CustomScript` 中的四个字段添加了不同的“克隆装饰器“。由于 `shallowClone` 和 `deepCone`  较复杂，我们对字段 `c` 和 `d` 增加了额外的打印输出进行进一步讲解。
```typescript
// define a custom script
class CustomScript extends Script{
  /** boolean type.*/
  @ignoreClone
  a:boolean = false;
  
  /** number type.*/
  @assignmentClone
  b:number = 1;
  
  /** class type.*/
  @shallowClone
  c:Vector3[] = [new Vector3(0,0,0)];
  
  /** class type.*/
  @deepClone
  d:Vector3[] = [new Vector3(0,0,0)];
}

// Init entity and script
const entity = engine.createEntity();
const script = entity.addComponent(CustomScript);
script.a = true;
script.b = 2;
script.c[0].set(1,1,1);
script.d[0].set(1,1,1);

// Clone logic
const cloneEntity = entity.clone();
const cloneScript = cloneEntity.getComponent(CustomScript);
console.log(cloneScript.a); // output is false,ignoreClone will ignore the value.
console.log(cloneScript.b); // output is 2,assignmentClone is just assignment the origin value.
console.log(cloneScript.c[0]); // output is Vector3(1,1,1),shallowClone clone the array shell,but use the same element.
console.log(cloneScript.d[0]); // output is Vector3(1,1,1),deepClone clone the array shell and also clone the element.

cloneScript.c[0].set(2,2,2); // change the field c[0] value to (2,2,2).
cloneScript.d[0].set(2,2,2); // change the field d[0] value to (2,2,2).

console.log(script.c[0]); // output is (2,2,2). bacause shallowClone let c[0] use the same reference with cloneScript's c[0].
console.log(script.d[0]); // output is (1,1,1). bacause deepClone let d[0] use the different reference with cloneScript's d[0].
```
- 注意: 

  - `shallowClone` 和 `deepClone` 通常用于 *Object*、*Array* 和 *Class* 类型。
  - `shallowClone` 克隆后会保持自身引用独立，并使用赋值的方式克隆其内部所有字段（如果内部字段是基本类型则会拷贝值，如果内部字段是引用类型则会拷贝其引用地址）。
  - `deepClone` 为深克隆，会对属性进行深度递归，至于属性的子属性如何克隆，取决于子属性的装饰器。
  - 如果克隆装饰器不能满足诉求，可以通过实现 [_cloneTo()](/apis/design/#IClone-cloneTo) 方法追加自定义克隆。

