import { chromium } from '../../../frontend/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve('docs/ui-refinement/round1-critic');
const browser = await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const checks=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
await page.goto('http://127.0.0.1:5183');await page.waitForTimeout(500);await shot('default-1440');
checks.push({name:'initial page',body:await page.locator('body').innerText(),tabs:await page.getByRole('tab').allTextContents()});
checks.push({name:'clock',time:await page.locator('time').evaluate(e=>({text:e.innerText,datetime:e.dateTime,title:e.title}))});
await page.getByRole('button',{name:'Open Command Picture',exact:true}).click();await shot('command-1440');
checks.push({name:'command active',selected:await page.getByRole('tab',{selected:true}).allTextContents()});
await page.getByRole('button',{name:'3D View options',exact:true}).click();await shot('menu-1440');
checks.push({name:'menu',items:await page.getByRole('menuitem').allTextContents()});
await page.getByRole('menuitem',{name:'Open to Side',exact:true}).click();await shot('split-1440');
checks.push({name:'split',tabs:await page.getByRole('tab').allTextContents(),separators:await page.getByRole('separator').count()});
const separator=page.getByRole('separator').first();
if(await separator.count()){
 const before=await separator.boundingBox(); await separator.focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft'); const after=await separator.boundingBox(); checks.push({name:'keyboard resize',before,after});
 await shot('split-focus-1440');
}
await page.getByRole('button',{name:'Close 3D View view',exact:true}).click();checks.push({name:'close 3d',tabs:await page.getByRole('tab').allTextContents()});
await page.getByRole('button',{name:'Open 3D View from Views',exact:true}).click();checks.push({name:'reopen 3d',tabs:await page.getByRole('tab').allTextContents()});
await page.getByRole('button',{name:'Hide Views list',exact:true}).click();await shot('sidebar-hidden-1440');checks.push({name:'sidebar hidden',sidebar:await page.getByRole('complementary').count()});
await page.getByRole('button',{name:'Show Views list',exact:true}).click();
await page.getByRole('button',{name:'Open Map',exact:true}).focus();await page.keyboard.press('ArrowDown');checks.push({name:'activity keyboard arrow',focus:await page.locator(':focus').getAttribute('aria-label')});await page.keyboard.press('Enter');
await page.getByRole('button',{name:'Keyboard shortcuts',exact:true}).click();await shot('shortcuts-1440');await page.keyboard.press('Escape');checks.push({name:'dialog Escape',dialogs:await page.getByRole('dialog').count(),focus:await page.locator(':focus').getAttribute('aria-label')});
await page.getByRole('tab',{name:'Command Picture',exact:true}).focus();await shot('tab-focus-1440');await page.keyboard.press('F6');checks.push({name:'F6',focus:await page.locator(':focus').evaluate(e=>({role:e.getAttribute('role'),label:e.getAttribute('aria-label'),class:e.className}))});
await page.getByRole('tab',{name:'Command Picture',exact:true}).focus();await page.keyboard.press('Control+Delete');checks.push({name:'keyboard close',tabs:await page.getByRole('tab').allTextContents()});
for(const size of [{width:1920,height:1080},{width:3840,height:2160}]){await page.setViewportSize(size);await page.getByRole('button',{name:'Open Tactical Map from Views',exact:true}).click();await shot(`default-${size.width}`);await page.getByRole('button',{name:'Timeline options',exact:true}).click();await page.getByRole('menuitem',{name:'Open to Side',exact:true}).click();await shot(`split-${size.width}`);checks.push({name:`overflow-${size.width}`,overflow:await page.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth,h:innerHeight,sh:document.documentElement.scrollHeight}))});await page.getByRole('button',{name:'Close Timeline view',exact:true}).click();}
checks.push({name:'disabled modules',buttons:await page.locator('.activity-button:disabled').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),opacity:getComputedStyle(e).opacity,color:getComputedStyle(e).color})))});
checks.push({name:'page errors',errors});fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));await browser.close();
