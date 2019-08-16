const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const dirs = fs.readdirSync(path.join(__dirname, "../packages"));

const execs = dirs.map((dir) => {
  function createExec(dir) {
    let dirname = path.join(__dirname, "../packages", dir);
    return function () {
      const docdirPath = `${dirname}/doc`;
      if(!fs.existsSync(docdirPath)) {
        fs.mkdirSync(docdirPath);
      }
      exec(`tnpx jsdoc2md --files ${dirname}/src/*.ts --configure ./jsdoc2md.json > ${dirname}/doc/api.md`, (err, stdout) => {
        if(err) {
          console.log(err);
        }
      })
    }
  }
  return createExec(dir);
});

execs.forEach(func=>func());