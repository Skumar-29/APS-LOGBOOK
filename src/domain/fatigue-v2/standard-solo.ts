import type {DriverRules} from "./types";
export const standardSolo:DriverRules={
 id:"standard-solo",label:"Standard Solo",sourcePage:24,requiresCertificate:false,
 windows:[
 {id:"short-330",periodMinutes:330,maxWorkMinutes:315,minimumRestMinutes:15,rest:"short-15",anchor:"any-rest"},
 {id:"short-480",periodMinutes:480,maxWorkMinutes:450,minimumRestMinutes:30,rest:"short-30",anchor:"any-rest"},
 {id:"short-660",periodMinutes:660,maxWorkMinutes:600,minimumRestMinutes:60,rest:"short-60",anchor:"any-rest"},
 {id:"daily-24",periodMinutes:1440,maxWorkMinutes:720,minimumRestMinutes:420,rest:"stationary",anchor:"major-7"},
 {id:"weekly-7",periodMinutes:10080,maxWorkMinutes:4320,minimumRestMinutes:1440,rest:"stationary",anchor:"major-24"},
 {id:"fortnight-14",periodMinutes:20160,maxWorkMinutes:8640,minimumRestMinutes:0,rest:"night-four-paired",anchor:"night-or-24"}
 ]};
