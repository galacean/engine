# Background System

The Background system in Galacean Engine provides comprehensive scene background rendering capabilities. It supports multiple background modes including solid colors, skyboxes, and textures, allowing developers to create immersive visual environments.

## Overview

The Background system is integrated into the Scene class and provides three main rendering modes:
- **SolidColor**: Simple solid color backgrounds
- **Sky**: Advanced skybox rendering with materials
- **Texture**: 2D texture backgrounds with flexible fill modes

## Background Modes

### SolidColor Mode

The simplest background mode that renders a solid color across the entire viewport:

```typescript
import { BackgroundMode, Color } from "@galacean/engine";

// Access scene background
const background = scene.background;

// Set solid color mode
background.mode = BackgroundMode.SolidColor;

// Configure color (RGBA values from 0-1)
background.solidColor.set(0.2, 0.4, 0.8, 1.0); // Blue background
background.solidColor = new Color(0.1, 0.1, 0.1, 1.0); // Dark gray

// Common color presets
background.solidColor = Color.BLACK;
background.solidColor = Color.WHITE;
background.solidColor = new Color(0.05, 0.05, 0.05, 1.0); // Default engine color
```

### Sky Mode

Advanced skybox rendering using Sky materials for realistic environmental backgrounds:

```typescript
import { BackgroundMode, SkyBoxMaterial, TextureCube } from "@galacean/engine";

// Set sky mode
background.mode = BackgroundMode.Sky;

// Method 1: Using SkyBoxMaterial with cube texture
const skyMaterial = new SkyBoxMaterial(engine);
const cubeTexture = await engine.resourceManager.load<TextureCube>({
  urls: [
    "px.jpg", "nx.jpg", // Positive/Negative X
    "py.jpg", "ny.jpg", // Positive/Negative Y  
    "pz.jpg", "nz.jpg"  // Positive/Negative Z
  ],
  type: AssetType.TextureCube
});
skyMaterial.texture = cubeTexture;
background.sky.material = skyMaterial;

// Method 2: Using procedural sky
const proceduralSky = new SkyProceduralMaterial(engine);
proceduralSky.sunSize = 0.04;
proceduralSky.sunSizeConvergence = 5;
proceduralSky.atmosphereThickness = 1.0;
proceduralSky.skyTint = new Color(0.5, 0.5, 0.5, 1.0);
proceduralSky.groundColor = new Color(0.369, 0.349, 0.341, 1.0);
background.sky.material = proceduralSky;

// Custom sky mesh (optional)
const skyMesh = await engine.resourceManager.load<ModelMesh>("custom-sky.mesh");
background.sky.mesh = skyMesh;
```

### Texture Mode

2D texture backgrounds with flexible scaling and positioning options:

```typescript
import { BackgroundMode, BackgroundTextureFillMode, Texture2D } from "@galacean/engine";

// Set texture mode
background.mode = BackgroundMode.Texture;

// Load and set background texture
const backgroundTexture = await engine.resourceManager.load<Texture2D>({
  url: "background.jpg",
  type: AssetType.Texture2D
});
background.texture = backgroundTexture;

// Configure fill mode
background.textureFillMode = BackgroundTextureFillMode.AspectFitHeight; // Default
```

## Texture Fill Modes

The texture fill mode determines how the background texture is scaled and positioned:

### AspectFitWidth
Maintains aspect ratio and scales texture width to match canvas width, centering vertically:

```typescript
background.textureFillMode = BackgroundTextureFillMode.AspectFitWidth;
// Best for: Wide textures, landscape orientations
// Result: Texture width = Canvas width, height scaled proportionally
```

### AspectFitHeight  
Maintains aspect ratio and scales texture height to match canvas height, centering horizontally:

```typescript
background.textureFillMode = BackgroundTextureFillMode.AspectFitHeight;
// Best for: Tall textures, portrait orientations  
// Result: Texture height = Canvas height, width scaled proportionally
```

### Fill
Stretches texture to fill entire canvas, potentially distorting aspect ratio:

```typescript
background.textureFillMode = BackgroundTextureFillMode.Fill;
// Best for: When exact canvas coverage is required
// Result: Texture fills entire canvas, aspect ratio may change
```

## Advanced Configuration

### Dynamic Background Switching

