---
order: 0
title: Device Recovery
type: Resource
label: Device
---

Since the GPU is a shared resource, in some cases, the GPU may revoke control, causing your program to lose the GPU device. The following situations may lead to device loss:

- A page is stuck for too long
- Multiple pages consume too many GPU resources, causing all pages to lose context and only restoring the foreground page
- PC device switches graphics cards or updates graphics card drivers

After the device is lost, the engine will automatically restore all program content at the appropriate time. Users usually do not need to worry about it. When necessary, users can handle device loss and recovery logic through the following mechanisms.

### Handling Loss and Recovery

When the GPU device is lost, the `Engine` will dispatch a `devicelost` event, allowing users to implement logic such as user prompts or saving configurations:

```typescript
engine.on("devicelost", () => {
  // Do some device lost logic here
  // For example，prompt user or save configuration etc
});
```

The engine supports automatic GPU device recovery. When the program can be restored, the `Engine` will dispatch a `devicerestored` event. The engine will automatically rebuild low-level GPU resources such as textures, buffers, and shaders, and attempt to restore their data content automatically. Resources created through methods provided by the engine, such as Loader and PrimitiveMesh, can be fully restored automatically without any manual intervention. Manual handling is only required when developers modify resource content themselves, such as manually modifying the pixel content of a texture.

```typescript
engine.on("devicerestored", () => {
  // Do some device restore logic here
  // For example，restore user-modified texture content
  texture.setPixelBuffer(pixels, 0, offsetX, offsetY, width, height);
});
```

### Custom Recovery

Another scenario is when resources are entirely created by developers, such as custom [Loader](/en/docs/assets-type) or procedurally generated resources. In addition to handling in the `devicerestored` event as mentioned above, custom content recovery can also be achieved by implementing a custom recoveryer. The following example registers a custom recoveryer for a texture created by the user and registers it with the `ResourceManager`. When the device needs to be restored, the `restoreContent` method will automatically trigger and restore its content.

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

> Note: It is not recommended for recoveryer implementations to rely on or consume a large amount of CPU memory.

### Simulating Device Loss and Recovery

In actual projects, the probability of triggering device loss and recovery is small. To facilitate developers in testing the program's performance and logic handling after device loss and recovery, the `Engine` provides built-in methods to simulate device loss and recovery.

| Method                                                     | Description       |
| ---------------------------------------------------------- | ----------------- |
| [forceLoseDevice](/apis/core/#Engine-forceLoseDevice)       | Force device loss |
| [forceRestoreDevice](/apis/core/#Engine-forceRestoreDevice) | Force device recovery |

### References

- "Handling WebGL Context Lost": https://www.khronos.org/webgl/wiki/HandlingContextLost

