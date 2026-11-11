/** Transcription of the 64 user-supplied screenshots, 15 November–16 December 2026.
 * Each hex value describes 96 consecutive quarter-hour cells, MSB = 00:00.
 * These are two INDEPENDENT end states produced by clearing each app's own red Work.
 * They are not identical inputs and DiaryMate output is NOT legal authority.
 * Check source artifact: APS_Logbook_32_Day_Screenshot_Fixture.json.
 */
import {emptyState,ensureDay} from "../../src/domain/model";
import {dateAdd} from "../../src/domain/time";
export const startDate="2026-11-15";
const aps=[
 "000000000000000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfc0000000000fff",
 "000000ffffff7fec00000fff","000000c00000000000000000",
 "0000003fffffdffbff3ffc00","0000003fffffdffbff3ffc00",
 "0000003fffffdffbff3ffc00","0000003fffffdffbff3ffc00",
 "0000003fffc0000000000000","000000000000000000000000",
 "000000000000000000000fff","fff7feffcfff000000000fff",
 "fff7fdffcfff000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfc0000000000fff",
 "000000ffffff7f0f80000fff","000000c00000000000000000",
 "0000003fffffdffbff3ffc00","0000003fffffdffbff3ffc00",
 "0000003fffffdffbff3ffc00","0000003fffffdffbff3ffc00",
 "0000003fffc0000000000000","000000000000000000000000",
 "000000000000000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfff000000000fff"
];
const diaryMate=[
 "000000000000000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfc0000000000fff",
 "000000ffffff0000000fffff","000000fc0000000000000000",
 "00000003fffffdffbff3ffc0","00000003fffffdffbff3ffc0",
 "00000003fffffdffbff3ffc0","00000003fffffdffbff3ffc0",
 "00000003fffc000000000000","000000000000000000000000",
 "000000000000000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfc0000000000fff",
 "000000ffffff7f0000000fff","000000fe0000000000000000",
 "00000001fffffeffdff9ffe0","00000001fffffeffdff9ffe0",
 "00000001fffffeffdff9ffe0","00000001fffffeffdff9ffe0",
 "00000001fffe000000000000","000000000000000000000000",
 "000000000000000000000fff","fff7feffcfff000000000fff",
 "fff7feffcfff000000000fff","fff7feffcfff000000000fff"
];
export function screenshotDays(source:"APS"|"DiaryMate") {
  const masks=source==="APS"?aps:diaryMate;
  return masks.map((mask,i)=>({
    date:dateAdd(startDate,i),
    slots:Array.from({length:96},(_,j)=>(BigInt("0x"+mask)&(1n<<BigInt(95-j)))!==0n?"work" as const:"rest" as const)
  }));
}
export function screenshotWorkspace(source:"APS"|"DiaryMate") {
 const s=emptyState();s.onboarded=true;s.settings.autoPages=false;
 s.settings.diaryRestDefault="stationary";
 Object.assign(s.profile,{scheme:"BFM",twoUp:false,base:"NSW",zone:"Australia/Sydney",
   operation:"HVNL",certificate:"SCREENSHOT-TEST",certificateExpiry:"2027-12-31"});
 for(const row of screenshotDays(source)){
  const d=ensureDay(s,row.date);d.restDefault="stationary";d.slots=row.slots;
 }
 return s;
}
