#!/usr/bin/env node
// 发版向导：把「改版本 → 写版本记录 → 全量校验 → 打包 → 打 tag」固定成一条命令。
//
//   node scripts/release.mjs 0.1.4          # 准备 0.1.4 的发版（不提交、不推送）
//   node scripts/release.mjs 0.1.4 --dry-run # 只检查，不改文件
//
// 做的事：
//  1. 校验目标版本是 semver 且严格大于当前版本；
//  2. 改 package.json version，同步 test/client-package-identity.test.js 里的身份断言；
//  3. 在 README「版本记录」最前面插入 `### <version>` 占位小节（没有就报错，逼你写清楚改了什么）；
//  4. 跑 npm run verify（build + test + pack-audit）；
//  5. 打包出 tgz 并打印下一步（git commit / tag / npm publish / 本地安装）。
//
// 故意不做的事：不自动 commit、不自动 tag、不自动 publish——发版是人来拍板的动作。
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const dry = process.argv.includes('--dry-run')
const target = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/

const read = (path) => readFile(resolve(root, path), 'utf8')
const write = (path, text) => (dry ? Promise.resolve() : writeFile(resolve(root, path), text))
const die = (message) => {
  console.error(`❌ ${message}`)
  process.exit(1)
}
const compare = (a, b) => {
  const split = (v) => v.split(/[-+]/)[0].split('.').map(Number)
  const [x, y] = [split(a), split(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

if (!target) die('用法：node scripts/release.mjs <version> [--dry-run]')
if (!SEMVER.test(target)) die(`"${target}" 不是合法 semver`)

const pkgPath = 'package.json'
const pkg = JSON.parse(await read(pkgPath))
if (compare(target, pkg.version) <= 0) die(`目标版本 ${target} 必须大于当前版本 ${pkg.version}`)

console.log(`${dry ? '[dry-run] ' : ''}发版：${pkg.name} ${pkg.version} → ${target}`)

// 1) package.json
pkg.version = target
await write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

// 2) 身份断言（这个测试显式锁了版本号，必须一起改，否则 CI 立刻红）
const identity = 'test/client-package-identity.test.js'
const identityText = await read(identity)
const identityNext = identityText.replace(/assert\.equal\(pkg\.version, '[^']+'\)/, `assert.equal(pkg.version, '${target}')`)
if (identityNext === identityText) die('没有在 test/client-package-identity.test.js 找到版本断言，请手动确认')
await write(identity, identityNext)

// 3) README 版本记录
const readmePath = 'README.md'
const readme = await read(readmePath)
if (new RegExp(`^### ${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(readme)) {
  console.log('ℹ️  README 已有该版本小节，跳过插入')
} else {
  const marker = '## 版本记录\n'
  const at = readme.indexOf(marker)
  if (at < 0) die('README 找不到「## 版本记录」段落')
  const insert = `${marker}\n### ${target}\n\n（发版前把这一节写完：修了什么、为什么、兼容性影响、升级注意）\n`
  await write(readmePath, readme.slice(0, at) + insert + readme.slice(at + marker.length))
  console.log('ℹ️  已在 README 插入版本小节占位——请补全内容后再发版')
}

if (dry) {
  console.log('✅ dry-run 完成：以上改动不会写入文件')
  process.exit(0)
}

// 4) 全量校验
try {
  execFileSync('npm', ['run', 'verify'], { cwd: root, stdio: 'inherit' })
} catch {
  die('verify 未通过：修好再发版（版本号已改，回退用 git checkout package.json test/client-package-identity.test.js README.md）')
}

// 5) 打包
const out = execFileSync('npm', ['pack', '--cache', resolve(root, '.npm-cache')], { cwd: root, encoding: 'utf8' })
const tgz = out.trim().split('\n').pop().trim()
console.log(`\n✅ 已生成 ${tgz}\n`)
console.log('接下来（人来做）：')
console.log(`  1) 补全 README「### ${target}」小节并提交：git add -A && git commit -m "release: ${target}"`)
console.log(`  2) 打 tag：git tag -a v${target} -m "v${target}" && git push --follow-tags`)
console.log('  3) 发布：npm publish --otp=<一次性口令>')
console.log('  4) 本机装：Harness 插件页卸载旧版 → 安装 ' + tgz + ' → 重启 Harness 并刷新页面')
console.log('  5) 装完先在测试群跑一遍“建任务 → 执行 → 汇报”，确认执行通道通再碰真实项目')
