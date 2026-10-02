import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { TabGroup } from '../../../../shared/tab-types'
import type { TabBarProps } from './tab-bar-props'
import type { TabBarItem } from './tab-bar-item-model'
import { resolveTabStripSelection, type TabStripActivationModifiers } from './tab-strip-selection'

export type TabBarClusterInteractions = {
  highlightedTabIds: ReadonlySet<string>
  autoRenameClusterIds: ReadonlySet<string>
  selectTab: (tabId: string, modifiers: TabStripActivationModifiers) => boolean
  clearSelection: () => void
  closeCluster: (tabIds: readonly string[]) => void
}

export function useTabBarClusterInteractions({
  props,
  groupId,
  group,
  groups,
  allItems,
  visibleItems,
  activeVisibleTabId
}: {
  props: TabBarProps
  groupId: string
  group: TabGroup | null
  groups: readonly TabGroup[]
  allItems: readonly TabBarItem[]
  visibleItems: readonly TabBarItem[]
  activeVisibleTabId: string | null
}): TabBarClusterInteractions {
  const selection = useAppStore((state) => state.tabSelectionByGroupId[groupId])
  const seenClusterIdsRef = useRef<ReadonlySet<string> | null>(null)
  const autoRenameClusterIds = useMemo(() => {
    const ids = new Set<string>()
    const seen = seenClusterIdsRef.current
    if (seen) {
      for (const cluster of group?.tabClusters ?? []) {
        if (cluster.name === '' && !seen.has(cluster.id)) {
          ids.add(cluster.id)
        }
      }
    }
    return ids
  }, [group?.tabClusters])
  useEffect(() => {
    // Why: a restored or moved unnamed cluster must not steal focus by reopening its rename field.
    const ids = new Set<string>()
    for (const pane of groups) {
      for (const cluster of pane.tabClusters ?? []) {
        ids.add(cluster.id)
      }
    }
    seenClusterIdsRef.current = ids
  }, [groups])
  const highlightedTabIds = useMemo(() => new Set(selection?.tabIds), [selection])
  const visibleTabIds = useMemo(() => visibleItems.map((item) => item.unifiedTabId), [visibleItems])
  const activeTabId =
    group?.activeTabId ??
    allItems.find((item) => item.id === activeVisibleTabId)?.unifiedTabId ??
    null
  const selectTab = useCallback(
    (tabId: string, modifiers: TabStripActivationModifiers): boolean => {
      const state = useAppStore.getState()
      const next = resolveTabStripSelection({
        visibleTabIds,
        activeTabId,
        selection: state.tabSelectionByGroupId[groupId],
        clickedTabId: tabId,
        modifiers,
        isMac: navigator.userAgent.includes('Mac')
      })
      state.setTabSelection(groupId, next.selection)
      return !next.activate
    },
    [activeTabId, groupId, visibleTabIds]
  )
  const clearSelection = useCallback(() => {
    useAppStore.getState().setTabSelection(groupId, null)
  }, [groupId])
  const itemByUnifiedId = useMemo(
    () => new Map(allItems.map((item) => [item.unifiedTabId, item])),
    [allItems]
  )
  const closeCluster = (tabIds: readonly string[]): void => {
    // Why: never use store bulk-close; every member must retain the strip's terminal and dirty-file confirmations.
    for (const tabId of tabIds) {
      if (props.onCloseTab) {
        props.onCloseTab(tabId)
        continue
      }
      const item = itemByUnifiedId.get(tabId)
      if (!item) {
        continue
      }
      if (item.type === 'browser') {
        props.onCloseBrowserTab?.(item.id)
      } else if (item.type === 'editor' || item.type === 'simulator') {
        props.onCloseFile?.(item.id)
      } else {
        props.onClose(item.id)
      }
    }
  }
  return { highlightedTabIds, autoRenameClusterIds, selectTab, clearSelection, closeCluster }
}
