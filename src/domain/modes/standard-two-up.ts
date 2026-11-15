import {row,type PeriodRule} from './types';
/** 2026 NHVR written diary Table 3, page 24: Standard Two-up. */
export const STANDARD_TWO_UP:readonly PeriodRule[] = Object.freeze([
 row(330,315,15,'breaks'),row(480,450,30,'breaks'),
 row(660,600,60,'breaks'),row(1440,720,300,'stationary-or-sleeper'),
 row(3120,null,600,'stationary'),row(10080,3600,1440,'weekly'),
 row(20160,7200,0,'nights')
]);