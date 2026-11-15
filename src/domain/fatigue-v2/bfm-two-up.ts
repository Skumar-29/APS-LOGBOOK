import type {DriverRules} from "./types";
export const bfmTwoUp:DriverRules={
 id:"bfm-two-up",label:"BFM Two-up",sourcePage:25,requiresCertificate:true,
 windows:[
 {id:"daily-24",periodMinutes:1440,maxWorkMinutes:840,minimumRestMinutes:0,rest:"none",anchor:"any-rest"},
 {id:"extended-82",periodMinutes:4920,maxWorkMinutes:null,minimumRestMinutes:600,rest:"stationary",anchor:"major-10"},
 {id:"weekly-7",periodMinutes:10080,maxWorkMinutes:4200,minimumRestMinutes:1440,rest:"two-up-seven-day",anchor:"major-24"},
 {id:"fortnight-14",periodMinutes:20160,maxWorkMinutes:8400,minimumRestMinutes:0,rest:"night-four",anchor:"night-or-24"}
 ]};
