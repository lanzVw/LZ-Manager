import React, { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Preset } from '../../../core/types'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

interface PresetEditorModalProps {
  isOpen: boolean
  preset: Preset | null
  enabledModCount: number
  modsLoading: boolean
  submitting: boolean
  error: string | null
  onSubmit: (name: string, description: string) => void
  onClose: () => void
}

export const PresetEditorModal: React.FC<PresetEditorModalProps> = ({
  isOpen,
  preset,
  enabledModCount,
  modsLoading,
  submitting,
  error,
  onSubmit,
  onClose
}) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const initialName = preset?.name || ''
  const initialDescription = preset?.description || ''
  const isCreate = !preset

  useEffect(() => {
    if (!isOpen) return
    setName(initialName)
    setDescription(initialDescription)
    setNameError(null)
  }, [isOpen, initialName, initialDescription])

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('方案名称不能为空')
      return
    }
    if (trimmed.length > 60) {
      setNameError('方案名称不能超过 60 个字符')
      return
    }
    setNameError(null)
    onSubmit(trimmed, description.trim())
  }

  const displayError = nameError || error
  const showEmptyWarning = isCreate && !modsLoading && enabledModCount === 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isCreate ? '保存当前装配为新方案' : '编辑方案信息'}
      description={
        isCreate
          ? '将当前所有已启用的 Mod 记录为一份可一键切换的快照。'
          : '只修改方案名称与描述，不会改动方案包含的 Mod 列表。'
      }
      maxWidth="max-w-lg"
      confirmText={isCreate ? '保存方案' : '保存修改'}
      cancelText="取消"
      onConfirm={handleSubmit}
      loading={submitting}
    >
      <div className="space-y-4">
        {displayError && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        {showEmptyWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              当前没有已启用的 Mod，创建出的方案不包含任何 Mod；应用该方案时会导致全部 Mod 停用。
            </span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-text mb-1">方案名称</label>
          <Input
            maxLength={60}
            placeholder="例如：主战常态套装 / 盛装泳装派对"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError(null)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              // 中文输入法合成中回车是在选词，直接提交会把半成品名称写进方案
              const isComposing = (e.nativeEvent as any)?.isComposing || e.keyCode === 229
              if (isComposing) return
              e.preventDefault()
              handleSubmit()
            }}
          />
          <p className="text-[10px] text-text-muted mt-1 text-right tabular-nums-strict">
            {name.length}/60
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text mb-1">方案描述（可选）</label>
          <textarea
            rows={3}
            maxLength={200}
            placeholder="简述该方案的 Mod 搭配特色..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-surface-2 border border-border focus:border-primary rounded-control px-3.5 py-2 text-xs text-text placeholder:text-text-muted focus:outline-none font-sans resize-none"
          />
          <p className="text-[10px] text-text-muted mt-1 text-right tabular-nums-strict">
            {description.length}/200
          </p>
        </div>
      </div>
    </Modal>
  )
}
