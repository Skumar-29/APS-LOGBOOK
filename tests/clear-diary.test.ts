import { it, expect } from 'vitest';
import { emptyState, ensureDay, clone } from '../src/domain/model';
import { clearTestDiary } from '../src/domain/clear-diary';
it('clears all diary sources while preserving every unrelated workspace field', () => {
 const s=emptyState(); ensureDay(s,'2026-11-08').slots[80]='work'; ensureDay(s,'2026-12-20').slots[0]='work';
 s.pages.push({id:'p',bookId:'b',number:'1',date:'2026-11-08',status:'Cancelled',reason:'test'});
 const before=clone(s); clearTestDiary(s,'CLEAR');
 expect(s.days).toEqual({}); expect(s.activities).toEqual([]); expect(s.pages).toEqual([]);
 for(const k of Object.keys(before) as (keyof typeof s)[]) if(!['days','activities','pages','audit'].includes(k)) expect(s[k]).toEqual(before[k]);
 expect(s.audit.at(-1)?.action).toBe('Clear test diary');
});
it('rejects missing confirmation and an active timer without changing data', () => {
 const s=emptyState(); ensureDay(s,'2026-11-08').slots[0]='work';
 const before=clone(s); expect(()=>clearTestDiary(s,'clear')).toThrow('CLEAR'); expect(s).toEqual(before);
 s.timer={id:'t',kind:'work',start:Date.now(),zone:s.profile.zone,vehicle:'',restType:'stationary',profile:s.profile};
 const running=clone(s); expect(()=>clearTestDiary(s,'CLEAR')).toThrow('active timer'); expect(s).toEqual(running);
});
