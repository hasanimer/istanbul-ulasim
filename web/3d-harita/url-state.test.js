import test from 'node:test';
import assert from 'node:assert/strict';
import {readUrlState,writeUrlState} from './url-state.js';

test('route and line state round-trip through the query string, keeping other params',()=>{
 const url=writeUrlState('http://x/?landmark=rams',{from:'Kadıköy',to:'Taksim'});
 assert.deepEqual(readUrlState(url),{mode:'route',from:'Kadıköy',to:'Taksim',line:null,underground:false});
 assert.match(url,/landmark=rams/);
 const line=writeUrlState(url,{line:'M4'});
 assert.deepEqual(readUrlState(line),{mode:'lines',from:null,to:null,line:'M4',underground:false});
 assert.equal(readUrlState(writeUrlState(line,{underground:true})).underground,true);
 assert.equal(new URL(writeUrlState(line,{})).search,'?landmark=rams');
});
test('garbage input is ignored',()=>{
 assert.deepEqual(readUrlState('http://x/?line=%3Cscript%3E&from=&to=A'),{mode:'lines',from:null,to:null,line:null,underground:false});
});
