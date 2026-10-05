# 鸣潮角色服饰资源

本目录用于 QAQManager 的角色外观分区，不会改变实际 Mod 的磁盘层级。

- `catalog.json`：角色、服饰稳定 ID、中英文名、版本、来源与图片校验信息。
- `images/<角色>/`：离线使用的优化 WebP 封面。
- 更新命令：`python scripts/update_wuwa_character_skins.py`

当前目录收录鸣潮 Wiki 的 `Signature Outfits`、`Deluxe Outfits` 和 `Premium Outfits` 分类中所有非默认官方服饰。漂泊者的同一套服饰会按男、女主分别保存立绘和分区条目，以匹配管理器中的两个角色目录。

Wiki 文本遵循其页面标注的 CC-BY-SA；角色美术素材版权归游戏及其权利方所有，仅作为管理器内的离线分类封面使用。每个条目的社区 Wiki 页面、官方展示文章（若页面提供）和原图链接均保存在 `catalog.json`。
