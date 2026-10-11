# 鸣潮内嵌修复规则

这里存放 QAQManager 的鸣潮声明式修复资源。管理器只下载并执行经过结构校验的 JSON 规则，不下载或执行远程 JavaScript、Python 或可执行文件。

## 文件

- `rules.json`：随安装包提供的离线规则，也是联网更新的发布源。
- `manual-rules.json`：手工维护的本地核验规则，目前包含绯雪 3.4 到 3.5 的 25 组 hash；这些映射已与 fork 逐条比对并在生成时去重。
- `extraction-report.json`：原项目基线、fork 活动快照、Woju 安全增量、差异、排除项、提交与 SHA256 审计记录。
- `standalone/QAQ_Wuwa_Hiyuki_3.5_FixTool.exe`：绯雪 3.4 到 3.5 独立修复器，可拖入文件夹，也可被旧版管理器作为自定义修复器调用。
- `../鸣潮/Wuwa_Mod_Fixer_v3.5.1.exe`：管理器“打开独立修复器”使用的完整工具；文件大小 `7,208,448` 字节，SHA256 为 `033D70DE975D4D0471BC70DD2E96CED4E3BE357303DA90ED6526A40145BAB832`。

## 联网更新

管理器会在用户目录缓存、缓存备份与安装包内规则中选择 `revision` 最高的已校验版本，同版本优先使用缓存；联网检查失败时自动保留当前可用规则。当前规则为 `revision 5` / 工具版本 `2.2.0`。客户端每次执行内置修复前会自动检查，30 分钟内复用最近一次结果；界面的“更新规则”按钮会强制立即检查。

发布普通 hash 更新不需要重新打包管理器：

1. 更新生成器输入或 `manual-rules.json`，同步递增 `release.revision`，并更新工具版本与时间。
2. 执行 `node scripts/update_wuwa_fix_rules.mjs` 生成 `rules.json` 和审计报告。
3. 执行 `node scripts/update_wuwa_fix_rules.mjs --check` 与 `node scripts/test_wuwa_fixer.mjs`。
4. 将生成结果提交并推送到 `QAQmod-Client` 的 `main` 分支。客户端随后会从下方两个地址读取更高 `revision` 的规则。

只有增加引擎尚不支持的新操作类型时，才需要发布新版管理器；普通 8/16 位 hash 赋值替换只更新 JSON 即可。

默认更新源：

- `https://raw.githubusercontent.com/peterdua/QAQmod-Client/main/resources/fix/wuwa/rules.json`
- `https://cdn.jsdelivr.net/gh/peterdua/QAQmod-Client@main/resources/fix/wuwa/rules.json`

规则引擎当前只允许声明式修改 `.ini` 赋值，内置规则仅使用 `hash` 键的完整 8 位或 16 位十六进制值。新增顶点组、缓冲区或纹理文件变换等新操作类型时，仍需更新管理器引擎。

当前规则包以 fork `3.5.1` 配置作为活动 hash 快照，并保留原项目 `3.4.1` / 配置 `3.4.4` 作为比较基线：

- fork 共提取 1054 个无歧义替换组、1468 条唯一来源 hash，其中 1465 条为 8 位、3 条为 16 位 UID hash。
- 在此基础上，Woju Assets `3.5.0.3`（程序 `3.5.0.1`）的 `hashes.json` 经过固定 SHA256 `e55c6f08559aab225484bad1e6a91ae284812b42d671b5a741b7c518ddff1412` 校验后，新增 366 条与现有规则来源和目标都不相交、且不覆盖 fork 已知冲突来源的 8 位 hash；它们覆盖 Lucy、Luuk、Phrolova Hecate、Rebecca、Lucilla、Qiuyuan、Chisa、男女漂泊者学院形态、Yangyang 及多种 3.5 武器/特殊形态等。
- 最终布局为 1413 条普通全局映射、10 条 Aemeath 严格映射、20 条跨 profile 条件映射、25 条绯雪独立核验映射和 366 条 Woju 安全增量，共 1834 条且来源不重复。
- 相对原项目基线，560 条来源目标不变、281 条更新到 3.5 目标、627 条新增；11 条基线来源在 fork 中变为角色上下文冲突，14 条 Cantarella 旧状态映射被 fork 删除，不继续输出过期目标。
- 三个 `strict_main_match` Aemeath 配件 profile 的 10 条映射按各自主 hash 条件启用，不会作为全局规则误改其他 Mod。
- fork 的完整当前 hash 索引中有 20 个 hash 同时被另一 profile 当作旧来源；其中还包括 7 个没有历史 `replace` 的 Denia 解放形态当前纹理。它们不再全局执行，而是拆成 CiacconaUltimate、Denia、Zani Upper、Zani Lower、Mornye 五组条件规则；只有原始 INI 出现该 profile 独有的主 hash 或旧纹理 hash 时才启用。普通 Ciaccona、Denia 解放形态、Zani Interface 及其他角色的当前 hash 不会在重复修复时被继续推进。
- 用户提供的绯雪 v3.5 25 条映射（含刘海和后发光照贴图）全部与 fork 一致；规则包保留其独立来源标记，但每个来源 hash 只声明一次。

