import {describe,it,expect} from 'vitest';
import {tableFor} from '../src/domain/catalogue';
const p=(scheme:'Standard'|'BFM',twoUp:boolean)=>({scheme,twoUp});
const rows=(scheme:'Standard'|'BFM',twoUp:boolean)=>tableFor(p(scheme,twoUp)).map(x=>[x.minutes,x.limit,x.rest,x.type]);
describe('2026 NHVR mode-specific rule tables',()=>{
 it('Standard Solo, diary Table 1',()=>expect(rows('Standard',false)).toEqual([
  [330,315,15,'breaks'],[480,450,30,'breaks'],[660,600,60,'breaks'],
  [1440,720,420,'stationary'],[10080,4320,1440,'stationary'],
  [20160,8640,0,'nights']
 ]));
 it('Standard Two-up, diary Table 3',()=>expect(rows('Standard',true)).toEqual([
  [330,315,15,'breaks'],[480,450,30,'breaks'],[660,600,60,'breaks'],
  [1440,720,300,'stationary-or-sleeper'],[3120,null,600,'stationary'],
  [10080,3600,1440,'weekly'],[20160,7200,0,'nights']
 ]));
 it('BFM Solo, diary Table 4',()=>expect(rows('BFM',false)).toEqual([
  [375,360,15,'breaks'],[540,510,30,'breaks'],[720,660,60,'breaks'],
  [1440,840,420,'stationary'],[20160,8640,0,'nights']
 ]));
 it('BFM Two-up, diary Table 5',()=>expect(rows('BFM',true)).toEqual([
  [1440,840,0,'stationary'],[4920,null,600,'stationary'],
  [10080,4200,1440,'weekly'],[20160,8400,0,'nights']
 ]));
 it('no mode table can be mutated through a caller',()=>{
  const a=tableFor(p('Standard',false));a.pop();
  expect(tableFor(p('Standard',false))).toHaveLength(6);
 });
});
