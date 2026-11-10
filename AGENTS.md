# AGENTS.md

## 项目概述

LZ Manager 是一个面向 Windows 的 3DMigoto / XXMI Mod 管理器（Electron + React + TypeScript），
用于管理绝区零、鸣潮、崩坏：星穹铁道、明日方舟：终末地、原神等游戏的 Mod。
提供 Mod 启停/预览/元数据编辑、拖拽压缩包导入、GameBanana 市场搜索下载、Mod 冲突检测、
3DMigoto 运行环境自动部署、Mod 数值持久化（Persist Bridge）、预设、以及游戏内悬浮窗（Overlay）。
无服务端，所有数据落在本地文件系统与 `%APPDATA%\QAQManager`。

## 目录结构

- `src/core/` — 与 Electron 无关的纯 Node 业务逻辑（引擎层，可单测）
  - `types.ts` 全部跨进程共享类型的唯一定义处
  - `mod-engine.ts` Mod 扫描/启停/移动/封面/元数据，是文件操作的唯一收口
  - `config-store.ts` `%APPDATA%\QAQManager\config.json` 与 `presets.json` 的读写与损坏恢复
  - `characters-data.ts` 内置的官方角色名数据库与别名归一（生成式大文件，非手写）
  - `gamebanana-service.ts` GameBanana API、压缩包解包/安装（CommonJS + `require` 风格）
  - `import-engine.ts` 本地压缩包导入管线、`persist-bridge.ts` Mod 数值保留、`conflict-detector.ts` hash 冲突检测
  - `environment-deployer.ts` XXMI 环境检查/部署、`text-encoding.ts` GBK/UTF-16 编码探测与回写
  - `hotkey-dispatch.ts` 按键派发判定/前台校验/回声守卫；`wuwa-fix-engine.ts` 鸣潮 Hash 修复规则引擎、`ini-backup.ts` 修复备份与回滚、`mod-fixer.ts` 修复器解析/安装/拉起（自 QAQ 管理器移植）
- `src/main/` — Electron 主进程：`index.ts` 为入口并集中注册全部 IPC；`overlay-manager.ts`、`game-focus-service.ts`、`tray-manager.ts`、`controller-service.ts` 为独立服务类
- `src/preload/index.ts` — 唯一的 IPC 桥，同时挂到 `window.lz` 与 `window.flairx`
- `src/renderer/` — React 前端；`pages/` 主界面五个页面，`overlay/` 游戏内悬浮窗（同一 bundle，靠 URL hash 分流）
- `resources/` — 随包携带的运行时资源（`binaries/` 7za/UnRAR/焦点助手、`fix/` 修复器 exe 与鸣潮修复规则（自 QAQ 管理器随包，含 GPL 许可文件）、`games/<id>/character-skins/catalog.json`、图标、字体）；打包后从 `process.resourcesPath` 读取
- `tests/` — vitest 用例，覆盖核心引擎（conflict-detector / iniParser / text-encoding / wuwa-fix-engine / ini-backup / restore-persist-bak / hotkey-dispatch / game-visibility）
- `docs/` — 维护类文档；`scripts/` — 资源同步脚本

### 角色资源更新

游戏版本更新后同步角色头像与外观立绘，**必须**按 [`docs/角色头像与外观立绘同步指南.md`](docs/角色头像与外观立绘同步指南.md) 执行：

```bash
python scripts/sync_character_assets.py --check   # 只检查缺什么
python scripts/sync_character_assets.py --avatars # 补齐官方头像
```

两条硬性约束：

- **只用官方素材**：ZZZ 用 Wiki `Agent_<英文名>_Icon.png`（283×307），终末地用官网干员页立绘（303×386），外观立绘用官方 `_Portrait.png` 缩放到高 1200。**禁止自己裁切/生成角色图**——曾用全身立绘自动裁头部，脸偏出画面全部返工
- **角色名以官方简体中文名为准**：目录名与 `characters-data.ts` 的 `name` 均用国服官方译名，时装名同理（「病名为生」而非英文直译）；异体字按官网当前写法统一

角色数据运行时以 `src/core/characters-data.ts` 为准；`resources/games/*/character-config.json` 只是离线参考，`src/` 下无代码读取。

## 常用命令

```bash
npm install
```

```bash
npm run build
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm start
```

- `npm start` 需要先 `npm run build`；启动成功时 stdout 会出现 `[LZ Main] bootstrap` 与 `app ready, creating windows`
- 直接双击可执行文件启动（不经 npm）：

```bash
./node_modules/electron/dist/electron.exe ./dist/main/index.cjs
```

