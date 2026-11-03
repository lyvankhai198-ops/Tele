import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pool } from "@workspace/db";
import { createRelease } from "../../artifacts/api-server/src/lib/release-update-store";

type Request = (path: string, cookie?: string, body?: unknown, method?: string, headers?: Record<string,string>) => Promise<Response>;
export async function testReleaseUpdates(options: {
  request: Request; adminCookie: string; userCookie: string;
  setMode: (mode: string) => void; sends: Array<{ chat_id: string; text: string }>;
}) {
  const { request, adminCookie: admin, userCookie: user, sends, setMode } = options;
  const check = (value: unknown, code: string) => assert.ok(value, code);
  const path = "/admin/release-updates", group = "-100123456789";
  await pool.query("INSERT INTO system_settings(key,value) VALUES('telecampaign_release_notification_settings',$1)", [JSON.stringify({chatId:group})]);
  check((await request(path)).status === 401, "E2E_RELEASE_ANON_DENIED");
  check((await request(path, user)).status === 403, "E2E_RELEASE_USER_DENIED");
  check((await request(path, admin, {title:"x",vi:"v",en:" " })).status === 400, "E2E_RELEASE_BILINGUAL");
  const initialSends = sends.length;
  const content = {title:"Only this release",vi:"Chỉ gửi bản đã chọn.",en:"Send only the selected release."};
  const create = async (title: string) => {
    const response = await request(path, admin, {...content,title});
    check(response.status === 201, "E2E_RELEASE_CREATE");
    return await response.json() as any;
  };
  const first = await create(content.title), second = await create("Leave this draft alone");
  check(sends.length === initialSends, "E2E_RELEASE_CREATE_NEVER_SENDS");
  const list = await request(path, admin);
  const listing = await list.json() as any;
  check(list.headers.get("cache-control")?.includes("no-store") && listing.destination === group && listing.updates.length === 2, "E2E_RELEASE_PRIVATE_LIST");
  const send = (id: string, version: number) => request(`${path}/${id}/send`, admin, {version,destination:group,confirmed:true});
  check((await request(`${path}/${first.id}/send`, user, {version:1,destination:group,confirmed:true})).status === 403, "E2E_RELEASE_SEND_ADMIN_ONLY");
  check((await request(`${path}/${first.id}/send`, admin, {version:1,destination:group,confirmed:false})).status === 400, "E2E_RELEASE_CONFIRMATION");
  check((await request(`${path}/${first.id}/send`, admin, {version:1,destination:"-100999",confirmed:true})).status === 409, "E2E_RELEASE_DESTINATION_PINNED");
  check((await request(`${path}/${first.id}/send`, admin, {version:1,destination:group,confirmed:true}, "POST", {Origin:"https://untrusted.invalid"})).status === 403, "E2E_RELEASE_ORIGIN");
  const duplicate = await Promise.all([send(first.id,1),send(first.id,1)]);
  check(duplicate.filter(r=>r.status===200).length === 1 && duplicate.filter(r=>r.status===409).length === 1, "E2E_RELEASE_DOUBLE_CLICK");
  check(sends.length === initialSends+1 && sends.at(-1)?.chat_id===group && sends.at(-1)?.text.includes(content.title) &&
    !sends.at(-1)?.text.includes(second.title), "E2E_RELEASE_ONLY_SELECTED_GROUP_NO_PRIVATE");
  const sent = await duplicate.find(r=>r.status===200)!.json() as any;
  check(sent.status === "sent" && sent.sentMessageId > 0 && sent.sentAt, "E2E_RELEASE_RECEIPT");
  const edit = await request(`${path}/${first.id}`, admin, {...content,title:"Edited title, not another send",version:sent.version},"PATCH");
  const edited = await edit.json() as any;
  check(edit.ok && edited.status==="sent" && edited.sentText===sent.sentText, "E2E_RELEASE_EDIT_SENT_SNAPSHOT");
  check((await send(first.id,edited.version)).status===409 && sends.length===initialSends+1, "E2E_RELEASE_SENT_NO_RESEND");
  check((await request(`${path}/${second.id}`,admin,{...content,version:99},"PATCH")).status===409, "E2E_RELEASE_STALE_EDIT");
  setMode("reject");
  const failedResponse = await send(second.id,1), failed = await failedResponse.json() as any;
  check(failed.status==="failed", "E2E_RELEASE_REJECT_KNOWN");
  setMode("ok");
  const retried = await (await send(second.id,failed.version)).json() as any;
  check(retried.status==="sent", "E2E_RELEASE_RETRY_EXPLICIT");
  setMode("timeout");
  const uncertain = await create("Uncertain release");
  const uncertainResult = await (await send(uncertain.id,1)).json() as any;
  check(uncertainResult.status==="unknown", "E2E_RELEASE_TIMEOUT_UNKNOWN");
  const beforeUnknownRetry = sends.length;
  check((await send(uncertain.id,uncertainResult.version)).status===409 && sends.length===beforeUnknownRetry, "E2E_RELEASE_UNKNOWN_NO_RETRY");
  setMode("wrong-receipt");
  const wrong = await create("Wrong receipt");
  const wrongResult = await (await send(wrong.id,1)).json() as any;
  check(wrongResult.status==="unknown" && (await send(wrong.id,wrongResult.version)).status===409, "E2E_RELEASE_WRONG_RECEIPT_NO_RETRY");
  setMode("ok");
  const stale = await create("Interrupted sending");
  const staleRecord = {...stale,status:"sending",sendingAt:new Date(Date.now()-180000).toISOString()};
  await pool.query("UPDATE system_settings SET value=$2 WHERE key=$1",["telecamp_release:"+stale.id,JSON.stringify(staleRecord)]);
  const staleList = await (await request(path,admin)).json() as any;
  check(staleList.updates.find((r:any)=>r.id===stale.id).status==="unknown" && (await send(stale.id,1)).status===409,"E2E_RELEASE_CRASH_NO_RETRY");
  const removed = await request(`${path}/${first.id}`,admin,{version:edited.version},"DELETE");
  check(removed.status===204, "E2E_RELEASE_DELETE");
  check(await createRelease(pool,content,"fixture",first.id)===null, "E2E_RELEASE_TOMBSTONE");
  check(!(await (await request(path,admin)).json() as any).updates.some((r:any)=>r.id===first.id),"E2E_RELEASE_DELETED_HIDDEN");
  const beforeCli = sends.length;
  for (let run=0;run<2;run++) {
    const output = execFileSync(process.execPath,["scripts/refresh-telecampaign-bot-menu.mjs"],{
      cwd:process.cwd(),encoding:"utf8",timeout:20000,stdio:["ignore","pipe","pipe"],
      env:{...process.env,TELECAMPAIGN_SUPPORT_BOT_TOKEN:"",TELECAMPAIGN_KGPT_BOT_TOKEN:""},
    });
    check(output.includes("release_announcement=not_sent") && output.includes(run===0?"release_draft=saved":"release_draft=already_recorded"),"E2E_RELEASE_ACTUAL_CLI_DRAFT_ONLY");
  }
  check(sends.length===beforeCli,"E2E_RELEASE_DEPLOY_NO_TELEGRAM");
  const customerNotifications=await request("/notifications",user);
  check(!(await customerNotifications.text()).includes(content.title),"E2E_RELEASE_NOT_CUSTOMER_NOTIFICATION");
}
