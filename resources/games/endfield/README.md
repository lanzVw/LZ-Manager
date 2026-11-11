# endfield

明日方舟终末地初始资源目录。

当前已补充：
- `character-config.json`: 默认角色分类、手工别名映射、角色中英名字映射总配置
- `category-images/README.md`: 角色分类图占位目录说明

本次名字映射整理主要参考：
- 明日方舟终末地国服官网干员页：`https://endfield.hypergryph.com/operator`
- 明日方舟终末地英文官网干员页：`https://endfield.gryphline.com/en-us/operator`
- 明日方舟终末地日文官网干员页：`https://endfield.gryphline.com/ja-jp/operator`
- 明日方舟终末地 BWIKI 干员图鉴：`https://wiki.biligame.com/zmd/%E5%B9%B2%E5%91%98%E5%9B%BE%E9%89%B4`
- Prydwen Arknights: Endfield Characters：`https://www.prydwen.gg/arknights-endfield/characters/`

说明：
- 当前映射按国服官网干员页整理，共 34 名公开干员；男主/女主按两套目录分别维护
- 中文名以国服官网简体中文写法为准（BWIKI 更新可能滞后），英文名以官网 `codename` 为准
- 诀与梨诺分别映射为 `Arcane / オクギ`、`Liino / リーノ`
- `character-config.json` 中：`defaultCharacters` 维护初始角色分类，`manualMappings` 维护特殊别名，`characterNameMap.pairs` 维护中英名字映射
- `管理员` 在官网数据中存在男女两套条目，但中英文显示名一致，这里只保留一条公共映射
- 本目录的 `character-config.json` 仅作离线参考，运行时角色数据以 `src/core/characters-data.ts` 为准

角色头像与外观立绘的同步流程见 [`docs/角色头像与外观立绘同步指南.md`](../../../docs/角色头像与外观立绘同步指南.md)。
