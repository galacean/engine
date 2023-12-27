# How to Contribute

The following is a set of guidelines for contributing to Galacean. Please spend several minutes reading the article before you create an issue or pull request.<br />

## Code of Conductor

<br />We have adopted the [Contributor Covenant](https://www.contributor-covenant.org/) as its Code of Conduct, and we expect project participants to adhere to it. Please read [the full text](./CODE_OF_CONDUCTOR.md) so that you can understand what actions will and will not be tolerated.<br />

## Issue Reporting

<br />You can make use of the Github Issues for Galacean to:<br />

1. Report a bug.
1. Request a feature
1. Ask a question


<br />Before reqorting an issue, please take the following steps:<br />

1. Search the existing issues.
1. Clearly describe the issue including steps to reproduce when it is a bug.
1. Provite an online example. Make use of [jsFiddle](http://jsfiddle.net/), [jsBin](http://jsbin.com/).


<br />If you open an issue that does not conform to the requirements, **it will be closed immediately**.<br />

## Contributing Code


### Setting Up

<br />To set up for contributing code, you will take a few steps:<br />

1. Ensure you have node.js installed. You can download Node.js from [nodejs.org](https://nodejs.org/en/) and make sure your Node.js is later than `12`. Use `node -v` to check your Node.js version.
1. Fork the Galacean repository.
1. Run `npm run bootstrap` in your cloned folder to install all the dependencies for Galacean.



### Making a Change

<br />After setting up the environment of Galacean, you can make your change already. The only thing you should make sure is that you checked out the correct branch.<br />

### Test Your Change

<br />You can test your change by the following ways:<br />

- Clone the Galacean playground repository and write a demo for your change.
- Write an uint test in the Galacean repository and run `npm run test` to execute the uint test.

- [Write an e2e test](https://github.com/galacean/runtime/wiki/How-to-write-an-e2e-Test-for-runtime) in the Galacean repository and run `npm run e2e` to execute the e2e test.



### Submitting a Pull Request

<br />After you have made and tested your change, commit and push it to your fork. Then, open a Pull Request from your fork to the main Galacean repository on the branch you used in the `Making a Change` section of this document.<br />

### Reviewing a Pull Request


#### Addressing review feedback

<br />If we ask for changes via code reviews then:<br />

1. Make the required updates to the code.
1. Re-run the Angular test suites to ensure tests are still passing.
1. Create a fixup commit and push to your GitHub repository (this will update your Pull Request):

```
git commit --all --fixup HEAD
git push
```

<br />That's it! Thank you for your contribution!<br />

##### Updating the commit message

<br />A reviewer might often suggest changes to a commit message (for example, to add more context for a change or adhere to our [commit message guidelines](./COMMIT_MESSAGE_CONVENTION.md)). In order to update the commit message of the last commit on your branch:<br />

1. Check out your branch:

```
git checkout my-fix-branch
```

2. Amend the last commit and modify the commit message:

```
git commit --amend
```

3. Push to your GitHub repository:

```
git push --force-with-lease
```


> NOTE:
> If you need to update the commit message of an earlier commit, you can use `git rebase` in interactive mode. See the [git docs](https://git-scm.com/docs/git-rebase#_interactive_mode) for more details.



#### After your pull request is merged

<br />After your pull request is merged, you can safely delete your branch and pull the changes from the main (upstream) repository:<br />

- Delete the remote branch on GitHub either through the GitHub web UI or your local shell as follows:

```
git push origin --delete my-fix-branch
```

- Check out the master branch:

```
git checkout master -f
```

- Delete the local branch:

```
git branch -D my-fix-branch
```

- Update your master with the latest upstream version:

```
git pull --ff upstream master
```


## Coding Rules

<br />To ensure consistency throughout the source code, keep these rules in mind as you are working:<br />

- All features or bug fixes **must be tested** by one or more specs (unit-tests).
- All public API methods **must be documented**.
- We use Prettier as an automatic code formatter. Run `npm run prettier` after making any changes to the code.



## Credits

<br />Thank you to all the people who have already contributed to Galacean!<br />
<br />// WIP: Contributors
