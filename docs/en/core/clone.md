---
order: 5
title: Clone
type: Core
label: Core
---

Node cloning is a common runtime feature, and node cloning also includes cloning its bound components. For example, during the initialization phase, dynamically create a certain number of identical entities based on configuration, and then place them in different positions in the scene according to logical rules. Here, the details of script cloning will be explained in detail.

## Entity Cloning
It's very simple, just call the entity's [clone()](/en/apis/design/#IClone-clone) method to complete the cloning of the entity and its attached components.
```typescript
const cloneEntity = entity.clone();
```

## Script Cloning
Scripts are essentially components, so when we call the entity's [clone()](/en/apis/design/#IClone-clone) function, the engine will not only clone the built-in components but also clone custom scripts. The cloning rules for built-in components have been customized by the official team, and similarly, we have also opened up the cloning capabilities and rules for scripts to developers. The default cloning method for script fields is shallow copy. For example, if we modify the field values of the script and then clone it, the cloned script will retain the modified values without any additional coding. Below is an example of custom script cloning:
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
In addition to the default cloning method, the engine also provides "clone decorators" to customize the cloning method for script fields. The engine has four built-in clone decorators:

| Decorator Name | Decorator Description |
| :--- | :--- |
| [ignoreClone](/en/apis/core/#ignoreClone) | Ignore the field during cloning. |
| [assignmentClone](/en/apis/core/#assignmentClone) | (Default value, equivalent to not adding any clone decorator) Assign the field during cloning. If it is a basic type, the value will be copied; if it is a reference type, the reference address will be copied. |
| [shallowClone](/en/apis/core/#shallowClone) | Shallow clone the field during cloning. After cloning, it will maintain its own independent reference and clone all its internal fields by assignment (if the internal field is a basic type, the value will be copied; if the internal field is a reference type, the reference address will be copied). |
| [deepClone](/en/apis/core/#deepClone) | Deep clone the field during cloning. After cloning, it will maintain its own independent reference, and all its internal deep fields will remain completely independent. |

We slightly modify the above example and add different "clone decorators" to the four fields in `CustomScript`. Since `shallowClone` and `deepClone` are more complex, we add additional print output to the fields `c` and `d` for further explanation.
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
  - `shallowClone` will maintain its own independent reference after cloning and clone all its internal fields by assignment (if the internal field is a basic type, the value will be copied; if the internal field is a reference type, the reference address will be copied).
  - `deepClone` is a deep clone that will recursively clone the properties deeply. How the sub-properties of the properties are cloned depends on the decorators of the sub-properties.
  - If the clone decorators do not meet the requirements, you can implement the [_cloneTo()](/en/apis/design/#IClone-cloneTo) method to add custom cloning.
