---
order: 4
title: Resource Release
type: Resource Workflow
label: Resource
---

To avoid reloading resources repeatedly, once a resource is loaded, it will be cached in the _ResourceManager_. The cache itself consumes memory and video memory. When developers no longer need the cached content, they need to manually release the cached content.

> Note: Resources are interdependent.

For example, the entity shown in the diagram below contains a [MeshRenderer](/apis/core/#MeshRenderer) component, which depends on a [Material](/apis/core/#Material). _Material_ may be referenced by multiple _MeshRenderers_. If _Material_ is released, other _MeshRenderers_ that reference it will not be able to find the _Material_ and will throw an error.

![image.png](https://gw.alipayobjects.com/mdn/mybank_yulibao/afts/img/A*wXmqRIwqI18AAAAAAAAAAAAAARQnAQ)

> Note: JavaScript cannot track object references. In weakly-typed languages like JavaScript, developers are not provided with memory management capabilities. All object memory is managed through garbage collection, and you cannot determine when an object will be released. Therefore, there is no [destructor](https://en.wikipedia.org/wiki/Destructor) to call for releasing referenced resources.

`ResourceManager` provides a reference-counting-based resource release system, and developers need to manually call [gc](/apis/core/#ResourceManager-gc):

```typescript
engine.resourceManager.gc();
```

## Verify Resource Release

If you need to verify whether the resources have been released successfully, follow these steps and open the following example on a blank page:

<playground src="assets-gc.ts"></playground>

In this example, when initialized, a `Texture2D` and a `Sprite` are created to render a 2D sprite. After clicking the GC button in the top right corner, the `root` node is destroyed, and the reference counts of the texture and sprite assets are cleared. At this point, these assets will be truly destroyed. Taking memory snapshots before and after `gc` can help you better understand this process:

1. Before `gc`: **Developer Tools** -> **Memory** -> **Take Heap Snapshot**
2. After `gc`: **Developer Tools** -> **Memory** -> **Take Heap Snapshot** -> **Compare** -> **Select the snapshot before gc**

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*CtRmTqXDgt0AAAAAAAAAAAAADhuCAQ/original" alt="image-1" style="zoom:50%;" />

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*E5PwQ7ocw2EAAAAAAAAAAAAADhuCAQ/original" alt="image-1" style="zoom:50%;" /> 

{ /*examples*/ }
