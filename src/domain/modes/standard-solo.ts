import {row,type PeriodRule} from './types';
/** 2026 NHVR written diary Table 1, page 24: Standard Solo. */
export const STANDARD_SOLO:readonly PeriodRule[] = Object.freeze([
 row(330,315,15,'breaks'),row(480,450,30,'breaks'),
 row(660,600,60,'breaks'),row(1440,720,420,'stationary'),
 row(10080,4320,1440,'stationary'),row(20160,8640,0,'nights')
]);