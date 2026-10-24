import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOwnerPasswordStore} from '../lib/owner-auth.js';
import {ensureShopCollections} from '../lib/shop-catalog.js';

test('owner size correction preserves paid prices and financial reporting', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kvn-size-price-'));
  const seed=ensureShopCollections({users:[{id:'owner',role:'owner',name:'Test Owner'}],organizations:[],events:[],orders:[],settings:{}});
  seed.shopProducts[0].unitAmountBySize['4XL']=4200;
  seed.shopOrders=[2999,3900].map((price,i)=>({id:`paid-${i}`,status:'paid',fulfillmentStatus:'awaiting_fulfillment',items:[{productId:seed.shopProducts[0].id,size:'M',quantity:1,unitAmount:price}],merchandiseSubtotal:price,shippingAmount:500,amountTotal:price+500}));
  fs.writeFileSync(path.join(dir,'store.json'),JSON.stringify(seed));
  createOwnerPasswordStore({dataDir:dir,bootstrapPassword:'test-only-password-123'});
  const port=43000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,HOME:dir,PORT:String(port),BASE_URL:base,DATA_DIR:dir,UPLOAD_DIR:path.join(dir,'uploads'),OWNER_EMAIL:'owner@example.test'},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),5000);child.stdout.on('data',c=>{if(String(c).includes('running at')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error('server exited'));});});
  const login=await fetch(base+'/api/auth/owner',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'test-only-password-123'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  for(const [i,price] of [2999,3900].entries()){
    const response=await fetch(base+`/api/shop/orders/paid-${i}/size`,{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({itemIndex:0,size:'4XL'})});
    assert.equal(response.status,200);
    const {order}=await response.json();
    assert.equal(order.items[0].size,'4XL');
    assert.equal(order.items[0].unitAmount,price);
    assert.equal(order.merchandiseSubtotal,price);
    assert.equal(order.amountTotal,price+500);
  }
  const report=await (await fetch(base+'/api/shop/orders',{headers:{cookie}})).json();
  assert.equal(report.metrics.merchandiseRevenue,6899);
  assert.equal(report.metrics.grossRevenue,7899);
  assert.equal(report.products[0].sizeInventory['4XL'],seed.shopProducts[0].sizeInventory['4XL']-2);
  assert.equal(report.products[0].sizeInventory.M,seed.shopProducts[0].sizeInventory.M+2);
});
