---
order: 0
title: Device Recovery
type: Resource
label: Device
---

Since the GPU is a shared resource, there are situations where the GPU might reclaim control, causing your program's GPU device to be lost. For example, device loss might occur in the following scenarios:

- A page is stuck for too long
- Multiple pages occupy too many GPU resources, causing all pages to lose context and only the foreground page to recover
- PC switches graphics cards or updates graphics card drivers

After device loss, the engine will automatically recover all content at an appropriate time. Users usually do not need to worry about it. If necessary, users can handle device loss and recovery logic through the following mechanisms.

### Loss and Recovery Handling

When the GPU device is lost, the `Engine` will dispatch a `devicelost` event. Users can perform some user prompts or save configuration logic:

```typescript
engine.on("devicelost", () => {
  // Do some device lost logic here
  // For example，prompt user or save configuration etc
});
```

The engine supports automatic GPU device recovery. When the program can recover, the `Engine` will dispatch a `devicerestored` event. The engine will automatically rebuild textures, buffers, shaders, and other low-level GPU resources and will attempt to automatically restore their data content. Resources created through the engine's Loader and PrimitiveMesh methods can usually fully recover their content automatically, and developers do not need to do anything. Only when developers manually modify resource content, such as manually modifying the texture's pixel content, do they need to handle it manually.

```typescript
engine.on("devicerestored", () => {
  // Do some device restore logic here
  // For example，restore user-modified texture content
  texture.setPixelBuffer(pixels, 0, offsetX, offsetY, width, height);
});
```

### Custom Restorer

Another situation is when resources are entirely created by the developer, such as custom [Loader](/en/docs/assets/custom) or programmatically generated resources. Besides handling it in the `devicerestored` event as mentioned above, you can also implement a custom content restorer. The following example registers a custom restorer for a user-created texture and registers it with the `ResourceManager`. When the device needs to be restored, the `restoreContent` method will automatically trigger and restore its content.

```typescript
// Step 1: Define content restorer
export class CustomTextureContentRestorer extends ContentRestorer<Texture2D> {
  /**
   * Constructor of CustomTextureContentRestorer.
   * @param resource - Texture2D resource
   * @param url - Texture2D content source url
   */
  constructor(resource: Texture2D, public url: string) {
    super(resource);
  }

  /**
   * @override
   */
  restoreContent(): AssetPromise<Texture2D> | void {
    return request<HTMLImageElement>(this.url).then((image) => {
      const resource = this.resource;
      resource.setImageSource(image);
      resource.generateMipmaps();
      return resource;
    });
  }
}

// Step 2: Register Content Restorer
resourceManager.addContentRestorer(
  new CustomTextureContentRestorer(texture, url)
);
```

> Note: It is not recommended for the restorer implementation to rely on and occupy a large amount of CPU memory.

### Simulating Device Loss and Recovery

In actual projects, the probability of triggering device loss and recovery is relatively low. To facilitate developers in testing the program's performance and logic handling after device loss and recovery, the `Engine` provides built-in methods to simulate device loss and recovery.

| Method                                                      | Description  |
| ----------------------------------------------------------- | ------------ |
| [forceLoseDevice](/en/apis/core/#Engine-forceLoseDevice)    | Force device loss |
| [forceRestoreDevice](/en/apis/core/#Engine-forceRestoreDevice) | Force device recovery |

### References

- "WebGL Handling Context Lost": https://www.khronos.org/webgl/wiki/HandlingContextLost

