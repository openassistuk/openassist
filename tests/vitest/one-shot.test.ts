import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelDeliveryRejected, type OneShotRequest } from "../../packages/core-types/dist/index.js";
import { OpenAssistDatabase } from "../../packages/storage-sqlite/src/index.js";
import { assertManagedTaskCompatibility } from "../../packages/storage-sqlite/src/compatibility.js";
import { createOneShot, OneShotWorker, oneShotReceipt } from "../../packages/core-runtime/src/one-shot.js";
import { OpenAssistRuntime } from "../../packages/core-runtime/src/runtime.js";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";

const owner = { actorId: "100000001", channelId: "telegram-test", conversationKey: "chat-one" };
const start = "2026-09-28T12:00:00.000Z";
const text: OneShotRequest = { delaySeconds: 120, action: { type: "text", text: "Reminder test" } };
let root: string, db: OpenAssistDatabase, now: number;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(),"oa-reminders-"));
  db = new OpenAssistDatabase({ dbPath: path.join(root,"openassist.db"), logger });
  now = Date.parse(start);
});
afterEach(() => { db.close(); fs.rmSync(root,{recursive:true,force:true}); vi.restoreAllMocks(); });
function create(request = text, id = "request-one") {
  return createOneShot(db.oneShots,owner,request,start,id,"Europe/London",new Date(now).toISOString());
}
function worker(overrides: Record<string, unknown> = {}) {
  const generate = vi.fn(async () => "Generated result");
  const send = vi.fn(async () => ({transportMessageId:"receipt-1"}));
  const options = { store: db.oneShots, enabled: () => true, intervalMs: () => 1000,
    authorize: async () => true, channelType: () => "telegram", generate, send, now: () => now, ...overrides };
  return { instance: new OneShotWorker(options as any), generate, send };
}

