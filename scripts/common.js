const axios = require("axios").default;
// const 
// 真山 token 勿动
const token = "2ZUNEsk4iturQBHlnzext8sybszd04BcrpgXt5JR";
// 知识库 namespace
// const namespace = "r3/apis";
const namespace = "387081";

const request = axios.create({
  baseURL: "https://yuque.antfin-inc.com/api/v2",
  headers: {
    "X-Auth-Token": token
  }
})

module.exports =  {
  request,
  token,
  namespace
}