对于多历史来源组，引擎会基于原始 INI 倒序选择实际存在的优先来源，只替换该来源的全部出现；不会把同组所有历史版本同时改写。

fork 中有 13 个来源 hash 在不同角色 profile 下对应不同目标。当前规则包用固定清单核验后明确排除，不会静默选择任一目标；出现这些 hash 时保持原文，需使用独立修复器或等待后续增加可拒绝歧义的角色作用域引擎。

这里的 13 条 fork“多目标来源排除”、Woju 的 41 个多目标来源及其 30 个歧义可达来源、22 个循环可达来源、11 个与 fork 冲突清单重叠的来源，以及 105 个与现有规则来源/目标边界相交的候选，都是有意不执行的安全边界。生成器固定这些统计和 Woju 安全增量 SHA256 `a668ca5c0c26e78e3fb7bf6606dea3ddf41c19b19a09ebe350ad096c06f4a94c`，并对全部 1834 条声明映射执行二次运行幂等测试。`revision 5` 继续固定 8 个条件规则、30 条条件映射及触发条件的 SHA256 布局指纹；联网 JSON 若篡改这些元数据会被拒绝。

这不等价于完整修复核心。管理器保留 `resources/fix/鸣潮/Wuwa_Mod_Fixer_v3.5.1.exe` 作为“独立修复器”可选模式，避免复杂修复能力被移除。

## 上游说明

参考项目 [Moonholder/Wuwa_Mod_Fixer](https://github.com/Moonholder/Wuwa_Mod_Fixer) 及 [newaccforananta/Wuwa_Mod_Fixer_Fork](https://github.com/newaccforananta/Wuwa_Mod_Fixer_Fork) 使用 GPLv3；[Woju25/WuWa_MOD_WojuFixer](https://github.com/Woju25/WuWa_MOD_WojuFixer) 仓库使用 AGPLv3。这里必须严格区分版本：原项目审计基线的程序版本为 `3.4.1`、配置版本为 `3.4.4`；活动 fork 的程序与配置版本均为 `3.5.1`，固定提交为 `8c4e40674a225abd82a69800e590b532e8c99acc`；Woju 最新规则资产为 `v3.5.0.3`、程序包内文件版本为 `v3.5.0.1`，固定仓库提交为 `bd998ad5aa4281f2a893931cc3abea9ea49134d5`；绯雪规则的目标游戏版本为 `3.5`。

本目录没有复制上述项目的程序源码或 UI，只独立提取并重新组织可验证的 old-hash 到 current-hash 事实对照。Woju 的 `StableHashes.json`、`HighLodHashes.json` 以及数字赋值规则、LOD/状态派生、`ensure_lines` 段内插行、顶点组重映射、stride、checksum、`.buf`/DDS 修改、RabbitFX 与特殊角色逻辑均未导入；这些仍需独立修复器或后续新增受控引擎能力。

联网规则加载时会重新校验声明映射总数与 combined SHA256；元数据与实际规则不一致时拒绝缓存并继续使用上一份有效规则。

## 重新生成

```powershell
node scripts/update_wuwa_fix_rules.mjs --input G:\working\QAQManagerV4\tmp\Wuwa_Mod_Fixer_extract\Wuwa_Mod_Fixer-main\config.json --fork-input G:\working\QAQManagerV4\tmp\Wuwa_Mod_Fixer_Fork_config_audit\config.json --woju-input "G:\working\QAQManagerV4\QAQmod-Client\tools\FixTool\wuwa\wojufixer.3.5.3\Assets v3.5.0.3_win-x64\hashes.json"
node scripts/update_wuwa_fix_rules.mjs --input G:\working\QAQManagerV4\tmp\Wuwa_Mod_Fixer_extract\Wuwa_Mod_Fixer-main\config.json --fork-input G:\working\QAQManagerV4\tmp\Wuwa_Mod_Fixer_Fork_config_audit\config.json --woju-input "G:\working\QAQManagerV4\QAQmod-Client\tools\FixTool\wuwa\wojufixer.3.5.3\Assets v3.5.0.3_win-x64\hashes.json" --check
node scripts/test_wuwa_fixer.mjs
```
