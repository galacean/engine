---
order: 5
title: Clone
type: Core
label: Core
---


Node cloning is a common feature at runtime, and cloning a node will also clone the components bound to it. For example, during initialization, create a certain number of identical entities dynamically based on configuration, and then place them in different positions in the scene according to logical rules. Here, we will provide a detailed explanation of the cloning details of scripts.

## Entity Cloning
It's very simple, just call the [clone()](/apis/design/#IClone-clone) method of the entity to complete the cloning of the entity and its attached components.
```typescript
const cloneEntity = entity.clone();
```

## Script Cloning
Since scripts are essentially components, when we call the [clone()](/apis/design/#IClone-clone) function of an entity, the engine will not only clone the built-in components but also clone custom scripts. The cloning rules for built-in components have been customized by the official, and similarly, we have opened up the cloning capability and rules for scripts to developers. The default cloning method for scripts is shallow copy. For example, if we modify the field values of a script and then clone it, the cloned script will retain the modified values without the need for any additional coding. Here is an example of cloning a custom script:
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
### Clone Decorators
In addition to the default cloning method, the engine also provides "clone decorators" to customize the cloning method of script fields. There are four built-in clone decorators:

| Decorator Name | Decorator Description |
| :--- | :--- |
| [ignoreClone](/apis/core/#ignoreClone) | Ignore the field during cloning. |
| [assignmentClone](/apis/core/#assignmentClone) | (Default, equivalent to not adding any clone decorators) Assign the field during cloning. If it is a primitive type, it will copy the value; if it is a reference type, it will copy the reference address. |
| [shallowClone](/apis/core/#shallowClone) | Perform shallow cloning of the field during cloning. After cloning, it will maintain its own reference independently and clone all its internal fields using the assignment method (copying the value for primitive types and copying the reference address for reference types). |
| [deepClone](/apis/core/#deepClone) | Perform deep cloning of the field during cloning. After cloning, it will maintain its own reference independently, and all its deep internal fields will remain completely independent. |

We slightly modified the above example and added different "clone decorators" to the four fields in `CustomScript`. Since `shallowClone` and `deepClone` are more complex, we added additional print outputs for fields `c` and `d` for further explanation.
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
- Note:

  - `shallowClone` and `deepClone` are usually used for *Object*, *Array*, and *Class* types.
  - `shallowClone` maintains its own reference independently after cloning and clones all its internal fields using the assignment method (copying the value for primitive types and copying the reference address for reference types).
  - `deepClone` performs deep cloning, recursively cloning properties, and how the sub-properties of properties are cloned depends on the decorators of the sub-properties.
  - If the clone decorators do not meet the requirements, you can append custom cloning by implementing the [_cloneTo()](/apis/design/#IClone-cloneTo) method. 


