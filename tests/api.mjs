import {spawn} from 'node:child_process';import {mkdtemp,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
const root=fileURLToPath(new URL('..',import.meta.url)),temp=await mkdtemp(path.join(os.tmpdir(),'buzz-test-')),port=42000+Math.floor(Math.random()*10000),base='http://127.0.0.1:'+port,dbpath=path.join(temp,'test.sqlite');const processServer=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),DATABASE_PATH:dbpath},stdio:['ignore','pipe','pipe']});let log='';processServer.stderr.on('data',x=>log+=x);const results=[];
function client(){let cookie='';return{get cookie(){return cookie;},async req(url,data,extra={}){const response=await fetch(base+url,{method:data===undefined?'GET':'POST',headers:{Cookie:cookie,...(data===undefined?{}:{'Content-Type':'application/json'}),...extra},...(data===undefined?{}:{body:JSON.stringify(data)}),redirect:'manual'});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const t=await response.text();let body;try{body=JSON.parse(t);}catch{body=t;}return{status:response.status,body};}};}
async function test(name,fn){await fn();results.push({name,passed:true});console.log('PASS '+name);}
try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout '+log)),10000);processServer.once('exit',()=>{clearTimeout(timer);reject(Error(log));});processServer.stdout.on('data',()=>{clearTimeout(timer);resolve();});});const a=client(),b=client();const products=JSON.parse(await readFile(path.join(root,'data/items.json')));const p=products.find(p=>p.variants.some(v=>v.available&&v.inventory_quantity>=3)),v=p.variants.find(v=>v.available&&v.inventory_quantity>=3);
await test('Homepage and local source theme',async()=>{const r=await a.req('/');assert.equal(r.status,200);assert.match(r.body,/Sneaker Buzz/i);assert.match(r.body,/replica-client.js/);assert.doesNotMatch(r.body,/<script[^>]*src=["']https:\/\/www.googletagmanager/);});
await test('Recovered catalog: 1045 products and 56 Vans',async()=>{assert.equal((await a.req('/api/health')).body.products,1045);assert.equal((await a.req('/api/catalog')).body.total,1045);assert.equal((await a.req('/api/catalog?collection=/collections/vans')).body.total,56);});
await test('Search, sorting, pagination and original cards',async()=>{const r=(await a.req('/api/catalog?sort=price-asc')).body;assert.equal(r.handles.length,24);let prices=r.handles.map(h=>products.find(p=>p.handle===h).price);assert.deepEqual(prices,[...prices].sort((a,b)=>a-b));assert.equal((await a.req('/api/catalog?q=zzzznoexisting1234')).body.total,0);assert.notDeepEqual((await a.req('/api/catalog?page=2')).body.handles,r.handles);assert.equal((await a.req('/api/cards?handles='+p.handle)).body.html.length,1);assert.equal((await a.req('/api/catalog?filters='+encodeURIComponent(JSON.stringify([{field:'vendor',value:'Vans'}])))).body.total,56);});
await test('Empty cart and persistent session',async()=>{assert.equal((await a.req('/cart.js')).body.item_count,0);assert.match(a.cookie,/bbsid=/);});
await test('Cart adds, authoritative price, changes and updates',async()=>{assert.equal((await a.req('/cart/add.js',{id:v.id,quantity:1,price:1})).body.price,v.price);assert.equal((await a.req('/cart/add.js',{id:v.id,quantity:1})).body.quantity,2);assert.equal((await a.req('/cart.js')).body.total_price,v.price*2);assert.equal((await a.req('/cart/change.js',{id:v.id,quantity:3})).body.item_count,3);assert.equal((await a.req('/cart/update.js',{updates:{[v.id]:2}})).body.item_count,2);});
await test('Invalid variant, out-of-stock and invalid quantity',async()=>{for(const data of [{id:0,quantity:1},{id:v.id,quantity:-1},{id:v.id,quantity:1.5},{id:v.id,quantity:100}])assert.equal((await a.req('/cart/add.js',data)).status,422);const sold=products.flatMap(p=>p.variants).find(v=>!v.available);if(sold)assert.equal((await a.req('/cart/add.js',{id:sold.id,quantity:1})).status,422);});
await test('Cart session isolation',async()=>assert.equal((await b.req('/cart.js')).body.item_count,0));
await test('Cross-origin mutation rejection',async()=>assert.equal((await a.req('/cart/clear.js',{}, {Origin:'https://evil.example'})).status,403));
const email='qa@example.invalid',password='TestOnly9876';let userId;
await test('Registration, hash, session rotation, cart retention',async()=>{const old=a.cookie;const r=await a.req('/api/register',{email,password,first_name:'QA',last_name:'Test'});assert.equal(r.status,200);userId=r.body.customer.id;assert.notEqual(old,a.cookie);assert.equal((await a.req('/cart.js')).body.item_count,2);const d=new DatabaseSync(dbpath);const row=d.prepare('SELECT * FROM customers WHERE id=?').get(userId);assert.notEqual(row.password_hash,password);assert.equal(row.password_hash.length,64);assert.ok(row.salt.length>=32);d.close();});
await test('Logout, incorrect/correct login and duplicate email',async()=>{await a.req('/api/logout',{});assert.equal((await a.req('/api/session')).body.customer,null);assert.equal((await a.req('/api/login',{email,password:'wrong987'})).status,401);assert.equal((await a.req('/api/login',{email,password})).body.customer.id,userId);assert.equal((await a.req('/api/register',{email,password,first_name:'QA',last_name:'Test'})).status,422);});
await test('Newsletter independent persistence',async()=>{assert.equal((await a.req('/contact',{email})).status,200);const d=new DatabaseSync(dbpath);assert.ok(d.prepare('SELECT * FROM subscribers WHERE email=?').get(email));d.close();});
await test('Unconfigured provider APIs are explicit',async()=>{for(const url of ['/api/recover','/api/integration-disabled'])assert.equal((await a.req(url,{})).status,424);});
await test('Remove last cart item',async()=>assert.equal((await a.req('/cart/change.js',{id:v.id,quantity:0})).body.item_count,0));
await test('Source 404 paths and path traversal',async()=>{for(const p of ['/blogs/news/news','/collections/palladium','/pages/h','/products/giay-vans-mn-skate-half-cab-1','/unavailable'])assert.equal((await a.req(p)).status,404);assert.notEqual((await a.req('/assets/%2e%2e%2f%2e%2e%2fserver.mjs')).status,200);});
const manage = '/api/admin/store';
const testHandle = 'qa-store-product';
let testVariant, testOrder;
const newProduct = {
  handle:testHandle,title:'Giày QA',vendor:'QA',type:'Giày',image:'',description:'Dữ liệu kiểm thử',
  active:true,collections:['/collections/vans'],variants:[{sku:'QA-40',size:'40',color:'Đen',price:1200000,stock:2}],
};
await test('Admin rights explicitly granted and 1,045 products seeded in SQLite', async () => {
  assert.equal((await a.req(manage+'/overview')).status,403);
  assert.equal((await b.req(manage+'/overview')).status,401);
  assert.equal((await b.req('/api/register',{email:'operator@example.invalid',password,first_name:'QA',last_name:'Admin'})).status,200);
  const cli = spawn(process.execPath,['scripts/grant-admin.mjs','operator@example.invalid'],{cwd:root,env:{...process.env,DATABASE_PATH:dbpath}});
  assert.equal(await new Promise(resolve=>cli.once('exit',resolve)),0);
  assert.equal((await b.req('/admin')).status,200);
  const result=(await b.req(manage+'/overview')).body;
  assert.equal(result.products,1045);
  assert.equal(result.variants,products.reduce((n,p)=>n+p.variants.length,0));
});
await test('Product creation publishes its variants, detail and category membership', async () => {
  assert.equal((await a.req(manage+'/products',{...newProduct,create:true})).status,403);
  assert.equal((await b.req(manage+'/products',{...newProduct,create:true})).status,201);
  const r=await a.req('/products/'+testHandle+'.js');
  assert.equal(r.body.variants[0].price,120000000);
  testVariant=r.body.variants[0].id;
  assert.match((await a.req('/products/'+testHandle)).body,/Giày QA/);
  assert.equal((await a.req('/api/catalog?collection=/collections/vans&q=QA-40')).body.total,1);
  assert.equal((await b.req(manage+'/products',{...newProduct,create:true})).status,409);
});
await test('COD checkout validates price, reserves stock once and isolates order history', async () => {
  await a.req('/cart/add.js',{id:testVariant,quantity:2});
  const input={recipient:'Khách QA',phone:'0900000012',address:'Số 10, đường kiểm thử',note:'',request_id:'qa-checkout-request-01',expected_subtotal:1};
  assert.equal((await a.req('/api/orders',input)).status,409);
  const draft=(await a.req('/cart.js')).body;
  const first=await a.req('/api/orders',{...input,expected_subtotal:draft.total_price});
  assert.equal(first.status,201);
  testOrder=first.body.id;
  const retry=await a.req('/api/orders',{...input,expected_subtotal:draft.total_price});
  assert.equal(retry.body.id,testOrder);
  assert.equal((await a.req('/cart.js')).body.item_count,0);
  assert.equal((await a.req('/products/'+testHandle+'.js')).body.variants[0].inventory_quantity,0);
  assert.equal((await a.req('/api/chat/recommendations',{message:'giày QA đen size 40 dưới 2 triệu'})).body.products.length,0);
  assert.equal((await a.req('/api/orders')).body.rows.length,1);
  assert.equal((await b.req('/api/orders')).body.rows.length,0);
  assert.equal((await a.req(manage+'/orders',{id:testOrder,status:'cancelled'})).status,403);
});
await test('Stock edits detect stale snapshots, cancellation returns stock and hidden products disappear', async () => {
  const record=(await b.req(manage+'/products?handle='+testHandle)).body;
  assert.equal((await b.req(manage+'/products',{...record,variants:[{...record.variants[0],expected_stock:2}]})).status,409);
  assert.equal((await b.req(manage+'/orders',{id:testOrder,status:'completed'})).status,409);
  assert.equal((await b.req(manage+'/orders',{id:testOrder,status:'cancelled'})).status,200);
  assert.equal((await b.req(manage+'/orders',{id:testOrder,status:'cancelled'})).status,409);
  assert.equal((await a.req('/products/'+testHandle+'.js')).body.variants[0].inventory_quantity,2);
  assert.equal((await a.req('/api/chat/recommendations',{message:'giày QA đen size 40 dưới 2 triệu'})).body.products[0].variantId,testVariant);
  const current=(await b.req(manage+'/products?handle='+testHandle)).body;
  assert.equal((await b.req(manage+'/products',{...current,active:false})).status,200);
  assert.equal((await a.req('/products/'+testHandle)).status,404);
  assert.equal((await a.req('/api/catalog?q=QA-40')).body.total,0);
  assert.equal((await a.req('/api/chat/recommendations',{message:'giày QA đen size 40 dưới 2 triệu'})).body.products.length,0);
});
await test('Members edit their profile and locked accounts lose active sessions', async () => {
  assert.equal((await a.req('/api/account/profile',{first_name:'Tên mới',last_name:'QA'})).body.customer.first_name,'Tên mới');
  assert.equal((await b.req(manage+'/members',{id:userId,disabled:true})).status,200);
  assert.equal((await a.req('/api/session')).body.customer,null);
  assert.equal((await a.req('/api/login',{email,password})).status,401);
  assert.equal((await b.req(manage+'/members',{id:userId,disabled:false})).status,200);
  assert.equal((await a.req('/api/login',{email,password})).status,200);
});
await test('Vietnamese recommendation returns usable cards within budget and variant criteria', async () => {
  const api='/api/chat/recommendations';
  assert.equal((await a.req(api,{message:'  '})).status,422);
  const data=(await a.req(api,{message:'Giày Vans màu đen size 42 dưới 2 triệu'})).body;
  assert.ok(data.products.length>0 && data.products.length<=5);
  for (const card of data.products) {
    assert.match(card.url,/^\/products\//);
    assert.match(card.brand,/^vans$/i);
    assert.match(card.color,/black|đen/i);
    assert.equal(card.size,'42');
    assert.ok(card.price<=2000000 && card.image);
    const p=(await a.req(card.url+'.js')).body;
    assert.ok(p.variants.some(v=>v.id===card.variantId && v.available && v.price===card.price*100));
  }
  const range=(await a.req(api,{message:'giày từ 500k đến 1 triệu'})).body;
  assert.ok(range.products.length>0);
  assert.ok(range.products.every(p=>p.price>=500000 && p.price<=1000000));
  assert.equal((await a.req(api,{message:'giày Vans đen size 99 dưới 50k'})).body.products.length,0);
  const script=await a.req('/product-chat.js');
  assert.equal(script.status,200);
  assert.match(script.body,/api\/chat\/recommendations/);
});
console.log(JSON.stringify({passed:results.length,results},null,2));
}catch(e){console.error(e);process.exitCode=1;}finally{processServer.kill();await new Promise(r=>processServer.once('exit',r));await rm(temp,{recursive:true,force:true});}
