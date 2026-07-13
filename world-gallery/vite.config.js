// Gallery dev server. Each demos/<feature>/index.html is its own previewable page (iframe-isolated, so a
// heavy or broken demo can't take down the others); the landing index.html lists them. No build-time
// codegen — Vite serves the HTML entries directly, and the landing discovers demos via import.meta.glob.
const path = require("path");

// Suppress the browser context menu on every demo page from one place (mirrors examples/template/iframe.ejs),
// so Galacean's right-click orbit/pan isn't eaten and no demo has to repeat it. Both the gallery iframe and
// the full-screen tab load this same transformed HTML, so both are covered.
function suppressContextMenu() {
  return {
    name: "suppress-context-menu",
    transformIndexHtml(html, ctx) {
      if (!ctx.path.includes("/demos/")) return html;
      return html.replace("</head>", "  <script>document.oncontextmenu = () => false;</script>\n  </head>");
    }
  };
}

module.exports = {
  plugins: [suppressContextMenu()],
  server: {
    open: false,
    host: "0.0.0.0",
    port: 3000,
    fs: {
      allow: [path.resolve(__dirname, "..")]
    }
  },
  preview: {
    fs: {
      allow: [path.resolve(__dirname, "..")]
    }
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
