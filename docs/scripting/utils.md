# Utils System

Galacean's utility system is distributed across multiple packages, but the core principle is: only document public and stable interfaces, avoiding dependencies on internal implementations. This page provides an overview of common utility locations and detailed API documentation for the core Utils class.

## Core Utilities (`@galacean/engine`)

`@galacean/engine` provides two main utility classes:

```ts
import { Utils, MathUtil } from "@galacean/engine";
```

- **Utils**: Provides `removeFromArray`, `decodeText`, `isAbsoluteUrl`, `isBase64Url`, `resolveAbsoluteUrl`, `objectValues` and other utility functions.
- **MathUtil**: Common mathematical operations including `clamp`, `lerp`, angle/radian conversions, etc.

Basic examples:

```ts
const entities: Entity[] = [e1, e2, e3];
Utils.removeFromArray(entities, e2);

const speed = MathUtil.clamp(player.speed, 0, maxSpeed);
```

## Utils Class Detailed API

The `Utils` class in `@galacean/engine` focuses on performance-oriented tasks such as fast array removal, safe text decoding, and URL handling. Earlier versions documented several internal methods (like `_reflectGet`, `_floatMatrixMultiply`), which were never publicly released; this section covers only the current stable public API.

### removeFromArray

High-performance array element removal:

```ts
const entities = [e1, e2, e3, e4];
const removed = Utils.removeFromArray(entities, e2); // true
console.log(entities); // [e1, e4, e3]
```

**Features**:
- O(1) swap-and-pop element removal
- Order may change, suitable for component lists, system caches, and other scenarios requiring fast deletion
- Returns boolean indicating successful removal

### decodeText

Safe text decoding:

```ts
const data = new Uint8Array([72, 101, 108, 108, 111]);
const text = Utils.decodeText(data); // "Hello"
```

**Features**:
- Prefers native `TextDecoder`
- Falls back to compatible implementation, safely decodes UTF-8 binary buffers
- Suitable for resource packages, GLTF embedded text, and other scenarios

### URL Utilities

Complete URL processing tools:

```ts
Utils.isAbsoluteUrl("https://example.com/asset.gltf"); // true
Utils.isBase64Url("data:image/png;base64,iVBORw0..."); // true

Utils.resolveAbsoluteUrl("https://example.com/assets/", "textures/wood.jpg");
// -> "https://example.com/assets/textures/wood.jpg"
```

**API Details**:
- `isAbsoluteUrl(url)`: Determines if URL is absolute or protocol-relative
- `isBase64Url(url)`: Detects data/base64 URLs
- `resolveAbsoluteUrl(base, relative)`: Joins and normalizes URLs; automatically handles `file://` in local path scenarios

### objectValues

Compatibility object value extraction:

```ts
const config = { left: 12, top: 24 };
const values = Utils.objectValues(config); // [12, 24]
```

**Features**:
- Lightweight replacement when legacy runtimes lack `Object.values`
- Suitable for debugging, logging, and quick object value extraction

### Common Usage Patterns

- **Entity/Component Management**: `removeFromArray` maintains active lists
- **Resource Loading**: URL detection and joining commonly used in custom Loaders
- **Binary Processing**: `decodeText` decodes resource packages, GLTF embedded text
- **Debug/Logging**: `objectValues` quickly prints object values

## Loader Utilities

The loader module provides helper functions for binary data and resource paths, for example:

```ts
import { ab2str } from "@galacean/engine-loader/resource-deserialize/utils/Utils";

const arrayBuffer = await fetch(url).then(r => r.arrayBuffer());
const text = ab2str(arrayBuffer);
```

**Note**: Loader internal utilities may be package-private APIs, pay attention to change logs during upgrades.

## UI Utilities

The UI package contains utilities related to canvas, input, and hierarchy:

```ts
import { Utils as UIUtils } from "@galacean/engine-ui";

UIUtils.calcCanvasSize(canvas, devicePixelRatio);
```

Specific capabilities are subject to UI package documentation/source code.

## MathUtil Utilities

The MathUtil class provides common mathematical operations:

```ts
import { MathUtil } from "@galacean/engine";

// Value clamping
const clampedValue = MathUtil.clamp(value, min, max);

// Linear interpolation
const interpolated = MathUtil.lerp(start, end, t);

// Angle conversion
const radians = MathUtil.degreeToRadian(degrees);
const degrees = MathUtil.radianToDegree(radians);
```

## Best Practices

1. **Depend on Public APIs**: Don't directly call utilities with underscore prefixes or marked `@internal`.
2. **Pay Attention to Package Differences**: Core, Loader, and UI each maintain utility functions; names may overlap but meanings differ.
3. **Use Utils for Performance-Sensitive Scenarios**: For array removal, URL joining, etc., prioritize official implementations.
4. **Copy Implementation When Necessary**: If you need internal utility capabilities, implement a copy in your project rather than directly referencing internal functions.

## Performance Considerations

- `removeFromArray` uses swap-and-pop algorithm, much faster than `Array.splice()`
- `decodeText` prefers native `TextDecoder`, better performance than manual string concatenation
- URL utilities avoid regex performance overhead
- `objectValues` directly uses `Object.values` in supported environments

## Further Reading

- `packages/core/src/Utils.ts` – Official implementation source code
- `packages/loader`, `packages/ui` – Corresponding package utility collections
- Math.md – Detailed math library documentation
- AssetManagement.md – URL handling in resource management

> If you need more utilities (such as those in UI or Loader packages), please refer to the corresponding package documentation or source code; these utilities' APIs may differ from the core `Utils`.
