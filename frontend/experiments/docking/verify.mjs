import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.SPIKE_URL??'http://127.0.0.1:5178';
const evidence=new URL(process.env.SPIKE_EVIDENCE??'./evidence/',import.meta.url);await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={date:new Date().toISOString(),browser:browser.version(),base,viewport:{width:1440,height:900},versions:JSON.parse(await readFile('package.json','utf8')),results:[]};
const visible=(page,id)=>page.locator(`[data-probe="${id}"]:visible`);
for(const engine of ['flex','golden']){
  const context=await browser.newContext({viewport:report.viewport});const page=await context.newPage();
  const errors=[],consoleMessages=[];
  const monitor=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(['warning','error'].includes(m.type()))consoleMessages.push({type:m.type(),text:m.text()});});};
  monitor(page);context.on('page',monitor);
  const result={engine,checks:[],errors,consoleMessages};report.results.push(result);
  const check=(name,detail)=>result.checks.push({name,passed:true,detail});
  try{
    await page.goto(`${base}/?engine=${engine}`);await visible(page,'context').waitFor();
    const tabSelector=engine==='flex'?'.flexlayout__tab_button_content':'.lm_title';
    await page.locator(tabSelector).filter({hasText:/^Chart$/}).first().click();await visible(page,'chart').waitFor();
    await page.locator(tabSelector).filter({hasText:/^Context$/}).first().click();await visible(page,'context').waitFor();
    check('tab activation','Context → Chart → Context');
    await visible(page,'context').getByRole('button',{name:'Toggle selection'}).click();
    await visible(page,'context').getByRole('button',{name:'Advance time'}).click();
    await page.getByRole('button',{name:'Split chart',exact:true}).click();await visible(page,'chart').waitFor();
    assert.equal(await visible(page,'chart').locator('[data-selection]').textContent(),'ENTITY-B');
    assert.equal(await visible(page,'chart').locator('[data-time]').textContent(),'Time 1');
    check('split and shared context','Selection ENTITY-B / time 1 survived split');
    const chart=page.locator('[data-chart]:visible');await chart.locator('canvas').waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-chart]')?.dataset.values==='[11,21]');
    check('ECharts updates','Canvas mounted with time-dependent [11,21] values');
    const before=await chart.boundingBox();
    const splitter=page.locator(engine==='flex'?'.flexlayout__splitter':'.lm_splitter').filter({visible:true}).first();
    const box=await splitter.boundingBox();assert(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+120,box.y+box.height/2,{steps:12});await page.mouse.up();
    await page.waitForTimeout(250);const after=await chart.boundingBox();assert(Math.abs(after.width-before.width)>50);
    assert(Math.abs(Number(await chart.getAttribute('data-chart-width'))-after.width)<2);
    check('splitter and chart resize',{before:before.width,after:after.width});
    await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(250);
    const viewportBox=await chart.boundingBox();assert(Math.abs(Number(await chart.getAttribute('data-chart-width'))-viewportBox.width)<2);
    check('viewport resize',viewportBox);await page.setViewportSize(report.viewport);
    await page.screenshot({path:new URL(`${engine}-split.png`,evidence).pathname.replace(/^\/([A-Z]:)/,'$1')});
    for(let cycle=1;cycle<=2;cycle++){
      const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Pop chart',exact:true}).click();const popup=await popupPromise;
      await visible(popup,'chart').waitFor();await popup.locator('[data-chart] canvas').waitFor();
      // Main context may be in a background tab after Golden's close/pop-in.
      if(!await visible(page,'context').count())await page.locator(tabSelector).filter({hasText:/^Context$/}).first().click();
      await visible(page,'context').getByRole('button',{name:'Advance time'}).click();
      const time=1+cycle;
      await popup.waitForFunction(t=>document.querySelector('[data-time]')?.textContent===`Time ${t}`,time);
      await visible(popup,'chart').getByRole('button',{name:'Toggle selection'}).click();
      const expected=cycle===1?'ENTITY-A':'ENTITY-B';
      await page.waitForFunction(v=>document.querySelector('[data-probe="context"] [data-selection]')?.textContent===v,expected);
      await popup.setViewportSize({width:900,height:700});await popup.waitForTimeout(250);
      const childChart=popup.locator('[data-chart]');const childBox=await childChart.boundingBox();
      assert(childBox.width>100);assert(Math.abs(Number(await childChart.getAttribute('data-chart-width'))-childBox.width)<2);
      if(cycle===1)await popup.screenshot({path:new URL(`${engine}-popout.png`,evidence).pathname.replace(/^\/([A-Z]:)/,'$1')});
      // Browser window.close fires beforeunload, unlike Playwright's forced page.close.
      await popup.evaluate(()=>window.close());await popup.waitForEvent('close').catch(()=>{});
      await page.waitForTimeout(350);await visible(page,'chart').waitFor();
      assert.equal(await visible(page,'chart').locator('[data-time]').textContent(),`Time ${time}`);
      check(`popout cycle ${cycle}`,{sharedTime:time,bidirectionalSelection:expected,childResize:childBox,layoutAfterClose:await page.evaluate(()=>window.probe.layout())});
    }
    await page.getByRole('button',{name:'Open chart',exact:true}).click();await visible(page,'chart').waitFor();
    check('open after child close','Chart is usable; same session revision');
    await page.getByRole('button',{name:'Close chart',exact:true}).click();
    await page.locator('[data-probe="chart"]').waitFor({state:'detached'});
    await page.getByRole('button',{name:'Open chart',exact:true}).click();await visible(page,'chart').waitFor();
    assert.equal(await visible(page,'chart').locator('[data-time]').textContent(),'Time 3');
    check('tab close/reopen','View remounts with shared time 3');
    await page.evaluate(()=>{window.savedOpen=window.open;window.open=()=>null;});
    await page.getByRole('button',{name:'Pop chart',exact:true}).click();
    await page.waitForTimeout(250);await visible(page,'chart').waitFor();
    check('blocked popup',{layout:await page.evaluate(()=>window.probe.layout()),message:await page.locator('#error').textContent()});
    await page.evaluate(()=>{window.open=window.savedOpen;});
    assert.deepEqual(errors,[]);check('runtime errors','No pageerror events');
  }catch(error){result.failure=String(error);result.layoutAtFailure=await page.evaluate(()=>window.probe?.layout());result.messageAtFailure=await page.locator('#error').textContent();await page.screenshot({path:new URL(`${engine}-failure.png`,evidence).pathname.replace(/^\/([A-Z]:)/,'$1')});}
  await context.close();
}
await browser.close();await writeFile(new URL('results.json',evidence),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.results.map(({engine,checks,failure,errors})=>({engine,checks:checks.map(c=>c.name),failure,errors})),null,2));
if(report.results.some(r=>r.failure))process.exitCode=1;
