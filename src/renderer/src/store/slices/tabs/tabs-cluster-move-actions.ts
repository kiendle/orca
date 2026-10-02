import { createBrowserUuid } from '@/lib/browser-uuid'
import type { TabsSlice, TabsSliceGet, TabsSliceSet } from './tabs-slice-contract'
import {
  findGroupAndWorktree,
  pickNextActiveTab,
  pushRecentTabId,
  sanitizeRecentTabIds
} from '../tab-group-state'
import { isPaneColumnSplitDropNoOp } from '../pane-column-split-drop-no-op'
import { buildSplitNode, collapseGroupLayout, replaceLeaf } from './tabs-layout'
import { buildActiveSurfacePatch } from './tabs-surface'
import { mergeTabClusterRecords, normalizeTabGroupClusters } from './tab-cluster-model'
import { buildTabClusterStripMove } from './tabs-cluster-strip-actions'
import { applyTabOrderSortValues } from './tabs-tab-order'

export function createTabsClusterMoveActions(
  set: TabsSliceSet,
  get: TabsSliceGet
): Pick<TabsSlice, 'moveTabCluster'> {
  return {
    moveTabCluster: (sourceGroupId, clusterId, target) => {
      let moved = false
      set((state) => {
        const source = findGroupAndWorktree(state.groupsByWorktree, sourceGroupId)
        const destination = findGroupAndWorktree(state.groupsByWorktree, target.groupId)
        const cluster = source?.group.tabClusters?.find((candidate) => candidate.id === clusterId)
        if (!source || !destination || !cluster || source.worktreeId !== destination.worktreeId) {
          return state
        }
        const { worktreeId } = source
        const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
        if (sourceGroupId === target.groupId && !target.splitDirection) {
          const next = buildTabClusterStripMove(source.group, tabs, cluster.tabIds, {
            index: target.index ?? source.group.tabOrder.length - cluster.tabIds.length,
            clusterId
          })
          if (!next) {
            return state
          }
          moved = true
          return {
            groupsByWorktree: {
              ...state.groupsByWorktree,
              [worktreeId]: state.groupsByWorktree[worktreeId].map((group) =>
                group.id === sourceGroupId ? next.group : group
              )
            },
            unifiedTabsByWorktree: { ...state.unifiedTabsByWorktree, [worktreeId]: next.tabs }
          }
        }

        const memberIds = new Set(cluster.tabIds)
        const sourceOrder = source.group.tabOrder.filter((id) => !memberIds.has(id))
        if (
          target.splitDirection &&
          sourceOrder.length === 0 &&
          isPaneColumnSplitDropNoOp({
            sourceGroupId,
            targetGroupId: target.groupId,
            splitDirection: target.splitDirection,
            sourceTabCount: 1,
            layout: state.layoutByWorktree[worktreeId]
          })
        ) {
          return state
        }

        let destinationGroup = destination.group
        let groups = state.groupsByWorktree[worktreeId]
        let layoutByWorktree = state.layoutByWorktree
        if (target.splitDirection) {
          const id = createBrowserUuid()
          destinationGroup = { id, worktreeId, tabOrder: [], activeTabId: null }
          groups = [...groups, destinationGroup]
          const layout =
            layoutByWorktree[worktreeId] ?? ({ type: 'leaf', groupId: target.groupId } as const)
          const replacement = buildSplitNode(
            target.groupId,
            id,
            target.splitDirection === 'left' || target.splitDirection === 'right'
              ? 'horizontal'
              : 'vertical',
            target.splitDirection === 'left' || target.splitDirection === 'up' ? 'first' : 'second'
          )
          layoutByWorktree = {
            ...layoutByWorktree,
            [worktreeId]: replaceLeaf(layout, target.groupId, replacement)
          }
        }
        const destinationId = destinationGroup.id
        const destinationOrder = destinationGroup.tabOrder.filter((id) => !memberIds.has(id))
        destinationOrder.splice(
          Math.max(0, Math.min(target.index ?? destinationOrder.length, destinationOrder.length)),
          0,
          ...cluster.tabIds
        )
        const activeTabId =
          source.group.activeTabId && memberIds.has(source.group.activeTabId)
            ? source.group.activeTabId
            : cluster.tabIds[0]
        const sourceActiveTabId =
          source.group.activeTabId && memberIds.has(source.group.activeTabId)
            ? pickNextActiveTab(
                source.group.tabOrder.filter(
                  (id) => !memberIds.has(id) || id === source.group.activeTabId
                ),
                source.group.recentTabIds,
                source.group.activeTabId
              )
            : source.group.activeTabId
        const pinnedTabIds = new Set(tabs.filter((tab) => tab.isPinned).map((tab) => tab.id))
        groups = groups.map((group) => {
          if (group.id === sourceGroupId) {
            return normalizeTabGroupClusters(
              {
                ...group,
                tabOrder: sourceOrder,
                activeTabId: sourceActiveTabId,
                recentTabIds: sanitizeRecentTabIds(group.recentTabIds, sourceOrder),
                tabClusters: group.tabClusters?.filter((candidate) => candidate.id !== clusterId)
              },
              pinnedTabIds
            )
          }
          if (group.id === destinationId) {
            return normalizeTabGroupClusters(
              {
                ...group,
                tabOrder: destinationOrder,
                activeTabId,
                recentTabIds: pushRecentTabId(
                  sanitizeRecentTabIds(group.recentTabIds, destinationOrder),
                  activeTabId
                ),
                tabClusters: mergeTabClusterRecords(group.tabClusters, [cluster])
              },
              pinnedTabIds
            )
          }
          return group
        })
        let activeGroupIdByWorktree = {
          ...state.activeGroupIdByWorktree,
          [worktreeId]: destinationId
        }
        if (!sourceOrder.length) {
          groups = groups.filter((group) => group.id !== sourceGroupId)
          const collapsed = collapseGroupLayout(
            layoutByWorktree,
            activeGroupIdByWorktree,
            worktreeId,
            sourceGroupId,
            destinationId
          )
          layoutByWorktree = collapsed.layoutByWorktree
          activeGroupIdByWorktree = {
            ...collapsed.activeGroupIdByWorktree,
            [worktreeId]: destinationId
          }
        }
        const nextTabs = tabs.map((tab) =>
          memberIds.has(tab.id) ? { ...tab, groupId: destinationId } : tab
        )
        const unifiedTabsByWorktree = {
          ...state.unifiedTabsByWorktree,
          [worktreeId]: applyTabOrderSortValues(
            applyTabOrderSortValues(nextTabs, sourceOrder),
            destinationOrder
          )
        }
        const groupsByWorktree = { ...state.groupsByWorktree, [worktreeId]: groups }
        const recentQuickCommandIdByGroup = { ...state.recentQuickCommandIdByGroup }
        if (!sourceOrder.length) {
          delete recentQuickCommandIdByGroup[sourceGroupId]
        }
        const patch = {
          unifiedTabsByWorktree,
          groupsByWorktree,
          layoutByWorktree,
          activeGroupIdByWorktree,
          recentQuickCommandIdByGroup
        }
        moved = true
        return {
          ...patch,
          ...(state.activeWorktreeId === worktreeId
            ? buildActiveSurfacePatch({ ...state, ...patch }, worktreeId, destinationId)
            : {})
        }
      })
      if (moved) {
        get().recordFeatureInteraction?.('terminal-tabs')
        get().recordFeatureInteraction?.('tab-splits')
      }
      return moved
    }
  }
}
