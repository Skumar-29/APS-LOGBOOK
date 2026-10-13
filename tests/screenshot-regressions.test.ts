import {screenshotFixture} from './fixtures/screenshot-history';
import {describe,it,expect} from 'vitest';
import {clone} from '../src/domain/model';
import {diaryCsv} from '../src/domain/diary';
import {analyse,selectCheckSummaries} from '../src/domain/rules';
import {instantFor} from '../src/domain/time';
import {planDiary} from '../src/domain/planning';
import {statusClass,warningLines} from '../src/domain/warnings';
const qld='Australia/Brisbane',nsw='Australia/Sydney';
const at=(date:string,time:string,zone=qld)=>instantFor(date,time,zone)[0];
describe('supplied screenshot history, mixed bases and binary blocks',()=>{
 it('does not lose the first hour of an existing NSW page to an absent QLD page',()=>{
  const s=screenshotFixture(),before=clone(s),r=analyse(s,'2026-10-06T24:00',1,{now:at('2026-10-14','04:00')});
  expect(r.days[0]).toMatchObject({work:240,rest:1200,unknown:0});expect(s).toEqual(before);
 });
 it('treats null blocks as rest within an existing day, without inventing absent dates',()=>{
  const s=screenshotFixture();s.days['2026-10-06'].slots[0]=null;
  const r=analyse(s,'2026-10-06T24:00',2,{now:at('2026-10-14','04:00')});
  expect(r.days[1]).toMatchObject({work:240,rest:1200,unknown:0});
  // The next NSW page overlaps the last hour in the preceding QLD calendar
  // date. Only that explicitly recorded interval is known; no absent day is
  // manufactured as a full rest day.
  expect(r.days[0].unknown).toBeGreaterThan(0);expect(r.days[0].work).toBe(0);
 });
 it('preserves daily totals and colours excessive known work across NSW/QLD changes',()=>{
  const s=screenshotFixture(),r=analyse(s,'2026-10-13T24:00',8,{now:at('2026-10-14','04:00')});
  expect(r.days.map(d=>d.work)).toEqual([240,1320,840,840,720,720,720,1170]);
  expect(r.days.every(d=>d.work+d.rest===1440&&d.unknown===0)).toBe(true);
  expect(Object.keys(r.breachSlots).some(k=>k.startsWith('2026-10-07:'))).toBe(true);
  expect(Object.keys(r.breachSlots).some(k=>k.startsWith('2026-10-13:'))).toBe(true);
  expect(diaryCsv(s,'2026-10-06','2026-10-06',r)).toContain('"240","1200"');
 });
 it('does not assert overdue breaks on an entirely missing day',()=>{
  const s=screenshotFixture();delete s.days['2026-10-07'];
  const r=analyse(s,'2026-10-07T24:00',2,{now:at('2026-10-14','04:00')});
  expect(r.days[1].unknown).toBe(1440);
  expect(r.findings.filter(f=>f.date==='2026-10-07'&&f.code.startsWith('rest-'))).toEqual([]);
 });
 it('gives Stats the same long/night rule-window quantity as the rule table',()=>{
  const s=screenshotFixture(),r=analyse(s,'2026-10-13T24:00',14,{now:at('2026-10-14','04:00')});
  const check=selectCheckSummaries(r.checks,r.assessedThrough,r.zone!).find(c=>c.label==='7 days long/night')!;
  expect(r.longNight).toBeGreaterThan(0);expect(r.longNight).toBe(check.work);expect(r.longNightStart).toBe(check.start);
 });
 it('marks review and open periods differently from approval and dates warnings',()=>{
  const r=analyse(screenshotFixture(),'2026-10-13T24:00',14,{now:at('2026-10-14','04:00')});
  expect(statusClass('Needs review')).toBe('review');expect(statusClass('Open period')).toBe('open');expect(statusClass('Rest due')).toBe('bad');
  expect(warningLines(r).some(x=>/\d{2}\/10\/2026.*(?:QLD|NSW)/.test(x))).toBe(true);
 });
 it('separates future plans and gives a scoped short-break time when weekly history is missing',()=>{
  const s=screenshotFixture(),now=at('2026-10-14','03:56'),r=analyse(s,'2026-10-14T24:00',2,{now}),p=planDiary(s,'2026-10-14',now,r)!;
  expect(r.days.at(-1)!.work).toBe(0);expect(p.report.days.at(-1)).toMatchObject({work:720,rest:720});
  expect(p.reviewReasons!.length).toBeGreaterThan(0);expect(p.shortBreakUntil||p.continuousUntil||p.breakDue).toBeTruthy();
 });
});
