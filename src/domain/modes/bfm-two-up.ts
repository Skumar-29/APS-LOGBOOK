import {row,type PeriodRule} from './types';
/** 2026 NHVR written diary Table 5, page 25: accredited BFM Two-up. */
export const BFM_TWO_UP:readonly PeriodRule[] = Object.freeze([
 row(1440,840,0,'stationary'),row(4920,null,600,'stationary'),
 row(10080,4200,1440,'weekly'),row(20160,8400,0,'nights')
]);