module.exports = {
  firstParty: [
    {
      name: "@galacean/engine-xr",
      path: "packages/xr",
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
  ],

  secondParty: [
    {
      name: "@galacean/engine-toolkit",
      repo: "https://github.com/galacean/engine-toolkit.git",
      isMonorepo: true,
      buildCommand: "pnpm b:all",
      packages: [
        {
          name: "@galacean/engine-toolkit",
          packagePath: "packages/galacean-engine-toolkit",
          browserPath: "dist/umd/browser.js"
        },
      ]
    },
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
      packagePath: ".",
      browserPath: "dist/browser.js",
      buildCommand: "pnpm build"
    }
  ]
};
