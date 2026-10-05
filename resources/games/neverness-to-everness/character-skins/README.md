# 异环角色时装资源

本目录为 QAQManager 的角色外观分区提供离线目录，不改变 Mod 在磁盘上的原有层级。

- `catalog.json`：角色、时装稳定 ID、官方中英文名、获取来源、数据版本和图片校验信息。
- `images/<角色>/`：离线使用的优化 WebP 角色时装封面。
- 更新资源：`python scripts/update_neverness_character_skins.py`
- 离线校验：`python scripts/update_neverness_character_skins.py --validate-only`

## 收录口径

数据截止到 **2026-07-14**，主来源为 [Waifus-Grace/NTE_Assets](https://github.com/Waifus-Grace/NTE_Assets) 从当前客户端导出的 **Version 1.2.7 Global** 数据，目录固定到提交 `e9752e5963103529f0d683fd0aed4752b7dfad78`，避免远端后续更新改变已提交结果。

脚本联合核验以下正式客户端数据：

- `DT_AppearanceData.json`：时装 ID、官方中英文名、角色 ID、展示状态、获取来源、外观 Mesh 和 UI 图片路径；
- `DT_DefaultAppearanceData.json`：默认外观 ID，用于确保原皮肤不会进入时装目录；
- `DT_Character.json`：角色 ID 与官方中英文角色名；
- `DT_TextTable.json` 与 `ST_Appearance.json`：文本表注册信息及官方中文时装名交叉校验。

只有同时满足以下条件的记录才会收录：类型为角色 `Fashion`、`IsDefault=false`、`IsCharacterShow=true`、角色 ID 可映射到管理器分类，并且存在实际 `PlayerAppearanceAsset`。当前结果为 **50 条时装记录、41 套独立时装设计、14 个角色分类、50 张 WebP 封面**。其中「零」的 9 套同名外观分别存在男、女体型资源，因此会生成 18 条管理器记录。

这里的“已实装”表示当前客户端已包含完整外观 Mesh、UI Actor、图标与立绘资源，不等同于每条记录都已经通过公告确认公开上线或此刻可获取。目录会优先保存数据表中的获取文本；没有本地化来源时保留原始 `SourceID`，由后续版本更新继续核实。

## 明确排除

- 默认角色外观、滑翔翼、载具以及其他非角色完整外观；
- `Fashion_1075_1`（夏日梦 / Summer Dream）和 `Fashion_1075_nighty`（星月夜 / Starlit Night）：当前数据只有名称和 UI 图片，没有实际角色外观 Mesh，不能确认是完整可替换时装；
- NTEGame 社区页中的 `Fashion_1004_5`（Lacrimosa Skin 6）：当前正式 `DT_AppearanceData` 中不存在该 ID；
- 染色方案不单独创建皮肤分区，它们属于对应完整时装的可选配色。

`Fashion_1075_rpg_level3`（织梦者 / Dreamweaver）已包含实际外观 Mesh 和 UI 资源，因此作为已实装时装收录；其获取来源字段在当前数据表中为空，目录会如实标记为“当前数据表未标注”。

伊洛伊的 `Fashion_1075_rpg_level1`、`Fashion_1075_rpg_level2` 和 `Fashion_1075_rpg_level3` 在当前客户端表中分别指向不同的实际外观 Mesh，但 `PortraitImg` 都指向同一张 `YH_UI_shizhuang_big_yiluoyi` 角色立绘。目录保留客户端给出的原始图片映射并记录各自 Mesh 路径，不虚构不存在的差分立绘；管理器仍可依靠中英文时装名区分三个分区。

部分记录的 `SourceID` 没有配套本地化文本。此时目录直接显示“数据表来源 ID”，不会根据内部代号猜测活动名称。

社区 [NTEGame 时装数据库](https://www.ntegame.com/skins/) 和 [Neverness.gg 首发时装指南](https://neverness.gg/nte-character-outfits-glider-skins/) 仅作为辅助核对来源，不覆盖正式客户端数据。游戏文本和图片版权归 Hotta Studio 及相应权利方所有，仅作为管理器内的离线分类封面使用。每条记录的固定提交原图链接、原始尺寸、字节数和 SHA-256 均保存在 `catalog.json`。
