# 截图资源

README「界面展示」段落引用的图片放在这里。用绝对地址引用，保证 GitHub 与 npm 页面都能显示：

```markdown
![说明](https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/<文件名>)
```

## 命名约定

| 文件 | 内容 |
| --- | --- |
| `overview.png` | 主界面：侧栏 + 群聊 |
| `group-chat.png` | 群聊与 @ 投递 |
| `tasks.png` | 任务列表、优先级与依赖 |
| `execution.png` | 执行记录、证据与恢复 |
| `approval-light.png` | 权限审批（浅色） |
| `approval-dark.png` | 权限审批（深色） |
| `about.png` | 关于页版本检查 |

## 截图规格

- 宽度统一 **1280px**（Retina 截图先用 `sips -Z 1280 文件.png` 缩放）
- 只截 Harness 窗口，不截桌面、不露个人信息、项目路径用示例名称
- PNG，单张控制在 **300KB 以内**；超过可用 `pngquant --quality=65-85 文件.png` 压缩
- 明暗主题成对提供时，用同一屏内容，便于对比

本目录不进 npm 包（`package.json` 的 `files` 未包含 `docs/`），只用于 GitHub 展示。
