import {row,type PeriodRule} from './types';
/** 2026 NHVR written diary Table 4, page 25: accredited BFM Solo.
 * The independent 36h long/night and 84h checkpoint requirements are
 * enforced by the dedicated cumulative layer, NOT waived by this table. */
export const BFM_SOLO:readonly PeriodRule[] = Object.freeze([
 row(375,360,15,'breaks'),row(540,510,30,'breaks'),
 row(720,660,60,'breaks'),row(1440,840,420,'stationary'),
 row(20160,8640,0,'nights')
]);