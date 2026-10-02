import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { dispatchWorkspaceTabCommand } from '@/lib/workspace-tab-commands'
import { guardRunningTerminalGroupClose } from '../terminal/running-terminal-close-guard'
import type { TabCluster, TabGroup } from '../../../../shared/tab-types'
import {
  resolveTerminalTabTitle,
  resolveUnifiedTabLabel
} from '../../../../shared/tab-title-resolution'
import type { TabBarProps } from './tab-bar-props'
import type { TabBarItem } from './tab-bar-item-model'
import { resolveTabStripSelection, type TabStripActivationModifiers } from './tab-strip-selection'

export type TabBarClusterInteractions = {
  highlightedTabIds: ReadonlySet<string>
  autoRenameClusterIds: ReadonlySet<string>
  selectTab: (tabId: string, modifiers: TabStripActivationModifiers) => boolean
  clearSelection: () => void
  closeCluster: (cluster: TabCluster) => void
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
  const closeCluster = (cluster: TabCluster): void => {
    const state = useAppStore.getState()
    const tabIds = [...cluster.tabIds]
    const generatedTitlesEnabled = state.settings?.tabAutoGenerateTitle === true
    const unifiedTabById = new Map(
      (state.unifiedTabsByWorktree[props.worktreeId] ?? []).map((tab) => [tab.id, tab])
    )
    // Why: collapsed members disappear from visibleItems, not from the group's close.
    const terminals = tabIds.flatMap((tabId) => {
      const item = itemByUnifiedId.get(tabId)
      const tab = unifiedTabById.get(tabId)
      if (tab?.contentType === 'terminal') {
        return [
          {
            terminalTabId: tab.entityId,
            tabLabel:
              item?.type === 'terminal'
                ? resolveTerminalTabTitle(item.data, generatedTitlesEnabled, item.data.title)
                : resolveUnifiedTabLabel(tab, generatedTitlesEnabled)
          }
        ]
      }
      return item?.type === 'terminal'
        ? [
            {
              terminalTabId: item.id,
              tabLabel: resolveTerminalTabTitle(item.data, generatedTitlesEnabled, item.data.title)
            }
          ]
        : []
    })
    guardRunningTerminalGroupClose({
      subjectKey: `tab-cluster:${cluster.id}`,
      groupLabel: cluster.name,
      terminals,
      onClose: () => {
        if (props.onCloseTabs) {
          props.onCloseTabs(tabIds)
          return
        }
        // Why: legacy hosts still need bulk routing, or confirmation would requeue each terminal.
        for (const tabId of tabIds) {
          dispatchWorkspaceTabCommand({
            type: 'close',
            target: { kind: 'tab', worktreeId: props.worktreeId, tabId },
            bulk: true
          })
        }
      }
    })
  }
  return { highlightedTabIds, autoRenameClusterIds, selectTab, clearSelection, closeCluster }
}
