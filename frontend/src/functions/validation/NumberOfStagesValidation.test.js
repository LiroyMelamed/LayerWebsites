import {NumberOfStagesValidation} from './NumberOfStagesValidation';
jest.mock('i18next',()=>({t:key=>key}));
test('accepts existing numeric values normalized by useFieldState',()=>{
 expect(NumberOfStagesValidation('8')).toBeNull();expect(NumberOfStagesValidation(8)).toBeNull();
});
test('rejects non-integer, negative and excessive stage counts',()=>{
 for(const value of ['abc','2.5','-1','0'])expect(NumberOfStagesValidation(value)).toBe('errors.numbersOnly');
 expect(NumberOfStagesValidation('21')).toBe('errors.maxStages15');
});
