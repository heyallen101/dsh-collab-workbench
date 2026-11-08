# 协作工作台 · Collaboration Workbench

[![CI](https://github.com/wind7rui/dsh-collab-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/wind7rui/dsh-collab-workbench/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-collab-workbench.svg)](https://www.npmjs.com/package/dsh-collab-workbench)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

DeepSeek Harness 的多 Agent 项目协作插件。通过自定义角色、项目群聊和任务调度，让不同职责的 Agent 在同一项目中协作，并保留执行记录与交付依据。

npm 包名：`dsh-collab-workbench`。源码仓库：[wind7rui/dsh-collab-workbench](https://github.com/wind7rui/dsh-collab-workbench)。

## 核心功能

- **人员与角色**：创建自定义人员，设置职责描述和模型，为项目组织不同分工。
- **项目群聊**：在群内沟通，通过 @ 指定成员；群组关联项目工作目录。
- **任务管理与自动调度**：指派成员、设置优先级及前置依赖，系统按可用执行额度安排任务。
- **执行记录与恢复**：保存输入、执行状态、结果摘要和证据；支持显式重试、停止及有界的中断恢复。
- **群内权限审批**：在可明确关联的请求上，展示宿主原生审批入口；无法安全关联时回到原会话处理。
- **交付与记忆**：支持管理员最终交付，以及个人和团队记忆。
- **版本检查**：关于页手动检查 npm 上的新版本，发现新版时显示侧栏云朵提示；只提示，不自动安装。

## 界面展示

> 以下均为深色主题下的实际渲染截图。

**工作台总览**：左侧是 Harness 原生侧栏（工作台作为插件入口），中间是项目群聊，右侧是任务列表与人员。

![工作台总览：侧栏、群聊、任务与人员](https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/overview.png)

**项目群聊**：管理员派发任务、成员完成回报、群里直接看得到交付结论。

![项目群聊：任务派发与成员回报](https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/group-chat.png)

**任务列表**：按状态（全部 / 待办 / 进行中 / 已完成）与群组筛选，卡片上直接标注承接成员。

![任务列表：状态筛选与成员标注](https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/tasks.png)

**人员与角色**：每个角色绑定模型与职责描述，可随时启停、编辑。

![人员与角色：模型绑定与职责描述](https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/people.png)

**群内原生权限审批**（明 / 暗主题成对提供，便于对比）：

| 浅色主题 | 深色主题 |
| :---: | :---: |
| <img src="https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/approval-light.png" width="420" alt="浅色主题下的群内权限审批"> | <img src="https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/approval-dark.png" width="420" alt="深色主题下的群内权限审批"> |

## 安装

本包是 **DeepSeek Harness 插件**，不是可单独运行的应用。需要已安装并可正常运行的 Harness，以及可用的模型配置。

在 Harness 的插件管理功能中，以 npm 包名安装并启用：

```text
dsh-collab-workbench
```

也可让 Harness 中的助手协助安装，示例：

> 请从 npm registry 安装并启用 dsh-collab-workbench 插件。

安装结果若提示重启，请先重启 Harness，再刷新页面。普通的 `npm install` 只下载 npm 包，不等于已在 Harness 中启用插件。

若遇到下载失败，检查本机及 Harness profile 的 registry、作用域 registry 和网络设置；指定公共 registry 不一定覆盖本机已有的作用域配置。

## 快速开始

1. 打开侧栏中的“协作工作台”。
2. 创建人员，为每人填写名称、职责及模型配置。
3. 创建项目群，选择成员、管理员和项目工作目录。
4. 在群中描述目标，通过 @ 指定人员沟通；创建任务并设置指派和依赖。
5. 查看任务状态与成员结果，处理必要的决策或权限审批，由管理员核验并完成最终交付。

任务执行需要使用者提供适用的模型和工具权限。系统记录的“已完成”基于执行成员汇报和程序条件，不替代对代码、测试及成果的独立验收。

## 五种预设角色类型

创建人员时可选择下列模板，也可以使用自定义类型和职责：

| 类型 | 默认职责 |
| --- | --- |
| 研发负责人 | 接收需求、分解任务、协调进度、验收交付 |
| 架构师 | 技术方案设计、架构评审 |
| 高级工程师 | 代码实现、联调、自测 |
| 测试工程师 | 测试用例设计、质量验证 |
| 产品经理 | 需求澄清、验收标准定义、价值把关 |

这些是**可选模板**，安装不会自动创建五名人员。每位用户的人员、职责、模型、群组和任务都在自己的 Harness 中配置和保存，不随 npm 包分发。

## 更新方式

在工作台侧栏底部打开“关于”，点击“检查更新”。

- npm registry 来源的安装可查询新版本；有更新时出现侧栏云朵和“关于”页入口。
- **插件不会自动安装更新**，也不会卸载自身。当前 Harness 拒绝用同名包覆盖运行中的插件，因此“关于”页只显示新版本号和升级步骤。
- 升级步骤：在 Harness 的插件页面卸载本插件，再安装“关于”页给出的版本（例如 `dsh-collab-workbench@<新版本号>`），然后重启 Harness 并刷新页面。
- 卸载后若安装失败，工作台会暂时不可用；请先备份数据并确认网络与 registry 可用。
- 升级只替换程序，`$DSH_HOME/dsh-workbench` 中的角色、群组和任务数据会保留。
- 本地 tgz 或目录安装不提供 npm 在线检查，也不会擅自切换来源。
- 网络或 registry 异常只影响检查；不会因此删除工作台数据。

验证更新时，先安装当前版本，等 npm 上出现更高版本后，在“关于”页检查即可看到提示。同版本不会显示“发现新版”。

## 数据与权限边界

工作台台账默认位于 `$DSH_HOME/dsh-workbench/state.json`，保存人员、群组、任务及执行状态；记忆保存在同一数据目录下。工作数据不上传到 npm。Agent 使用模型和工具时的数据处理仍由使用者的 Harness、模型服务及工具配置决定。

- 安装或更新插件不会把发布者的人员、任务或会话复制给使用者。
- 升级保留原数据目录；重要项目建议先备份工作台数据和项目文件。
- 调度不会提高 Agent 权限，工具调用仍受 Harness 的授权与文件访问规则约束。
- 恢复任务时应先核对已有成果；不保证任意外部操作或文件修改恰好执行一次。
- 同一任务的多个成员可能同时工作；插件不会自动为每人建立 Git worktree，需合理划分文件范围。

## 版本记录

### 0.1.4

修复 Harness 0.2.2 升级后**执行通道整体不可用**：内核删除了 `sessionController.inspect`，插件的硬调用抛出 `ctx.sessionController.inspect is not a function`，又因为该错误写进了全局 `executionError` 闸门，导致所有任务（不只是出错的那个）都无法调度。

- 新增 `src/host/host-api.js` 作为**内核能力适配层**：冷读 Session 事件时优先用 0.2.1 的 `inspect`，不存在则改用 0.2.2+ 的 `events({ address })`；两者都没有时抛带版本提示的 `CapabilityMissingError`。
- 执行通道**降级修复**：单个 run 读不出 Session 只把该 run 标 `blocked` 并写明原因，不再污染全局闸门；运行期单次失败记入 `executionLastError`；只有入口级故障（缺硬依赖、恢复流程崩溃）才停调度。
- 启动时先做**能力探测**，缺 `sessionController` / `create` / `resolveAgent` / `agents` 时直接给出可读原因，而不是让引擎跑到一半崩。
- 新增 RPC `execution.reset`：清除入口故障并重建调度（不清任务数据）；`execution.status` 增加 `diagnostics`（宿主能力清单、incident、最近错误），便于界面和排障。
- 工程侧：新增 `scripts/pack-audit.mjs`（版本/semver、内置包不得进 dependencies、pack 产物完整性）与 `scripts/release.mjs`（发版向导），`npm run verify` 一条命令跑全部校验；新增 `test/host-api.test.js`，同一套执行用例同时跑在 0.2.1 与 0.2.2 两种宿主语义上。

**验证记录**：A 组（升级事故复现）、B 组（主链路）在本机 Harness 0.2.2-rc.1 上实测通过；C 组（降级路径）以
`test/host-api.test.js` 的 11 条用例覆盖，并附两次真实重启的观察记录。完整记录见
[VERIFY-0.1.4-本地验证.md](VERIFY-0.1.4-本地验证.md)。

**升级注意**：这是兼容性修复，无数据格式变更；0.1.0 的群组、角色、任务数据原样可用。执行引擎里被 0.2.2 打上 `blocked` 的 run，安装 0.1.4 后调一次重试或 `execution.reset` 即可恢复。

**已知问题（不阻塞本版，进下一版）**：群内发「暂停所有执行」等自然语言指令不会触发暂停（需用界面停止按钮）；决策回复后群里没有系统回显；被取代的旧失败 run 仍留在执行记录里。

> 版本号说明：0.1.1–0.1.3 为内部发布版本，曾在 npm 上短暂存在后删除，现已不可安装；对外发布版本从 0.1.4 继续。


### 0.1.0

首个公开发布版本。包含：

- 人员与角色、项目群聊、任务指派与自动调度、执行记录与中断恢复、群内原生权限审批、交付与记忆。
- 关于页版本检查：可查询 npm 上的新版本；发现新版时显示侧栏云朵提示。
- 当前 Harness 不支持覆盖运行中的插件，因此更新入口只显示升级步骤，不提供一键安装。

## 开发

以下命令用于开发工作目录；npm 安装包不包含测试目录：

```bash
npm run build      # 生成审批 UI 构建产物并做包一致性检查
npm test           # 单元/集成测试（宿主替身，不连真实模型）
npm run audit      # 打包体检：版本号、内置包、pack 产物完整性
npm run verify     # 上面三项一起跑，CI 与发版前都用它
```

### 宿主版本兼容

Harness 内核在 0.2.1 → 0.2.2 之间删除了 `sessionController.inspect`，公开方法表变化由
`src/host/host-api.js` 集中适配，调用方不再直接写 `typeof xxx.fn`：

- 冷读 Session 事件走 `readSessionEvents()`：0.2.1 用 `inspect`，0.2.2+ 用 `events({ address })`；
- 缺能力时抛 `CapabilityMissingError`（`code = 'workbench/capability-missing'`），带「需要哪个宿主版本」；
- 宿主接入新版本后，先跑 `capabilities()` 对比方法表，再补一条对应 `.test.js` 用例。

### 发版流程

```bash
git switch -c fix/xxx           # 1. 从 main 开分支
# ...改代码、补测试...
git commit -m "fix: ..."
npm run verify                  # 2. 全绿才继续
git switch main && git merge --no-ff fix/xxx

npm run release 0.1.4           # 3. 改版本 + 插版本记录 + verify + 打 tgz
#   → 补全 README「### 0.1.4」小节
git add -A && git commit -m "release: 0.1.4"
git tag -a v0.1.4 -m "v0.1.4" && git push --follow-tags
npm publish --otp=<口令>        # 4. 发布到 npm
```

`scripts/release.mjs` 只改版本号、插入版本记录占位、跑校验并打出 tgz，**不代你 commit / tag / publish**；
`pack-audit` 会在「改了运行期代码但没升版本」「内置包进了 dependencies」「pack 产物漏文件」时直接失败。

### 发版节奏：先本地跑两天

稳定版不直接 `npm publish`。0.1.4 起固定为：**本地装 tgz → 按 `VERIFY-<版本>-本地验证.md` 跑够 48 小时 → 全过再发布**。
验证记录与问题清单都写在那份文件里，发版时把结论贴进 README 版本小节。

### 本机安装验证

```bash
cd ~/.dsh/profiles/desktop
pnpm add /绝对路径/dsh-collab-workbench-0.1.4.tgz
rc=$?; [ $rc -ne 0 ] && echo "安装失败（沙箱/网络），改用 Harness 插件页安装 tgz"
# 完全退出并重启 Harness，然后在测试群跑一遍：建任务 → 执行 → dwb_report_execution → 任务完成
```

Host 依赖由 Harness 提供。隔离测试使用宿主替身；测试通过不等于已完成使用者环境的真实模型、权限审批、明暗主题或冷启动验收。

## 许可证

Apache-2.0。原创 SVG 图标随包以同一许可证提供。
