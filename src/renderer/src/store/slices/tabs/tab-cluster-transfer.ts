import type { TabGroup } from '../../../../../shared/tab-types'
import { normalizeTabGroupClusters } from './tab-cluster-model'

export function applyTransferredTabClusterMembership(
  group: TabGroup,
  tabId: string,
  clusterId: string | null | undefined,
  pinnedTabIds: ReadonlySet<string>
): TabGroup {
  if (!group.tabClusters) {
    return normalizeTabGroupClusters(group, pinnedTabIds)
  }
  const tabClusters = group.tabClusters.map((cluster) => {
    const joining = cluster.id === clusterId && !pinnedTabIds.has(tabId)
    const wasMember = cluster.tabIds.includes(tabId)
    if (joining === wasMember) {
      return cluster
    }
    return {
      ...cluster,
      tabIds: joining ? [...cluster.tabIds, tabId] : cluster.tabIds.filter((id) => id !== tabId)
    }
  })
  return normalizeTabGroupClusters({ ...group, tabClusters }, pinnedTabIds)
}