```typescript
class BackgroundController extends Script {
  private backgrounds = {
    day: { mode: BackgroundMode.Sky, material: dayMaterial },
    night: { mode: BackgroundMode.Sky, material: nightMaterial },
    indoor: { mode: BackgroundMode.SolidColor, color: new Color(0.1, 0.1, 0.1, 1.0) }
  };
  
  switchToDay(): void {
    const bg = this.entity.scene.background;
    bg.mode = BackgroundMode.Sky;
    bg.sky.material = this.backgrounds.day.material;
  }
  
  switchToNight(): void {
    const bg = this.entity.scene.background;
    bg.mode = BackgroundMode.Sky;
    bg.sky.material = this.backgrounds.night.material;
  }
  
  switchToIndoor(): void {
    const bg = this.entity.scene.background;
    bg.mode = BackgroundMode.SolidColor;
    bg.solidColor = this.backgrounds.indoor.color;
  }
}
```

### Responsive Background Textures

```typescript
class ResponsiveBackground extends Script {
  private mobileTexture: Texture2D;
  private desktopTexture: Texture2D;
  
  onAwake(): void {
    this.updateBackgroundForDevice();
    
    // Listen for canvas size changes
    this.engine.canvas._sizeUpdateFlagManager.addListener(() => {
      this.updateBackgroundForDevice();
    });
  }
  
  private updateBackgroundForDevice(): void {
    const bg = this.entity.scene.background;
    const canvas = this.engine.canvas;
    const aspectRatio = canvas.width / canvas.height;
    
    bg.mode = BackgroundMode.Texture;
    
    if (aspectRatio > 1.5) {
      // Wide screen - use desktop texture
      bg.texture = this.desktopTexture;
      bg.textureFillMode = BackgroundTextureFillMode.AspectFitHeight;
    } else {
      // Mobile/square screen - use mobile texture
      bg.texture = this.mobileTexture;
      bg.textureFillMode = BackgroundTextureFillMode.AspectFitWidth;
    }
  }
}
```

### Performance Optimization

```typescript
class OptimizedBackground extends Script {
  private lowQualityTexture: Texture2D;
  private highQualityTexture: Texture2D;
  
  onAwake(): void {
    this.setBackgroundQuality();
  }
  
  private setBackgroundQuality(): void {
    const bg = this.entity.scene.background;
    const canvas = this.engine.canvas;
    const pixelCount = canvas.width * canvas.height;
    
    bg.mode = BackgroundMode.Texture;
    
    // Use lower quality texture for high-resolution displays
    if (pixelCount > 1920 * 1080) {
      bg.texture = this.lowQualityTexture;
    } else {
      bg.texture = this.highQualityTexture;
    }
  }
}
```

## Best Practices

### Performance Considerations
- **Texture Size**: Use appropriately sized textures to avoid memory waste
- **Compression**: Enable texture compression for background textures when possible
- **LOD**: Consider using different quality textures based on device capabilities
- **Sky Materials**: Procedural sky materials are more memory-efficient than cube textures

### Visual Quality
- **Aspect Ratios**: Choose fill modes that preserve important visual elements
- **Color Spaces**: Ensure background colors match your scene's lighting setup
- **Seamless Transitions**: Use smooth interpolation when switching backgrounds dynamically

### Memory Management
```typescript
// Properly dispose of background resources
const oldTexture = background.texture;
background.texture = newTexture;
oldTexture?.destroy(); // Free memory

// Clear background when switching modes
background.mode = BackgroundMode.SolidColor;
background.texture = null; // Release texture reference
```

## Integration with Other Systems

### Lighting Integration
```typescript
// Coordinate background with ambient lighting
if (background.mode === BackgroundMode.Sky) {
  scene.ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
  scene.ambientLight.diffuseSolidColor = background.sky.material.tint;
}
```

### Post-Processing Integration
```typescript
// Adjust background for post-processing effects
const postProcess = camera.getComponent(PostProcessVolume);
if (postProcess.bloom.enabled) {
  // Use darker background to enhance bloom effect
  background.solidColor.set(0.02, 0.02, 0.02, 1.0);
}
```

The Background system provides a flexible foundation for creating visually appealing scenes while maintaining optimal performance across different platforms and devices.