describe("durable native reminders", () => {
  it("anchors delays at inbound receipt, deduplicates changed tool IDs, and rejects a missed new deadline", () => {
    now += 60_000;
    const saved = create();
    expect(saved.scheduledFor).toBe("2026-09-28T12:02:00.000Z");
    now += 180_000;
    expect(create().id).toBe(saved.id);
    expect(() => create(text,"new-request")).toThrow("original deadline");
    expect(db.oneShots.list(owner)).toHaveLength(1);
    expect(oneShotReceipt(saved)).not.toHaveProperty("action");
  });
  it.each([
    {at:"2026-09-28T13:00:00",action:text.action},
    {...text,at:"2026-09-28T13:00:00Z"},
    {...text,delaySeconds:-1}, {...text,delaySeconds:Infinity},
    {...text,recipientUserId:"stranger"}, {delaySeconds:2,action:{type:"shell",command:"pwd"}},
    {delaySeconds:2,action:{type:"text",text:"x".repeat(8001)}},
    {delaySeconds:2,action:{type:"text",text:""}},
    {delaySeconds:2,action:{type:"prompt",prompt:"hello",tools:["exec.run"]}},
    {action:text.action}, null
  ])("rejects invalid or expanded request contracts %#", request => {
    expect(() => createOneShot(db.oneShots,owner,request,start,"bad","UTC",start)).toThrow();
  });
  it("converts offset deadlines and preserves the timezone", () => {
    const saved = create({at:"2026-09-28T13:02:00+01:00",action:text.action});
    expect(saved.scheduledFor).toBe("2026-09-28T12:02:00.000Z");
    expect(saved.timezone).toBe("Europe/London");
  });
  it("bounds active tasks per actor, across chats and per installation, and caps listings", () => {
    for(let index=0;index<32;index++) create(text,`actor-limit-${index}`);
    expect(()=>create(text,"actor-limit-overflow")).toThrow("limit");
    for(const task of db.oneShots.list(owner)) db.oneShots.cancel(task.id,owner);
    for (let actor = 0; actor < 8; actor++) for (let n=0;n<32;n++) {
      createOneShot(db.oneShots,{...owner,actorId:`synthetic-${actor}`,conversationKey:`chat-${n}`},text,start,`r-${n}`,"UTC",start);
    }
    expect(() => create()).toThrow("limit");
    expect(db.oneShots.list()).toHaveLength(50);
    const item = db.oneShots.list().find(task=>task.state === "pending")!;
    db.oneShots.cancel(item.id,item);
    expect(create().state).toBe("pending");
  });
  it("dispatches text without a model call, records success, and never sends again after restart", async () => {
    const task = create(); const w = worker();
    await w.instance.tick(); expect(w.send).not.toHaveBeenCalled();
    now += 120_000; await w.instance.tick();
    expect(w.generate).not.toHaveBeenCalled(); expect(w.send).toHaveBeenCalledOnce();
    expect(db.oneShots.get(task.id)?.state).toBe("delivered");
    db.close(); db = new OpenAssistDatabase({dbPath:path.join(root,"openassist.db"),logger});
    db.oneShots.recover(); const again = worker(); await again.instance.tick();
    expect(again.send).not.toHaveBeenCalled();
  });
  it("recovers late work visibly with its original deadline", async () => {
    const task=create(); now += 240_000; db.oneShots.recover();
    const w=worker(); await w.instance.tick();
    expect(w.send.mock.calls[0]?.[1].text).toContain(task.scheduledFor);
    expect(w.send.mock.calls[0]?.[1].text).toContain("Delayed reminder");
  });
  it("persists prompt output and safely retries rejected delivery without regenerating", async () => {
    const task=create({delaySeconds:120,action:{type:"prompt",prompt:"Summarize the day"}});
    now += 120_000; let calls=0;
    const send=vi.fn(async()=>{ if (++calls===1) throw new ChannelDeliveryRejected(); return {transportMessageId:"accepted"}; });
    const w=worker({send}); await w.instance.tick();
    expect(db.oneShots.get(task.id)?.state).toBe("ready");
    db.oneShots.recover(); now += 5000; await w.instance.tick();
    expect(w.generate).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledTimes(2);
    expect(db.oneShots.get(task.id)?.state).toBe("delivered");
    expect(oneShotReceipt(task).timing).toContain("Generation begins");
  });
  it("bounds definite delivery rejections and provider retries", async () => {
    const task=create(); now+=120_000;
    const w=worker({send:async()=>{throw new ChannelDeliveryRejected();}});
    for(let i=0;i<5;i++) { await w.instance.tick(); now+=30_000; }
    expect(db.oneShots.get(task.id)?.state).toBe("failed");
    const prompt=createOneShot(db.oneShots,owner,{at:new Date(now+1000).toISOString(),action:{type:"prompt",prompt:"test"}},start,"prompt","UTC",new Date(now).toISOString());
    const broken=worker({generate:async()=>{throw new Error("sensitive provider details");}});
    for(let i=0;i<5;i++) { now+=30_000; await broken.instance.tick(); }
    expect(db.oneShots.get(prompt.id)?.attempts).toBe(3);
    expect(db.oneShots.get(prompt.id)?.state).toBe("failed");
    expect(db.oneShots.get(prompt.id)?.note).not.toContain("sensitive");
  });
  it("does not blindly resend ambiguous transport outcomes", async () => {
    const task=create(); now+=120_000;
    const send=vi.fn(async()=>{throw new Error("socket disconnected after acceptance");});
    const w=worker({send}); await w.instance.tick(); db.oneShots.recover(); now+=60_000; await w.instance.tick();
    expect(db.oneShots.get(task.id)?.state).toBe("uncertain"); expect(send).toHaveBeenCalledOnce();
  });
  it("recovers crashed in-flight delivery as uncertain and interrupted generation as retryable", () => {
    const first=create(), second=create(text,"second");
    db.oneShots.claim(first.id,start); db.oneShots.claim(second.id,start);
    db.oneShots.saveResult(first.id,[{channel:"telegram",conversationKey:owner.conversationKey,text:"saved",metadata:{}}]);
    db.oneShots.beginDelivery(first.id,0); db.oneShots.recover();
    expect(db.oneShots.get(first.id)?.state).toBe("uncertain");
    expect(db.oneShots.get(second.id)?.state).toBe("pending");
  });
  it("enforces actor and chat scope for list and cancel", () => {
    const task=create();
    for(const intruder of [{...owner,actorId:"100000002"},{...owner,conversationKey:"chat-two"},{...owner,channelId:"another"}]) {
      expect(db.oneShots.list(intruder)).toEqual([]);
      expect(()=>db.oneShots.cancel(task.id,intruder)).toThrow("not found");
    }
    expect(db.oneShots.cancel(task.id,owner).task.state).toBe("cancelled");
  });
  it("cancels delivery while generation is in progress", async () => {
    const task=create({delaySeconds:120,action:{type:"prompt",prompt:"work"}}); now+=120_000;
    const w=worker({generate:async()=>{
      expect(db.oneShots.cancel(task.id,owner).inFlight).toBe(true); return "result";
    }});
    await w.instance.tick(); expect(w.send).not.toHaveBeenCalled();
    expect(db.oneShots.get(task.id)?.state).toBe("cancelled");
  });
  it("reports an in-flight send honestly and allows cancellation between chunks", async () => {
    const task=create({delaySeconds:120,action:{type:"text",text:"x".repeat(7000)}}); now+=120_000;
    const w=worker({send:async()=>{
      const cancelled=db.oneShots.cancel(task.id,owner);
      expect(cancelled.inFlight).toBe(true); expect(cancelled.task.state).toBe("delivering");
      return {transportMessageId:"first-part"};
    }});
    await w.instance.tick(); expect(db.oneShots.get(task.id)?.state).toBe("cancelled");
    db.oneShots.cancel(task.id,owner); await w.instance.tick();
    expect(db.oneShots.get(task.id)?.state).toBe("cancelled");
  });
  it("rechecks authorization between generation and sending", async () => {
    const task=create({delaySeconds:120,action:{type:"prompt",prompt:"test"}}); now+=120_000;
    let approved=true; const w=worker({authorize:async()=>approved,generate:async()=>{approved=false;return "result";}});
    await w.instance.tick(); expect(w.send).not.toHaveBeenCalled(); expect(db.oneShots.get(task.id)?.state).toBe("failed");
  });
  it("waits for channel readiness across restart without losing pending work", async () => {
    const task=create();now+=120_000;let available=false;
    const w=worker({available:async()=>available});await w.instance.tick();
    expect(db.oneShots.get(task.id)?.state).toBe("pending");expect(w.send).not.toHaveBeenCalled();
    now+=60_000;available=true;await w.instance.tick();
    expect(db.oneShots.get(task.id)?.state).toBe("delivered");
  });
  it("blocks old application rollback while work remains and never rewrites state", () => {
    const task=create(), file=path.join(root,"openassist.db");
    expect(()=>assertManagedTaskCompatibility(file,[])).toThrow("lacks managed one-shot");
    expect(()=>assertManagedTaskCompatibility(file,["managed-one-shots-v1"])).not.toThrow();
    expect(db.oneShots.get(task.id)?.state).toBe("pending");
    db.oneShots.cancel(task.id,owner);
    expect(()=>assertManagedTaskCompatibility(file,[])).not.toThrow();
  });
});

