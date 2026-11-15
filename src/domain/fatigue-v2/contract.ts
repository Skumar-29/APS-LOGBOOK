import type {DaySummary} from "../timeline";
import type {RestClassification} from "../rest";
export interface Check {
 label:string;start:string;end:string;work:number;limit:number|null;rest:number;requiredRest:number;
 status:"Exceeded"|"Needs review"|"Within work cap"|"Rest due"|"Open period";
 remaining:number;date:string;reason:string;assessedThrough:string;restSummary?:string;zone?:string;
}
export interface WorkWindow {
 start:string;end:string;limit:number|null;established:boolean;assessedThrough:string;
 zone?:string;work:number;rest:number;requiredRest:number;remaining:number;status:Check["status"];review:boolean;unknown:number;
}
export interface Finding {
 id:string;code:string;message:string;severity:"breach"|"review"|"due";
 start:string;end:string;at:string;date:string;zone?:string;instant?:number;
}
export interface RuleReport {
 breachSlots:Record<string,string[]>;restSlots:Record<string,string[]>;workWindows:WorkWindow[];
 checks:Check[];issues:string[];findings:Finding[];days:DaySummary[];
 restClassifications:Record<string,RestClassification>;
 lastWork:string;majorRest:string;nightRests:number;nightRestPair?:boolean;longNight:number;workSince24:number;
 nextBreak:number|null;restartAt:string|null;controlling:Check|null;
 assessedThrough:string;source:string;version:string;revision:number;zone?:string;
 checkpoint84?:{work:number;since:string;exact:boolean};
 longNightStart?:string;longNightEnd?:string;longNightZone?:string;
}
