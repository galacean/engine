import type {AtomKind,RockAtom} from '@galacean/engine-world-planning/landforms/RockAtoms';
/** First-stage shape contracts. These are explicit whitebox heuristics, not geology laws. */
export const SHAPE_RULES:Partial<Record<AtomKind,{topMin:number;topMax:number;description:string}>>={
 spire:{topMin:.1,topMax:.18,description:'尖塔：高／最大底边 ≥ 1.5；顶端两边 ≤ 底边18%；向上持续收窄。'},
 crown:{topMin:.3,topMax:.65,description:'冠峰：保留30%–65%的冠顶，层层收束；区别于细长尖塔。'},
 wall:{topMin:.5,topMax:1,description:'岩壁：延展方向宽度不得小于厚度；顶部保留至少75%延展宽度。'},
 'terrace/cap':{topMin:.4,topMax:1,description:'台地：顶部投影至少占基底55%；保留宽的水平承托面。'},
 'buttress/shoulder':{topMin:.1,topMax:.6,description:'山肩：高端必须偏向一侧，形成单向退落；不能变成居中尖塔。'},
 skirt:{topMin:.1,topMax:.6,description:'裙边：高度 ≤ 宽度25%；高端偏向一侧；高处仅占短端，留下长尾。'},
};
/** Check actual compiled geometry, not only slider values. A failure must not be published.
 * @param atom Compiled coarse rock volume in world metres.
 */
export function validateShape(atom:RockAtom):void {
 const bs=atom.boxes,top=bs.reduce((a,b)=>(a.elevation??0)+a.sizeY>(b.elevation??0)+b.sizeY?a:b);
 const name=atom.kind;
 if(name==='spire'){
  if(atom.height/Math.max(atom.width,atom.depth)<1.5-1e-8)throw new Error('尖塔必须高于最大底边的1.5倍，请加高或缩小底部');
  if(top.sizeX/atom.width>.18+1e-8||top.sizeZ/atom.depth>.18+1e-8)throw new Error('尖塔顶端过宽，失去收尖特征');
  for(let i=1;i<bs.length;i++)if(bs[i].sizeX>=bs[i-1].sizeX||bs[i].sizeZ>=bs[i-1].sizeZ)throw new Error('尖塔必须逐层收窄');
 }
 if(name==='crown'&&(top.sizeX/atom.width<.3-1e-8||top.sizeX/atom.width>.65+1e-8))throw new Error('冠峰须保留冠顶，不能退化为针尖或整块平顶');
 if(name==='wall'&&(atom.width<atom.depth||top.sizeX/atom.width<.75-1e-8))throw new Error('岩壁需要延展面：请增宽、减薄或保留宽顶');
 if(name==='terrace/cap'&&(top.sizeX*top.sizeZ/(atom.width*atom.depth)<.55-1e-8))throw new Error('台地承托面过小');
 if(name==='buttress/shoulder'||name==='skirt'){
  const dx=top.center.x-atom.x,dz=top.center.z-atom.z,localX=dx*Math.cos(atom.yaw)+dz*Math.sin(atom.yaw);
  if(Math.abs(localX)<atom.width*.15)throw new Error('高端过于居中：山肩/裙边应向一侧退落，请调整高端左右偏移');
 }
 if(name==='skirt'&&atom.height>atom.width*.25)throw new Error('裙边过高，请降低高度或延长底部');
}
