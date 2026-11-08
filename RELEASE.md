# 发版流程

面向维护者。从改版本到 npm 发布、GitHub 打标签建 Release 的完整操作顺序，以及踩过的坑。

普通人安装插件不需要看这份文档，直接看 [README](README.md)。

---

## 0. 发版前必须知道的三条硬规则

**规则一：已删除的版本号永久作废。**

npm 一旦发布过某个版本号，即使 `npm unpublish` 删除，该版本号也**永久不可再次发布**。历史记录保留在 registry 的 `time` 字段里。

本项目 `0.1.1`、`0.1.2`、`0.1.3` 均已作废，对外版本从 `0.1.4` 继续。发版前先确认目标版本号可用：

```bash
curl -s -H 'User-Agent: npm' https://registry.npmjs.org/dsh-collab-workbench \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      const j=JSON.parse(d);
      console.log("现存:", Object.keys(j.versions).join(", "));
      console.log("dist-tags:", JSON.stringify(j["dist-tags"]));
      console.log("历史（含已删）:", Object.keys(j.time).filter(k=>/^\d/.test(k)).sort().join(", "));
    })'
```

**规则二：先 npm 发布，再打 git 标签。**

顺序反了会出现「标签指向一个在 npm 上装不到的版本」。正确顺序固定为：

```
改版本 → verify → pack → npm publish → 确认 npm → git tag → git push tag → 建 Release
```

**规则三：`npm publish` 需要浏览器 2FA，必须由维护者本人执行。**

其余步骤可以交给助手或脚本。

---

## 1. 准备分支

```bash
cd "dsh-workbench"

git switch main && git pull
git switch -c release/x.y.z
```

改代码、补测试、提交：

```bash
npm test
git add -A && git commit -m "fix: ..."
git switch main && git merge --no-ff release/x.y.z
```

## 2. 跑发版向导

```bash
npm run release 0.1.5
```

`scripts/release.mjs` 会自动完成：

1. 校验目标版本是 semver 且严格大于当前版本
2. 改 `package.json` 的 `version`
3. 同步 `test/client-package-identity.test.js` 里的版本断言
4. 在 `README.md`「版本记录」最前面插入 `### 0.1.5` 占位小节（**改之前必须先手写好这一节**，没有就报错）
5. 跑 `npm run verify`（build + test + pack-audit）
6. 打包出 `dsh-collab-workbench-0.1.5.tgz`，并打印后续命令

**它不会替你 commit / tag / publish。**

只想检查不改文件：

```bash
npm run release 0.1.5 --dry-run
```

## 3. 确认「版本记录」写清楚了

打开 `README.md`，确认新版本小节包含：

- 这个版本改了什么（用户视角）
- 升级注意事项（有无数据格式变更、要不要重试/重置）
- 已知问题（不阻塞发版但需要说明的）

这一节会直接复制进 GitHub Release。

## 4. 全量校验

```bash
npm run verify
```

包含 `build` → `test` → `pack-audit`。pack-audit 会在下列情况直接失败：

- 改了运行期代码但没升版本
- 内置包（如 `@deepseek-ai/*`）跑进了 `dependencies`
- pack 产物漏文件

## 5. 检查打包内容

```bash
ls -lh dsh-collab-workbench-0.1.5.tgz
tar -tzf dsh-collab-workbench-0.1.5.tgz | grep -E 'VERIFY|CANDIDATE|test/|\.tgz' || echo "✅ 包内无内部文档"
```

包内**不应**出现验证记录、发版说明、测试目录、其他 tgz。

## 6. 发布到 npm（需 2FA）

```bash
npm publish ./dsh-collab-workbench-0.1.5.tgz --access public --registry=https://registry.npmjs.org/
```

浏览器会弹验证页，确认。

常见报错：

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `E401 Unauthorized` | 登录过期 | `npm login --registry=https://registry.npmjs.org/` |
| `EOTP` / `E403` | 2FA 没完成 | 重新执行 publish |
| `E400 Cannot publish over previously published version` | 版本号已作废 | 换更高的版本号重来（见规则一） |
| `E404 Not Found - PUT` | 未登录，npm 用它伪装成包不存在 | 先 `npm whoami` 确认登录 |

