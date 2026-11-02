import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
const cacheDir=mkdtempSync(join(tmpdir(),"gmb-offer-render-"));
const server=await createServer({cacheDir,server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try {
 const {default:Panel}=await server.ssrLoadModule('/src/components/SchedulePanel.jsx');
 const {default:Preview}=await server.ssrLoadModule('/src/components/PostPreview.jsx');
 const noop=()=>{};
 const props={postType:'OFFER',postTypes:[{value:'OFFER',label:'Offer / promotion'}],serviceTopics:[],offerTitle:'30% off painting labour',offerStart:'2026-11-01',offerEnd:'2026-11-30',offerTerms:'Materials excluded.',offerRedeemUrl:'https://example.com',postText:'Offer copy',onChangePostType:noop,onChangeOfferTitle:noop,onChangeOfferStart:noop,onChangeOfferEnd:noop,onChangeOfferTerms:noop,onChangeOfferRedeemUrl:noop,onChangePostText:noop,onChangeScheduleDate:noop,onChangeScheduleTime:noop,onChangeAutoCadence:noop};
 const html=renderToStaticMarkup(React.createElement(Panel,props));
 for(const text of ['Offer starts','Offer ends','Terms and exclusions','Offer redemption link','2026-11-30','Materials excluded.'])assert.ok(html.includes(text),text);
 const preview=renderToStaticMarkup(React.createElement(Preview,{offerDetails:{title:props.offerTitle,start:props.offerStart,end:props.offerEnd,terms:props.offerTerms,coupon:'TOGETHER30'},ctaLabel:'View offer'}));
 for(const text of ['30% off painting labour','2026-11-30','Materials excluded.','TOGETHER30','View offer'])assert.ok(preview.includes(text),text);
 console.log('Offer form and customer preview render all required fields.');
} finally {await server.close();rmSync(cacheDir,{recursive:true,force:true});}
