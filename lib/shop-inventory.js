import crypto from 'crypto';
import { ensureShopCollections } from './shop-catalog.js';

export class ShopInventoryError extends Error {
  constructor(message,statusCode=409){ super(message); this.name='ShopInventoryError'; this.statusCode=statusCode; }
}

const instant = clock => (typeof clock === 'function' ? clock() : new Date());
const quantityOf = lines => lines.reduce((sum,line)=>sum+line.quantity,0);

function aggregateLines(lines=[]) {
  const aggregate = new Map();
  for (const source of lines) {
    const productId=String(source.productId||''),size=String(source.size||'');
    const quantity=Number(source.quantity);
    if(!productId||!size||!Number.isInteger(quantity)||quantity<=0) throw new ShopInventoryError('Choose a valid size and quantity.',400);
    const key=`${productId}:${size}`,prior=aggregate.get(key);
    if(prior) prior.quantity+=quantity;
    else aggregate.set(key,{productId,size,quantity});
  }
  if(!aggregate.size) throw new ShopInventoryError('Your shop cart is empty.',400);
  return [...aggregate.values()];
}

export function releaseExpiredShopReservations(store,clock=()=>new Date()) {
  ensureShopCollections(store);
  const now=instant(clock).getTime();
  for(const reservation of store.shopReservations){
    if(reservation.status==='pending'&&new Date(reservation.expiresAt).getTime()<=now){
      reservation.status='expired';
      reservation.expiredAt=new Date(now).toISOString();
    }
  }
  return store.shopReservations;
}

function pendingDemand(store,productId,size) {
  return store.shopReservations.filter(item=>item.status==='pending').flatMap(item=>item.lines)
    .filter(line=>line.productId===productId&&line.size===size)
    .reduce((sum,line)=>sum+line.quantity,0);
}

export function reserveShopInventory(store,request,clock=()=>new Date()) {
  ensureShopCollections(store);
  releaseExpiredShopReservations(store,clock);
  const lines=aggregateLines(request?.lines);
  for(const line of lines){
    const product=store.shopProducts.find(item=>item.id===line.productId&&item.active!==false);
    if(!product||!product.sizes.includes(line.size)) throw new ShopInventoryError('Choose an available product and size.',400);
    const remaining=Math.max(0,Number(product.sizeInventory?.[line.size]||0)-pendingDemand(store,line.productId,line.size));
    if(line.quantity>remaining) throw new ShopInventoryError(`Only ${remaining} ${line.size} remaining.`,409);
  }
  const totalPending=store.shopReservations.filter(item=>item.status==='pending').reduce((sum,item)=>sum+quantityOf(item.lines),0);
  const totalRemaining=store.shopProducts.reduce((sum,product)=>sum+Object.values(product.sizeInventory||{}).reduce((n,value)=>n+Number(value||0),0),0)-totalPending;
  if(quantityOf(lines)>totalRemaining) throw new ShopInventoryError(`Only ${Math.max(0,totalRemaining)} Collector’s Edition shirts remaining.`,409);
  const createdAt=instant(clock),reservation={
    id:`shr_${crypto.randomBytes(6).toString('hex')}`,
    orderId:String(request?.orderId||''),lines,status:'pending',createdAt:createdAt.toISOString(),
    expiresAt:new Date(createdAt.getTime()+31*60*1000).toISOString()
  };
  store.shopReservations.push(reservation);
  return reservation;
}

export function commitShopReservation(store,reservationId,orderId,clock=()=>new Date()) {
  ensureShopCollections(store);
  const reservation=store.shopReservations.find(item=>item.id===reservationId);
  if(!reservation) throw new ShopInventoryError('Shop reservation not found.',404);
  if(reservation.status==='committed'){
    if(reservation.orderId!==orderId) throw new ShopInventoryError('Shop reservation belongs to another order.',409);
    return store.collectorAssignments.filter(item=>item.orderId===orderId);
  }
  if(reservation.status!=='pending'||new Date(reservation.expiresAt).getTime()<=instant(clock).getTime()) throw new ShopInventoryError('Shop reservation has expired.',409);
  const count=quantityOf(reservation.lines),used=new Set(store.collectorAssignments.map(item=>item.number)),numbers=[];
  for(let candidate=1;numbers.length<count&&candidate<=250;candidate++) if(!used.has(candidate)) numbers.push(candidate);
  if(numbers.length!==count) throw new ShopInventoryError('Collector inventory is sold out.',409);
  for(const line of reservation.lines){
    const product=store.shopProducts.find(item=>item.id===line.productId);
    const available=Number(product?.sizeInventory?.[line.size]||0);
    if(!product||line.quantity>available) throw new ShopInventoryError(`Only ${available} ${line.size} remaining.`,409);
  }
  for(const line of reservation.lines){
    const product=store.shopProducts.find(item=>item.id===line.productId);
    product.sizeInventory[line.size]-=line.quantity;
  }
  const assignedAt=instant(clock).toISOString(),assignments=numbers.map(number=>({
    number,displayNumber:String(number).padStart(3,'0'),orderId,status:'active',assignedAt
  }));
  store.collectorAssignments.push(...assignments);
  reservation.status='committed';reservation.orderId=orderId;reservation.committedAt=assignedAt;
  return assignments;
}

export function restoreShopInventory(store,order,clock=()=>new Date()) {
  ensureShopCollections(store);
  if(order.inventoryRestoredAt) return order;
  for(const line of order.items||[]){
    const product=store.shopProducts.find(item=>item.id===line.productId);
    if(product&&product.sizeInventory?.[line.size]!=null) product.sizeInventory[line.size]+=Number(line.quantity||0);
  }
  for(const assignment of store.collectorAssignments.filter(item=>item.orderId===order.id)) assignment.status='refunded';
  order.inventoryRestoredAt=instant(clock).toISOString();
  return order;
}
