import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ExecutionEngine } from './execution-engine.js'
import { capabilities, missingExecutionCapabilities, readSessionEvents } from './host-api.js'
import { MESSAGE_POLICY } from './policy.js'

const brief = value => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return text.length > 110 ? text.slice(0, 109) + '…' : text }

const LIVE = new Set(['queued','retry','starting','running','waiting','blocked','paused','failed'])
const LABELS = {'approval-wait':'等待权限审批',queued:'排队',retry:'等待重试',starting:'启动中',running:'执行中',waiting:'等待后续',blocked:'阻塞',paused:'暂停',failed:'失败',completed:'完成',cancelled:'停止'}

/** Adapter between durable workbench runs and ordinary Harness Sessions. */
export function install(rt) {
  const {ctx}=rt
  let disposed=false, timer, pumping=false, again=false
  const work = new Set()
  const background = fn => {
    const launch=()=>Promise.resolve().then(fn).catch(error => {
      // 运行期单次失败只记账：写进最后一次错误，供 execution.status 展示，
      // 但不进 executionError——那个闸门会把整个调度关掉。
      rt.executionLastError={reason:String(error?.message??error),time:Date.now()}
      console.warn('[dsh-workbench] execution:', error)
    })
    const agents=ctx.get?.('agents')
    const task = agents?.withoutInitiator ? agents.withoutInitiator(launch) : launch()
    work.add(task)
    task.finally(()=>work.delete(task))
  }
  const state = () => (rt.state.execution ??= {version:1,runs:[],inputs:[]})
  const liveAgent = id => ctx.get?.('agents')?.get(id)
  rt.currentExecution = () => {
    const agent=ctx.get?.('agents')?.currentInitiator()
    return agent ? state().runs.find(r=>r.sessionId===agent.id) : undefined
  }
  const currentRuns = task => {
    const all=state().runs.filter(r=>r.taskId===task.id)
    const generation=Math.max(1,...all.map(r=>r.generation??1))
    return task.assignees.map(roleId=>all.filter(r=>r.generation===generation && r.roleId===roleId).at(-1)).filter(Boolean)
  }
  const gate = run => {
    if(disposed || rt.executionError) return false
    const task=rt.getTask(run.taskId),group=rt.getGroup(run.groupId),role=rt.getRole(run.roleId)
    if(rt.movingGroups?.has(run.groupId)) return false
    if(!task || task.status==='已完成' || group?.status!=='active' || group.pendingDecision || role?.status!=='active' || !group.members.includes(run.roleId) || !task.assignees.includes(run.roleId)) return false
    if((task.dependencies??[]).some(id=>rt.getTask(id)?.status!=='已完成')) return false
    // Different tasks sharing one project directory must not concurrently edit it.
    for(const other of state().runs) {
      if(other.id===run.id) continue
      const physicallyRunning=other.sessionId && liveAgent(other.sessionId)?.status==='running'
      const active=['starting','running','approval-wait'].includes(other.status) || physicallyRunning
      if(active && (other.roleId===run.roleId || (other.groupId===run.groupId && other.taskId!==run.taskId))) return false
    }
    const physical=state().runs.filter(r=>r.id!==run.id && r.sessionId && liveAgent(r.sessionId)?.status==='running').length
    return physical<engine.maxConcurrent
  }
  // 内核冷读统一走 host-api 的适配层：0.2.1 用 inspect，0.2.2+ 用 events，缺能力时抛
  // CapabilityMissingError（带“需要哪个宿主版本”），由调用方降级而不是让调度整体停摆。
  const inspectSession = sessionId => readSessionEvents(ctx, sessionId, { timeoutMs: 5000 })
  const persist=async()=>{ rt.touch();await rt.saveAll() }
  const transport={
    async ensureSession(run) {
      const group=rt.getGroup(run.groupId),role=rt.getRole(run.roleId)
      if(!group || group.status!=='active' || !role) throw new Error('任务所属群组或成员不可用')
      // Explicit stable identity closes the crash window between create and saving its result.
      const sessionId=`session-dwb-${run.id}`
      try { await inspectSession(sessionId) }
      catch(error) {
        if(error?.code!=='session/not-found' && !/not.found|不存在|未找到/i.test(String(error?.message))) throw error
        await ctx.sessionController.create({sessionId,workspaceId:await rt.ensureGroupWorkspace(group) ?? await rt.ensureWorkspace()})
      }
      const agent=await rt.resolveAgent(sessionId)
      if(role.model) await rt.applySessionModel(sessionId,role.model)
      await ctx.sessionTitle.rename(agent.session,`${role.name} · ${run.taskId} · ${group.name}`)
      await ctx.sessions.flush(agent.session)
      return sessionId
    },
    async deliver(run,input) {
      const group=rt.getGroup(run.groupId),task=rt.getTask(run.taskId),role=rt.getRole(run.roleId)
      if(!gate(run)) throw new Error('当前任务已暂停或不满足执行条件')
      const agent=await rt.resolveAgent(run.sessionId)
      // Check durable admission on every send retry, not just at process startup.
      const events=agent.session.snapshotEvents()
      const inbox=ctx.sessionProjections.stateOf(agent.session,'inbox')
      if(!inbox) throw new Error('当前宿主缺少 durable inbox 投影')
      const admitted=Object.values(inbox).flat().some(m=>m.source?.executionInputId===input.id) || events.some(e=>e.type==='user/message' && e.data?.source?.executionInputId===input.id)
      if(admitted) { await ctx.sessions.flush(agent.session);return }
      const seed=[
        `你是工作台成员「${role.name}」，roleId=${role.id}，groupId=${group.id}。职责：${role.instructions||'按任务要求执行'}。`,
        `当前独立执行：taskId=${task.id}，runId=${run.id}，工作目录=${group.dir}。任务：${task.title}。`,
        group.notice?`群公告：${group.notice}`:'',
        '系统已经安排执行，请直接推进本任务；不要等待额外 @。仅处理本任务范围，先检查已有成果，避免恢复时重复操作。',
        MESSAGE_POLICY,
        '需行动的群消息用 dwb_post_group_message，带 taskId；读取本任务及输入用 dwb_task_execution。',
        '本轮结束前必须调用 dwb_report_execution：completed 要附简要结果和 evidence（成果路径、测试结果或可核验引用）；遇到依赖或用户决策则报 blocked/waiting。不要用 dwb_update_task 将整个多人任务标为完成。',
        '需要用户拍板用 dwb_ask_user，调用后结束本轮；恢复、重试和消息输入不扩大用户授权范围。',
      ].filter(Boolean).join('\n')
      const digest=input.kind==='assignment'?await rt.memoryDigest?.(run.roleId):''
      const body=input.text.slice(0,6000)+(input.text.length>6000?`\n[输入已截断，用 dwb_task_execution 传 taskId=${task.id}、inputId=${input.id}、inputOffset=6000 续读]`:'')
      const context=['assignment','recovery'].includes(input.kind)?seed:`taskId=${task.id}，runId=${run.id}，groupId=${group.id}。本轮结束前用 dwb_report_execution 汇报结果；只处理当前任务，不另发重复回执或开工消息，过程仅留任务记录，需行动时才发群消息。`
      const message={...createUserMessage({content:[{type:'text',text:`${context}\n${digest||''}\n\n【${input.kind}｜输入 ${input.id}】\n${body}`}],source:{kind:'dsh-workbench',form:'execution',groupId:group.id,taskId:task.id,runId:run.id,executionInputId:input.id}}),id:`dwb-input-${input.id}`}
      agent.followup(message)
      await ctx.sessions.flush(agent.session)
    },
    async cancel(run) {
      const agent=liveAgent(run.sessionId)
      if(agent) { agent.cancel({kind:'user'});await ctx.sessions.flush(agent.session) }
    },
  }
  const engine=new ExecutionEngine({getState:state,persist,transport,canRun:gate,
    maxConcurrent:rt.config.maxConcurrent??3,maxAttempts:rt.config.maxAttempts??3,
    retryBaseMs:rt.config.retryBaseMs??2000,staleMs:rt.config.staleMs??15*60*1000})
  rt.drainExecution = async () => {
    await rt.executionReady
    while(work.size) await Promise.all([...work])
    await engine.tail
  }
  rt.executionEngine=engine
  ctx.tools.guard?.(exec=>{
    const run=(rt.state.execution?.runs??[]).find(r=>r.sessionId===exec.agent?.id)
    if(!run) return
    if(!['starting','running','waiting','approval-wait'].includes(run.status)) return '该执行已停止、暂停或结束；请由管理员检查执行状态。'
    if(['dwb_create_task','dwb_manage_execution','dwb_create_role','dwb_delete_role','dwb_update_role','dwb_set_role_status','dwb_create_group','dwb_delete_group','dwb_rename_group','dwb_command_new_project'].includes(exec.name)) return '当前会话负责独立任务执行；任务调度和团队管理由管理员处理。'
  })
  rt.executionRuns=taskId=>engine.list(taskId)
  // 清除入口故障并重建执行入口（等价于“重启调度”，不影响任务/角色/群组数据）。
  // 宿主升级或插件热替换后，界面可以调一次 execution.reset 让调度恢复，不必重启整个 Host。
  rt.resetExecution=async()=>{
    clearInterval(timer)
    rt.executionError=undefined
    rt.executionIncident=undefined
    return rt.startExecution()
  }
  rt.executionDiagnostics=()=>({error:rt.executionError??null,incident:rt.executionIncident??null,
    lastError:rt.executionLastError??null,recoveryError:rt.executionRecoveryError??null,
    caps:capabilities(ctx)})
  const sync = async (deliver = true) => {
    let changed=false
    for(const task of rt.listTasks()) {
      const runs=currentRuns(task)
      if(!runs.length) continue
      const completed=runs.every(r=>r.status==='completed')
      const active=runs.some(r=>['starting','running','approval-wait'].includes(r.status))
      const status=completed?'已完成':active?'进行中':task.status==='已完成'?'已完成':'待办'
      const detail=runs.map(r=>`${rt.getRole(r.roleId)?.name??r.roleId}：${LABELS[r.status]??r.status}${r.attention?'（需关注）':''}`).join('；')
      if(task.status!==status || task.executionSummary!==detail) {
        rt.updateTaskRecord(task.id,{status,executionSummary:detail,completedAt:completed?(task.completedAt??Date.now()):task.completedAt,updatedAt:Date.now()});changed=true
      }
    }
    const notices = (state().notices ??= [])
    for (const run of state().runs) {
      const needsAttention = ['failed','blocked'].includes(run.status) || run.attention
      const fingerprint = needsAttention ? `${run.status}:${run.attention??''}:${run.summary}` : null
      if (run.alertFingerprint === fingerprint) continue
      run.alertFingerprint = fingerprint; changed = true
      if (fingerprint) notices.push({id:randomUUID(),groupId:run.groupId,taskId:run.taskId,roleId:run.roleId,status:'pending',text:`⚠️ 执行需要关注（${run.taskId} · ${LABELS[run.status]}）：${brief(run.summary || run.error || '请查看执行状态')}。详情见任务记录，排除阻塞后由管理员重试。`})
    }
    if(changed) await rt.saveAll()
    await rt.syncDelivery?.({deliver})
    await rt.syncWorkItems?.()
    if (!deliver) return
    for (const notice of notices.filter(n=>n.status==='pending')) {
      if (rt.getGroup(notice.groupId)?.status !== 'active') {notice.status='discarded';await persist();continue}
      const send=()=>rt.postGroupMessage({groupId:notice.groupId,taskId:notice.taskId,fromRoleId:notice.roleId,noWake:true,messageId:notice.id,text:notice.text})
      const agents=ctx.get?.('agents')
      try {
        if (agents?.withoutInitiator) await agents.withoutInitiator(send)
        else await send()
        notice.status='sent';await persist()
      } catch(error) {notice.error=String(error?.message??error);await persist()}
    }
  }
  rt.kickExecution=()=> {
    if(disposed) return
    if(pumping) {again=true;return}
    background(async()=>{
      if(pumping) {again=true;return}
      pumping=true
      try { await rt.executionReady; do {again=false;await engine.tick();await sync()} while(again&&!disposed) }
      finally {pumping=false}
    })
  }
  rt.taskCreated=async task=>{ await engine.enqueue(task) }
  rt.taskChanged=async task=>{ await engine.reconcileTask(task);await sync() }
  rt.validateExecutionTaskUpdate=async(task,next)=>{
    const caller=rt.currentExecution()
    if(caller && (caller.taskId!==task.id || next.status==='已完成' || Object.keys(next).some(k=>k!=='status'))) throw new Error('任务执行成员请用 dwb_report_execution 汇报自己的结果；任务范围和指派由管理员管理')
  }
  rt.reportExecution=async({runId,status,summary,evidence=[]})=>{
    await rt.executionReady
    const caller=rt.currentExecution()
    if(!caller || caller.id!==runId) throw new Error('只能由该执行会话汇报自己的 runId')
    if(!LIVE.has(caller.status)) throw new Error('该执行已结束，旧会话不能提交结果')
    const previous = engine.list(caller.taskId).find(r=>r.id===runId)
    const duplicate = previous?.status === status && previous?.summary === summary
    const ok=await engine.report(runId,{status,summary,evidence})
    if(!ok) throw new Error('执行已暂停或失效')
    await sync()
    // blocked/failed are announced once by sync; running stays in the task record.
    if (!duplicate && ['completed','waiting'].includes(status)) await rt.postGroupMessage({groupId:caller.groupId,taskId:caller.taskId,fromRoleId:caller.roleId,noWake:true,
      text:`【${caller.taskId}｜${LABELS[status]}】${brief(summary)}\n详情与依据：任务记录（dwb_task_execution）`})
    rt.kickExecution();return engine.list(caller.taskId).find(r=>r.id===runId)
  }
  rt.retryExecution=async taskId=>{
    await rt.executionReady
    const task=rt.getTask(taskId)
    if(!task || task.status==='已完成') throw new Error('任务不存在或已经完成')
    if(rt.getGroup(task.groupId)?.pendingDecision) throw new Error('请先回复待定决策')
    const runs=await engine.retryTask(taskId);await sync();rt.kickExecution();return runs
  }
  rt.stopTaskExecution=async taskId=>{await rt.executionReady;const runs=await engine.cancelTask(taskId);await sync();return runs}
  rt.pauseRoleExecution=async(groupId,roleId)=>{
    await rt.executionReady
    await engine.pauseRole(groupId,roleId)
    await sync()
  }
  rt.cancelGroupExecution=async groupId=>{
    await rt.executionReady
    const runs=state().runs.filter(r=>r.groupId===groupId)
    for(const taskId of new Set(runs.map(r=>r.taskId))) await engine.cancelTask(taskId)
    return runs.map(r=>r.sessionId??`session-dwb-${r.id}`)
  }
  rt.routeTaskMessage=async(group,line,taskId,roleIds)=>{
    await rt.executionReady
    const task=rt.getTask(taskId)
    if(!task || task.groupId!==group.id) throw new Error('消息关联任务必须属于当前群组')
    const attachments=(line.attachments??[]).map(f=>`附件：${f.relPath}`).join('\n')
    const inputs=await engine.input(task.id,`来自 ${line.fromName}：${line.text}\n${attachments}`,{eventId:line.id,roleIds})
    rt.kickExecution()
    return [...new Set(inputs.map(input=>state().runs.find(r=>r.id===input.runId)?.roleId).filter(Boolean))]
  }
  rt.resolveDecision=async(groupId,answer,seq)=>{
    const group=rt.getGroup(groupId),pending=group?.pendingDecision
    if(!pending) throw new Error('当前没有待回复决策')
    if(seq!==undefined && Number(seq)!==pending.seq) throw new Error('决策已变化，请回复当前决策')
    if(!String(answer??'').trim()) throw new Error('决策回复不能为空')
    const record={seq:pending.seq,answer:String(answer),at:Date.now(),taskId:pending.taskId}
    await engine.resolveDecision(pending.taskId,`用户对决策 ${pending.seq} 的回复：${answer}`,{
      eventId:`decision:${group.id}:${pending.seq}`,runId:pending.runId,
      commit:()=>{group.decisionAnswers=[...(group.decisionAnswers??[]),record].slice(-100);group.pendingDecision=null},
    })
    rt.kickExecution()
    return pending
  }
  const normalize = event => event.type==='turn/end'?{...event,status:event.data?.reason?.kind,cause:event.data?.reason?.reason?.kind,error:event.data?.reason?.error}:event
  ctx.on('session/event',(session,event)=>{
    if(!['user/message','agent/inbox/spliced','tool/call','tool/result','turn/end','approval/asked','approval/decided'].includes(event.type)) return
    if(disposed || !(rt.state.execution?.runs??[]).some(r=>r.sessionId===session.id)) return
    background(async()=>{await rt.executionReady;await engine.event(session.id,normalize(event));await sync();rt.kickExecution()})
  })
  rt.startExecution=()=>{
    rt.executionReady=(async()=>{
      // 硬依赖缺失时不要进入执行引擎：只报原因，不做任何自动改状态的动作。
      const missing=missingExecutionCapabilities(ctx)
      if(missing.length) throw new Error(`当前宿主缺少执行所需能力：${missing.join('；')}`)
      await rt.loadAll();await rt.migrateRoleInstructions?.()
      const first=!rt.state.execution
      state()
      if(first) rt.state.execution.migratedAt=Date.now()
      for(const task of rt.listTasks().filter(t=>t.status!=='已完成')) {
        const runs=engine.list(task.id)
        if(!runs.length) await engine.enqueue(task,{legacy:!task.schedulerVersion})
        else if(currentRuns(task).some(r=>(r.taskRevision??1)!==(task.revision??1))) await engine.reconcileTask(task)
      }
      await persist()
      const observations=new Map()
      // 恢复阶段是最容易踩内核 API 变化的地方：每个 run 独立 try，读不出来就把它标 blocked
      // 并写清原因，其它 run 照常恢复——绝不把异常抛到 executionError 把整条调度关掉。
      for(const run of state().runs.filter(r=>r.sessionId && !['completed','cancelled'].includes(r.status))) {
        try {
          const inspection=await inspectSession(run.sessionId)
          observations.set(run.sessionId,{events:inspection.events.map(normalize),running:liveAgent(run.sessionId)?.status==='running'})
        } catch(error) {
          // An unreadable existing session is a recovery problem, never permission to redo it.
          run.status='blocked';run.error=`恢复读取失败：${String(error?.message??error)}`
        }
      }
      // recover 本身失败（引擎内部异常）同样只降级：已恢复的观测照常应用不了时，
      // 保持各 run 的现状，把原因记到 executionStatus 供界面显示。
      try {
        await engine.recover(observations)
      } catch(error) {
        rt.executionRecoveryError=String(error?.message??error)
        console.warn('[dsh-workbench] execution recover:',error)
      }
      await sync(false)
    })()
    // 入口失败（硬依赖缺失、恢复流程本身崩了）才停调度，并且只停调度、不改任务状态；
    // 界面通过 execution.status 展示 reason，清除 incident 后下一次 tick 自动重试入口。
    rt.executionReady.catch(error=>{
      rt.executionIncident={stage:'startup',reason:String(error?.message??error),time:Date.now()}
      rt.executionError=rt.executionIncident.reason
    })
    timer=setInterval(()=>rt.kickExecution(),Math.max(250,rt.config.tickMs??2000));timer.unref?.()
    rt.kickExecution()
    return rt.executionReady
  }
  ctx.effect(()=>async()=>{
    disposed=true;clearInterval(timer)
    await rt.executionReady?.catch(()=>{})
    while(work.size) await Promise.all([...work])
    await engine.tail
    for (const run of rt.state.execution?.runs ?? []) {
      const agent=run.sessionId ? liveAgent(run.sessionId) : null
      if(agent?.status==='running') {agent.cancel({kind:'disposed'},{keepInbox:true});await ctx.sessions.flush(agent.session)}
    }
    await rt.saveAll()
  },'dsh-workbench: execution lifetime')
}
