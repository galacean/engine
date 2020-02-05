const fs = require("fs");
const path = require("path");
const { request, namespace } = require("./common")

const docList = fs.readdirSync("./packages").reduce((list, dir) => {
  const readmePath = path.join("./packages", dir, "doc/api.md");
  if (fs.existsSync(readmePath)) {
    const body = fs.readFileSync(readmePath, { encoding: "utf-8" })
    if (body) {
      list.push({
        body: fs.readFileSync(readmePath, { encoding: "utf-8" }),
        title: dir,
      });
    }
  }
  return list;
}, []);


function createArticle(data) {
  if (!data.body) {
    return;
  }
  return request.post(`/repos/${namespace}/docs`, {
    title: data.title,
    slug: data.title,
    format: 'markdown',
    body: data.body,
    public: 1
  }).catch(e => {
    console.warn(`create ${data.title} error`);
  })
}

function updateArticle(data) {
  if (!data.body) {
    return;
  }
  return request.put(`/repos/${namespace}/docs/${data.id}`, {
    title: data.title,
    slug: data.title,
    body: data.body,
    public: 1
  }).catch(e => {
    console.warn(`update ${data.title} error`);
  })
}

function generateToc(docList) {
  return docList
    .map(doc => doc.title)
    .map((title, index) => `- [${title}](${title})\n`)
    .join("")
}

request.get(`/repos/${namespace}/docs`).then(res => {
  return res.data.data;
}).then(remoteDocs => {
  return docList.reduce((list, doc) => {
    const remoteDoc = remoteDocs.find(value => value.title === doc.title);
    doc.isExistInLark = false;
    if (remoteDoc) {
      doc.isExistInLark = true;
      doc.id = remoteDoc.id;
    }
    list.push(doc);
    return list;
  }, []);
}).then(docList => {
  const updatePromises = docList.filter(doc => doc.isExistInLark).map(updateArticle);
  const createPromises = docList.filter(doc => !doc.isExistInLark).map(createArticle);
  Promise.all(updatePromises.concat(createPromises)).then(() => {
    const toc = generateToc(docList);
    request.put(`/repos/${namespace}`, { toc }).catch(e => {
      console.warn("toc error")
    });
  })
}).catch(e => {
}) 
