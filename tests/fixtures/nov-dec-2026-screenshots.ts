/** Screenshot-derived fixtures, 15 Nov–16 Dec 2026. Work Diary Mate is
 * comparative behaviour, not a statutory legal determination. Both source
 * screenshots were filled independently, so their different blocks are outputs. */
const raw = `
2026-11-15 R84,W12 | R84,W12
2026-11-16 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-11-17 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-11-18 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-11-19 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-11-20 W12,R1,W10,R1,W10,R2,W6,R42,W12 | =
2026-11-21 R24,W24,R28,W20 | R24,W24,R1,W10,R1,W2,R22,W12
2026-11-22 R24,W6,R66 | R24,W2,R70
2026-11-23 R30,W24,R1,W10,R1,W10,R2,W12,R6 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-11-24 R30,W24,R1,W10,R1,W10,R2,W12,R6 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-11-25 R30,W24,R1,W10,R1,W10,R2,W12,R6 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-11-26 R30,W24,R1,W10,R1,W10,R2,W12,R6 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-11-27 R30,W16,R50 | R26,W16,R54
2026-11-28 R96 | =
2026-11-29 R84,W12 | =
2026-11-30 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-12-01 W12,R1,W10,R1,W10,R2,W12,R36,W12 | W12,R1,W9,R1,W11,R2,W12,R36,W12
2026-12-02 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-12-03 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-12-04 W12,R1,W10,R1,W10,R2,W6,R42,W12 | =
2026-12-05 R24,W24,R1,W7,R28,W12 | R24,W24,R1,W7,R4,W5,R19,W12
2026-12-06 R24,W7,R65 | R24,W2,R70
2026-12-07 R31,W24,R1,W10,R1,W10,R2,W12,R5 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-12-08 R31,W24,R1,W10,R1,W10,R2,W12,R5 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-12-09 R31,W24,R1,W10,R1,W10,R2,W12,R5 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-12-10 R31,W24,R1,W10,R1,W10,R2,W12,R5 | R26,W24,R1,W10,R1,W10,R2,W12,R10
2026-12-11 R31,W16,R49 | R26,W16,R54
2026-12-12 R96 | =
2026-12-13 R84,W12 | =
2026-12-14 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-12-15 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
2026-12-16 W12,R1,W10,R1,W10,R2,W12,R36,W12 | =
`.trim();
function decode(value:string) {
 const blocks=value.split(',').flatMap(part=>{
  const match=/^([WR])(\d+)$/.exec(part.trim());
  if(!match)throw Error('Bad screenshot fixture segment '+part);
  return Array(Number(match[2])).fill(match[1] as 'W'|'R');
 });
 if(blocks.length!==96) throw Error('Screenshot day is not 96 blocks: '+value+' -> '+blocks.length);
 return blocks;
}
export const screenshotComparison = raw.split('\n').map(line=>{
 const match=/^(\d{4}-\d{2}-\d{2}) (.+?) \| (.+)$/.exec(line.trim());
 if(!match)throw Error('Bad screenshot fixture line '+line);
 const reference=decode(match[2]),aps=decode(match[3]==='='?match[2]:match[3]);
 return {date:match[1],reference,aps,
  referenceWork:reference.filter(x=>x==='W').length*15,
  apsWork:aps.filter(x=>x==='W').length*15,
  differingSlots:reference.filter((x,i)=>x!==aps[i]).length};
});
