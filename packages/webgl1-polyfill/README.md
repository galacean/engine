# WebGL1 compatibility

`WebGLEngine.create()` first attempts WebGL2. When it is unavailable, it dynamically imports a pinned release of this package from jsDelivr. The public engine creation API does not change. No compatibility implementation is imported by the core, WebGL RHI, or umbrella engine distributions.

The CDN entry receives implementation identities from the calling engine. It does not import or bundle another engine. It patches the existing WebGL1 context and overrides the required engine methods. Overrides select by owning device; native WebGL2 engines retain their implementations and shader variants. Unsupported transform-feedback particle modules retain their previous WebGL1 behavior.

Direct calls to `WebGLGraphicDevice.init()` require WebGL2. Use `WebGLEngine.create()` for automatic fallback.
