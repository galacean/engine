const getOtp = require("./get-otp-token");
const { exec } = require("child_process");

getOtp().then(res => {
  exec(`tnpx lerna publish prerelease --yes --otp ${res}`, (err, stdout) => {
    if (err) {
      return console.error(err);
    }
    console.log(stdout);
  });
});