- `npm run dev` 会并发起 Vite dev server + 三个 watch 构建 + Electron，仅开发时使用；`dev:renderer` 单独起 5173 端口
- `npm run dist`（electron-builder 打 NSIS 安装包，读 `electron-builder.yml`）已在本机验证通过：产物在 `release/<version>/`，安装包为 `LZ-Manager-Setup-<version>.exe`，另有免安装的 `win-unpacked/`。当前体积约 181 MB，主要来自随包 `resources/`（修复器与 `dxcompiler.dll`）。该配置的 `publish: null` 表示当前只做本地打包、不上传，也没有代码签名证书，安装时 Windows 会提示「未知发布者」

## 版本号与发版

版本号遵循 SemVer（`主.次.修订`），**唯一来源是 `package.json` 的 `version`**：渲染层经 IPC `app:getVersion` 读取，GameBanana 的 User-Agent 也从它派生。不要在代码、文案或 UI 里另写版本字符串——曾出现过顶栏显示 Electron 自身版本（`v44.5.1`）而非应用版本的事故。当前处于 `0.x` 阶段。

每次发版前先判断进位位置，并在发版提交正文写明理由：

| 位 | 触发条件 |
|---|---|
| 修订位 `0.1.x` | 只修 bug、修文案或样式瑕疵，不新增功能、不改交互 |
| 次位 `0.x.0` | 新增功能、调整交互或界面、性能优化、依赖大版本升级 |
| 主位 `x.0.0` | `1.0.0` 是首个稳定版；此后只有破坏性变更（配置 JSON 结构、`%APPDATA%\QAQManager` 目录布局、IPC 契约）才进位 |

- `0.x` 阶段的次位允许包含不兼容改动，但必须在提交正文点明，方便回退时判断影响面
- 一个发版周期内可以有多条功能提交，但**只在发版时改一次版本号**：不要每加一个功能就 bump，也不要攒着等下次一起改
- 发版流程：`git status` 干净 → 四项检查（`npm test` / `typecheck` / `lint` / `build`）通过 → `npm version <版本> --no-git-tag-version`（同步 `package.json` 与 `package-lock.json`）→ 提交 `chore(release): 版本号改为 x.y.z`，正文列出本版包含的功能提交 → 需要安装包时再 `npm run dist`
- 仓库无 remote、无 git tag，发版不打 tag；接入远端后再补 `v<version>` 标签

## 编码约定

- 注释与 UI 文案用中文；注释只写"为什么"（历史坑、协议约束、平台限制），不写"做了什么"
- 主进程/core 用 class + `public/private` 显式修饰；渲染层用函数组件 + hooks
- core 层日志用 `console.log/warn/error` 并带 `[模块名]` 前缀（如 `[config-store]`、`[LZ Main]`）；无日志框架
- IPC 通道命名统一 `domain:action`（`mods:toggle`、`config:updateApp`、`overlay:setScale`）；主进程用 `ipcMain.handle`，preload 用 `ipcRenderer.invoke` 一一对应
- preload 暴露的每个方法都要在 `src/renderer/types.d.ts` 对应的 `LZApi` 上可用（该文件必须保持无顶层 import/export 的环境声明形式）
- 主界面的可复用控件收在 `src/renderer/components/ui/`；本地文件路径渲染图片一律走 `utils/fileUrl.ts` 的 `toFileUrl`
- 渲染层 IPC 调用同时存在 `window.lz` 与 `window.flairx` 两种写法，两者是同一个对象；新代码倾向 `window.flairx`
- 提交信息用 Conventional Commits + 中文描述（见 `git log`）

## 架构要点与不变量