## 7. 确认 npm 发布成功

```bash
curl -s -H 'User-Agent: npm' https://registry.npmjs.org/dsh-collab-workbench \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      const j=JSON.parse(d); console.log("versions:", Object.keys(j.versions).join(", "));
      console.log("dist-tags:", JSON.stringify(j["dist-tags"]));
    })'
```

必须满足：

- `versions` 里出现目标版本
- `dist-tags.latest` 等于目标版本

**不满足就不要打标签。**

## 8. 打 git 标签

```bash
git add -A
git commit -m "release: 0.1.5"
git push origin main

git tag -a v0.1.5 -m "v0.1.5 — <一句话主题>"
git push origin v0.1.5
```

核对：

```bash
git tag -n1
git ls-remote --tags origin | sed 's#refs/tags/##'
```

## 9. 建 GitHub Release

打开（改版本号）：

```
https://github.com/heyallen101/dsh-collab-workbench/releases/new?tag=v0.1.5
```

- **Tag**：选刚推上去的 `v0.1.5`
- **Title**：`v0.1.5 — <一句话主题>`
- **Description**：复制 README 里对应的版本记录小节，补一段「安装」

```markdown
## 安装

```text
dsh-collab-workbench@0.1.5
```

npm: https://www.npmjs.com/package/dsh-collab-workbench
```

## 10. 确认 CI 与页面

```bash
curl -sL -o /dev/null -w 'CI badge http=%{http_code}\n' \
  https://github.com/heyallen101/dsh-collab-workbench/actions/workflows/ci.yml/badge.svg
```

再人工确认：

- https://github.com/heyallen101/dsh-collab-workbench/actions —— 最新一次全绿
- https://github.com/heyallen101/dsh-collab-workbench/releases —— 新 Release 可见
- https://www.npmjs.com/package/dsh-collab-workbench —— 版本与 README 已更新

## 11. 本机升级验证

```bash
# Harness 插件页：卸载旧版 → 安装新版本
dsh-collab-workbench@0.1.5
```

重启 Harness、刷新页面，打开工作台「关于」确认：

- 当前版本 = 新版本
- 最新版本 = 新版本
- 状态 = 已是最新版本

再跑一遍主链路：建任务 → 执行 → 成员汇报 → 任务完成。数据（角色/群组/任务）应全部保留。

---

## 附录 A：为什么不能一键自动升级

当前 Harness 的插件管理器在 HMR 可用时，禁止用同名包覆盖已安装的插件（返回 `already-installed`）。官方路径是「先卸载再安装」，但插件无法在卸载自己的同时继续执行后续安装逻辑，失败会导致工作台不可用。

因此插件只提供**版本检查 + 升级步骤提示**，不自动安装。这是设计选择，不是缺陷。

## 附录 B：本地安装 tgz 验证（不发布也能测）

```bash
cd ~/.dsh/profiles/desktop
pnpm add /绝对路径/dsh-collab-workbench-0.1.5.tgz
rc=$?; [ $rc -ne 0 ] && echo "安装失败（沙箱/网络），改用 Harness 插件页安装 tgz"
```

从本地 tgz 安装时，「关于」页会显示「当前从本地文件安装」，不会提示 npm 更新。这是预期行为。

## 附录 C：仓库改名 / 转移后要同步的地方

GitHub 用户名或仓库名变更后，下列**硬编码地址**必须手动更新（GitHub 的 301 重定向能兜底一阵，但不应长期依赖）：

| 文件 | 字段 |
| --- | --- |
| `package.json` | `repository.url`、`homepage`、`bugs.url` |
| `README.md` | CI 徽标、仓库链接、所有 `raw.githubusercontent.com` 图片地址 |
| `docs/images/README.md` | raw 地址示例 |
| `RELEASE.md`（本文档） | 上文所有链接 |

检查有没有漏：

```bash
grep -rn 'wind7rui' package.json README.md docs/ RELEASE.md scripts/ .github/ || echo "✅ 无旧地址残留"
```

`package.json` 的地址变更**不会更新到已发布的 npm 版本**，要等下一次发版才生效。期间旧地址靠重定向继续可用。
