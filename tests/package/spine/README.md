# Spine package tests

Run after `npm run build`:

```sh
npm run test:spine:packages
```

The check packs workspace packages and installs them in isolated temporary projects. It verifies:

- Public TypeScript declarations compile with `strict: true` and `skipLibCheck: false`.
- Installing and bundling one backend does not include the other backend or design runtime code.
- Both backends render through the ESM and CommonJS package entry points, in either registration order.

`consumer.ts` checks public types; `browser.js` is the rendering smoke test. Detailed animation, resource ownership and lifecycle behavior is covered by `tests/src/spine`.

Requires npm registry access and Playwright Chromium. Temporary projects are deleted on success and retained with their path printed on failure. This command does not publish packages.
