import {WorldPlanning3DView} from '@galacean/engine-world-planning/semantic-study/WorldPlanning3DView';
import {WALK_METRICS} from '@galacean/engine-world-planning/semantic-study/PlanningWalk';
import {buildMetricsZoo} from './MetricsZoo.ts';
async function main(){const {plan,stations}=buildMetricsZoo(),view=await WorldPlanning3DView.create(document.querySelector('#viewport')!,()=>{});view.setPlan(plan);view.frame({x:0,z:0,width:160,depth:160});
 const settings=document.querySelector('#settings')!;
 for(const [key,label,min,max,step] of [['height','身高 (m)',.5,3,.1],['eye','视高 (m)',.3,2.8,.1],['walk','步速 (m/s)',.5,10,.5],['run','跑速 (m/s)',1,20,.5],['jumpHeight','跳高 (m)',.1,4,.1],['step','跨阶 (m)',0,1,.05]] as const){const row=document.createElement('label'),input=document.createElement('input');row.textContent=label;input.type='number';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(WALK_METRICS[key]);input.setAttribute('aria-label',label);input.onchange=()=>{const value=input.valueAsNumber;if(!Number.isFinite(value)||value<min||value>max){input.value=String(WALK_METRICS[key]);return;}view.setWalkMetric(key,value);};row.append(input);settings.append(row);}
 for(const station of stations){const button=document.createElement('button');button.textContent=station.label;button.onclick=()=>view.startWalk(station.spawn);document.querySelector('#stations')!.append(button);}
 document.querySelector<HTMLButtonElement>('#overview')!.onclick=()=>{view.stopWalk();view.frame({x:0,z:0,width:160,depth:160});};window.addEventListener('pagehide',()=>view.dispose(),{once:true});}
void main().catch(error=>{document.querySelector('#viewport')!.textContent=String(error);});
