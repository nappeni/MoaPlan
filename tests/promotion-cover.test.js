import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSlides} from '../src/promotion-slides.js';
test('legacy drafts gain a cover without losing any content, including eight-slide drafts',()=>{
 const content=Array.from({length:8},(_,i)=>({title:'본문'+i,body:'유지할 내용',backgroundId:'image'+i}));
 const a={title:'활동 표지',startDate:'2026-10-03',promotion:{status:'draft',slides:content}};
 const result=prepareSlides(a);
 assert.equal(result.length,9);assert.equal(result[0].role,'cover');
 assert.deepEqual(result.slice(1).map(s=>s.backgroundId),content.map(s=>s.backgroundId));
 assert.deepEqual(a.promotion.slides,content);
 assert.deepEqual(prepareSlides({...a,promotion:{status:'draft',slides:result}}),result);
 assert.deepEqual(prepareSlides({...a,promotion:{status:'published',slides:content}}),content);
});
test('activity and organization start with a cover and AI slide order is retained',()=>{
 for(const kind of ['organization','activity']){
  const a={kind,title:'표지 제목'};
  assert.equal(prepareSlides(a)[0].role,'cover');
  const generated=prepareSlides(a,{slides:[{title:'표지'},{title:'본문'}]});
  assert.deepEqual(generated.map(s=>s.role),['cover','content']);
  assert.deepEqual(generated.map(s=>s.title),['표지','본문']);
 }
});
