/** Gesture classification for a scrollable 15-minute diary grid.
 * Never treat vertical or ambiguous diagonal motion as a Work/Rest edit.
 * Native pan-y remains enabled; a tap toggles only if the finger barely moved.
 */
export type DiaryGestureAxis = "pending"|"horizontal"|"vertical";
export function classifyDiaryGesture(dx:number,dy:number,threshold=9):DiaryGestureAxis {
  const x=Math.abs(dx),y=Math.abs(dy);
  if(!Number.isFinite(x)||!Number.isFinite(y))return "vertical";
  if(x<threshold && y<threshold)return "pending";
  // Require clearly horizontal intent; ambiguous diagonal is safe to ignore.
  if(x>=threshold && x>=1.5*y)return "horizontal";
  if(y>=threshold && y>=x)return "vertical";
  if(Math.max(x,y)>=18)return "vertical";
  return "pending";
}
export function isDeliberateDiaryTap(dx:number,dy:number):boolean {
  return Number.isFinite(dx) && Number.isFinite(dy) &&
    Math.hypot(dx,dy)<=6;
}
