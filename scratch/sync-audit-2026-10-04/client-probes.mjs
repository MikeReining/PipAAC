import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import * as ops from '/Users/mike/dev/PipAAC/public/shared/ops.mjs';
import * as cryptoApi from '/Users/mike/dev/PipAAC/public/shared/sync_crypto.mjs';
import { importCatalog } from '/Users/mike/dev/PipAAC/public/shared/import.mjs';
import { createEntity, setEntityPhoto } from '/Users/mike/dev/PipAAC/public/shared/groups.mjs';
const catalog=JSON.parse(readFileSync('/Users/mike/dev/PipAAC/public/catalog.json','utf8'));
const syncSource=readFileSync('/Users/mike/dev/PipAAC/public/shared/sync.mjs','utf8');
const output=[];
const tick=async()=>{for(let i=0;i<20;i++) await new Promise(r=>setTimeout(r,5));};
function openDb(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(catalog.schemaSql);importCatalog(db,catalog);return db;}
async function runtime({cfg={userId:'audit-user',epoch:1,cursor:1},persist=async()=>true,rows=[],snapshot=null,epoch=1,allKeys=null,submitFails=false,localBlob=null,setup=null}={}){
 const db=openDb(); const seed=ops.listOps(db).map((o,i)=>({...o,relay_seq:i+1}));ops.drainOps(db,seed);setup?.(db);
 const store=cryptoApi.memoryKeyStore();const identity=await cryptoApi.getDeviceIdentity(store);
 const keys=allKeys??{1:await cryptoApi.newUserKey()};await cryptoApi.putUserKey(store,'audit-user',keys[cfg.epoch],cfg.epoch);
 const saved=[];const puts=[];const submits=[];const timers=new Map();let nextTimer=0;let latest=500;const sockets=[];const warnings=[];
 const backend={rows,snapshot,epoch,submitFails,localBlob};
 class WS {static OPEN=1;constructor(){this.readyState=0;sockets.push(this);}send(){}close(){this.readyState=3;this.onclose?.();}}
 const ctx=vm.createContext({crypto,TextEncoder,TextDecoder,Uint8Array,CompressionStream,DecompressionStream,Response,Blob,WebSocket:WS,location:{origin:'https://audit.invalid'},document:{},addEventListener(){},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},console:{warn(...a){warnings.push(String(a.at(-1)));}}});
 const modules={
  './ops.mjs':ops,
  '../db.js':{loadBlobBytes:async()=>backend.localBlob,saveBlobBytes:async()=>{},setBlobFetcher:()=>{}},
  './platform.mjs':{onOnline:()=>{},onVisible:()=>{}},
  './sync_crypto.mjs':{...cryptoApi,openKeyStore:()=>store},
  './sync_client.mjs':{relayClient:({userKey})=>({
   fetchOps:async(after)=>({ops:backend.rows.filter(r=>r.relay_seq>after)}),
   getSnapshot:async()=>backend.snapshot,
   putSnapshot:async(payload,seq)=>{puts.push({payload,seq});},
   selfKey:async()=>({current_epoch:backend.epoch,wrapped_key:JSON.stringify(await cryptoApi.wrapUserKey(keys[backend.epoch],await cryptoApi.exportDhPublic(identity.dh.publicKey)))}),
   wsUrl:async()=> 'wss://audit.invalid/ws',
   submit:async(list)=>{const sealed=[];for(const op of list)sealed.push({op,env:await cryptoApi.sealOp(userKey,op)});submits.push(sealed);if(backend.submitFails)throw new Error('temporary failure');return{ops:list.map(o=>({op_id:o.op_id,relay_seq:++latest}))};},
   getBlob:async()=>{throw new Error('temporary blob failure');},
   putBlob:async()=>{throw new Error('temporary blob failure');},
  })},
 };
 const root=new vm.SourceTextModule(syncSource,{context:ctx});
 await root.link(async(spec)=>{const values=modules[spec];if(!values)throw new Error(spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context:ctx});});await root.evaluate();
 const user={id:'audit-user',sync:cfg};const handle=await root.namespace.initSync(db,user,async p=>{saved.push(structuredClone(p));Object.assign(user,p);},'https://audit.invalid',()=>{},null,persist);await tick();
 const timer=async(ms)=>{const entries=[...timers];for(const[id,t]of entries)if(t.ms===ms){timers.delete(id);t.fn();}await tick();};
 const row=async(op,seq,e=1)=>({relay_seq:seq,epoch:e,env:await cryptoApi.sealOp(keys[e],op)});
 return{db,store,keys,user,handle,backend,saved,puts,submits,timers,timer,sockets,root,warnings,row};
}
// 1: persist's actual failure signal is ignored before the cursor advances.
{
 const r=await runtime({persist:async()=>false});
 r.backend.rows=[await r.row({op_id:'op_savefail',kind:'create_entity',args:{id:'ent_savefail',name:'Unsaved'}},2)];
 r.sockets[0].onopen();await tick();
 output.push({case:'persist-false-cursor',persistResult:false,cursor:r.user.sync.cursor,registrySaved:r.saved.at(-1),entityInMemory:!!r.db.prepare("SELECT id FROM personal_entity WHERE id='ent_savefail'").get()});r.db.close();
}
// 2: rotating after inbound e2 does not rebuild the submitting client.
{
 const keys={1:await cryptoApi.newUserKey(),2:await cryptoApi.newUserKey()};const r=await runtime({allKeys:keys,epoch:2});
 const inbound=await r.row({op_id:'op_rotation',kind:'create_entity',args:{id:'ent_rotation',name:'Rotation'}},2,2);
 r.sockets[0].onmessage({data:JSON.stringify({t:'ops',ops:[inbound]})});await tick();
 createEntity(r.db,{id:'ent_after_rotation',name:'New edit'});await r.timer(300);
 const sealed=r.submits.at(-1).find(s=>s.op.op_id===ops.listOps(r.db).find(o=>o.kind==='create_entity'&&JSON.parse(o.args).id==='ent_after_rotation').op_id);
 const opens=async key=>{try{await cryptoApi.openOp(key,sealed.env);return true;}catch{return false;}};
 output.push({case:'stale-client-after-rotation',localEpoch:r.user.sync.epoch,opensWithEpoch1:await opens(keys[1]),opensWithEpoch2:await opens(keys[2])});r.db.close();
}
// 3: device missed e2 and relay only holds latest wrapped e3.
{
 const keys={1:await cryptoApi.newUserKey(),2:await cryptoApi.newUserKey(),3:await cryptoApi.newUserKey()};const r=await runtime({allKeys:keys,epoch:3});
 r.backend.rows=[await r.row({op_id:'op_missed_epoch',kind:'create_entity',args:{id:'ent_missed_epoch',name:'Missed'}},2,2)];
 r.sockets[0].onopen();await tick();
 output.push({case:'missed-intermediate-epoch',epoch:r.user.sync.epoch,cursor:r.user.sync.cursor,entityPresent:!!r.db.prepare("SELECT id FROM personal_entity WHERE id='ent_missed_epoch'").get(),health:r.root.namespace.syncHealth(),warnings:r.warnings});r.db.close();
}
// 4: maximum observed sequence is not a complete prefix for a snapshot.
{
 const r=await runtime();createEntity(r.db,{id:'ent_audit_local',name:'Local only'});await r.timer(300);
 const snap=r.puts.at(-1);const plain=await cryptoApi.openOp(r.keys[1],snap.payload.env);
 output.push({case:'snapshot-incomplete-prefix',cursor:r.user.sync.cursor,snapshotSeq:snap.seq,knownSeqs:ops.listOps(r.db).filter(o=>o.relay_seq!==null).map(o=>o.relay_seq),snapshotEntityIds:plain.snap.personal_entity.map(e=>e.id)});r.db.close();
}
// 5: initial snapshot adoption advances registry without awaiting DB durability.
{
 const donor=openDb();createEntity(donor,{id:'ent_in_snapshot',name:'Snapshot only'});const keys={1:await cryptoApi.newUserKey()};
 const snapshot={e:1,env:await cryptoApi.sealOp(keys[1],{seq:500,snap:ops.snapshotSynced(donor)})};let persists=0;
 const r=await runtime({cfg:{userId:'audit-user',epoch:1,cursor:0},allKeys:keys,snapshot,persist:async()=>{persists++;return true;}});
 output.push({case:'snapshot-cursor-without-persist',cursor:r.user.sync.cursor,persistCalls:persists,registrySaves:r.saved});r.db.close();donor.close();
}
// 6: a temporary submit failure does not re-arm an outbox retry on an open socket.
{
 const r=await runtime({submitFails:true});createEntity(r.db,{id:'ent_retry',name:'Retry'});await r.timer(300);
 output.push({case:'submit-retry-missing',submitAttempts:r.submits.length,pendingOps:ops.listOps(r.db).filter(o=>o.relay_seq===null).length,remainingTimerDurations:[...r.timers.values()].map(t=>t.ms),flushError:r.root.namespace.syncHealth().flushError});r.db.close();
}
// 7: failed ingest is omitted by save-status call path.
{
 const r=await runtime();r.backend.rows=[await r.row({op_id:'op_unknown',kind:'new_kind_from_newer_version',args:{}},2)];r.sockets[0].onopen();await tick();
 const {editorStatus}=await import('/Users/mike/dev/PipAAC/public/board/editor-find.js');const h=r.root.namespace.syncHealth();
 const pending=r.db.prepare('SELECT COUNT(*) AS n FROM sync_op WHERE relay_seq IS NULL').get().n;
 output.push({case:'ingest-error-saved-status',ingestError:h.ingestError?.split('\n')[0],pending,status:editorStatus({linked:true,pending,online:true,flushError:h.flushError,mediaPending:h.mediaPending,saveBlocked:false,saveError:null})});r.db.close();
}
// 8: transient upload failures with local bytes are discarded after ten tries.
{
 const r=await runtime({localBlob:new Uint8Array([1,2,3])});const sha='a'.repeat(64);createEntity(r.db,{id:'ent_media',name:'Photo'});setEntityPhoto(r.db,'ent_media','blob:'+sha);await r.handle.queueBlob(sha);await tick();
 let n=1;while((await r.store.get('blobq/audit-user'))?.length && n<20){const ms=[...r.timers.values()].find(t=>t.ms>=30000)?.ms;if(!ms)break;await r.timer(ms);n++;}
 output.push({case:'transient-media-drop',attempts:n,localBytesStillPresent:true,queue:await r.store.get('blobq/audit-user'),health:r.root.namespace.syncHealth()});r.db.close();
}
// 9: adopting a snapshot with no tail can confirm a pending edit it erased.
{
 const donor=openDb();const keys={1:await cryptoApi.newUserKey()};
 const snapshot={e:1,env:await cryptoApi.sealOp(keys[1],{seq:500,snap:ops.snapshotSynced(donor)})};
 const r=await runtime({cfg:{userId:'audit-user',epoch:1,cursor:0},allKeys:keys,snapshot,setup:db=>createEntity(db,{id:'ent_pending_snapshot',name:'Pending snapshot'})});
 const op=ops.listOps(r.db).find(o=>o.kind==='create_entity'&&JSON.parse(o.args).id==='ent_pending_snapshot');
 const published=await cryptoApi.openOp(keys[1],r.puts.at(-1).payload.env);
 output.push({case:'snapshot-erases-pending-with-no-tail',pendingOpNowConfirmedAt:op.relay_seq,entityPresent:!!r.db.prepare("SELECT id FROM personal_entity WHERE id='ent_pending_snapshot'").get(),publishedSnapshotSeq:published.seq,publishedEntityPresent:published.snap.personal_entity.some(e=>e.id==='ent_pending_snapshot')});r.db.close();donor.close();
}
// 10: a pruned log with no tail never triggers snapshot recovery.
{
 const donor=openDb();createEntity(donor,{id:'ent_pruned_snapshot',name:'Pruned snapshot'});const keys={1:await cryptoApi.newUserKey()};
 const snapshot={e:1,env:await cryptoApi.sealOp(keys[1],{seq:500,snap:ops.snapshotSynced(donor)})};
 const r=await runtime({cfg:{userId:'audit-user',epoch:1,cursor:1},allKeys:keys,snapshot});
 output.push({case:'pruned-backlog-empty-tail',cursor:r.user.sync.cursor,availableSnapshotSeq:500,snapshotEntityPresent:!!r.db.prepare("SELECT id FROM personal_entity WHERE id='ent_pruned_snapshot'").get()});r.db.close();donor.close();
}
writeFileSync('/private/tmp/pip-sync-audit-2026-10-04/client-results.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
