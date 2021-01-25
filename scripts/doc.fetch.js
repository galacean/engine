const { request, namespace } = require("./common")

request.get(`/repos/${namespace}/docs`)
  .then(res => res.data.data)
  .then(data => data.map(item => item.slug))
  .then(data => data.forEach(requestDetail))

function requestDetail(slug) {
  // console.log(`/repos/${namespace}/docs/${slug}?raw=1`)
  request.get(`/repos/${namespace}/docs/${slug}?raw=1`)
    .then(res => res.data.data.body)
    .then(console.log).catch(e => {
    })
}