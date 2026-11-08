# 截图资源

README「界面展示」段落引用的图片放在这里。用绝对地址引用，保证 GitHub 与 npm 页面都能显示：

```markdown
![说明](https://raw.githubusercontent.com/heyallen101/dsh-collab-workbench/main/docs/images/<文件名>)
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

截图左下角的 Harness 账号标识必须处理掉，Harness 只做中间遮盖（`1XX******XX`），首 3 位 + 末 2 位
组合起来仍有识别度。

当前 4 张图的处理方式：在缩放到 1280 宽之后，用矩形涂掉左下角 `x 0–128 / y 666–700`（Harness
侧栏的账号行），填充色取同区域背景色 `rgb(44,49,58)`。涂完用脚本复查过该区域**无任何亮像素残留**。

重新截图的处理步骤：

```python
from PIL import Image, ImageDraw
im = Image.open('原始截图.png').convert('RGB')
im = im.resize((1280, round(im.size[1]*1280/im.size[0])), Image.LANCZOS)
bg = im.getpixel((126, 668))                       # 取账号行右侧的背景色
ImageDraw.Draw(im).rectangle((0, 666, 128, 700), fill=bg)
im.quantize(256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).save('overview.png', optimize=True)
```

复查命令（应输出 0）：

```python
from PIL import Image
im = Image.open('overview.png').convert('RGB'); px = im.load(); w, h = im.size
print(sum(1 for y in range(h-40, h) for x in range(0, 160) if sum(px[x, y])/3 > 90))
```

## 关于本目录

本目录不进 npm 包（`package.json` 的 `files` 未包含 `docs/`），只用于 GitHub 展示。
