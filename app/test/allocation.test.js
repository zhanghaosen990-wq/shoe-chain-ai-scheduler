const {test}=require('node:test');
const assert=require('node:assert/strict');
const {distribute}=require('../allocation');
test('adding a second factory redistributes the whole order into positive feasible quantities',()=>{
 const result=distribute(500,[{id:'A',min:100,max:400},{id:'B',min:150,max:300}]);
 assert.equal(result.A+result.B,500);assert.ok(result.A>=100&&result.A<=400);assert.ok(result.B>=150&&result.B<=300);
});
test('redistribution respects asymmetric capacity and refuses infeasible selection',()=>{
 assert.deepEqual(distribute(800,[{id:'A',min:300,max:500},{id:'B',min:300,max:300}]),{A:500,B:300});
 assert.equal(distribute(500,[{id:'A',min:300,max:900},{id:'B',min:300,max:900}]),null);
 assert.equal(distribute(500,[{id:'A',min:100,max:0},{id:'B',min:100,max:900}]),null);
});
