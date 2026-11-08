import test from 'node:test'
import assert from 'node:assert/strict'
import { runtime, seed } from './runtime-fixture.mjs'
import {
  CapabilityMissingError,
  capabilities,
  missingExecutionCapabilities,
  readSessionEvents,
  safe,
  sessionExists,
} from '../src/host/host-api.js'

// 内核在 0.2.1 → 0.2.2 删掉了 sessionController.inspect。
// 这组用例锁住「两个宿主都能跑」以及「能力缺失时必须降级而不是锁死调度」。

test('readSessionEvents prefers inspect on a 0.2.1 host', async () => {
  const calls = []
  const ctx = { sessionController: { inspect: async (id, signal) => { calls.push(['inspect', id, Boolean(signal)]); return { events: [{ type: 'a' }], hasMore: false } } } }
  const result = await readSessionEvents(ctx, 'sid', { timeoutMs: 5000 })
  assert.deepEqual(result, { events: [{ type: 'a' }], hasMore: false })
  assert.deepEqual(calls, [['inspect', 'sid', true]])
})

test('readSessionEvents falls back to events({address}) on a 0.2.2 host', async () => {
  const seen = []
  const ctx = {
    sessionController: {
      async events(request, signal) {
        seen.push([request, Boolean(signal)])
        return { records: [{ type: 'b' }, { type: 'c' }], cursor: 2, hasMore: true }
      },
    },
  }
  const result = await readSessionEvents(ctx, 'sid')
  assert.deepEqual(result, { events: [{ type: 'b' }, { type: 'c' }], hasMore: true })
  assert.deepEqual(seen[0][0], { address: { kind: 'session', sessionId: 'sid' } })
})

test('readSessionEvents resolves the service through ctx.get as well as ctx', async () => {
  const ctx = { get: name => (name === 'sessionController' ? { events: async () => ({ records: [{ type: 'x' }] }) } : undefined) }
  assert.deepEqual((await readSessionEvents(ctx, 'sid')).events, [{ type: 'x' }])
})

test('a host lacking both read entries raises a CapabilityMissingError naming the requirement', async () => {
  await assert.rejects(() => readSessionEvents({ sessionController: {} }, 'sid'), error => {
    assert.ok(error instanceof CapabilityMissingError)
    assert.equal(error.code, 'workbench/capability-missing')
    assert.match(error.message, /0\.2\.1 或 0\.2\.2\+/)
    return true
  })
  await assert.rejects(() => readSessionEvents({}, 'sid'), /内核未注册该服务/)
})

test('sessionExists reports absence only for session/not-found and rethrows other failures', async () => {
  const notFound = { sessionController: { inspect: async () => { throw Object.assign(new Error('gone'), { code: 'session/not-found' }) } } }
  assert.equal(await sessionExists(notFound, 'sid'), false)
  const ioError = { sessionController: { inspect: async () => { throw new Error('disk exploded') } } }
  await assert.rejects(() => sessionExists(ioError, 'sid'), /disk exploded/)
  const present = { sessionController: { inspect: async () => ({ events: [] }) } }
  assert.equal(await sessionExists(present, 'sid'), true)
})

test('safe() swallows failures into the fallback and records the cause', async () => {
  const errors = []
  assert.equal(await safe(async () => { throw new Error('boom') }, 'fallback', error => errors.push(error.message)), 'fallback')
  assert.deepEqual(errors, ['boom'])
  assert.equal(await safe(async () => 'ok', 'fallback'), 'ok')
})

test('capabilities() and missingExecutionCapabilities() describe both host generations', () => {
  const old = capabilities({ sessionController: { inspect() {}, create() {}, resolveAgent() {} }, agents: { get() {} } })
  assert.equal(old.sessionInspect, true)
  assert.equal(old.sessionEvents, false)
  assert.deepEqual(missingExecutionCapabilities({ sessionController: { inspect() {}, create() {}, resolveAgent() {} }, agents: { get() {} } }), [])
  const newHost = capabilities({ sessionController: { events() {}, create() {}, resolveAgent() {} }, agents: { get() {} } })
  assert.equal(newHost.sessionInspect, false)
  assert.equal(newHost.sessionEvents, true)
  assert.deepEqual(missingExecutionCapabilities({ sessionController: { events() {}, create() {}, resolveAgent() {} }, agents: { get() {} } }), [])
  const broken = missingExecutionCapabilities({ sessionController: {} })
  assert.ok(broken.some(reason => reason.includes('sessionController.create')))
})

