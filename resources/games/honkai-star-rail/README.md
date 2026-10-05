# honkai-star-rail

Honkai: Star Rail bundled resource directory.

Current contents:
- `character-config.json`: default character folders, manual alias mappings, and the Chinese/English character-name map.
- `resources/images/honkai-star-rail/<display-name>/_cover.*`: character covers synced from HoYoLAB HoYoWiki, with common category covers reused from Endfield.

Notes:
- Character data is synced from the HoYoLAB HoYoWiki English and Chinese aggregate character pages.
- Chinese display folders use hyphen separators instead of middle dots. Special display names: `阮梅`, `刃-千治`.
- Trailblazer path variants are folded into the manager folders `女主` and `男主`; generic Trailblazer aliases map to `女主`, while Caelus/male-specific aliases map to `男主`.
- Legacy JASM `jasmName` values are retained only for compatibility with existing local English folders or old cover file stems.
- HSR keeps the `光锥` default category, but does not create a `武器` display category; NPC, 大世界, UI, and 功能 use Endfield default covers.
