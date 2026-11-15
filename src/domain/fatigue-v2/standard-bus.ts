import type {DriverRules} from "./types";
/** Table 2 on page 24: standard fatigue-regulated bus/coach hours. */
export const standardBus:DriverRules={
 id:"standard-bus",label:"Standard Bus/Coach",sourcePage:24,requiresCertificate:false,
 windows:[
 {id:"short-330",periodMinutes:330,maxWorkMinutes:315,minimumRestMinutes:15,rest:"short-15",anchor:"any-rest"},
 {id:"short-480",periodMinutes:480,maxWorkMinutes:450,minimumRestMinutes:30,rest:"short-30",anchor:"any-rest"},
 {id:"short-660",periodMinutes:660,maxWorkMinutes:600,minimumRestMinutes:60,rest:"short-60",anchor:"any-rest"},
 {id:"daily-24",periodMinutes:1440,maxWorkMinutes:720,minimumRestMinutes:420,rest:"stationary",anchor:"major-7"},
 {id:"weekly-7",periodMinutes:10080,maxWorkMinutes:null,minimumRestMinutes:0,rest:"night-six",anchor:"night-or-24"},
 {id:"four-weeks-28",periodMinutes:40320,maxWorkMinutes:17280,minimumRestMinutes:0,rest:"bus-28-day",anchor:"major-24"}
 ]};
