import {randomUUID} from "node:crypto";
import {eq,sql} from "drizzle-orm";
import {db,systemSettingsTable,destinationsTable} from "@workspace/db";
import {syncAccountDestinations,isDevelopmentDemoTelegramAccount} from "./telegram";
import {telegramAccountsTable} from "@workspace/db";
import {saveOperation,operationKey,failOperation,type OperationJob} from "./operations";
let busy=false,timer:ReturnType<typeof setInterval>|undefined;
export async function processSyncOperations(dependencies:{sync?:typeof syncAccountDestinations}={}){
  if(busy)return;busy=true;
  let current:OperationJob|undefined,token=randomUUID();
  try{
    current=await db.transaction(async tx=>{
      const rows=await tx.execute(sql`SELECT value FROM system_settings WHERE key LIKE 'telecamp_operation:%'
        AND value::jsonb->>'kind'='sync_groups' AND (
          value::jsonb->>'state'='queued' OR (value::jsonb->>'state'='running' AND (value::jsonb->'payload'->>'leaseUntil')::timestamptz<now()))
        ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if(!rows.rows.length)return undefined;
      const job=JSON.parse((rows.rows[0] as {value:string}).value) as OperationJob;
      job.state="running";job.phase="sync";job.processed=0;job.payload.token=token;job.payload.leaseUntil=new Date(Date.now()+90_000).toISOString();
      await saveOperation(tx,job);return job;
    });
    if(!current)return;
    const job=current;let last=0,seen=0;
    const update=async(count:number,force=false)=>{
      seen=count;if(!force&&Date.now()-last<2000)return;last=Date.now();
      const rows=await db.execute(sql`UPDATE system_settings SET value=jsonb_set(jsonb_set(value::jsonb,'{processed}',to_jsonb(${count}::int)),
        '{payload,leaseUntil}',to_jsonb(${new Date(Date.now()+90_000).toISOString()}::text))::text,updated_at=now()
        WHERE key=${operationKey(job.owner,job.id)} AND value::jsonb->'payload'->>'token'=${token}
          AND value::jsonb->>'state'='running'
          AND EXISTS(SELECT 1 FROM telegram_accounts WHERE id=${job.accountId}::uuid AND owner_user_id=${job.owner} AND deleted_at IS NULL) RETURNING key`);
      if(!rows.rows.length)throw Error("OPERATION_SYNC_STOPPED");
    };
    const heartbeat=setInterval(()=>void update(seen,true).catch(()=>{}),20_000);
    try{
      const [account]=await db.select().from(telegramAccountsTable).where(eq(telegramAccountsTable.id,job.accountId!));
      if(!account||account.deletedAt)throw Error("OPERATION_SYNC_STOPPED");
      const count=isDevelopmentDemoTelegramAccount(account)
        ?(await db.select({id:destinationsTable.id}).from(destinationsTable).where(eq(destinationsTable.accountId,account.id))).length
        :await (dependencies.sync??syncAccountDestinations)(account.id,count=>update(count));
      await update(count,true);
      await db.execute(sql`UPDATE system_settings SET value=jsonb_set(jsonb_set(jsonb_set(value::jsonb,'{state}','"completed"'),
        '{phase}','"completed"'),'{total}',to_jsonb(${count}::int))::text,updated_at=now()
        WHERE key=${operationKey(job.owner,job.id)} AND value::jsonb->'payload'->>'token'=${token}`);
    }finally{clearInterval(heartbeat);}
  }catch{if(current)await failOperation(current.owner,current.id,"OPERATION_SYNC_RETRY",token).catch(()=>{});}
  finally{busy=false;}
}
export function startSyncOperationWorker(){if(timer)return;void processSyncOperations();timer=setInterval(()=>void processSyncOperations(),3000);}
