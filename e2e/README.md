### Note: Require install git-lfs
We use [git-lfs](https://git-lfs.com/) (Install by official website) to manage baseline images for e2e tests, so it's necessary to install it, ignore if already installed.
### 1. Create a case page in the e2e/case directory
You can refer to e2e/case/animator-play.ts.
### 2. Configure your e2e test in e2e/config.ts
The threshold is color difference threshold (from 0 to 1). Less more precise.
### 3. Debug your test cases:
#### Launch the Case page:

```
npm run e2e:case
```

After successfully launching the case page, run:

```
git lfs pull
```
Pull image from github, then run

```
npm run e2e:debug
```

Open the Cypress client for debugging.
Cypress will capture screenshots of your case pages.
Review the screenshots in e2e/downloads folder, store them in the e2e/fixtures/originImage directory if there are no issues, then rerun the test cases. If the test cases pass, the debugging is complete.

### 4. Run the complete e2e tests:
```
npm run e2e
```
Note: The e2e testing framework for this project is Cypress. For detailed usage instructions, please refer to https://www.cypress.io/.


### Add new e2e case

1. modify `config.ts` based on the new test case.
2. run `npm run e2e:debug`

the new image of test case for comparison will be present under directory `e2e/downloads`, you need to copy it into directory `e2e/fixtures/originImage`.