// —— 端到端：同一套用例跑在两种宿主语义上 ——

for (const host of ['inspect', 'events']) {
  test(`dispatch, completion and restart recovery work on a ${host}-style host`, async () => {
    const f = await runtime({ host })
    let g
    try {
      seed(f.rt)
      const response = await f.request('tasks.create', { title: 'Implement', groupId: 'group_1', assignees: ['role_1'] })
      assert.equal(response.ok, true, JSON.stringify(response))
      await f.settle()
      const task = response.data.task
      const [run] = f.rt.executionRuns(task.id)
      assert.equal(run.status, 'running')
      await f.call('dwb_report_execution', { runId: run.id, status: 'completed', summary: 'done', evidence: ['out.txt'] }, run)
      await f.settle()
      assert.equal(f.rt.getTask(task.id).status, '已完成')
      await f.close(false)
      // 重启：startExecution 的恢复路径同样要走冷读适配层
      g = await runtime({ host, home: f.home, sessions: f.sessions })
      await g.settle()
      assert.equal(g.rt.executionError ?? null, null)
      assert.equal(g.rt.executionRuns(task.id)[0].status, 'completed')
    } finally {
      if (g) await g.close()
      else await f.close()
    }
  })
}

test('a host that lost every cold-read entry blocks the affected run, not the whole scheduler', async () => {
  const f = await runtime()
  let g
  try {
    seed(f.rt)
    // 用一个已存在、但不会被自动恢复的 run 构造“读不出来”的场景：
    // 任务标完成让闸门拒发，run 留在 running 等重启恢复。
    const task = await f.rt.createTask({ title: 'stuck', groupId: 'group_1', assignees: ['role_2'] })
    await f.settle()
    const [seeded] = f.rt.executionRuns(task.id)
    assert.equal(seeded.status, 'running')
    f.rt.state.execution.runs = f.rt.state.execution.runs.map(r => (r.id === seeded.id ? { ...r, status: 'running' } : r))
    await f.rt.saveAll()
    await f.close(false)

    // 重启后的宿主两个冷读入口都没了（模拟内核删 API 但插件没适配）
    g = await runtime({ home: f.home, sessions: f.sessions })
    delete g.ctx.sessionController.inspect
    g.rt.executionError = 'force-rerun'
    await g.request('execution.reset')
    await g.settle()

    const [run] = g.rt.executionRuns(task.id)
    assert.equal(run.status, 'blocked')
    assert.match(run.error ?? '', /恢复读取失败/)
    assert.match(run.error ?? '', /sessionController/)
    // 关键回归：单个 run 读失败不得写进全局闸门
    assert.equal(g.rt.executionError, undefined)
    assert.equal(g.rt.executionDiagnostics().error, null)
    // 调度仍然活着：新任务照常派发
    const second = await g.rt.createTask({ title: 'second', groupId: 'group_1', assignees: ['role_1'] })
    await g.settle()
    assert.equal(g.rt.executionRuns(second.id)[0].status, 'running')
  } finally {
    if (g) await g.close()
    else await f.close().catch(() => {})
  }
})

test('execution.reset clears a startup incident and rebuilds the scheduler', async () => {
  const f = await runtime()
  try {
    seed(f.rt)
    f.rt.executionIncident = { stage: 'startup', reason: 'injected' }
    f.rt.executionError = 'injected'
    const res = await f.request('execution.reset')
    assert.equal(res.ok, true, JSON.stringify(res))
    assert.equal(res.data.error, null)
    assert.equal(f.rt.executionError, undefined)
    assert.equal(f.rt.executionIncident, undefined)
    const task = await f.rt.createTask({ title: 'T', groupId: 'group_1', assignees: ['role_2'] })
    await f.settle()
    assert.equal(f.rt.executionRuns(task.id)[0].status, 'running')
  } finally {
    await f.close()
  }
})
