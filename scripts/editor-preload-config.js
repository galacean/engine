module.exports = {
  firstParty: [
    {
      name: "@galacean/engine-xr",
      path: "packages/xr",
      browserPath: "dist/browser.min.js"
    },
    {
      name: "@galacean/engine-xr-webxr",
      path: "packages/xr-webxr",
      browserPath: "dist/browser.min.js"
    },
    {
      name: "@galacean/engine-ui",
      path: "packages/ui",
      browserPath: "dist/browser.min.js"
    },
    {
      name: "@galacean/engine-physics-lite",
      path: "packages/physics-lite",
      browserPath: "dist/browser.min.js"
    },
    {
      name: "@galacean/engine-physics-physx",
      path: "packages/physics-physx",
      browserPath: "dist/browser.min.js"
    },
    {
      name: "@galacean/engine-shaderlab",
      path: "packages/shader-lab",
      browserPath: "dist/browser.min.js"
    },
    {
      name: "@galacean/engine-shader",
      path: "packages/shader",
      browserPath: "dist/browser.js"
    }
  ],

  secondParty: [
    {
      name: "@galacean/engine-lottie",
      repo: "https://github.com/galacean/engine-lottie.git",
      packagePath: ".",
      browserPath: "dist/browser.js",
      buildCommand: "pnpm build"
    },
    {
      name: "@galacean/engine-spine",
      repo: "https://github.com/galacean/engine-spine.git",
      branch: "4.2",
      packagePath: ".",
      browserPath: "dist/browser.js",
      buildCommand: "pnpm build"
    }
  ]
};
