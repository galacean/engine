// Current product omits tools.water from its global declaration. These runtime cases
// use its shipped module declaration explicitly, without bypassing runtime checks.
const prefix = "";
const typed =
  '(/** @type {{water:typeof import("/api/water/WaterAuthoring")}} */(/** @type {unknown} */(tools))).water.author(';
const records =
  'const records=/** @type {Array<{id:string;kind:string;material:{$ref:string};enabled:boolean}>} */(await water.author({operation:"list"}));';
const fixture =
  'const waters=/** @type {Array<{id:string;kind:string}>} */(await water.author({operation:"list"}));const target=waters.find(x=>x.kind==="lake");if(!target)throw Error("No lake fixture");const id=target.id;';
const cases = [];
function add(id, body, verify) {
  cases.push({
    id: "water." + id,
    tool: "water.author",
    source: prefix + body.replaceAll("water.author(", typed),
    typingWorkaround: "Missing tools.water declaration; use shipped WaterAuthoring module type",
    ...(verify ? { verify: prefix + verify.replaceAll("water.author(", typed) } : {})
  });
}
add("list", records + 'if(!records.length)throw Error("No waters");return records;');
add("get", records + 'return await water.author({operation:"get",id:records[0].id});');
add(
  "update",
  fixture + 'return await water.author({operation:"update",id,patch:{visible:false}});',
  fixture + 'return await water.author({operation:"get",id});'
);
add(
  "updateMany",
  fixture +
    records +
    'const peer=records.find(x=>x.id!==id);if(!peer)throw Error("No peer");return await water.author({operation:"updateMany",updates:[{id,patch:{visible:true}},{id:peer.id,patch:{priority:1}}]});'
);
for (const enabled of [false, true])
  add(
    "setEnabled-" + enabled,
    fixture + `return await water.author({operation:"setEnabled",id,enabled:${enabled}});`,
    fixture +
      records +
      `if(records.find(x=>x.id===id)?.enabled!==${enabled})throw Error("Enable state mismatch");return {id};`
  );
for (const scope of ["instance", "shared"])
  add(
    "color-" + scope,
    fixture + `return await water.author({operation:"color",id,color:[60,130,160],scope:${JSON.stringify(scope)}});`
  );
add(
  "texture",
  records +
    'const ocean=records.find(x=>x.kind==="ocean");if(!ocean)throw Error("No ocean");const textures=(await editor.asset.list({})).filter(x=>x.path==="Water/Textures/ocean-roughWaves.ktx2");if(!textures.length)throw Error("No existing wave texture");return await water.author({operation:"texture",id:ocean.id,path:textures[0].path,scope:"instance"});'
);
add(
  "create",
  records +
    'const existing=records.find(x=>x.kind==="lake");if(!existing)throw Error("No existing lake");const values=/** @type {Array<{authoring:Extract<Parameters<typeof import("/api/water/WaterAuthoring").author>[0],{operation:"create"}>["input"]}>} */(await water.author({operation:"get",id:existing.id}));await water.author({operation:"remove",id:existing.id});return await water.author({operation:"create",name:"Audit Water",input:values[0].authoring});',
  fixture + 'return await water.author({operation:"get",id});'
);
add(
  "remove",
  fixture + 'return await water.author({operation:"remove",id});',
  'const q=await editor.entity.list({scene:"Scene/SeedWorld.scene",name:"Audit Water"});if(q.items.length){const c=await editor.component.query({scene:"Scene/SeedWorld.scene",entityId:q.items[0].id,type:"WaterBodyComponent"});if(c.length)throw Error("Water survived");}return {removed:true};'
);
module.exports = cases;
if (require.main === module) process.stdout.write(JSON.stringify(cases, null, 2));
