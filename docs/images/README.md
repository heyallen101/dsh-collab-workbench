# 截图资源

README「界面展示」段落引用的图片放在这里。用绝对地址引用，保证 GitHub 与 npm 页面都能显示：

```markdown
![说明](https://raw.githubusercontent.com/wind7rui/dsh-collab-workbench/main/docs/images/<文件名>)
```

## 命名约定

| 文件 | 内容 | 状态 |
| --- | --- | --- |
| `overview.png` | 主界面：侧栏 + 群聊 + 任务/人员面板 | ✅ 已有 |
| `group-chat.png` | 群聊：任务派发、成员回报、交付结论 | ✅ 已有 |
| `tasks.png` | 任务列表：状态筛选、成员标注 | ✅ 已有 |
| `people.png` | 人员与角色：模型绑定、职责描述 | ✅ 已有 |
| `approval-light.png` | 权限审批（浅色） | ✅ 已有 |
| `approval-dark.png` | 权限审批（深色） | ✅ 已有 |
| `execution.png` | 执行记录、证据与恢复 | ⬜ 待补 |
| `about.png` | 关于页版本检查 | ⬜ 待补 |

## 生成方式

原始截图为 3840×2100 Retina 全屏，统一按下面两步处理（深色 UI 量化到 256 色几乎无损）：

```bash
python3 - <<'EOF'
from PIL import Image
im = Image.open('原始截图.png').convert('RGB')
im = im.resize((1280, round(im.size[1]*1280/im.size[0])), Image.LANCZOS)
im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).save('overview.png', optimize=True)
EOF
```

处理前请按「脱敏」一节检查一遍。

## 截图规格

- 宽度统一 **1280px**（`sips -Z 1280 文件.png` 保留原比例缩放到最长边；要精确 1280 宽用上面的 PIL 脚本）
- 只截 Harness 窗口，不截桌面、不露个人信息、项目路径用示例名称
- PNG，单张控制在 **300KB 以内**；超过可用 `pngquant --quality=65-85 文件.png` 压缩
- 明暗主题成对提供时，用同一屏内容，便于对比

## 脱敏

截图左下角的 Harness 账号标识要确认已打码。当前 4 张截图为 `1XX******XX` 形式（中间已遮盖），
可以发布；但首尾 3 位 + 2 位仍组合起来仍有识别度。若介意，截屏前先把账号显示切到完全掩码的状态，
或对左下角做裁剪。

## 关于本目录

本目录不进 npm 包（`package.json` 的 `files` 未包含 `docs/`），只用于 GitHub 展示。
