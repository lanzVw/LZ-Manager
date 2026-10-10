import React, { useState, useEffect, useMemo } from 'react'
import { FolderInput, Search, X, Check, Plus, User, AlertCircle } from 'lucide-react'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { useToast } from './ui/Toast'
import { toFileUrl } from '../utils/fileUrl'

interface MoveModModalProps {
  isOpen: boolean
  onClose: () => void
  modName: string
  modFullPath: string
  currentCharacter: string
  onSuccess?: (newPath: string, targetCharacter: string) => void
  onToast?: (msg: string) => void
}

export const MoveModModal: React.FC<MoveModModalProps> = ({
  isOpen,
  onClose,
  modName,
  modFullPath,
  currentCharacter,
  onSuccess,
  onToast
}) => {
  const toastApi = useToast()

  const notify = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    if (onToast) {
      onToast(msg)
    } else if (toastApi) {
      if (type === 'success') toastApi.success(msg)
      else if (type === 'error') toastApi.error(msg)
      else if (type === 'warning') toastApi.warning(msg)
      else toastApi.info(msg)
    }
  }

  const [characters, setCharacters] = useState<string[]>([])
  const [avatars, setAvatars] = useState<Record<string, string>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCharacter, setSelectedCharacter] = useState('')
  const [customCharacter, setCustomCharacter] = useState('')
  const [loading, setLoading] = useState(false)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    setSearchTerm('')
    setSelectedCharacter('')
    setCustomCharacter('')

    const loadData = async () => {
      setLoading(true)
      try {
        const [mods, avatarMap] = await Promise.all([
          window.lz.scanMods(),
          window.lz.getCharacterAvatars()
        ])

        const charSet = new Set<string>()
        if (Array.isArray(mods)) {
          mods.forEach((m: any) => {
            if (m.characterName && m.characterName !== currentCharacter) {
              charSet.add(m.characterName)
            }
          })
        }
        if (avatarMap && typeof avatarMap === 'object') {
          Object.keys(avatarMap).forEach((c) => {
            if (c !== currentCharacter) charSet.add(c)
          })
        }

        setCharacters(Array.from(charSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')))
        setAvatars(avatarMap || {})
      } catch (err) {
        console.error('Failed to load characters for move modal:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [isOpen, currentCharacter])

  const filteredCharacters = useMemo(() => {
    if (!searchTerm.trim()) return characters
    const lower = searchTerm.toLowerCase()
    return characters.filter((c) => c.toLowerCase().includes(lower))
  }, [characters, searchTerm])

  const targetCharName = customCharacter.trim() || selectedCharacter

  const handleConfirmMove = async () => {
    if (!targetCharName) {
      notify('请选择或输入目标角色分类名称', 'warning')
      return
    }

    if (targetCharName.toLowerCase() === currentCharacter.toLowerCase()) {
      notify('目标角色不能与当前所在角色相同', 'warning')
      return
    }

    setMoving(true)
    try {
      const res = await window.lz.moveToCharacter(modFullPath, targetCharName)
      if (res && res.success) {
        notify(`已成功将模组移动到 [${targetCharName}]`, 'success')
        onSuccess?.(res.newPath || '', targetCharName)
        onClose()
      } else {
        notify(`移动失败: ${res?.error || '无法移动模组文件夹'}`, 'error')
      }
    } catch (err: any) {
      notify(`移动异常: ${err.message || '操作失败'}`, 'error')
    } finally {
      setMoving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="移动模组到其他角色"
      maxWidth="max-w-lg"
      className="bg-surface/95 backdrop-blur-2xl border-border/80 shadow-2xl"
    >
      <div className="space-y-4">
        {/* 当前模组信息指示条 */}
        <div className="p-3 rounded-[10px] bg-surface-2/70 border border-border/60 flex items-center justify-between text-xs">
          <div className="min-w-0 mr-3">
            <div className="text-[10px] text-text-muted">待移动模组:</div>
            <div className="font-bold text-text truncate max-w-[280px]" title={modName}>
              {modName}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] text-text-muted">当前所在角色:</div>
            <div className="font-bold text-primary truncate max-w-[120px]">
              {currentCharacter}
            </div>
          </div>
        </div>

        {/* 搜索与快捷新建栏 */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索现有角色分类..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-2 border border-border/70 rounded-[8px] text-text placeholder:text-text-muted focus:outline-none focus:border-primary/60 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 角色列表网格 */}
          <div className="max-h-52 overflow-y-auto pr-1 space-y-1 scrollbar-thin">
            {loading ? (
              <div className="py-8 text-center text-xs text-text-muted">加载角色中...</div>
            ) : filteredCharacters.length === 0 ? (
              <div className="py-6 text-center text-xs text-text-muted">
                未找到匹配角色，可直接在下方新建角色分类
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {filteredCharacters.map((char) => {
                  const isSelected = selectedCharacter === char && !customCharacter.trim()
                  const avatar = avatars[char]
                  return (
                    <button
                      key={char}
                      type="button"
                      onClick={() => {
                        setSelectedCharacter(char)
                        setCustomCharacter('')
                      }}
                      className={`p-2 rounded-[8px] border text-left flex items-center space-x-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-primary-fg border-primary shadow-xs font-bold'
                          : 'bg-surface-2/60 hover:bg-surface border-border/60 text-text'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-3 shrink-0 flex items-center justify-center border border-border/40">
                        {avatar ? (
                          <img src={toFileUrl(avatar)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </div>
                      <span className="text-xs truncate flex-1">{char}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 新建/自定义角色输入 */}
        <div className="pt-2 border-t border-border/60">
          <label className="block text-[11px] font-semibold text-text-muted mb-1 flex items-center space-x-1">
            <Plus className="w-3 h-3 text-primary" />
            <span>或输入新建角色分类名称:</span>
          </label>
          <input
            type="text"
            value={customCharacter}
            onChange={(e) => {
              setCustomCharacter(e.target.value)
              if (e.target.value.trim()) setSelectedCharacter('')
            }}
            placeholder="例如: 维琳娜, 简·杜, NPC, 武器..."
            className="w-full px-3 py-1.5 text-xs bg-surface-2 border border-border/70 rounded-[8px] text-text placeholder:text-text-muted focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        {/* 底部确认操作 */}
        <div className="pt-2 flex items-center justify-between">
          <div className="text-[11px] text-text-muted truncate max-w-[200px]">
            目标: <span className="font-bold text-primary">{targetCharName || '未选择'}</span>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={moving}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmMove}
              loading={moving}
              disabled={!targetCharName || moving}
              icon={<FolderInput className="w-3.5 h-3.5" />}
            >
              确认移动
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
