import { describe, expect, it, vi } from 'vitest'
import type { TabGroup } from '../../../shared/tab-types'

vi.mock('../store', () => ({ useAppStore: { setState: vi.fn() } }))

import { buildMirroredHostGroups } from './web-session-tabs-sync/layout-groups'
import { reconcileClientOwnedTabPlacement } from './web-session-client-owned-tab-placement'
import { getHiddenClusterTabIds } from '../store/slices/tabs/tab-cluster-model'

const group: TabGroup = {
  id: 'pane',
  worktreeId: 'wt',
  activeTabId: 'local-b',
  tabOrder: ['local-a', 'local-b'],
  tabClusters: [
    { id: 'work', name: 'Work', color: 'blue', collapsed: true, tabIds: ['local-a', 'local-b'] }
  ]
}

describe('web-session cluster presentation', () => {
  it('keeps a matching local pane collapsed across a host layout rebuild without sharing metadata', () => {
    const groups = buildMirroredHostGroups({
      currentGroups: [group],
      hostGroups: [
        { id: 'pane', activeTabId: 'host-b', tabOrder: ['host-a', 'host-b'] },
        { id: 'new-pane', activeTabId: 'host-c', tabOrder: ['host-c'] }
      ],
      hostToLocalTabId: new Map([
        ['host-a', 'local-a'],
        ['host-b', 'local-b'],
        ['host-c', 'local-c']
      ]),
      mirroredUnifiedIds: new Set(['local-a', 'local-b', 'local-c']),
      nextActiveUnifiedTabId: null,
      now: 0,
      validUnifiedTabIds: new Set(['local-a', 'local-b', 'local-c']),
      environmentId: 'cluster-mirror-test',
      worktreeId: 'wt',
      clientGroupIdByLocalTabId: new Map()
    })
    const retained = groups?.find((candidate) => candidate.id === 'pane')
    expect(retained?.tabClusters?.[0]).toMatchObject({
      id: 'work',
      name: 'Work',
      color: 'blue',
      collapsed: true
    })
    if (!retained) {
      throw new Error('Expected mirrored pane')
    }
    expect([...getHiddenClusterTabIds(retained)]).toEqual(['local-a'])
    expect(retained.activeTabId).toBe('local-b')
    expect(groups?.find((candidate) => candidate.id === 'new-pane')?.tabClusters).toBeUndefined()
  })

  it('rekeys client-owned cluster members when the host adopts a local editor identity', () => {
    const result = reconcileClientOwnedTabPlacement({
      currentGroups: [group],
      worktreeId: 'wt',
      validUnifiedTabIds: new Set(['local-a', 'mirrored-b']),
      adoptedTabs: [],
      placementMoves: [],
      rekeyedTabIds: new Map([['local-b', 'mirrored-b']]),
      intentTabId: null,
      reservedEmptyGroupFallbackTabId: null,
      currentActiveGroupId: group.id,
      currentLayout: { type: 'leaf', groupId: group.id },
      isGroupReserved: () => false
    })
    const retained = result.groups?.[0]
    expect(retained?.tabOrder).toEqual(['local-a', 'mirrored-b'])
    expect(retained?.tabClusters?.[0].tabIds).toEqual(['local-a', 'mirrored-b'])
    expect(retained?.activeTabId).toBe('mirrored-b')
    if (!retained) {
      throw new Error('Expected client-owned pane')
    }
    expect([...getHiddenClusterTabIds(retained)]).toEqual(['local-a'])
  })
})
