import express from "express";
import crypto from "node:crypto";
import { scanRefundLosses } from "./src/scanner.js";
import { LOSS_SCAN_QUERY, normalizeShopifyOrders } from "./src/shopify-query.js";
import { subscriptionMutation, PLANS } from "./src/billing.js";

const app=express();
const PORT=Number(process.env.PORT||3000);
const API_VERSION="2026-07";
const sessions=new Map();

function cleanShop(shop=""){ return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)?shop:null; }
function hmacOk(query){
  const {hmac,...rest}=query; if(!hmac||!process.env.SHOPIFY_API_SECRET) return false;
  const msg=Object.keys(rest).sort().map(k=>`${k}=${Array.isArray(rest[k])?rest[k].join(","):rest[k]}`).join("&");
  const digest=crypto.createHmac("sha256",process.env.SHOPIFY_API_SECRET).update(msg).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(String(hmac)));
}
async function gql(shop,token,query,variables={}){
  const r=await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`,{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":token},body:JSON.stringify({query,variables})});
  if(!r.ok) throw new Error(`Shopify GraphQL ${r.status}`); return r.json();
}
app.get("/health",(_,res)=>res.json({ok:true,service:"refund-recovery"}));
app.get("/auth",(req,res)=>{
  const shop=cleanShop(req.query.shop); if(!shop) return res.status(400).send("Invalid shop");
  const state=crypto.randomBytes(16).toString("hex"); sessions.set("state:"+state,{shop,created:Date.now()});
  const redirect=`${process.env.APP_URL}/auth/callback`;
  const u=new URL(`https://${shop}/admin/oauth/authorize`);
  u.searchParams.set("client_id",process.env.SHOPIFY_API_KEY); u.searchParams.set("scope","read_orders,read_returns");
  u.searchParams.set("redirect_uri",redirect); u.searchParams.set("state",state); res.redirect(u.toString());
});
app.get("/auth/callback",async(req,res)=>{
  if(!hmacOk(req.query)) return res.status(401).send("Invalid signature");
  const shop=cleanShop(req.query.shop), saved=sessions.get("state:"+req.query.state);
  if(!shop||!saved||saved.shop!==shop) return res.status(401).send("Invalid state");
  const r=await fetch(`https://${shop}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:process.env.SHOPIFY_API_KEY,client_secret:process.env.SHOPIFY_API_SECRET,code:req.query.code})});
  const token=await r.json(); if(!token.access_token) return res.status(400).json(token);
  sessions.set(shop,{accessToken:token.access_token,scope:token.scope}); sessions.delete("state:"+req.query.state); res.redirect(`/?shop=${encodeURIComponent(shop)}`);
});
app.get("/api/scan",async(req,res)=>{
  const shop=cleanShop(req.query.shop), session=sessions.get(shop); if(!session) return res.status(401).json({error:"Install/authenticate first"});
  let cursor=null, all=[], pages=0;
  do { const p=await gql(shop,session.accessToken,LOSS_SCAN_QUERY,{cursor}); const normalized=normalizeShopifyOrders(p); all.push(...normalized); const info=p?.data?.orders?.pageInfo; cursor=info?.hasNextPage?info.endCursor:null; pages++; } while(cursor&&pages<20);
  res.json(scanRefundLosses(all));
});
app.post("/api/billing/:plan",express.json(),async(req,res)=>{
  const shop=cleanShop(req.query.shop), session=sessions.get(shop); if(!session) return res.status(401).json({error:"Authenticate first"});
  try { const b=subscriptionMutation(req.params.plan,`${process.env.APP_URL}/?shop=${encodeURIComponent(shop)}&billing=complete`); const p=await gql(shop,session.accessToken,b.query,b.variables); const out=p?.data?.appSubscriptionCreate; if(out?.userErrors?.length) return res.status(400).json(out); res.json({confirmationUrl:out.confirmationUrl}); } catch(e){res.status(400).json({error:e.message});}
});
app.post("/webhooks",express.raw({type:"application/json"}),(req,res)=>{ res.status(200).send("ok"); });
app.get("/",(req,res)=>{
 const shop=String(req.query.shop||"");
 res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Refund Recovery</title><style>body{font-family:system-ui;margin:0;background:#f5f7f5;color:#152018}.wrap{max-width:960px;margin:60px auto;padding:24px}.card{background:white;border:1px solid #dfe5df;border-radius:16px;padding:28px;margin:18px 0}button,a.btn{background:#163d2a;color:white;border:0;border-radius:10px;padding:12px 18px;text-decoration:none;font-weight:700;cursor:pointer}.money{font-size:48px;font-weight:800}pre{white-space:pre-wrap}</style></head><body><div class="wrap"><h1>Refund Recovery</h1><p>Find refunds and returns that may have leaked inventory or money.</p><div class="card"><h2>Free loss scan</h2><p>Read-only. We never issue refunds or change inventory.</p><button onclick="scan()">Scan my store</button><div id="result"></div></div><div class="card"><h2>Continuous monitoring</h2><p>Growth $79/month · Pro $149/month</p><button onclick="bill('growth')">Start Growth</button> <button onclick="bill('pro')">Start Pro</button></div></div><script>const shop=${JSON.stringify(shop)};async function scan(){const e=document.getElementById('result');e.textContent='Scanning…';const r=await fetch('/api/scan?shop='+encodeURIComponent(shop));const j=await r.json();e.innerHTML=j.error?'<p>'+j.error+'</p>':'<div class="money">$'+Number(j.knownAmount||0).toLocaleString()+'</div><p>'+j.findingCount+' items need review</p><pre>'+JSON.stringify(j.findings,null,2)+'</pre>'}async function bill(p){const r=await fetch('/api/billing/'+p+'?shop='+encodeURIComponent(shop),{method:'POST'});const j=await r.json();if(j.confirmationUrl)location.href=j.confirmationUrl;else alert(j.error||JSON.stringify(j))}</script></body></html>`);
});
app.listen(PORT,()=>console.log(`Refund Recovery listening on ${PORT}`));
