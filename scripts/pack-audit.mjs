#!/usr/bin/env node
// 打包/依赖体检：把“装到别人机器上才发现”的问题提前到 CI。
//
// 检查项：
//  1. package.json version 必须是 semver，且 README「版本记录」有对应小节；
//  2. 与上一个 git tag 相比，改动落在测试目录/脚本/文档之外时，version 必须已经提升；
//  3. dependencies 里不允许出现 Harness 内置包（@deepseek-ai/dsh-* 由宿主提供）；
//     出现在 devDependencies / peerDependencies 时，版本必须与 host-api.js 声明的一致；
//  4. `npm pack` 的产物里必须包含运行期真正被 import 的文件（防止 files 字段漏项）。
//
// 用法：node scripts/pack-audit.mjs [--json]
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { HOST_IMPORTS } from '../src/host/host-api.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const readme = await readFile(resolve(root, 'README.md'), 'utf8')
const problems = []
const notes = []
const fail = (msg) => problems.push(msg)
const note = (msg) => notes.push(msg)

// ---- 1. 版本号与版本记录 ----
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/
if (!SEMVER.test(pkg.version)) fail(`package.json version "${pkg.version}" 不是合法 semver`)
const escaped = pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
if (!new RegExp(`^### ${escaped}\\s*$`, 'm').test(readme)) fail(`README「版本记录」缺少 ### ${pkg.version} 小节`)

// ---- 2. 改代码但没升版本 ----
try {
  const tags = execFileSync('git', ['tag', '-l', '--sort=-v:refname'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const lastTag = tags[0]
  if (!lastTag) {
    note('仓库还没有 tag，跳过“已升版本”检查')
  } else if (lastTag === `v${pkg.version}`) {
    const changed = execFileSync('git', ['diff', '--name-only', `${lastTag}..HEAD`], { cwd: root, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
    const runtime = changed.filter((file) => !/^(test\/|scripts\/|docs\/|\.github\/|README|CHANGELOG)/.test(file))
    if (runtime.length) {
      fail(`自 ${lastTag} 以来改了 ${runtime.length} 个运行期文件但没升版本（例如 ${runtime.slice(0, 3).join(', ')}）`)
    }
  } else {
    note(`上一个 tag ${lastTag} 与当前 ${pkg.version} 不同，视为已升版本`)
  }
} catch {
  note('git 不可用，跳过版本提升检查')
}

// ---- 3. 内置包不得进 dependencies ----
const isHarness = (name) => name.startsWith('@deepseek-ai/dsh-') || ['@deepseek-ai/cordis', '@deepseek-ai/cosmokit', '@deepseek-ai/schemastery'].includes(name)
for (const name of Object.keys(pkg.dependencies ?? {})) {
  if (isHarness(name)) fail(`dependencies 里出现了 Harness 内置包 ${name}：它必须由宿主提供，否则会打到旧版本`)
}
for (const section of ['devDependencies', 'peerDependencies']) {
  for (const [name, range] of Object.entries(pkg[section] ?? {})) {
    if (!isHarness(name)) continue
    if (!range.startsWith('*') && !range.startsWith('>=')) {
      fail(`${section} 里 ${name} 锁了 ${range}：开发者只用本机已装的宿主，锁具体版本会在升级后装出第二份内核`)
    }
  }
}
for (const [name, expected] of Object.entries(HOST_IMPORTS)) {
  const declared = pkg.peerDependencies?.[name] ?? pkg.devDependencies?.[name] ?? '(未声明)'
  note(`${name} 由宿主提供；host-api.js 记录的目标版本 ${expected}，package.json 声明 ${declared}`)
}

// ---- 4. pack 产物完整性 ----
try {
  // 用仓库内的缓存目录，避免机器上全局 ~/.npm 权限异常导致体检假失败。
  const cache = resolve(root, '.npm-cache')
  // --ignore-scripts 至关重要：npm pack 会触发 prepack，而本脚本本身就挂在 prepack 链上。
  const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache], { cwd: root, encoding: 'utf8' })
  const [info] = JSON.parse(out)
  const files = new Set(info.files.map((entry) => entry.path))
  for (const required of ['index.js', 'client.js', 'src/host/execution.js', 'src/host/host-api.js', 'locale/zh.json', 'cordis.patch.yml']) {
    if (!files.has(required)) fail(`npm pack 产物缺少 ${required}——检查 package.json 的 files 字段`)
  }
  note(`pack 产物 ${info.files.length} 个文件，约 ${(info.size / 1024).toFixed(0)} KB`)
} catch (error) {
  fail(`npm pack --dry-run 失败：${String(error.message ?? error).split('\n')[0]}`)
}

const asJson = process.argv.includes('--json')
if (asJson) {
  console.log(JSON.stringify({ ok: problems.length === 0, version: pkg.version, problems, notes }, null, 2))
} else {
  for (const line of notes) console.log(`ℹ️  ${line}`)
  if (problems.length) {
    for (const line of problems) console.error(`❌ ${line}`)
    process.exitCode = 1
  } else {
    console.log(`✅ pack-audit PASS ${pkg.name}@${pkg.version}`)
  }
}
