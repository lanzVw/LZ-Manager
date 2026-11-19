# LZ Manager

Windows 平台的 3DMigoto / XXMI Mod 管理器，支持绝区零、鸣潮、崩坏：星穹铁道、明日方舟：终末地、原神等游戏。

[下载最新版](https://github.com/lanzVw/LZ-Manager/releases/latest) · [问题反馈](https://github.com/lanzVw/LZ-Manager/issues)

## 下载

从 [GitHub Releases](https://github.com/lanzVw/LZ-Manager/releases/latest) 下载 `LZ-Manager-Setup-<version>.exe` 并安装。

- 仅支持 Windows 10/11 x64
- 当前安装包未配置代码签名证书，Windows 可能提示“未知发布者”
- 安装包约 183 MB，主要来自随包的修复器、运行库与角色资源

## 功能

- Mod 扫描、启停、预览、重命名、封面与元数据编辑
- 拖拽压缩包导入，GameBanana 市场搜索、下载与更新检查
- Mod 冲突检测、3DMigoto 运行环境检查与自动部署
- Persist Bridge 参数持久化与预设方案
- 游戏内悬浮窗：角色头像轨道、角色近似跟随、模组切换动效
- 浅色、深色与 Clay 主题

所有数据保存在 `%APPDATA%\QAQManager`，无服务端。

## 本地开发

环境要求：Windows、Node.js 22+、npm。

```bash
npm install
npm run dev
```

常用检查：

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

构建后启动：

```bash
npm start
```

## 打包与发布

```bash
npm run dist
```

产物输出到 `release/<version>/`，安装包为 `LZ-Manager-Setup-<version>.exe`。当前 `electron-builder.yml` 的 `publish` 为 `null`，GitHub Release 资产需要单独上传；完整发版流程见 [AGENTS.md](AGENTS.md)。

## 目录

- `src/core/`：可单测的 Node 业务逻辑
- `src/main/`：Electron 主进程与 IPC
- `src/preload/`：`window.lz` / `window.flairx` 桥
- `src/renderer/`：React 主界面与游戏内悬浮窗
- `resources/`：随包运行时资源
- `tests/`：Vitest 用例

## 许可

ISC
