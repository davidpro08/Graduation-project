// Isolated PostgreSQL checks; no remote credentials or application data.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role authenticated; create role anon; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.messages(id uuid primary key,conversation_id uuid not null,owner_id uuid not null,body text not null,kind text not null);
 alter table public.messages enable row level security;
 create policy own on public.messages to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 grant select,insert,delete on public.messages to authenticated;`);
 await db.exec(readFileSync(resolve(__dirname,'../migrations/20261107000000_message_claims.sql'),'utf8'));
 const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',message='00000000-0000-0000-0000-000000000003',conversation='00000000-0000-0000-0000-000000000004';
 await db.query('insert into messages values($1,$2,$3,$4,$5)',[message,conversation,owner,'original text','text']);
 const payload={message_id:message,original_text:'original text',claims:[{evidence:'original',subject:null,predicate:'exist',object:null,polarity:'positive',qualifiers:[]}]};
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 const insert=p=>db.query('insert into message_claims(message_id,conversation_id,owner_id,extractor_version,source_hash,payload) values($1,$2,$3,$4,$5,$6)',[message,conversation,owner,'v1','a'.repeat(64),p]);
 await insert(payload);assert.equal((await db.query('select * from message_claims')).rows.length,1);
 for(const bad of [{...payload,original_text:'substitution'},{...payload,claims:[{...payload.claims[0],polarity:null}]},{...payload,claims:[{...payload.claims[0],evidence:'fabricated'}]},{...payload,extra:1}]){
  await assert.rejects(db.query('update message_claims set payload=$1',[bad]));
 }
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.equal((await db.query('select * from message_claims')).rows.length,0);
 await assert.rejects(db.query('insert into message_claims(message_id,conversation_id,owner_id,extractor_version,source_hash,payload) values($1,$2,$3,$4,$5,$6)',[message,conversation,other,'v2','a'.repeat(64),payload]));
 await db.exec('reset role; set role anon');await assert.rejects(db.query('select * from message_claims'));
 await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 await db.query('update message_claims set payload=$1',[{...payload,claims:[]}]);
 await db.query('delete from messages where id=$1',[message]);assert.equal((await db.query('select * from message_claims')).rows.length,0);
 await db.close();console.log('claims SQL: schema, source binding, RLS, anon, empty claims, cascade passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
