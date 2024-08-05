---
order: 4
title: Custom Loader
type: Asset Workflow
label: Resource
---

Users can also create custom loaders to load custom resources:

```typescript
@resourceLoader(FBX, ["fbx"])
export class FBXLoader extends Loader<FBXResource> {
	load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<FBXResource> {
  	return new AssetPromise((resolve, reject)=> {
    	...
    })
  }
}
```

1. Use the [@resourceLoader](/en/apis/core/#resourceLoader) decorator to mark it as a _ResourceLoader_, passing in the type enum and the resource suffix to be parsed. In the example above, `FBX` is the type enum, and `["fbx"]` is the suffix of the resource to be parsed.
2. Override the [load](/en/apis/core/#ResourceManager-load) method. The `load` method will receive `loadItem` and `resourceManager`. `loadItem` contains the basic information of the load, and `resourceManager` can help load other referenced resources.
3. Return an [AssetPromise](/en/apis/core/#AssetPromise) object. `resolve` the parsed resource result, for example, FBX returns a specific `FBXResource`.
4. If there is an error, `reject` the error.

## Reference

<playground src="obj-loader.ts"></playground>
