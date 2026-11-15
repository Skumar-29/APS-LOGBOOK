import type {Profile} from '../model';
import type {PeriodRule} from './types';
import {STANDARD_SOLO} from './standard-solo';
import {STANDARD_TWO_UP} from './standard-two-up';
import {BFM_SOLO} from './bfm-solo';
import {BFM_TWO_UP} from './bfm-two-up';
/** Explicit mode selection — changing between solo/two-up never blends tables. */
export function modeTable(profile:Pick<Profile,'scheme'|'twoUp'>):PeriodRule[] {
 if(profile.scheme==='Standard')return [...(profile.twoUp?STANDARD_TWO_UP:STANDARD_SOLO)];
 if(profile.scheme==='BFM')return [...(profile.twoUp?BFM_TWO_UP:BFM_SOLO)];
 return [];
}
