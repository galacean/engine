declare let my: any;
const {system, platform, language} = my.getSystemInfoSync();


const android = system.toLowerCase().indexOf('android') !== -1;

const uaDesc = android ? 'Android; CPU Android 6.0' : 'iPhone; CPU iPhone OS 10_3_1 like Mac OS X';
const ua = `Mozilla/5.0 (${uaDesc}) AppleWebKit/603.1.30 (KHTML, like Gecko) Mobile/14E8301 MicroMessenger/6.6.0 MiniGame NetType/WIFI Language/${language}`;


export default {
  platform,
  language: language,
  appVersion: `5.0 (${uaDesc}) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1`,
  userAgent: ua,
}
