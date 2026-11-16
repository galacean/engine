# WebGL1 compatibility

`WebGLEngine.create()` first attempts WebGL2. If the canvas cannot create a WebGL2 context, the engine dynamically imports this package and prepares a WebGL1 device. Application bundles that support code splitting can serve the compatibility chunk alongside their other JavaScript files.

The bundled ES module distributes the compatibility code in a separate file. The single-file UMD distribution includes it in the main script.

Direct calls to `WebGLGraphicDevice.init()` require WebGL2. Use `WebGLEngine.create()` for automatic fallback.
