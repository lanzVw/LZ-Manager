import fs from 'fs'
import path from 'path'
import { translateModDetails } from './translate-service'
import {
  MIGOTO_DICTIONARY,
  splitWords,
  translateTerm,
  translateValueLabel
} from './mod-translator-dict'

export { MIGOTO_DICTIONARY, splitWords, translateTerm, translateValueLabel }

export interface ModTranslationResult {
  variableAliases: Record<string, string>
  hotkeyTranslations: Record<string, string>
  valueLabels: Record<string, Record<string, string>>
  notes?: string
}

/**
 * 自动分析并翻译指定 Mod 目录的所有配置与快捷键说明
 * 结果安全持久化到该 Mod 根目录下的 mod.json 中
 */
export async function autoTranslateModConfig(
  modFullPath: string,
  options: { forceCloud?: boolean } = {}
): Promise<ModTranslationResult> {
  const result: ModTranslationResult = {
    variableAliases: {},
    hotkeyTranslations: {},
    valueLabels: {}
  }

  if (!fs.existsSync(modFullPath)) {
    return result
  }

  // 1. 读取既有的 mod.json（保护已有用户自定义别名）
  const metaPath = path.join(modFullPath, 'mod.json')
  let existingMeta: any = {}
  if (fs.existsSync(metaPath)) {
    try {
      existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (_) {}
  }

  const userAliases: Record<string, string> = existingMeta.variableAliases || {}
  const userHotkeyTrans: Record<string, string> = existingMeta.hotkeyTranslations || {}
  const userValueLabels: Record<string, Record<string, string>> = existingMeta.valueLabels || {}

  // 2. 递归查找所有 .ini 文件
  const findInis = (dir: string): string[] => {
    const list: string[] = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) list.push(...findInis(full))
        else if (e.isFile() && e.name.toLowerCase().endsWith('.ini')) list.push(full)
      }
    } catch (_) {}
    return list
  }

  const iniFiles = findInis(modFullPath)
  if (iniFiles.length === 0) {
    return {
      variableAliases: userAliases,
      hotkeyTranslations: userHotkeyTrans,
      valueLabels: userValueLabels
    }
  }

  const extractedCommentsToTranslate: { key: string; text: string }[] = []

  // 3. 扫描每个 INI 文件中的按键与变量
  for (const iniFile of iniFiles) {
    try {
      const content = fs.readFileSync(iniFile, 'utf8')
      const lines = content.split(/\r?\n/)

      let currentSection = ''
      let currentDesc = ''
      let currentVar = ''
      let currentValueLabels: Record<string, string> = {}
      // 最近一次标签注释行的行号（用于窗口归属判断），-1 表示当前没有待归属的标签
      let lastLabelCommentLine = -1

      for (const [lineIdx, line] of lines.entries()) {
        const trimmed = line.trim()

        // 匹配 Section
        const secMatch = trimmed.match(/^\[([^\]]+)\]/)
        if (secMatch) {
          if (currentSection && currentDesc && !userHotkeyTrans[currentSection]) {
            if (/[\u4e00-\u9fa5]/.test(currentDesc)) {
              userHotkeyTrans[currentSection] = currentDesc
            } else if (currentDesc.length > 20 && options.forceCloud) {
              extractedCommentsToTranslate.push({ key: currentSection, text: currentDesc })
            } else {
              userHotkeyTrans[currentSection] = translateTerm(currentDesc)
            }
          }
          currentSection = secMatch[1]
          currentDesc = ''
          currentVar = ''
          currentValueLabels = {}
          lastLabelCommentLine = -1
          continue
        }

        // 注释行
        if (trimmed.startsWith(';') || trimmed.startsWith('//')) {
          const comment = trimmed.replace(/^[;//\s]+/, '').trim()
          const labelMatch = comment.match(/^([0-9]+)\s*[:=\-\s]\s*(.+)$/)
          if (labelMatch) {
            const rawLabel = labelMatch[2].trim()
            currentValueLabels[labelMatch[1]] = translateValueLabel(rawLabel)
            lastLabelCommentLine = lineIdx
          } else if (comment && !comment.startsWith('---') && !currentDesc) {
            currentDesc = comment
          }
          continue
        }

        // 变量声明或循环
        const varMatch = trimmed.match(/^\$([a-zA-Z0-9_\\.]+)\s*=\s*(.+)$/)
        if (varMatch) {
          const fullVar = varMatch[1]
          const normVar = fullVar.split('\\').pop() || fullVar
          currentVar = normVar
          if (!userAliases[normVar]) {
            userAliases[normVar] = translateTerm(normVar)
          }
          // 窗口归属：仅当标签注释行与本变量声明行相邻（间隔 ≤2 行）时才并入，紧邻优先；
          // 无论是否并入都立即清空待归属标签，避免同一批标签泄漏到后续每个 $var
          const withinLabelWindow = lastLabelCommentLine >= 0 && lineIdx - lastLabelCommentLine <= 2
          if (Object.keys(currentValueLabels).length > 0 && withinLabelWindow) {
            userValueLabels[normVar] = {
              ...(userValueLabels[normVar] || {}),
              ...currentValueLabels
            }
          }
          currentValueLabels = {}
          lastLabelCommentLine = -1
        }

        // global persist 变量声明
        const persistMatch = trimmed.match(/^\s*global\s+persist\s+\$([A-Za-z0-9_]+)/i)
        if (persistMatch) {
          const pVar = persistMatch[1]
          if (!userAliases[pVar]) {
            userAliases[pVar] = translateTerm(pVar)
          }
        }
      }

      // 收尾最后一个 Section
      if (currentSection && currentDesc && !userHotkeyTrans[currentSection]) {
        if (/[\u4e00-\u9fa5]/.test(currentDesc)) {
          userHotkeyTrans[currentSection] = currentDesc
        } else {
          userHotkeyTrans[currentSection] = translateTerm(currentDesc)
        }
      }
    } catch (err) {
      console.warn(`Error scanning ini for translation: ${iniFile}`, err)
    }
  }

  // 4. 对长句复杂注释（若开启云端翻译），通过 translateModDetails 进行批量翻译
  if (options.forceCloud && extractedCommentsToTranslate.length > 0) {
    for (const item of extractedCommentsToTranslate) {
      try {
        const trans = await translateModDetails({ text: item.text })
        if (trans.translatedText && trans.translatedText !== item.text) {
          userHotkeyTrans[item.key] = trans.translatedText
        }
      } catch (_) {}
    }
  }

  // 5. 保存回写 mod.json
  const updatedMeta = {
    ...existingMeta,
    variableAliases: userAliases,
    hotkeyTranslations: userHotkeyTrans,
    valueLabels: userValueLabels,
    lastConfigTranslatedAt: new Date().toISOString()
  }

  try {
    fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save mod.json translation:', err)
  }

  return {
    variableAliases: userAliases,
    hotkeyTranslations: userHotkeyTrans,
    valueLabels: userValueLabels
  }
}

/**
 * 用户手动设置/重命名变量的中文别名
 */
export function saveCustomVariableAlias(
  modFullPath: string,
  varName: string,
  customAlias: string
): boolean {
  if (!fs.existsSync(modFullPath)) return false
  const metaPath = path.join(modFullPath, 'mod.json')
  let existingMeta: any = {}
  if (fs.existsSync(metaPath)) {
    try {
      existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch (_) {}
  }

  const aliases = existingMeta.variableAliases || {}
  aliases[varName] = customAlias.trim()

  existingMeta.variableAliases = aliases
  existingMeta.updatedAt = new Date().toISOString()

  try {
    fs.writeFileSync(metaPath, JSON.stringify(existingMeta, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('Failed to save custom variable alias:', err)
    return false
  }
}