- 数据流：renderer → preload IPC → `src/main/index.ts` 的 handler → `src/core/*` 引擎 → 文件系统；引擎层把结果同步回两个窗口（主窗 + overlay）的 `game:changed` 事件
- **路径守卫**：`ModEngine` 中所有接受外部路径的文件操作必须先过 `resolveInsideModRoot()` / `sanitizeSegment()`，越界返回 `null`。新增任何以完整路径为参数的 IPC 都必须复用，否则渲染进程可读写删任意磁盘文件
- **配置白名单**：`config:updateApp` / `config:updateGame` 的 patch 经 `APP_CONFIG_KEYS` / `GAME_CONFIG_KEYS` 白名单过滤（`src/main/index.ts`）。新增配置键必须同时加进白名单，否则写入会被静默丢弃
- **启用/停用即目录改名**：磁盘上 `DISABLED_<name>` 前缀表示停用，无前缀表示启用。`toggleMod` 的顺序固定为「先 rename 目标 → 再写 Persist Bridge → 最后按 Option-A 互斥停用同角色其他 Mod」，不可调换，否则会产生半失败状态
- **Mod 名称即目录名**：`scanMods` / `getModDetails` 的 `name` 直接取自文件夹名（剥掉 `DISABLED_` 前缀）。因此「重命名」必然改磁盘目录，`renameMod` 必须原样保留 `DISABLED_` 前缀，否则会意外启用 Mod；首次重命名把原名记进 `mod.json` 的 `originalName`，后续再改**不覆盖**，否则还原点会漂移
- **市场图片与封面彻底分离**：图片统一放 `<modDir>/.lz_images/`，只增不改；封面只由 `mod.json` 的 `coverImage` 指针决定，**不复制任何文件**。历史上 `preview.png` 同时充当「市场首图」和「封面」，改封面等于覆盖原图，踩过两次坑，不要再回到那个设计
- **`.lz_images/` 的命名与排序**：补全时整批重建为 `market_NN.png`，序号严格等于市场顺序；安装阶段写的 `image_*` 会在补全时一并替换。`getMarketPreviews` 必须按「前缀优先级 + 序号」排序，**不能用纯字母序**——`image_02` 会排到 `market_01` 前面，导致缩略图顺序与市场错位
- **补全重建后封面按内容哈希找回**：文件名重排后只有哈希能确定是同一张图；若原封面不在市场返回的图里（旧版 `preview.png`、已下架截图），需单独补写为 `_cover.*` 保留，不能让它随重建消失
- **纹理贴图不得进预览列表**：判据是「文件名命中关键字」**或**「正方形 + 边长 ≥1024 + 边长为 2 的幂」。只用文件名黑名单不够——实际文件常叫 `Normal.jpg` / `Material.jpg` / `Light.jpg`，一个都匹配不上；只用「正方形」也不够，775×775、1291×1291 这类正常截图会被误杀
- **文本读写必须走 `readTextAuto` / `writeTextWithEncoding`**：Mod 的 ini 大量是 GBK 或 UTF-16LE，按 utf8 读会永久乱码。唯一例外：`wuwa-fix-engine.ts` 的 hash 替换必须按原始字节保真读写（latin1 + UTF-16 BOM 处理），**不要**改成编码探测回写，否则会破坏原文件编码
- **修复/重置的备份语义**：`*.qaqm-inibak-<stamp>` 是修复前备份，由 `ini-backup.ts` 列出/回滚（部分失败必须保留备份）；`*.qaqm-persistbak` 是 Persist Bridge 留存的原始 ini 备份，`mod-engine.restorePersistBakFiles` 还原即「重置 ini」。`fix:*` 与 `iniBackup:restore` 必须走主进程侧单飞互斥，防止并发互踩备份
- **切换游戏必须调用 `applyActiveGame()`**：它负责同步 `modEngine.setModFolderPath`、`modEngine.setPersistBridge(envRoot)`、`conflictDetector.setModFolderPath` 并向两个窗口广播。绕过它会留下指向旧游戏的服务状态
- **Persist Bridge 依赖 envRoot**（Mod 目录的上级 XXMI 运行时目录）；`persistBridgeEnabled` 为 false 或 envRoot 为空时全部持久化逻辑静默跳过
- `buffer` 必须在 `vite.config.main.ts` 的 `external` 中：`iconv-lite` → `safer-buffer` 会 `require('buffer')`，不 external 会生成坏 shim 导致启动崩溃
- Overlay 与主界面共用同一个 renderer bundle，靠 URL 含 `overlay` 分流（`main.tsx`）；主窗和 overlay 各有一份 React 树，状态不共享，只能靠 IPC 事件同步
- 角色名以国服官方名为准，任何来源（GameBanana 分类、压缩包名、标题）的角色名都要经 `normalizeCharacterName` 归一，禁止直接落盘成目录名
- 安全基线：主窗 `sandbox: true`、`setWindowOpenHandler` 拒绝所有新窗口、`will-navigate` 只放行 dev server 或 `file://`、CSP 写在 `index.html`

## 已知问题与陷阱

