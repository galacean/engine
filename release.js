const fs = require("fs");
const path = require("path");
const process = require("child_process");

fs.readdirSync("packages").forEach(dir => {
  const pathname = path.join(__dirname, "packages", dir);
  process.exec(`cd ${pathname} && tnpm publish`, (err, std) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(std);
  });
});
