# zzz

绝区零初始资源目录。

当前已补充：
- `character-config.json`: 默认角色分类、手工别名映射、角色中英名字映射总配置
- `category-images/README.md`: 角色分类图占位目录说明

本次名字映射整理主要参考：
- 绝区零 BWIKI 角色图鉴：`https://wiki.biligame.com/zzz/%E8%A7%92%E8%89%B2%E5%9B%BE%E9%89%B4`
- 绝区零 BWIKI 各角色 raw 页面中的 `英文名称` 字段
- Prydwen ZZZ Agents：`https://www.prydwen.gg/zenless/characters/`

说明：
- 当前映射按 BWIKI 角色图鉴与管理器实际支持角色整理
- `Cissia` 正式展示为 `希希芙`，历史错名 `茜茜娅` 保留为兼容别名；`Nangong Yu` 使用 `南宫羽`，兼容 `南宫玉`
- `character-config.json` 中：`defaultCharacters` 维护初始角色分类，`manualMappings` 维护特殊别名，`characterNameMap.pairs` 维护中英名字映射
- 本文件中的英文名优先采用 BWIKI 角色条目里记录的官方英文名称
- 本目录的 `character-config.json` 仅作离线参考，运行时角色数据以 `src/core/characters-data.ts` 为准

角色头像与外观立绘的同步流程见 [`docs/角色头像与外观立绘同步指南.md`](../../../docs/角色头像与外观立绘同步指南.md)。
