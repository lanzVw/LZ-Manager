# 崩坏：星穹铁道角色服装资源

本目录为 QAQManager 的角色外观分区提供离线目录，不改变 Mod 在磁盘上的原有层级。

- `catalog.json`：角色、服装稳定 ID、中英文名、别名、版本、来源和图片校验信息。
- `images/<角色>/`：离线使用的 WebP 角色服装封面。
- 更新资源：`python scripts/update_hsr_character_skins.py`
- 离线校验：`python scripts/update_hsr_character_skins.py --validate-only`

## 收录口径

数据截止到 **2026-07-14（[Version 4.3](https://honkai-star-rail.fandom.com/wiki/Version/4.3)）**，来源为 Honkai: Star Rail Wiki 的 [Outfits](https://honkai-star-rail.fandom.com/wiki/Outfits)、`Alternate Outfits` 和 `Outfit Trailblaze Fashion` 条目。

目录只收录已经上线、能够替换完整角色外观的非默认服装：4 款 `Alternate` 服装，以及开拓者完整套装“龙马精神 / Vim and Vigor”。由于管理器中的男主与女主是两个独立角色，“龙马精神”分别生成男主、女主两个分区，因此目录共有 5 款官方服装设计、6 条角色服装记录。

以下内容不作为独立角色皮肤分区：

- 可与完整服装组合使用的开拓者头饰和背饰；
- `Stellar Couture` 武器外观；
- 开拓者默认套装；
- 截止日期仍未上线的 [Version 4.4](https://honkai-star-rail.fandom.com/wiki/Version/4.4) 内容（该版本发布日期为 2026-07-15）。

Wiki 文本遵循其页面标注的 CC-BY-SA；游戏图片版权归游戏及相应权利方所有，仅作为管理器内的离线分类封面使用。每条记录的来源页面、原图链接、尺寸、字节数和 SHA-256 均保存在 `catalog.json`。
