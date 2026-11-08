/**
 * 宿主能力探测（内核 API 兼容层）。
 *
 * 背景：工作台直接调用 Harness 内核服务（sessionController / workspaceRegistry /
 * agents / sessionTitle ...）。内核在 0.2.1 → 0.2.2 之间删掉了
 * `sessionController.inspect`，只留 `sessionController.events`，导致一条硬调用就让
 * 整个执行通道抛错；而 execution.js 的闸门是 `if (rt.executionError) return false`，
 * 一个错误会把**所有**调度永久关掉，直到重启。
 *
 * 这里的约定：
 *  - 每项内核能力只在一个地方做名字/签名差异的适配，调用方不再写 `typeof x.fn`。
 *  - 缺能力时抛 `CapabilityMissingError`（code = 'workbench/capability-missing'），
 *    携带「能力名 + 需要的宿主版本」，便于在界面上说清楚“要升宿主”还是“要升插件”。
 *  - 探测失败要能降级：execution 一律走 `safe()`，把异常记成 run 的失败原因，
 *    绝不写进会让调度整体停摆的全局 `executionError`。
 */

/** 内核能力缺失：调用方可以据此给出「升级宿主」或「降级」的明确提示。 */
export class CapabilityMissingError extends Error {
  constructor(capability, requirement, detail) {
    super(`当前宿主不支持 ${capability}${requirement ? `（需要 ${requirement}）` : ''}${detail ? `：${detail}` : ''}`)
    this.name = 'CapabilityMissingError'
    this.code = 'workbench/capability-missing'
    this.capability = capability
    this.requirement = requirement
  }
}

/** Harness 内置能力（由内核 bundle 提供，插件不 vendor），0.2.2 时代统一下发。 */
const HARNESS_PACKAGE_VERSION = '0.2.2-rc.1'

/** 插件直接 import 的宿主包及其已知可用范围——pack-audit 按它检查 locks。 */
export const HOST_IMPORTS = Object.freeze({
  '@deepseek-ai/dsh-llm': HARNESS_PACKAGE_VERSION,
})

/** ctx.get(name) 在测试替身里可能为空，退回到 ctx[name]（Service 注册在 ctx 上）。 */
export const service = (ctx, name) => ctx?.get?.(name) ?? ctx?.[name]

const missing = (capability, requirement, detail) => new CapabilityMissingError(capability, requirement, detail)

/**
 * 冷读一个 Session 的事件（不激活 Agent），返回 `{ events, hasMore }`。
 * - 0.2.1：`sessionController.inspect(sessionId, signal)` → `{ events, hasMore }`
 * - 0.2.2+：`sessionController.events({ address: { kind:'session', sessionId } }, signal)` → `{ records, cursor, hasMore }`
 */
export async function readSessionEvents(ctx, sessionId, { timeoutMs = 5000 } = {}) {
  const sc = service(ctx, 'sessionController')
  if (!sc) throw missing('sessionController', HARNESS_PACKAGE_VERSION, '内核未注册该服务')
  const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
  if (typeof sc.inspect === 'function') {
    const result = await sc.inspect(sessionId, signal)
    return { events: result?.events ?? [], hasMore: Boolean(result?.hasMore) }
  }
  if (typeof sc.events === 'function') {
    const page = await sc.events({ address: { kind: 'session', sessionId } }, signal)
    return { events: page?.records ?? [], hasMore: Boolean(page?.hasMore) }
  }
  throw missing('sessionController.inspect / sessionController.events', '0.2.1 或 0.2.2+', '两个冷读入口都不存在')
}

/** Session 是否存在。只把 not-found 当作“不存在”，其它错误仍然上抛（可能是权限/IO 问题）。 */
export async function sessionExists(ctx, sessionId, options) {
  try {
    await readSessionEvents(ctx, sessionId, options)
    return true
  } catch (error) {
    if (error?.code === 'session/not-found') return false
    throw error
  }
}

/**
 * 包一层：任何内核调用失败都退回 fallback，而不是让异常冒泡到全局闸门。
 * `onError` 用于就地记账（例如把原因写到 run.error）。
 */
export async function safe(fn, fallback = undefined, onError) {
  try {
    return await fn()
  } catch (error) {
    if (onError) {
      try {
        onError(error)
      } catch {
        /* 记账失败不应再抛 */
      }
    }
    return fallback
  }
}

/** 宿主能力清单（关于页 / 诊断日志 / 升级提示共用）。 */
export function capabilities(ctx) {
  const sc = service(ctx, 'sessionController')
  const registry = service(ctx, 'workspaceRegistry')
  const agents = service(ctx, 'agents')
  return {
    harnessVersion: HARNESS_PACKAGE_VERSION,
    sessionController: Boolean(sc),
    sessionInspect: typeof sc?.inspect === 'function',
    sessionEvents: typeof sc?.events === 'function',
    sessionCreate: typeof sc?.create === 'function',
    sessionProjections: typeof sc?.projections === 'function',
    sessionResolveAgent: typeof sc?.resolveAgent === 'function',
    sessionSelectModel: typeof sc?.selectModel === 'function',
    sessionTitleRename: typeof service(ctx, 'sessionTitle')?.rename === 'function',
    workspaceResolveByPath: typeof registry?.resolveByPath === 'function',
    workspaceCreate: typeof registry?.create === 'function',
    agentsFacility: typeof agents?.get === 'function',
  }
}

/** 执行通道硬依赖的能力；缺任意一项，调度就不能开始。 */
export const EXECUTION_REQUIRED = Object.freeze([
  ['sessionController', '内核未注册 sessionController'],
  ['sessionCreate', 'sessionController.create 不可用'],
  ['sessionResolveAgent', 'sessionController.resolveAgent 不可用'],
  ['agentsFacility', 'agents 服务不可用'],
])

/** 返回缺失的执行依赖（空数组表示可以调度）。 */
export function missingExecutionCapabilities(ctx) {
  const caps = capabilities(ctx)
  return EXECUTION_REQUIRED.filter(([key]) => !caps[key]).map(([, reason]) => reason)
}
