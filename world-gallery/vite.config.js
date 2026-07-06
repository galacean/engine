// Gallery dev server. Each demos/<feature>/index.html is its own previewable page (iframe-isolated, so a
// heavy or broken demo can't take down the others); the landing index.html lists them. No build-time
// codegen — Vite serves the HTML entries directly, and the landing discovers demos via import.meta.glob.
module.exports = {
  server: {
    open: false,
    host: "0.0.0.0",
    port: 3000
  },
  resolve: {
    dedupe: ["@galacean/engine"]
  },
  optimizeDeps: {
    exclude: [
      "@galacean/engine",
      "@galacean/engine-shader",
      "@galacean/engine-shader-compiler",
      "@galacean/engine-toolkit-controls"
    ]
  }
};
