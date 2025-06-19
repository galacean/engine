# E2E Testing Guide

## Prerequisites

### Git LFS
We use [git-lfs](https://git-lfs.com/) to manage baseline images for e2e tests. Install it if you haven't already:
```bash
git lfs install
git lfs pull
```

## Quick Start

### Run all e2e tests
```bash
npm run e2e
```

### Debug tests interactively
```bash
npm run e2e:debug
```

Both commands will automatically:
- Install required browsers (Chromium)
- Start the test server
- Run visual regression tests with odiff comparison

## Project Structure

```
e2e/
├── case/              # Test case implementations
├── config.ts          # Test configuration
├── fixtures/
│   └── originImage/   # Baseline images (managed by git-lfs)
├── downloads/         # Generated screenshots
├── tests/             # Playwright test files
└── utils/             # Helper utilities
```

## Adding New Test Cases

### 1. Create a test case file
Create your test implementation in `e2e/case/`, following existing patterns:
```typescript
// e2e/case/my-new-test.ts
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  // Your test implementation
  initScreenshot(engine, camera);
});
```

### 2. Add configuration
Add your test to `e2e/config.ts`:
```typescript
MyCategory: {
  myNewTest: {
    category: "MyCategory",
    caseFileName: "my-new-test",
    threshold: 0.1  // 0.01 for strict tests, 0.1 for normal tests
  }
}
```

### 3. Generate baseline image
Run in debug mode to generate the initial screenshot:
```bash
npm run e2e:debug
```

Copy the generated image from `e2e/downloads/` to `e2e/fixtures/originImage/` and commit it with git-lfs.

## Threshold Guidelines

- **0.01**: Strict comparison for pixel-perfect tests (e.g., FXAA, transparency)
- **0.1**: Normal comparison for most 3D rendering tests
- Adjust based on rendering stability and requirements

## Troubleshooting

### Browser installation issues
Manually install browsers:
```bash
npm run e2e:install
```

### Missing baseline images
Pull from git-lfs:
```bash
git lfs pull
```

### Server startup issues
Manually start the test server:
```bash
npm run e2e:case
```

## Framework Details

This project uses [Playwright](https://playwright.dev/) with [odiff](https://github.com/dmtrKovalenko/odiff) for visual regression testing. All tests run in Chromium for consistency.


