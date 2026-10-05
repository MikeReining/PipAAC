import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {UserRelay} from '/Users/mike/dev/PipAAC/src/worker/relay.js';
import {PairingLobby} from '/Users/mike/dev/PipAAC/src/worker/lobby.js';
import {getDeviceIdentity,memoryKeyStore,exportPublicKey,exportDhPublic,signPayload,sealOp,newUserKey} from '/Users/mike/dev/PipAAC/public/shared/sync_crypto.mjs';
const output=[];
function fixture(){
 const raw=new DatabaseSync(':memory:');const sockets=[];let alarm=null;const objects=new Map();
 const ctx={blockConcurrencyWhile:async fn=>fn(),getWebSockets:()=>sockets,acceptWebSocket:ws=>sockets.push(ws),storage:{sql:{exec(sql,...args){if(sql.includes('CREATE TABLE')){raw.exec(sql);return{toArray:()=>[]};}const rows=raw.prepare(sql).all(...args);return{toArray:()=>rows};}},getAlarm:async()=>alarm,setAlarm:async n=>{alarm=n;},deleteAll:async()=>{},deleteAlarm:async()=>{alarm=null;}}};
 const env={BLOBS:{put:async(k,v)=>{objects.set(k,v);},get:async k=>objects.has(k)?{text:async()=>String(objects.get(k)),body:objects.get(k)}:null,delete:async k=>objects.delete(k)}};
 return{raw,ctx,env,sockets,objects};
}
const identity=await getDeviceIdentity(memoryKeyStore());
const signed=async(method,path,body)=>{
 const bytes=body===undefined?undefined:new TextEncoder().encode(JSON.stringify(body));const ts=Date.now();
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes??new Uint8Array()))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const sig=await signPayload(identity.sign,`${method}\n${path.split('?')[0]}\n${ts}\n${hash}`);
 return new Request('https://relay'+path,{method,headers:{'x-pip-device':identity.deviceId,'x-pip-ts':String(ts),'x-pip-sig':sig},body:bytes});
};
const init=async f=>{const relay=new UserRelay(f.ctx,f.env);const res=await relay.fetch(new Request('https://relay/users/audit/bootstrap',{method:'POST',body:JSON.stringify({device_id:identity.deviceId,pubkey:await exportPublicKey(identity.verify),dh_pub:await exportDhPublic(identity.dh.publicKey)})}));if(!res.ok)throw new Error(await res.text());return relay;};
// 1: removed sockets still receive ops and can send model messages.
{
 const f=fixture();const relay=await init(f);const removed='dev_removed';
 f.raw.prepare('INSERT INTO device(device_id,pubkey,epoch,added_at)VALUES(?,?,1,1)').run(removed,'unused');
 const received=[];const ws={send:m=>received.push(JSON.parse(m)),deserializeAttachment:()=>({d:removed}),close(){}};f.sockets.push(ws);
 await relay.fetch(await signed('DELETE','/users/audit/devices/'+removed));
 const key=await newUserKey();const env=await sealOp(key,{kind:'create_entity',args:{name:'Local synthetic'}});
 await relay.fetch(await signed('POST','/users/audit/ops',{ops:[{op_id:'op_worker_audit',env}]}));
 const other=[];f.sockets.push({send:m=>other.push(JSON.parse(m))});
 relay.webSocketMessage(ws,JSON.stringify({t:'model',e:1,env:{iv:'synthetic',ct:'synthetic'}}));
 output.push({case:'revoked-open-socket',deviceStillRegistered:!!f.raw.prepare('SELECT device_id FROM device WHERE device_id=?').get(removed),removedSocketReceived:received.map(m=>m.t),modeledMessageRebroadcast:other.map(m=>m.t)});f.raw.close();
}
// 2: websocket attachment accesses .device_id on verify's string result.
{
 const f=fixture();const relay=await init(f);const saved=[];
 globalThis.WebSocketPair=class{constructor(){this[0]={};this[1]={serializeAttachment:a=>saved.push(a)};}};
 const path='/users/audit/ws',ts=Date.now(),sig=await signPayload(identity.sign,`GET\n${path}\n${ts}`);
 let err=null;try{await relay.fetch(new Request(`https://relay${path}?device=${identity.deviceId}&ts=${ts}&sig=${sig}`,{headers:{Upgrade:'websocket'}}));}catch(e){err=String(e.message);}
 output.push({case:'websocket-sender-identity',authenticatedDevice:identity.deviceId,attachmentJson:JSON.stringify(saved[0]),nodeUpgradeLimitation:err});f.raw.close();delete globalThis.WebSocketPair;
}
// 3: pairing lobby accepts but discards a supplied epoch 3.
{
 const f=fixture();const lobby=new PairingLobby(f.ctx,f.env);
 const request=(tail,body)=>new Request('https://lobby/pair/ABCD2345'+tail,{method:'POST',body:JSON.stringify(body)});
 await lobby.fetch(request('/init',{}));await lobby.fetch(request('/claim',{device_id:'dev_new',sig_pub:'sig',dh_pub:'dh'}));
 await lobby.fetch(request('/grant',{user_id:'audit-user',by_device:'dev_owner',epoch:3,eph:'eph',iv:'iv',wrapped:'wrapped'}));
 const response=await(await lobby.fetch(new Request('https://lobby/pair/ABCD2345'))).json();
 output.push({case:'pairing-epoch-dropped',sentEpoch:3,returnedGrant:response.grant,newClientDefaultEpoch:response.grant.epoch??1});f.raw.close();
}
// 4: overlapping R2 snapshot writes can regress the watermark.
{
 const f=fixture();const relay=await init(f);let releaseOld;let startedOld;const started=new Promise(r=>startedOld=r);
 f.env.BLOBS.put=async(k,v)=>{const val=JSON.parse(new TextDecoder().decode(v));if(val.tag==='old'){startedOld();await new Promise(r=>releaseOld=r);}f.objects.set(k,v);};
 const olderReq=await signed('PUT','/users/audit/snapshot?seq=500',{tag:'old'});
 const older=relay.fetch(olderReq);await started;
 await relay.fetch(await signed('PUT','/users/audit/snapshot?seq=600',{tag:'new'}));
 const afterNew=relay.metaGet('snapshot_seq');releaseOld();await older;
 output.push({case:'snapshot-overlap-regression',afterNew:Number(afterNew),afterOlderCompletes:Number(relay.metaGet('snapshot_seq')),storedTag:JSON.parse(new TextDecoder().decode(f.objects.get('s/audit'))).tag});f.raw.close();
}
// 5: completed bootstrap cannot be retried after its HTTP response is lost.
{
 const f=fixture();const relay=await init(f);
 const again=await relay.fetch(new Request('https://relay/users/audit/bootstrap',{method:'POST',body:JSON.stringify({device_id:identity.deviceId,pubkey:await exportPublicKey(identity.verify)})}));
 output.push({case:'bootstrap-response-loss',sameDeviceRetryStatus:again.status,body:await again.json()});f.raw.close();
}
writeFileSync('/private/tmp/pip-sync-audit-2026-10-04/worker-results.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
