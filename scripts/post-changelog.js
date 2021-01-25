const fetch = require('node-fetch')
const { readFile } = require('fs-extra')
const inquirer = require('inquirer')
const chalk = require('chalk')

const ROBOT = 'https://oapi.dingtalk.com/robot/send?access_token=6c8c663092e8061151b9d88164e838552325b0d0b0d41306a9bd36d54db1bee7'

async function postChangelog(robotUrl) {
  const { title, content } = await inferChangelog()
  console.log('即将发布的 Changelog:')
  console.log()
  console.log()
  console.log(content)
  console.log()
  console.log()

  const { yes } = await inquirer.prompt([{
    name: 'yes',
    message: 'Confirm',
    type: 'list',
    choices: ['N', 'Y']
  }])

  if (yes) {
    fetch(
      robotUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            title,
            text: content
          }
        })
      }
    ).then(() => {
      console.log('Success')
    }).catch(err => {
      console.log(err)
    })
  }
}

async function inferChangelog() {
  const changelog = (await readFile('CHANGELOG.md', 'utf-8')).trim()
  const firstLine = changelog.split('\n')[0]

  if (!firstLine.startsWith('#')) {
    throw new Error('Invalid changelog')
  }

  const VERSION_RE = /v(\d{1,2}\.\d{1,2}\.\d{1,2})\.\.\.v(\d{1,2}\.\d{1,2}\.\d{1,2}).*\((\d{4}-\d{2}-\d{2})\)/
  const result = firstLine.match(VERSION_RE)
  const [, startVersion, endVersion, date] = result

  console.log(chalk.gray(`startVersion: ${startVersion}, endVersion: ${endVersion}, date: ${date} \n`))

  if ( !endVersion || !date) {
    throw new Error(`Cannot infer version from changelog: ${firstLine}`)
  }

  const content = changelog
    .slice(0, changelog.indexOf(`[${startVersion}]`))
    .trim()
    .replace(/#*$/, '')
    .trim()

  return {
    title: `# ${endVersion} (${date})`,
    content
  }
}

postChangelog(ROBOT)