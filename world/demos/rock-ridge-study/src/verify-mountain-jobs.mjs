import assert from 'node:assert/strict';
import {createMountainJobs} from './mountain-jobs.mjs';
const running=[],accepted=[],errors=[],release=[];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const jobs=createMountainJobs(job=>new Promise((resolve,reject)=>{running.push(job.seed);release.push({resolve,reject});}),
 (result,job)=>accepted.push({seed:job.seed,result}),error=>errors.push(error.message));
jobs.schedule({seed:1});await tick();jobs.schedule({seed:2});jobs.schedule({seed:3});
release[0].resolve('old');await tick();assert.deepEqual(running,[1,3]);assert.deepEqual(accepted,[]);
release[1].resolve('latest');await tick();assert.deepEqual(accepted,[{seed:3,result:'latest'}]);
jobs.schedule({seed:4});await tick();jobs.schedule({seed:5});release[2].reject(new Error('stale failure'));await tick();
assert.deepEqual(errors,[]);jobs.invalidate();release[3].resolve('cancelled');await tick();assert.equal(accepted.length,1);
jobs.schedule({seed:6});await tick();release[4].reject(new Error('current failure'));await tick();assert.deepEqual(errors,['current failure']);
console.log('Mountain jobs: serialized latest-request delivery, bounded queue, invalidation and errors passed');
