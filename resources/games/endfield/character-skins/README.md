# 明日方舟：终末地角色外观资源

本目录为 QAQManager 的角色外观分区提供离线目录，不改变 Mod 在磁盘上的原有层级。

- `catalog.json`：当前已核实的非默认完整角色外观目录。
- 更新并复核来源：`python scripts/update_endfield_character_skins.py`
- 仅复核在线来源：`python scripts/update_endfield_character_skins.py --source-check-only`
- 离线校验：`python scripts/update_endfield_character_skins.py --validate-only`

## 当前状态

截至 **2026-07-14**，未从可靠来源中找到已经上线、可由用户选择并替换完整角色外观的非默认角色皮肤，因此目录合法为空：`outfitCount`、`characterCount` 均为 `0`，且不创建占位图片。

核查来源与结果：

- [国服官网干员页](https://endfield.hypergryph.com/operator)仅提供当前干员资料，页面没有角色皮肤、时装、外观或衣柜内容与入口。
- [Endfield Talos Wiki 的 Operator 页面](https://endfield.wiki.gg/wiki/Operator)记录的满潜外观变化是装备发光效果，不是可单独选择的完整角色服装。
- 对 Endfield Talos Wiki 的分类和标题执行了 `Skin`、`Outfit`、`Costume`、`Appearance`、`Fashion`、`Wardrobe` 等定向检索，没有发现角色皮肤目录或条目。唯一命中标题的 `"Landbreaker" Outfit in the Trash Can` 是描述烧焦衣物的档案物品，不是干员外观。

## 收录口径

目录只收录已经上线、可由玩家主动选择、会替换完整可玩角色外观的非默认服装。以下内容不创建角色皮肤分区：

- 角色默认模型、立绘和剧情演出差分；
- 满潜后装备的发光效果；
- 武器、装备、头像、名片及其他个人资料装饰；
- NPC 外观、敌人外观或仅存在于未发布数据中的内容。

更新脚本会先重新检查官网入口、Wiki 分类和定向搜索。若发现任何未经人工确认的新候选内容，脚本会拒绝覆写空目录，避免把档案物品、文本中的普通衣物描述或未发布内容误报为角色皮肤。

Endfield Talos Wiki 文本采用 CC BY-SA 4.0；游戏素材版权归游戏及相应权利方所有。本目录当前不包含游戏图片。
