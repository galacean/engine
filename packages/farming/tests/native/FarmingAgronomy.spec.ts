import {afterEach,expect,it} from 'vitest';
import {nativeFixture} from './native-fixtures';
const fixtures:ReturnType<typeof nativeFixture>[]=[];
afterEach(async()=>{for(const f of fixtures.splice(0))await f.system.dispose();});
it('observes empty plots and storage without calling them faults or mutating the farm',async()=>{
 const f=nativeFixture();fixtures.push(f);await f.ready;
 const before=f.area.service.getSnapshot();
 const result=await f.api.getDiagnostics({farmId:'native-farm'});
 expect(result).toMatchObject({ok:true,value:{agronomy:[{farmId:'native-farm',status:'observed',evidence:{simulatedTimeMs:before.simulation.simulatedTimeMs,revision:before.revision,assessment:'no-issues-found',plotCount:1,cropCount:0,emptyPlotCount:1,storedQuantity:0,findingCount:0}}]}});
 expect(f.area.service.getSnapshot()).toEqual(before);
});
it('reports actual crop damage via the public diagnostics without concealing it behind readiness',async()=>{
 const f=nativeFixture();fixtures.push(f);await f.ready;
 const planted=await f.api.execute({operation:'plant',input:{farmId:'native-farm',plotId:'native/a',seedId:'berry-seed'}});
 expect(planted.ok).toBe(true);
 const crop=f.area.service.getPlot('native/a')!.crop!;
 expect(crop).not.toBeNull();
 expect((await f.api.execute({operation:'damageCrop',input:{farmId:'native-farm',plotId:'native/a',cropInstanceId:crop.instanceId,damagePermille:100,source:'storm'}})).ok).toBe(true);
 const result=await f.api.getDiagnostics({farmId:'native-farm'});
 expect(result).toMatchObject({ok:true,value:{agronomy:[{status:'observed',evidence:{assessment:'attention-needed',cropCount:1,findings:expect.arrayContaining([{plotId:'native/a',kind:'crop-health',reason:'damaged'}])}}]}});
});