- **TypeScript 7.0.2（原生版）与 typescript-eslint 不兼容**，`eslint.config.mjs` 因此退化为 `@babel/eslint-parser` 的纯语法 lint，没有类型相关规则（详见该文件顶部注释）。`react-hooks/*` 是当前唯一有实质价值的静态检查
- `npm run lint` 目前退出码为 0，但有 **23 条 warning**（`no-useless-escape`、`preserve-caught-error`、`no-useless-assignment`、`react-hooks/exhaustive-deps`），属已知的历史代码风格问题，被刻意降级为 warn
- 三个 vite 配置都是 `.ts` 且 `package.json` 为 `type: "commonjs"`，每次构建都会打印 `configLoader: 'native'` 的 ESM/CommonJS 警告，可用 `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` 抑制
- `src/core/characters-data.ts`（2422 行）与 `src/core/mod-translator-dict.ts` 是生成式大文件，手工编辑易冲突。**生成方式待确认**：未找到生成脚本，也未找到读取源，无法判断改数据应该改哪个文件
- `resources/games/*/character-config.json` 只有各目录的 README 提及，`src/` 下 grep 不到任何读取处（运行时用 `characters-data.ts` 的内嵌数据），已确认只是离线参考。改角色数据只需动 `characters-data.ts`
- 多处保留了指向原版 `QAQManagerV4` 的硬编码兜底路径（`gamebanana-service.ts` 的 7za/UnRAR 候选列表、`mod-engine.ts` 的 images 候选列表），仅作兼容兜底，**新功能不要沿用这种写法**
- 默认游戏路径硬编码为 `F:\XXMI\...`（`config-store.ts` 的 `getDefaultGames`），在别的机器上首次启动会得到一批无效路径
- `mod-engine.ts` 会循环剥离 `DISABLED_DISABLED_` 双前缀，说明历史上出现过 rename 半失败；改 `toggleMod` 时注意保持这个容错
- 本机 `node`/`npm` 不在默认 PATH 上，实际位于 `F:\Hermes_data\node\runtime`（另有 `~/bin` 下的 `node.cmd`/`npm.cmd` shim）；纯 bash 环境直接跑 `npm` 会 command not found
- `debug.log`（Electron ICU 报错）已被 `.gitignore` 的 `*.log` 覆盖并清理，仓库当前无日志残留
- 启动入口只有 `electron.exe`（`npm start` 或直接双击 `node_modules/electron/dist/electron.exe`）；仓库原有的 `启动FlairX.bat` / `启动LZ Manager.bat` 已按维护者要求删除
- **main 进程用到的 node 内置子路径必须同时写进 `vite.config.main.ts` 的 `rollupOptions.external`**：`stream/promises` 曾漏配，被 rolldown 替换成返回 `{}` 的 `__vite-browser-external` shim，GameBanana 下载因此在打包产物里恒抛 `pipeline is not a function`。自查方法：`dist/main/index.cjs` 里出现 `require___vite_browser_external()` 调用点即漏配

## 工作流约定

- 改代码前先读对应模块本身及其调用方（`src/main/index.ts` 的 IPC 注册处是几乎所有 core 能力的入口地图）
- 修 bug 先补一个能在 `tests/` 复现的 vitest 用例；测试目录不在 ESLint 与 `tsc` 的覆盖范围内（`tsconfig.json` 只 `include: ["src"]`），需自行保证类型正确
- 提交前跑 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`；四者当前均通过（lint 有上述 23 条 warning）
- 由谁执行改动（当前会话直接做，或交给 agy 等外部执行方）由维护者当次决定，文档不做统一规定。无论谁执行，其验证自述均不作数，提交前必须由审查方独立复跑上述四条命令
- 开工前先确认工作区状态，避免改动归属混杂难以审查
- 一次只做一件事，改动保持小范围
- **一个功能一次提交**：每完成一个功能就立即提交，不要攒到最后一次性提交。攒着会让多个功能的改动在同一批文件里交织（同一文件的 hunk 分属不同功能、`types.ts` 里两批类型混在一起），事后无法拆成独立提交——强行拆会产出编译不过的中间提交，`git bisect` 与单独 checkout 都会失败。提交信息用 Conventional Commits + 中文描述，正文按功能分条说明改了什么
- 不要修改 `dist/`（构建产物，已在 `.gitignore`）与 `resources/binaries/*.exe`（由同目录 `.cs` 源码编译产出）；不要提交密钥或 `.env.local`
- 仓库当前无 CI 配置（无 `.github/workflows/`、无 `.gitlab-ci.yml`），所有检查都在本地手动执行
- 仓库无 remote，`master` 为唯一分支，历史只在本地；动手前先 `git status` 确认，不要覆盖未提交的改动
- 项目说明统一维护在 `AGENTS.md`；`CLAUDE.md` 只有一行 `@AGENTS.md` 转发，**不要在 `CLAUDE.md` 正文写项目说明**——一旦它存在且不含该 import，Claude Code 会改为只读 `CLAUDE.md` 并静默忽略 `AGENTS.md`
