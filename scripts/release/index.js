const { exec } = require("child_process");
const { get } = require("/usr/local/lib/node_modules/tnpm/lib/get_otp");
const {
  alilangOTPEndpoint
} = require("/usr/local/lib/node_modules/tnpm/lib/config");

get(alilangOTPEndpoint, (err, token) => {
  if (err) {
    return console.error(err);
  }
  exec(`tnpm run release:canary --otp ${token}`, (err, stdout, stderr) => {
    if (err) {
      return console.error(err);
    }
    console.log(stdout);
    console.log(stderr);
  });
});

// getOtp().then(res => {
//
// });
