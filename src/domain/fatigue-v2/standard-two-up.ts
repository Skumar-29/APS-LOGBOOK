import type {DriverRules} from "./types";
export const standardTwoUp:DriverRules={
 id:"standard-two-up",label:"Standard Two-up",sourcePage:24,requiresCertificate:false,
 windows:[
 {id:"short-330",periodMinutes:330,maxWorkMinutes:315,minimumRestMinutes:15,rest:"short-15",anchor:"any-rest"},
 {id:"short-480",periodMinutes:480,maxWorkMinutes:450,minimumRestMinutes:30,rest:"short-30",anchor:"any-rest"},
 {id:"short-660",periodMinutes:660,maxWorkMinutes:600,minimumRestMinutes:60,rest:"short-60",anchor:"any-rest"},
 {id:"daily-24",periodMinutes:1440,maxWorkMinutes:720,minimumRestMinutes:300,rest:"stationary-or-approved-moving-sleeper",anchor:"major-5"},
 {id:"extended-52",periodMinutes:3120,maxWorkMinutes:null,minimumRestMinutes:600,rest:"stationary",anchor:"major-10"},
 {id:"weekly-7",periodMinutes:10080,maxWorkMinutes:3600,minimumRestMinutes:1440,rest:"two-up-seven-day",anchor:"major-24"},
 {id:"fortnight-14",periodMinutes:20160,maxWorkMinutes:7200,minimumRestMinutes:0,rest:"night-four-paired",anchor:"night-or-24"}
 ]};
