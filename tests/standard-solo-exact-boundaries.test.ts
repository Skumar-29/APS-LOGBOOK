import {describe,it,expect} from 'vitest';
import {emptyState,ensureDay} from '../src/domain/model';
import {editRange} from '../src/domain/diary';
import {analyse} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';

const zone='Australia/Sydney',day='2026-11-12';
function setup(){
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 Object.assign(s.profile,{name:'Standard solo boundaries',licence:'TEST',scheme:'Standard',twoUp:false,base:'NSW',zone,operation:'HVNL'});
 ensureDay(s,'2026-11-11').restDefault='stationary';
 ensureDay(s,day).restDefault='stationary';
 return s;
}
function evaluate(s:ReturnType<typeof setup>,end:string){
 const stamp=instantFor(day,end,zone)[0];
 return analyse(s,day+'T'+end,2,{now:stamp});
}
function work(s:ReturnType<typeof setup>,...intervals:[number,number][]) {
 for(const [a,b] of intervals)editRange(s,day,a,b,'work');
}
function row(r:ReturnType<typeof evaluate>,label:string){
 return r.checks.find(c=>c.label===label&&c.start===day+' 06:00');
}
describe('NHVR Standard Solo exact 15-minute rows and boundaries',()=>{
 it('5.5h: exact 5h15m Work plus 15m Rest must pass',()=>{
  const s=setup();work(s,[24,45]); // 06:00–11:15 Work
  const r=evaluate(s,'11:30'),c=row(r,'5h 30m');
  expect(c?.work).toBe(315);
  expect(c?.rest).toBe(15);
  expect(c?.status).toBe('Within work cap');
 });
 it('5.5h: 5h30m continuous Work exceeds the Work and Rest requirements',()=>{
  const s=setup();work(s,[24,46]);
  const r=evaluate(s,'11:30'),c=row(r,'5h 30m');
  expect(c?.work).toBe(330);
  expect(c?.status).toBe('Exceeded');
  expect(r.breachSlots[day+':45']).toBeDefined();
 });
 it('8h: 7h30m Work and exactly two separate 15m Rests pass',()=>{
  const s=setup();work(s,[24,36],[37,48],[49,56]);
  const r=evaluate(s,'14:00'),c=row(r,'8h 00m');
  expect(c?.work).toBe(450);
  expect(c?.rest).toBe(30);
  expect(c?.status).toBe('Within work cap');
 });
 it('8h: one 15m Rest and 7h45m Work breach both limits',()=>{
  const s=setup();work(s,[24,36],[37,56]);
  const r=evaluate(s,'14:00'),c=row(r,'8h 00m');
  expect(c?.work).toBe(465);
  expect(c?.rest).toBe(15);
  expect(c?.status).toBe('Exceeded');
 });
 it('11h: 10h Work with four separate 15m Rests passes the exact boundary',()=>{
  const s=setup();work(s,[24,34],[35,45],[46,56],[57,67]);
  const r=evaluate(s,'17:00'),c=row(r,'11h 00m');
  expect(c?.work).toBe(600);
  expect(c?.rest).toBe(60);
  expect(c?.status).toBe('Within work cap');
 });
 it('11h: 10h15m Work and only 45m Rest breaches',()=>{
  const s=setup();work(s,[24,38],[40,54],[55,68]);
  const r=evaluate(s,'17:00'),c=row(r,'11h 00m');
  expect(c?.work).toBe(615);
  expect(c?.rest).toBe(45);
  expect(c?.status).toBe('Exceeded');
 });
});
