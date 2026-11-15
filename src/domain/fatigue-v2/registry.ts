import type {Profile} from "../model";
import {standardSolo} from "./standard-solo";
import {standardTwoUp} from "./standard-two-up";
import {standardBus} from "./standard-bus";
import {bfmSolo} from "./bfm-solo";
import {bfmTwoUp} from "./bfm-two-up";
import type {DriverRules} from "./types";
export const ALL_BUILTIN_RULESETS=[standardSolo,standardTwoUp,standardBus,bfmSolo,bfmTwoUp] as const;
export function policyFor(p:Pick<Profile,"scheme"|"twoUp"> & {standardBus?:boolean}):DriverRules|null{
 if(p.scheme==="Standard")return p.standardBus?standardBus:p.twoUp?standardTwoUp:standardSolo;
 if(p.scheme==="BFM")return p.twoUp?bfmTwoUp:bfmSolo;
 // AFM/ACH/exemptions are not standard-mode tables: certificate needed.
 return null;
}
