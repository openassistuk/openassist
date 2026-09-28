import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAssistDatabase } from "../../packages/storage-sqlite/src/index.js";
import { SchedulerWorker } from "../../packages/core-runtime/src/scheduler.js";
import { ClockHealthMonitor } from "../../packages/core-runtime/src/clock-health.js";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";

let root:string, db:OpenAssistDatabase;
const logger={info:vi.fn(),warn:vi.fn(),error:vi.fn()} as any;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-clock-regression-"));db=new OpenAssistDatabase({dbPath:path.join(root,"state.db"),logger});});
afterEach(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});vi.useRealTimers();});
describe("clock-controlled recurring scheduling",()=>{
  it.each(["interval","cron"] as const)("executes timely %s skip slots, tolerates jitter, skips downtime and resumes after restart",kind=>{
    const config=createDefaultConfigObject().runtime;config.time.requireTimezoneConfirmation=false;
    config.scheduler.tasks=[{id:"test",enabled:true,scheduleKind:kind,intervalSec:60,cron:"* * * * *",misfirePolicy:"skip",action:{type:"prompt",promptTemplate:"test"}}];
    const enqueued:any[]=[];
    const tick=()=>{const worker=new SchedulerWorker({db,logger,getConfig:()=>config,getEffectiveTimezone:()=>"Europe/London",isTimezoneConfirmed:()=>true,enqueueScheduledExecution:item=>enqueued.push(item)});worker.start();worker.stop();};
    tick();expect(enqueued).toHaveLength(1);
    vi.setSystemTime(new Date("2026-09-28T12:01:01.900Z"));tick();expect(enqueued).toHaveLength(2);
    vi.setSystemTime(new Date("2027-09-28T12:00:10Z"));tick();expect(enqueued).toHaveLength(2);
    expect(db.getTaskCursor("test")?.lastEnqueuedFor).toBe("2027-09-28T12:00:00.000Z");
    vi.setSystemTime(new Date("2027-09-28T12:01:00Z"));tick();tick();expect(enqueued).toHaveLength(3);
  });
  it.each(["catch-up-once","backfill"] as const)("bounds %s work after a year offline",policy=>{
    const config=createDefaultConfigObject().runtime;config.scheduler.defaultMisfirePolicy=policy;
    config.scheduler.tasks=[{id:"test",enabled:true,scheduleKind:"interval",intervalSec:1,action:{type:"prompt",promptTemplate:"test"}}];
    db.upsertTaskCursor("test",{lastEnqueuedFor:"2025-09-28T12:00:00Z"});
    const enqueue=vi.fn(); const worker=new SchedulerWorker({db,logger,getConfig:()=>config,getEffectiveTimezone:()=>"UTC",isTimezoneConfirmed:()=>true,enqueueScheduledExecution:enqueue});
    worker.start();worker.stop();expect(enqueue).toHaveBeenCalledTimes(policy==="backfill"?100:1);
    if(policy==="catch-up-once") expect(enqueue.mock.calls[0]?.[0].scheduledFor).toBe("2026-09-28T12:00:00.000Z");
  });
  it("executes repeated DST-hour UTC slots without replaying a previous slot",()=>{
    const config=createDefaultConfigObject().runtime;
    config.scheduler.tasks=[{id:"dst",enabled:true,scheduleKind:"cron",cron:"0 * * * *",timezone:"Europe/London",misfirePolicy:"skip",action:{type:"prompt",promptTemplate:"test"}}];
    const enqueue=vi.fn();
    const tick=()=>{const w=new SchedulerWorker({db,logger,getConfig:()=>config,getEffectiveTimezone:()=>"Europe/London",isTimezoneConfirmed:()=>true,enqueueScheduledExecution:enqueue});w.start();w.stop();};
    vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));tick();
    vi.setSystemTime(new Date("2026-10-25T01:00:00Z"));tick();tick();
    expect(enqueue.mock.calls.map(call=>call[0].scheduledFor)).toEqual(["2026-10-25T00:00:00.000Z","2026-10-25T01:00:00.000Z"]);
  });
  it.each(["healthy","degraded","unhealthy"] as const)("confirmation refresh preserves a %s clock result",status=>{
    const config=createDefaultConfigObject().runtime;let confirmed=false;
    db.insertClockCheck(status,"fixture-clock",status==="healthy"?0:20_000);
    const update=vi.spyOn(db,"updateModuleHealth");
    const monitor=new ClockHealthMonitor({db,logger,getConfig:()=>config,getEffectiveTimezone:()=>"Europe/London",isTimezoneConfirmed:()=>confirmed});
    monitor.refreshModuleHealth();confirmed=true;monitor.refreshModuleHealth();
    expect(update).toHaveBeenLastCalledWith("time-sync",status,"clock check: fixture-clock");
  });
});
