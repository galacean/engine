import { defineProject } from "vitest/config";
import raw from "vite-raw-plugin";

export default defineProject({
  server: {
    port: 51204
  },
  plugins: [
    raw({
      fileRegex: /\.(glsl|gs)$/
    })
  ],
  optimizeDeps: {
    exclude: [
      "@galacean/engine",
      "@galacean/engine-loader",
      "@galacean/engine-rhi-webgl",
      "@galacean/engine-math",
      "@galacean/engine-core"
    ]
  },
  test: {
    browser: {
      provider: "playwright",
      enabled: true,
      name: "chromium",
      providerOptions: {
        launch: {
          args: ["--use-gl=egl", "--ignore-gpu-blocklist", "--use-gl=angle"]
        }
      }
    }
  }
});
