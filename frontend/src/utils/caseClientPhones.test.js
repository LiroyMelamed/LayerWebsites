import { caseClientPhones } from './caseClientPhones';
test('joins no stored phones and deduplicates equivalent local and international numbers for display',()=>{
 const record={PhoneNumber:'0999999999',Users:[{PhoneNumber:'050-1234567'},{PhoneNumber:'+972501234567'},{PhoneNumber:' 052 7654321 '},{PhoneNumber:null}]};
 const original=JSON.stringify(record);
 expect(caseClientPhones(record).join(', ')).toBe('050-1234567, 052 7654321');
 expect(JSON.stringify(record)).toBe(original);
 expect(caseClientPhones({PhoneNumber:'0500000000'})).toEqual(['0500000000']);
 expect(caseClientPhones({Users:[{}]})).toEqual([]);
});
