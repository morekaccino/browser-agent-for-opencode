import { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { bridgeStatusItem } from './rpc'
import type { BridgeStatus } from '../../lib/protocol'

export function useBridgeStatus(): BridgeStatus {
  const [status, setStatus] = useState<BridgeStatus>({ state: 'disconnected' })
  useEffect(() => {
    void bridgeStatusItem.getValue().then(setStatus)
    const unwatch = bridgeStatusItem.watch((value) => setStatus(value ?? { state: 'disconnected' }))
    return () => unwatch()
  }, [])
  return status
}

export interface ActiveTab {
  id?: number
  title?: string
  url?: string
}

export function useActiveTab(): ActiveTab {
  const [tab, setTab] = useState<ActiveTab>({})
  useEffect(() => {
    const update = async () => {
      const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true })
      if (active) setTab({ id: active.id, title: active.title, url: active.url })
    }
    void update()
    const onActivated = () => void update()
    const onUpdated = (_id: number, info: { title?: string; url?: string }) => {
      if (info.title !== undefined || info.url !== undefined) void update()
    }
    browser.tabs.onActivated.addListener(onActivated)
    browser.tabs.onUpdated.addListener(onUpdated)
    return () => {
      browser.tabs.onActivated.removeListener(onActivated)
      browser.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [])
  return tab
}
