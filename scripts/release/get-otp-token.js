#!/usr/bin/env node

"use strict";

const urllib = require("urllib");

// https://yuque.antfin-inc.com/docs/share/3db25c54-de90-40ae-b594-8ae16cefae6e#lFeK6
module.exports = function getOTP(endpoint) {
  endpoint = endpoint || "https://localhost.alibaba-inc.com:4401";
  return new Promise((resolve, reject) => {
    urllib.request(
      `${endpoint}`,
      {
        method: "GET",
        headers: {
          Referer: "https://login-idc.alipay.com"
        },
        data: {
          cb: "otp_callback",
          _api: "SsoLogin.getTokenFromAlilang",
          appkey: "antbuservice_001",
          stamp: Date.now()
        },
        rejectUnauthorized: false
      },
      function(err, data, res) {
        if (err) {
          reject(err);
          return;
        }

        if (res.status !== 200) {
          reject(new Error(`error otp status code ${res.status}`));
          return;
        }

        if (!data || !Buffer.isBuffer(data)) {
          reject(new Error("failed to fetch otp"));
          return;
        }

        data = data.toString();
        const inner = /otp_callback\((.+)\)/.exec(data);
        if (!inner || inner.length < 2) {
          reject(new Error(`error otp content ${data}`));
          return;
        }

        let token;
        try {
          const json = JSON.parse(inner[1]);
          token = json.token;
        } catch (e) {
          reject(e);
        }

        resolve(token);
      }
    );
  });
};
