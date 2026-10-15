import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'

export type Theme = 'light' | 'dark'
export type Palette = 'default' | 'clay'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  palette: Palette
  setPalette: (palette: Palette) => void
  togglePalette: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'lz-theme'
const PALETTE_STORAGE_KEY = 'lz-palette'

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // 优先读取 DOM 已设置的主题（index.html 早期注入），其次 localStorage，默认 light
    const currentAttr = document.documentElement.getAttribute('data-theme') as Theme | null
    if (currentAttr === 'light' || currentAttr === 'dark') {
      return currentAttr
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
      if (saved === 'light' || saved === 'dark') return saved
    } catch (_) {}
    return 'light'
  })

  const [palette, setPaletteState] = useState<Palette>(() => {
    // 优先读取 DOM 已设置的调色板（index.html 早期注入），其次 localStorage，默认 default
    const currentAttr = document.documentElement.getAttribute('data-palette') as Palette | null
    if (currentAttr === 'default' || currentAttr === 'clay') {
      return currentAttr
    }
    try {
      const saved = localStorage.getItem(PALETTE_STORAGE_KEY) as Palette | null
      if (saved === 'default' || saved === 'clay') return saved
    } catch (_) {}
    return 'default'
  })

  const applyTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, newTheme)
    } catch (_) {}
    // 同步到 Electron 后台持久化配置
    try {
      window.lz?.updateAppConfig?.({ theme: newTheme })
    } catch (_) {}
  }, [])

  const applyPalette = useCallback((newPalette: Palette) => {
    setPaletteState(newPalette)
    document.documentElement.setAttribute('data-palette', newPalette)
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, newPalette)
    } catch (_) {}
    // 同步到 Electron 后台持久化配置
    try {
      ;(window.lz?.updateAppConfig as ((cfg: Record<string, unknown>) => void) | undefined)?.({ palette: newPalette })
    } catch (_) {}
  }, [])

  // 监听跨窗口的主题与调色板同步（主窗口与悬浮窗互相即时响应）
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue)
        document.documentElement.setAttribute('data-theme', e.newValue)
        document.documentElement.classList.toggle('dark', e.newValue === 'dark')
      }
      if (e.key === PALETTE_STORAGE_KEY && (e.newValue === 'default' || e.newValue === 'clay')) {
        setPaletteState(e.newValue)
        document.documentElement.setAttribute('data-palette', e.newValue)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // 通过 ref 读取最新主题，避免 initFromConfig 依赖 theme 导致反复执行
  const themeRef = useRef(theme)
  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  // 仅挂载执行一次：检查持久化配置是否包含主题设定（useRef 标记，StrictMode 重复挂载也只跑一次）
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const initFromConfig = async () => {
      try {
        const cfg = await window.lz?.getConfig?.()
        if (cfg && (cfg.theme === 'light' || cfg.theme === 'dark')) {
          if (cfg.theme !== themeRef.current) {
            applyTheme(cfg.theme)
          }
        }
      } catch (_) {}
    }
    initFromConfig()
  }, [applyTheme])

  const toggleTheme = useCallback(() => {
    applyTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme, applyTheme])

  const togglePalette = useCallback(() => {
    applyPalette(palette === 'default' ? 'clay' : 'default')
  }, [palette, applyPalette])

  const contextValue = useMemo(
    () => ({
      theme,
      setTheme: applyTheme,
      toggleTheme,
      palette,
      setPalette: applyPalette,
      togglePalette,
    }),
    [theme, applyTheme, toggleTheme, palette, applyPalette, togglePalette]
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
