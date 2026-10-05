import{DatabaseSync}from'node:sqlite';import{readFileSync,writeFileSync}from'node:fs';
import{importCatalog}from'/Users/mike/dev/PipAAC/public/shared/import.mjs';
import{createGroup,swapGroups,createEntity,renameEntity}from'/Users/mike/dev/PipAAC/public/shared/groups.mjs';
import{listOps,drainOps,snapshotSynced,adoptSnapshot}from'/Users/mike/dev/PipAAC/public/shared/ops.mjs';
import{writeStatsDay}from'/Users/mike/dev/PipAAC/public/shared/stats.mjs';
import{setOverride,overrideFor}from'/Users/mike/dev/PipAAC/public/shared/voice.mjs';
import{memoryKeyStore,ensureRecoveryRoot,getUserKey,putUserKey,deriveEpochKey,sealOp,openOp,getDeviceIdentity}from'/Users/mike/dev/PipAAC/public/shared/sync_crypto.mjs';
const catalog=JSON.parse(readFileSync('/Users/mike/dev/PipAAC/public/catalog.json','utf8'));const out=[];
const open=()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(catalog.schemaSql);importCatalog(db,catalog);return db;};
{
 const db=open();createGroup(db,{id:'grp_audit_a',name:'A',indexSlot:80});createGroup(db,{id:'grp_audit_b',name:'B',indexSlot:81});swapGroups(db,'grp_audit_a','grp_audit_b');
 const stream=listOps(db).map((o,i)=>({...o,relay_seq:i+1}));const seats=()=>db.prepare("SELECT id,index_slot FROM board_group WHERE id LIKE 'grp_audit_%' ORDER BY id").all();
 const before=seats();drainOps(db,stream);const once=seats();drainOps(db,stream);const twice=seats();out.push({case:'repeat-confirmed-swap',before,once,twice});db.close();
}
{
 const db=open();createEntity(db,{id:'ent_audio',name:'Old name'});renameEntity(db,'ent_audio','Middle name');renameEntity(db,'ent_audio','New name');setOverride(db,{id:'ovr_audit',itemKind:'entity',itemId:'ent_audio',key:'blob:'+ 'a'.repeat(64),recordedText:'New name'});
 const stream=listOps(db).map((o,i)=>({...o,relay_seq:i+1}));drainOps(db,stream);const once=overrideFor(db,'entity','ent_audio');drainOps(db,stream);const twice=overrideFor(db,'entity','ent_audio');out.push({case:'repeat-confirmed-recording',once,twice,rows:db.prepare('SELECT id,status FROM clip_override').all()});db.close();
}
{
 const a=open();writeStatsDay(a,20000,'dev_audit',1,{words:12});const snap=snapshotSynced(a);const b=open();adoptSnapshot(b,snap);out.push({case:'stats-missing-snapshot',source:a.prepare('SELECT day,device_id,payload FROM stats_day').all(),restored:b.prepare('SELECT * FROM stats_day').all(),snapshotHasStats:Object.hasOwn(snap,'stats_day')});a.close();b.close();
}
{
 const a=memoryKeyStore(),b=memoryKeyStore();const root=await ensureRecoveryRoot(a,'audit');await putUserKey(b,'audit',await getUserKey(a,'audit',1),1);const pairedOwnerRotation=await getUserKey(b,'audit',2),cardKey=await deriveEpochKey(root,2);const env=await sealOp(pairedOwnerRotation,{kind:'create_entity',args:{id:'ent_audit',name:'Audit'}});let restored=false;try{await openOp(cardKey,env);restored=true;}catch{}out.push({case:'paired-owner-rotation-card',restoredFromOriginalCard:restored});
}
{
 const store=memoryKeyStore();const ids=await Promise.all([getDeviceIdentity(store),getDeviceIdentity(store),getDeviceIdentity(store)]);const stored=await getDeviceIdentity(store);out.push({case:'concurrent-identity-generation',returned:ids.map(x=>x.deviceId),stored:stored.deviceId});
}
{
 const db=open();const old=snapshotSynced(db);delete old.supporter_name;let error=null;try{adoptSnapshot(db,old);}catch(e){error=e.message;}out.push({case:'snapshot-missing-table',error});db.close();
}
writeFileSync('/private/tmp/pip-sync-audit-2026-10-04/state-results.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
