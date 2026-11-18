import {expect,it} from 'vitest';
import {irrigationEffectSummary} from '../../src/farming/application/IrrigationEffectSummary';
import type {CommandResult} from '../../src/farming/domain/FarmCommands';
it('keeps instantaneous overflow separate from clock settlement and unobserved later transport',()=>{
 const receipt:CommandResult={ok:true,commandId:'water',revision:10,replayed:false,changes:[
  {kind:'soil-moisture-changed',plotId:'neighbor',previousMoistureUnits:20,moistureUnits:21},
  {kind:'simulation-advanced',previousSimulationTimeMs:0,simulatedTimeMs:3000,elapsedSystemTimeMs:3000,capped:false},
  {kind:'soil-irrigated',plotId:'target',previousMoistureUnits:20,moistureUnits:32,water:{input:12,absorbed:12,distributed:0,lost:0}}
 ]};
 const value=irrigationEffectSummary(receipt);
 expect(value.immediateIrrigation).toEqual([receipt.changes[2]]);
 expect(value.simulationSettlements).toEqual([receipt.changes[1]]);
 expect(value.laterSoilTransport).toBe('not-observed');
 expect(value.revision).toBe(10);
});
