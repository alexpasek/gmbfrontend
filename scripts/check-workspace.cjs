// Render every workspace screen and key composer states without network calls.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { buildSync } = require('../../backend/node_modules/esbuild');
const root = path.resolve(__dirname, '..');
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gmb-ui-check-')), 'check.cjs');
buildSync({
  stdin: { resolveDir: root, loader: 'jsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import assert from 'node:assert/strict';
    import App from './src/App.jsx';
    import SchedulePanel from './src/components/SchedulePanel.jsx';
    globalThis.fetch = () => { throw new Error('UI checks must not call live services'); };
    const tabs = ['dashboard','profiles','history','photo-scheduler','performance','scheduler','bulk','youtube-poster','blog-automation','api-coverage','diagnostics'];
    for (const tab of tabs) {
      globalThis.localStorage = {getItem: key => key === 'gmbviking_tab' ? tab : null};
      globalThis.window = {location: {pathname: '/'}, localStorage};
      const html = renderToStaticMarkup(<App />);
      assert.ok(html.includes('aria-current="page"'), tab + ' needs active navigation');
      assert.ok(html.includes('id="active-profile"'), tab + ' needs business selector');
      if (tab === 'profiles') {
        assert.ok(html.indexOf('1. Write your update') < html.indexOf('Business settings'));
        assert.ok(html.includes('2. Choose a photo'));
        assert.ok(html.includes('3. Review your post'));
        assert.ok(html.includes('Choose a photo'));
      }
      console.log('Rendered screen:', tab);
    }
    const noOp = () => {};
    const props = {hasProfile: true, profileName: 'EPF Mississauga', serviceTopics: [], postTypes: [{value:'STANDARD',label:'Update'},{value:'EVENT',label:'Event'},{value:'OFFER',label:'Offer'}], postText:'A local service update', ctaOptions: [], autoCadenceDays:1, postType:'STANDARD', scheduleDate:'',scheduleTime:'',eventTitle:'',eventStart:'',eventEnd:'',offerTitle:'',offerCoupon:'',offerRedeemUrl:'', onChangePostText:noOp,onChangeServiceTopicId:noOp,onChangePostType:noOp,onChangeScheduleDate:noOp,onChangeScheduleTime:noOp,onChangeAutoCadence:noOp,onChangeEventTitle:noOp,onChangeEventStart:noOp,onChangeEventEnd:noOp,onChangeOfferTitle:noOp,onChangeOfferCoupon:noOp,onChangeOfferRedeemUrl:noOp};
    for (const type of ['STANDARD','EVENT','OFFER']) {
      const html = renderToStaticMarkup(<SchedulePanel {...props} postType={type} />);
      assert.ok(html.includes('Publish now'));
      assert.ok(html.indexOf('id="post-copy"') < html.indexOf('Publish now'));
      if (type === 'EVENT') assert.ok(html.includes('Event start'));
      if (type === 'OFFER') assert.ok(html.includes('Coupon code'));
      console.log('Rendered composer:', type);
    }
    const empty = renderToStaticMarkup(<SchedulePanel {...props} hasProfile={false} profileName="" />);
    assert.match(empty, /disabled="">Publish now/);
    assert.match(empty, /disabled="">Schedule post/);
    assert.ok(empty.includes('Choose a business at the top'));
    console.log('No-business state: publishing and scheduling disabled');
  ` },
  outfile: out, bundle: true, platform: 'node', format: 'cjs',
  loader: {'.css':'empty','.PNG':'dataurl','.png':'dataurl'},
  define: {'import.meta.env':'{}'}, logLevel:'silent'
});
require(out);

// Execute the actual scheduling handler with a stub API. No posts are created.
(async () => {
  const assert = require('node:assert/strict');
  const source = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
  const start = source.indexOf('  async function autoScheduleWithAi()');
  const end = source.indexOf('\n  async function buildBulkDrafts()', start);
  const handlerSource = source.slice(start, end);
  for (const scenario of [
    {name:'no photos', images:[], media:'', expected:0},
    {name:'single selected photo', images:[], media:'https://example.com/ceiling.jpg', expected:1},
    {name:'batch bounded by frequency', images:Array.from({length:5}, (_,i)=>({url:`https://example.com/${i}.jpg`})), media:'', expected:4}
  ]) {
    const calls = [];
    const notices = [];
    const scope = {
      selectedId:'test-profile', bulkImages:scenario.images, mediaUrl:scenario.media,
      effectiveComposerTopicId:'ceilings', bulkDurationPreset:'7', bulkDurationCustom:'',autoCadenceDays:2,
      scheduleDate:'2026-10-01',scheduleTime:'10:00', cta:'LEARN_MORE',linkUrl:'https://example.com',phoneCandidate:'',postType:'STANDARD',eventTitle:'',eventStart:'',eventEnd:'',offerTitle:'',offerCoupon:'',offerRedeemUrl:'',composerTopic:{label:'Ceilings'},
      setBulkBusy:()=>{},setBulkDrafts:()=>{},loadScheduledPosts:async()=>{},notify:message=>notices.push(message),
      api:{draftScheduledPosts:async payload=>{calls.push(payload);return {items:payload.images.map((body,i)=>({id:i,body}))};},commitScheduledPosts:async items=>calls.push(items)}
    };
    await new Function(...Object.keys(scope), handlerSource + '\nreturn autoScheduleWithAi();')(...Object.values(scope));
    if (!scenario.expected) {assert.equal(calls.length,0);assert.match(notices[0],/Select at least one image/);}
    else {assert.equal(calls[0].images.length,scenario.expected);assert.equal(calls[1].length,scenario.expected);assert.match(notices[0],/Scheduled/);}
    console.log('AI scheduling:', scenario.name);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
