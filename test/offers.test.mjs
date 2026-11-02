import test from 'node:test';
import assert from 'node:assert/strict';
import { offerError, OFFER_STARTERS } from '../src/lib/offers.mjs';
const b={topicType:'OFFER',offerTitle:'Painting labour offer',offerStart:'2099-11-01',offerEnd:'2099-11-30',offerRedeemUrl:''};
test('offer form allows optional redemption and blocks invalid promotion dates',()=>{
 assert.equal(offerError(b),'');
 for(const patch of [{offerTitle:''},{offerStart:''},{offerEnd:'2099-02-29'},{offerEnd:'2099-10-31'},{offerRedeemUrl:'javascript:alert(1)'}]) assert.notEqual(offerError({...b,...patch}),'');
 assert.notEqual(offerError(b,'2099-12-01T15:00:00Z'),'');
 assert.equal(offerError({topicType:'STANDARD'}),'');
});
test('starter copy does not invent discounts or coupon codes',()=>{
 assert.equal(OFFER_STARTERS.length,3);
 for(const s of OFFER_STARTERS){assert.ok(s.title.length<=58);assert.doesNotMatch(s.copy,/\d+%|free|guarantee/i);}
});