describe("runtime scheduling authorization", () => {
  function runtime(chat = vi.fn(async () => ({ output: {role:"assistant",content:"done"},usage:{inputTokens:1,outputTokens:1,totalTokens:2} }))) {
    const config=createDefaultConfigObject().runtime;
    config.paths={dataDir:root,logsDir:path.join(root,"logs"),skillsDir:path.join(root,"skills")};
    config.assistant.promptOnFirstContact=false; config.memory.enabled=false;
    config.time={...config.time,requireTimezoneConfirmation:false,ntpPolicy:"off"};
    config.operatorAccessProfile="full-root";
    config.channels=[{id:owner.channelId,type:"telegram",enabled:true,settings:{operatorUserIds:[owner.actorId]}}];
    const channel={id:()=>owner.channelId,capabilities:()=>({}),health:async()=>"healthy",send:vi.fn(async()=>({transportMessageId:"1"}))};
    const provider={id:()=>"openai-main",capabilities:()=>({supportsTools:true,supportsApiKeys:true,supportsImageInputs:false,supportsOAuth:false,supportsStreaming:false}),chat};
    const instance=new OpenAssistRuntime(config,{db,logger},{providers:[provider as any],channels:[channel as any]});
    instance.setProviderApiKey("openai-main","synthetic-token");
    return {instance,config,channel,chat};
  }
  it("denies unapproved senders even with a full-root override and denies Standard mode", async () => {
    const {instance}=runtime(); const other={...owner,actorId:"100000002"};
    db.setActorPolicyProfile(`${owner.channelId}:${owner.conversationKey}`,other.actorId,"full-root");
    await expect(instance.managedSchedulerAction("scheduler.create",other,text as any,start,"r")).rejects.toThrow("approved");
    db.setActorPolicyProfile(`${owner.channelId}:${owner.conversationKey}`,owner.actorId,"operator");
    await expect(instance.managedSchedulerAction("scheduler.create",owner,text as any,start,"r")).rejects.toThrow("full-root");
    await expect(instance.managedSchedulerAction("scheduler.list",owner,{},start,"r")).rejects.toThrow("full-root");
  });
  it("returns bounded receipts and isolates cancellation across chats", async () => {
    const {instance}=runtime(); const received=new Date().toISOString();
    const result=await instance.managedSchedulerAction("scheduler.create",owner,text as any,received,"r");
    expect(result.id).toMatch(/^reminder-/); expect(result).not.toHaveProperty("text");
    await expect(instance.managedSchedulerAction("scheduler.cancel",{...owner,conversationKey:"elsewhere"},{id:result.id},received,"c")).rejects.toThrow("not found");
    expect((await instance.managedSchedulerAction("scheduler.cancel",owner,{id:result.id},received,"c")).state).toBe("cancelled");
  });
  it("surfaces completed scheduling at the real 12-round cutoff without exposing action content", async () => {
    let round=0;
    const chat=vi.fn(async()=>({output:{role:"assistant",content:""},usage:{inputTokens:1,outputTokens:1,totalTokens:2},toolCalls:[{
      id:`call-${++round}`,name:"scheduler.create",argumentsJson:JSON.stringify({...text,action:{type:"text",text:"sensitive reminder content"}})
    }]}));
    const {instance,channel}=runtime(chat as any);
    const receivedAt=new Date(Date.now()-60_000).toISOString();
    await instance.handleInbound({channel:"telegram",channelId:owner.channelId,conversationKey:owner.conversationKey,senderId:owner.actorId,transportMessageId:"inbound-one",idempotencyKey:"cutoff-test",receivedAt,text:"Remind me in two minutes",attachments:[]});
    expect(chat.mock.calls.filter(call=>call[0]?.metadata?.toolRound !== undefined)).toHaveLength(12);
    const saved=db.oneShots.list(owner);expect(saved).toHaveLength(1);
    expect(saved[0]?.scheduledFor).toBe(new Date(Date.parse(receivedAt)+120_000).toISOString());
    const replies=channel.send.mock.calls.map(call=>call[0].text).join("\n");
    expect(replies).toContain("12 tool rounds");expect(replies).toContain(saved[0]!.id);
    expect(replies).not.toContain("sensitive reminder content");
  });
  it("scheduled prompts receive no tool schemas and cannot run a returned tool call", async () => {
    const chat=vi.fn(async()=>({output:{role:"assistant",content:"Generated without tools"},usage:{inputTokens:1,outputTokens:1,totalTokens:2},toolCalls:[{id:"forbidden",name:"exec.run",argumentsJson:'{"command":"pwd"}'}]}));
    const {instance}=runtime(chat as any);
    // Drive the same runtime-owned worker used by daemon start with a due persisted task.
    const receipt=await instance.managedSchedulerAction("scheduler.create",owner,{delaySeconds:1,action:{type:"prompt",prompt:"test"}},new Date().toISOString(),"prompt-boundary");
    vi.useFakeTimers();vi.setSystemTime(Date.now()+2000);
    try {
      await (instance as any).oneShotWorker.tick();
      expect(chat.mock.calls[0]?.[0].tools).toEqual([]);
      expect(db.oneShots.get(String(receipt.id))?.state).toBe("delivered");
    } finally {vi.useRealTimers();}
  });
});
