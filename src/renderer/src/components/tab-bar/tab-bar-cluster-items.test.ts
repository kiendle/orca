import { describe, expect, it } from 'vitest'
import type { TabCluster } from '../../../../shared/tab-types'
import { buildTabBarStripItems } from './tab-bar-cluster-items'
import type { TabBarItem } from './tab-bar-item-model'

function terminalItem(id: string): TabBarItem {
  return {
    type: 'terminal',
    id: `visible-${id}`,
    unifiedTabId: id,
    isPinned: false,
    data: {
      id: `visible-${id}`,
      worktreeId: 'wt',
      ptyId: null,
      title: id,
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 0
    }
  }
}

const ITEMS = ['a', 'b', 'c', 'd', 'e'].map(terminalItem)
const CLUSTER: TabCluster = {
  id: 'cluster',
  name: 'Work',
  color: 'blue',
  collapsed: false,
  tabIds: ['b', 'c', 'd']
}

describe('tab strip cluster projection', () => {
  it('inserts one chip before the first member and leaves ungrouped order alone', () => {
    const strip = buildTabBarStripItems(ITEMS, { activeTabId: 'a', tabClusters: [CLUSTER] })
    expect(strip.map((item) => item.id)).toEqual([
      'visible-a',
      'tab-cluster:cluster',
      'visible-b',
      'visible-c',
      'visible-d',
      'visible-e'
    ])
    expect(ITEMS.map((item) => item.unifiedTabId)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('renders a collapsed chip and only its active member as sortable strip items', () => {
    const strip = buildTabBarStripItems(ITEMS, {
      activeTabId: 'd',
      tabClusters: [{ ...CLUSTER, collapsed: true }]
    })
    expect(strip.map((item) => item.id)).toEqual([
      'visible-a',
      'tab-cluster:cluster',
      'visible-d',
      'visible-e'
    ])
  })

  it('retains a collapsed chip even when no member is the active tab', () => {
    const strip = buildTabBarStripItems(ITEMS, {
      activeTabId: 'a',
      tabClusters: [{ ...CLUSTER, collapsed: true }]
    })
    expect(strip.map((item) => item.id)).toEqual(['visible-a', 'tab-cluster:cluster', 'visible-e'])
  })

  it('places adjacent cluster chips in canonical member order, regardless of metadata order', () => {
    const second: TabCluster = {
      id: 'second',
      name: 'Other',
      color: 'pink',
      collapsed: false,
      tabIds: ['e']
    }
    expect(
      buildTabBarStripItems(ITEMS, { activeTabId: 'a', tabClusters: [second, CLUSTER] }).map(
        (item) => item.id
      )
    ).toEqual([
      'visible-a',
      'tab-cluster:cluster',
      'visible-b',
      'visible-c',
      'visible-d',
      'tab-cluster:second',
      'visible-e'
    ])
  })

  it('does not show an orphan chip when its entire cluster is absent from the rendered content', () => {
    expect(
      buildTabBarStripItems([ITEMS[0]!, ITEMS[4]!], {
        activeTabId: 'a',
        tabClusters: [CLUSTER]
      }).map((item) => item.id)
    ).toEqual(['visible-a', 'visible-e'])
  })
})
