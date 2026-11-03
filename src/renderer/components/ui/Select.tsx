import React, { useState, useRef, useEffect, useCallback, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface SelectOption<T = string | number> {
  value: T
  label: React.ReactNode
  /** 可搜索时的匹配文本；label 是 ReactNode 时必须给，否则回退到 string 类型的 label */
  searchText?: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SelectProps<T = string | number> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  disabled?: boolean
  className?: string
  popupClassName?: string
  size?: 'sm' | 'md'
  prefixIcon?: React.ReactNode
  align?: 'left' | 'right'
  title?: string
  /** 展开后在面板顶部显示搜索框，按 searchText 做大小写不敏感的子串过滤 */
  searchable?: boolean
  searchPlaceholder?: string
  /** ghost：无边框透明底，用于搜索 composer 内部或安静的筛选入口 */
  variant?: 'default' | 'ghost'
}

export function Select<T = string | number>({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  disabled = false,
  className = '',
  popupClassName = '',
  size = 'md',
  prefixIcon,
  align = 'left',
  title,
  searchable = false,
  searchPlaceholder = '搜索...',
  variant = 'default'
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // 键盘导航高亮索引 (-1 表示无高亮)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const optionId = (idx: number) => `${uid}-option-${idx}`

  const [popupCoords, setPopupCoords] = useState<{
    top?: number
    bottom?: number
    left?: number
    right?: number
    width: number
    maxHeight: number
    placement: 'top' | 'bottom'
  } | null>(null)

  // 可搜索时基于 searchText / label 过滤可见选项
  const visibleOptions = useMemo(() => {
    if (!searchable) return options
    const q = searchQuery.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => {
      const text = opt.searchText ?? (typeof opt.label === 'string' ? opt.label : '')
      return text.toLowerCase().includes(q)
    })
  }, [options, searchable, searchQuery])

  const selectedOption = options.find((opt) => opt.value === value)

  // 可用（非禁用）选项索引，用于键盘移动高亮时跳过禁用项
  const getEnabledIndexes = useCallback(
    () =>
      visibleOptions.reduce<number[]>(
        (acc, opt, idx) => (opt.disabled ? acc : [...acc, idx]),
        []
      ),
    [visibleOptions]
  )

  // 计算全局悬浮位置 (基于视口与触发元素坐标，支持自动翻转与边界保护)
  const calculateCoords = useCallback(() => {
    if (!containerRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top
    const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow

    const availableHeight = showAbove ? Math.max(120, spaceAbove - 16) : Math.max(120, spaceBelow - 16)
    const maxHeight = Math.min(searchable ? 320 : 240, availableHeight)

    const coords: {
      top?: number
      bottom?: number
      left?: number
      right?: number
      width: number
      maxHeight: number
      placement: 'top' | 'bottom'
    } = {
      width: rect.width,
      maxHeight,
      placement: showAbove ? 'top' : 'bottom'
    }

    if (showAbove) {
      coords.bottom = Math.max(8, viewportHeight - rect.top + 4)
    } else {
      coords.top = Math.max(8, rect.bottom + 4)
    }

    if (align === 'right') {
      coords.right = Math.max(8, viewportWidth - rect.right)
    } else {
      coords.left = Math.max(8, rect.left)
    }

    return coords
  }, [align, searchable])

  const openDropdown = () => {
    if (disabled) return
    if (searchable) {
      setSearchQuery('')
    }
    const initialCoords = calculateCoords()
    if (initialCoords) setPopupCoords(initialCoords)
    // 初始高亮当前选中项；无选中时高亮第一个可用项
    const selectedIndex = options.findIndex((opt) => opt.value === value && !opt.disabled)
    const enabled = options.reduce<number[]>(
      (acc, opt, idx) => (opt.disabled ? acc : [...acc, idx]),
      []
    )
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : enabled[0] ?? -1)
    setIsOpen(true)
  }

  const closeDropdown = useCallback((restoreFocus = false) => {
    setIsOpen(false)
    setHighlightIndex(-1)
    if (searchable) {
      setSearchQuery('')
    }
    if (restoreFocus) triggerRef.current?.focus()
  }, [searchable])

  // 打开时聚焦搜索输入框（searchable 时）或列表容器，保证键盘导航即刻生效
  useEffect(() => {
    if (isOpen) {
      if (searchable) {
        searchInputRef.current?.focus()
      } else {
        listRef.current?.focus()
      }
    }
  }, [isOpen, searchable])

  // 高亮变化时滚动到可视区域
  useEffect(() => {
    if (!isOpen || highlightIndex < 0) return
    const optionEl = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${highlightIndex}"]`
    )
    optionEl?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, highlightIndex])

  // 过滤结果变化（query 改变）后重置高亮：当前选中项若在 visibleOptions 中则高亮它，否则高亮第一个可用项，无可用项时 -1
  useEffect(() => {
    if (!isOpen || !searchable) return
    const selectedIndex = visibleOptions.findIndex((opt) => opt.value === value && !opt.disabled)
    const enabled = getEnabledIndexes()
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : enabled[0] ?? -1)
  }, [searchQuery, isOpen, searchable, value, visibleOptions, getEnabledIndexes])

  // 展开状态下实时响应视口滚动或尺寸变化，自动修正吸附位置
  useEffect(() => {
    if (!isOpen) return

    const handleUpdate = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      // 触发器完全滑出屏幕时自动收起
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setIsOpen(false)
        if (searchable) setSearchQuery('')
        return
      }
      const updated = calculateCoords()
      if (updated) setPopupCoords(updated)
    }

    window.addEventListener('resize', handleUpdate)
    window.addEventListener('scroll', handleUpdate, true)

    return () => {
      window.removeEventListener('resize', handleUpdate)
      window.removeEventListener('scroll', handleUpdate, true)
    }
  }, [isOpen, calculateCoords, searchable])

  // 点击外部自动收起 (同时判断触发器与 Portaled 菜单面板)
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popupRef.current &&
        !popupRef.current.contains(target)
      ) {
        setIsOpen(false)
        setHighlightIndex(-1)
        if (searchable) {
          setSearchQuery('')
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen, searchable])

  // ESC 键关闭并还原焦点到触发按钮
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeDropdown(true)
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, closeDropdown])

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    if (!isOpen) {
      openDropdown()
    } else {
      closeDropdown(true)
    }
  }

  // 触发按钮键盘支持：方向键展开
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (isOpen) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openDropdown()
    }
  }

  // 在可用选项之间移动高亮 (delta 为 1 / -1 / 首尾跳转由调用方处理)
  const moveHighlight = (delta: number) => {
    const enabled = getEnabledIndexes()
    if (enabled.length === 0) return
    setHighlightIndex((prev) => {
      const pos = prev >= 0 ? enabled.indexOf(prev) : -1
      if (pos === -1) return delta > 0 ? enabled[0] : enabled[enabled.length - 1]
      const nextPos = (pos + delta + enabled.length) % enabled.length
      return enabled[nextPos]
    })
  }

  const selectOption = (opt: SelectOption<T>) => {
    if (opt.disabled) return
    onChange(opt.value)
    closeDropdown(true)
  }

  // 列表容器键盘导航：↑/↓ 移动高亮、Home/End 首尾（搜索框内保留光标跳首尾）、Enter 选中
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    // IME 组合输入中不拦截任何键（拼音输入法等）
    if ((e.nativeEvent as any)?.isComposing || e.keyCode === 229) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveHighlight(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveHighlight(-1)
        break
      case 'Home': {
        // 搜索框内光标跳到开头，不拦截
        if ((e.target as HTMLElement)?.tagName === 'INPUT') {
          break
        }
        const enabled = getEnabledIndexes()
        if (enabled.length > 0) {
          e.preventDefault()
          setHighlightIndex(enabled[0])
        }
        break
      }
      case 'End': {
        // 搜索框内光标跳到末尾，不拦截
        if ((e.target as HTMLElement)?.tagName === 'INPUT') {
          break
        }
        const enabled = getEnabledIndexes()
        if (enabled.length > 0) {
          e.preventDefault()
          setHighlightIndex(enabled[enabled.length - 1])
        }
        break
      }
      case 'Enter': {
        const option =
          highlightIndex >= 0 && highlightIndex < visibleOptions.length
            ? visibleOptions[highlightIndex]
            : null
        if (option && !option.disabled) {
          e.preventDefault()
          selectOption(option)
        }
        break
      }
      default:
        break
    }
  }

  const sizeClasses =
    size === 'sm'
      ? 'py-1 px-2.5 text-xs rounded-control min-h-[28px]'
      : 'py-1.5 px-3 text-xs rounded-control min-h-[34px]'

  const triggerStateClasses =
    variant === 'ghost'
      ? isOpen
        ? 'border-transparent bg-surface shadow-xs'
        : 'border-transparent bg-transparent hover:bg-surface'
      : isOpen
        ? 'border-primary bg-surface ring-2 ring-primary/20 shadow-xs'
        : 'border-border bg-surface-2 hover:bg-surface hover:border-primary/40'

  // 过滤 w-full / min-w-full，防止 Portal 挂载到 body 上时被拉伸至全视口宽度
  const popupClasses = popupClassName
    .split(' ')
    .filter((c) => c && c !== 'w-full' && c !== 'min-w-full')
  const hasExplicitWidth = popupClasses.some((c) => /^w-(?:\[\w+\]|\d+|max|min|fit)/.test(c))
  const filteredPopupClassName = popupClasses.join(' ')

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left select-none ${className}`}
      title={title}
    >
      {/* 触发器按键 */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        onClick={toggleDropdown}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        className={`w-full flex items-center justify-between space-x-2 border transition-all duration-fast cursor-pointer ${triggerStateClasses} ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${sizeClasses}`}
      >
        <div className="flex items-center space-x-2 truncate">
          {prefixIcon && <span className="shrink-0 flex items-center">{prefixIcon}</span>}
          {selectedOption?.icon && (
            <span className="shrink-0 flex items-center">{selectedOption.icon}</span>
          )}
          <span
            className={`truncate font-medium ${
              selectedOption ? 'text-text' : 'text-text-muted'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform duration-fast ${
            isOpen ? 'rotate-180 text-primary' : ''
          }`}
        />
      </button>

      {/* 悬浮菜单面板 (通过 React Portal 挂载到 document.body，彻底杜绝被页面内容、网格卡片或 overflow 裁剪与覆盖) */}
      {isOpen &&
        popupCoords &&
        createPortal(
          <div
            ref={popupRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleListKeyDown}
            style={{
              position: 'fixed',
              top: popupCoords.top !== undefined ? `${popupCoords.top}px` : undefined,
              bottom: popupCoords.bottom !== undefined ? `${popupCoords.bottom}px` : undefined,
              left: popupCoords.left !== undefined ? `${popupCoords.left}px` : undefined,
              right: popupCoords.right !== undefined ? `${popupCoords.right}px` : undefined,
              minWidth: `${popupCoords.width}px`,
              width: hasExplicitWidth ? undefined : `${popupCoords.width}px`,
              maxHeight: `${popupCoords.maxHeight}px`,
              maxWidth: 'calc(100vw - 16px)'
            }}
            className={`z-[99999] flex flex-col overflow-hidden rounded-xl bg-surface/95 backdrop-blur-xl border border-border shadow-2xl ring-1 ring-black/5 dark:ring-white/10 p-1 animate-in fade-in outline-none ${
              popupCoords.placement === 'top'
                ? 'slide-in-from-bottom-1'
                : 'slide-in-from-top-1'
            } zoom-in-95 duration-fast ${filteredPopupClassName}`}
          >
            {/* 可选搜索输入框（吸顶，不随选项列表滚动） */}
            {searchable && (
              <div className="shrink-0 mb-1">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none shrink-0" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-surface-2 border border-border focus:border-primary/80 focus:ring-2 focus:ring-primary/20 text-text placeholder:text-text-muted text-xs rounded-lg pl-8 pr-2.5 py-1.5 transition-colors duration-fast focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* 选项滚动列表 */}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={
                highlightIndex >= 0 && highlightIndex < visibleOptions.length
                  ? optionId(highlightIndex)
                  : undefined
              }
              className="flex-1 min-h-0 overflow-y-auto outline-none"
            >
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-muted text-center font-mono">
                  无可选项目
                </div>
              ) : visibleOptions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-muted text-center font-mono">
                  无匹配项
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleOptions.map((opt, idx) => {
                    const isSelected = opt.value === value
                    const isHighlighted = idx === highlightIndex && !opt.disabled
                    return (
                      <button
                        key={`${String(opt.value)}_${idx}`}
                        id={optionId(idx)}
                        data-option-index={idx}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={-1}
                        disabled={opt.disabled}
                        onClick={(e) => {
                          e.stopPropagation()
                          selectOption(opt)
                        }}
                        onMouseEnter={() => {
                          if (!opt.disabled) setHighlightIndex(idx)
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left cursor-pointer ${
                          isSelected
                            ? 'bg-primary/10 text-primary font-bold border border-primary/20 shadow-2xs'
                            : isHighlighted
                            ? 'bg-surface-2 text-text border border-transparent'
                            : opt.disabled
                            ? 'opacity-40 cursor-not-allowed text-text-muted'
                            : 'text-text hover:bg-surface-2 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          {opt.icon && (
                            <span className="shrink-0 flex items-center">{opt.icon}</span>
                          )}
                          <div className="flex flex-col truncate">
                            <span className="truncate">{opt.label}</span>
                            {opt.description && (
                              <span className="text-[10px] text-text-muted truncate mt-0.5">
                                {opt.description}
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2 stroke-[2.5]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
