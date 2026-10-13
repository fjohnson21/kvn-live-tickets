import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {chromium} from 'playwright';
import {registerSponsoredRoutes} from '../lib/sponsored-routes.js';
import {beginClaim} from '../lib/sponsored-passes.js';
for(const width of [320,390])test(`owner verification recovery and manual issuance at ${width}px`,async t=>{
 let disk={events:[{id:'ev',slug:'kingdom-vibe-live-2026',organizationId:'org',status:'published',products:[]}],orders:[],disciples:[]},mail=[];
 beginClaim(disk,{name:'Pending Guest',email:'pending@example.test',phone:'9195550100',city:'Sanford',state:'NC',zip:'27330',interests:['attend']});
 const app=express();app.use(express.json());app.use(express.static('public'));const server=app.listen(0);t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 registerSponsoredRoutes(app,{readStore:()=>structuredClone(disk),writeStore:s=>{disk=structuredClone(s)},baseUrl:base,auth:(q,s,n)=>{q.user={id:'owner'};n()},owner:(q,s,n)=>n(),sendMail:async m=>{mail.push(m);return {id:'test_email'}}});
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/sponsored-admin.html');await page.locator('#pendingVerifications details').waitFor();await page.locator('#pendingVerifications summary').click();await page.getByRole('button',{name:'Resend Verification'}).click();await page.getByText('Fresh verification email accepted by provider.',{exact:false}).waitFor();assert.equal(mail.length,1);
 for(const [key,value]of Object.entries({name:'Manual Guest',email:'manual@example.test',phone:'9195550101'}))await page.locator(`#manualIssue [name=${key}]`).fill(value);await page.locator('#manualIssue [name=quantity]').selectOption('2');await page.locator('#manualIssue button').click();await page.locator('#manualResult a').waitFor();assert.equal(disk.orders.length,1);assert.equal(disk.orders[0].tickets.length,2);assert.equal(disk.orders[0].status,'complimentary');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(errors,[]);await page.screenshot({path:`/tmp/kvn-recovery-${width}.png`,fullPage:true});
});
