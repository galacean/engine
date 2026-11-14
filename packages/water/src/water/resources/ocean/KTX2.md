# Ocean KTX2 derivatives

The Galacean Ocean runtime loads only the tracked `.ktx2` derivatives. The authorized PNG files remain beside them as the auditable source inputs and are not runtime imports.

The deterministic encoder contract is:

- Khronos KTX-Software `v4.4.2` (`KTX-Software-4.4.2-Darwin-arm64.pkg`, SHA-256 `500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c`);
- all five runtime derivatives: `512 × 512`, UASTC quality 4 with Zstd level 18;
- SmoothWaves and RoughWaves retain linear RGB transfer;
- Caustics, Foam, and IntersectionNoise retain sRGB transfer;
- full Lanczos4 mip chains generated with wrap boundary sampling;
- top-left source orientation retained and one encoder thread used with deterministic test-run metadata.

Regenerate from `world/gallery` with the official `ktx` executable:

```sh
OCEAN_KTX2_KTX=/absolute/path/to/ktx pnpm water:ocean-textures:generate
```

Add `-- --check` to regenerate into temporary files and verify that every tracked derivative is byte-identical.
