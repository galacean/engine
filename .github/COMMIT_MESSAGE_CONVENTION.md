# Git Commit Message Convention

> This is adapted from [Angular's commit convention](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular).

<br />Messages must be matched by the following regex:<br />

```
/^(revert: )?(build|ci|docs|feat|fix|perf|refactor|test|types|style)(\(.+\))?: .{1,50}/
```


## Full Message Format

<br />A commit message consists of a **header**, **body** and **footer**. The header has a **type**, **scope** and **subject**:<br />

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```


### Commit Message Header


```
<type>(<scope>): <short summary>
  │       │             │
  │       │             └─⫸ Summary in present tense. Not capitalized. No period at the end.
  │       │
  │       └─⫸ Commit Scope: |core|2d|rhi-webgl|animations|loaders|controls|math|framebuffer-picker
  │                                          
  └─⫸ Commit Type: build|ci|docs|feat|fix|perf|refactor|test|types|style
```

<br />The `<type>` and `<summary>` fields are mandatory, the `(<scope>)` field is optional.<br />

## Explains


- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to our CI configuration files and scripts
- **docs**: Changes that only affect documentions
- **feat**: A new feature
- **fix**: A  bug fix
- **perf**: A code change that improves performance
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **test**: adding missing tests, refactoring tests; no production code change
- **types**: change only affect TypeScript's types.
- **style**: formatting, missing semi colons, etc; no code change



## Examples

<br />Appears under "Features" header, `loaders` subheader:<br />

```
feat(loaders): add 'timeout' option
```

<br />Appears under "Bug Fixes" header, `rhi-webgl` subheader, with a link to issue #28:<br />

```
fix(rhi-webgl): return null when creating a shader while gl context is lost

Closes #28
```


### Revert commits

<br />If the commit reverts a previous commit, it should begin with `revert:`, followed by the header of the reverted commit.<br />
<br />The content of the commit message body should contain:<br />

- information about the SHA of the commit being reverted in the following format: `This reverts commit <SHA>`.
- a clear description of the reason for reverting the commit message.


<br />Appears under the "Reverts" header:<br />

```
revert: feat(loaders): add 'timeout' option

This reverts commit 861ffe334f2b16608230b205700683c2f8f5de91.
```


### Breaking changes

<br />All breaking changes have to be mentioned in footer with the description of the change.<br />

```
BREAKING CHANGE:

The `addEventListener` function has changed to `on/once`.
```

