import type {DriverRules} from "./types";
export const bfmSolo:DriverRules={
 id:"bfm-solo",label:"BFM Solo",sourcePage:25,requiresCertificate:true,checkpoint84:true,longNightCapMinutes:2160,
 windows:[
 {id:"short-375",periodMinutes:375,maxWorkMinutes:360,minimumRestMinutes:15,rest:"short-15",anchor:"any-rest"},
 {id:"short-540",periodMinutes:540,maxWorkMinutes:510,minimumRestMinutes:30,rest:"short-30",anchor:"any-rest"},
 {id:"short-720",periodMinutes:720,maxWorkMinutes:660,minimumRestMinutes:60,rest:"short-60",anchor:"any-rest"},
 {id:"daily-24",periodMinutes:1440,maxWorkMinutes:840,minimumRestMinutes:420,rest:"stationary",anchor:"major-7"},
 {id:"fortnight-14",periodMinutes:20160,maxWorkMinutes:8640,minimumRestMinutes:0,rest:"bfm-solo-fourteen",anchor:"night-or-24"}
 ]};
