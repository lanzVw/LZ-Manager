# 绝区零角色时装资源

本目录用于 QAQManager 的角色外观分区，不会改变实际 Mod 的磁盘层级。

- `catalog.json`：角色、时装稳定 ID、中英文名、别名、来源与图片校验信息。
- `images/<角色>/`：离线使用的透明背景 WebP 立绘。

更新流程见 [`docs/角色头像与外观立绘同步指南.md`](../../../docs/角色头像与外观立绘同步指南.md)，检查新增时装：

```bash
python scripts/sync_character_assets.py --skins
```

当前目录收录绝区零 Wiki「Paid / Event Reward / Commission Reward Outfits」分类中的非原皮时装。Wiki 文本遵循其页面标注的 CC-BY-SA；角色美术素材版权归游戏及其权利方所有，仅作为管理器内的离线分类封面使用。每个条目的来源页和原图链接均保存在 `catalog.json`。
