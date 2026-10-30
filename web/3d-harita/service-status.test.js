import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyStatus,applyStatuses,estimateMinutes,facilitiesFor} from './service-status.js';

test('closure notices are separated from partial-service notices',()=>{
 assert.equal(classifyStatus('Hat bakım ve ray yenileme çalışmaları nedeniyle hattımız işletmeye kapalıdır.'),'closed');
 assert.equal(classifyStatus('Teknik bir arıza nedeniyle seferler Nurtepe-Kağıthane arasında mekik seferi olarak yapılmaktadır.'),'partial');
});
test('closed lines become suspended; partial lines keep running with an alert; M1 covers both branches',()=>{
 const lines=[{id:'T3',type:'tram'},{id:'M7',type:'metro'},{id:'M1A'},{id:'M1B'},{id:'B2',status:'suspended',statusLabel:'TCDD'}];
 const out=applyStatuses(lines,[{line:'T3',text:'hattımız işletmeye kapalıdır'},{line:'M7',text:'mekik seferi'},{line:'M1',text:'aktarma uyarısı'}],'src');
 assert.equal(out[0].status,'suspended');assert.equal(out[0].serviceAlert.kind,'closed');
 assert.equal(out[1].status,undefined);assert.equal(out[1].serviceAlert.kind,'partial');
 assert.ok(out[2].serviceAlert&&out[3].serviceAlert);
 assert.equal(out[4].statusLabel,'TCDD','existing suspensions are untouched');
 assert.equal(lines[0].status,undefined,'input is not mutated');
});
test('travel time uses per-line speed, type default, and a transfer allowance',()=>{
 const info={speeds:{M2:40},defaultSpeeds:{tram:16},transferMinutes:5};
 const r=estimateMinutes([{line:{id:'M2',type:'metro'},meters:10000},{line:{id:'T9',type:'tram'},meters:4000}],info);
 assert.deepEqual(r,{rideMinutes:30,transferMinutes:5,minutes:35});
});
test('built snapshot has speeds, facilities and a status endpoint',async()=>{
 const info=JSON.parse(await readFile(new URL('./data/service-info.json',import.meta.url),'utf8'));
 assert.ok(info.speeds.M2>20&&info.speeds.T1<25);
 assert.ok(Object.keys(info.facilities).length>100);
 assert.ok(facilitiesFor(info,'M2','Yenikapı'));
 assert.match(info.statusEndpoint,/^https:\/\/api\.ibb\.gov\.tr\//);
});
