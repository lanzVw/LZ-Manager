import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collectInstalledVersions,
  inspectInstalledTarget,
  type GameBananaInstalledTarget
} from '../utils/gamebanana-install'

export interface InstalledGameBananaVersions {
  target: GameBananaInstalledTarget | null
  versions: ReadonlySet<string>
  refresh: () => void
}

/**
 * 抽屉打开时查一次本地已安装副本，安装成功后再刷新。
 * 请求序号守卫用于丢弃切换 Mod / 关闭抽屉后的迟到响应。
 */
export const useInstalledGameBananaVersions = (modId?: number | null): InstalledGameBananaVersions => {
  const [target, setTarget] = useState<GameBananaInstalledTarget | null>(null)
  const seqRef = useRef(0)

  const refresh = useCallback(() => {
    if (modId === null || modId === undefined) return
    const seq = ++seqRef.current
    void inspectInstalledTarget(modId).then((hit) => {
      if (seq === seqRef.current) setTarget(hit)
    })
  }, [modId])

  useEffect(() => {
    setTarget(null)
    refresh()
    return () => {
      seqRef.current += 1
    }
  }, [refresh])

  const versions = useMemo(() => collectInstalledVersions(target), [target])

  return { target, versions, refresh }
}
