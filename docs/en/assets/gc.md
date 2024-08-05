---
order: 4
title: Releasing Assets
type: Asset Workflow
label: Resource
---

To avoid loading resources repeatedly, once a resource is loaded, it is cached in the _ResourceManager_. The cache itself occupies memory and video memory, so when developers no longer need the cached content, they need to manually release the cached content.

> Note: Resources are interdependent.

For example, the entity shown in the figure below contains a [MeshRenderer](/en/apis/core/#MeshRenderer) component, which depends on [Material](/en/apis/core/#Material). _Material_ may be referenced by multiple _MeshRenderers_. If _Material_ is released, other _MeshRenderers_ that reference it will not be able to find the _Material_ and will report an error.

![image.png](https://gw.alipayobjects.com/mdn/mybank_yulibao/afts/img/A*wXmqRIwqI18AAAAAAAAAAAAAARQnAQ)

> Note: JavaScript cannot track object references. Generally, in weakly typed languages like JavaScript, memory management functions are not provided to developers. All object memory is managed through garbage collection mechanisms, and you cannot determine when an object will be released, so there is no [destructor](https://zh.wikipedia.org/wiki/%E8%A7%A3%E6%A7%8B%E5%AD%90) to call for releasing referenced resources.

`ResourceManager` provides a set of resource releases based on reference counting, which requires developers to manually call [gc](/en/apis/core/#ResourceManager-gc):

```typescript
engine.resourceManager.gc();
```

## Verifying Asset Release

If you need to verify whether assets have been successfully released, you can follow the steps below and open the following example on a blank page:

<playground src="assets-gc.ts"></playground>

In this example, `Texture2D` and `Sprite` are created to render 2D sprites during initialization. When you click the GC button in the upper right corner, the `root` node is destroyed, and the reference counts of the texture and sprite assets are cleared. At this point, these assets will be truly destroyed. Taking memory snapshots before and after `gc` can give a more intuitive understanding of this process.

1. Before gc: **Developer Tools** -> **Memory** -> **Take Heap Snapshot**
2. After gc: **Developer Tools** -> **Memory** -> **Take Heap Snapshot** -> **Compare** -> **Select Snapshot Before gc**

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*CtRmTqXDgt0AAAAAAAAAAAAADhuCAQ/original" alt="image-1" style="zoom:50%;" />

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*E5PwQ7ocw2EAAAAAAAAAAAAADhuCAQ/original" alt="image-1" style="zoom:50%;" />
