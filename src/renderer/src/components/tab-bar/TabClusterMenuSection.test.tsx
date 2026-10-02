// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab, TabCluster, TabGroup } from '../../../../shared/tab-types'
import type { TabStripSelection } from '@/store/slices/tabs/tabs-slice-contract'
import { TabClusterMenuSection } from './TabClusterMenuSection'
import { getTabClusterMenuTargets } from './tab-cluster-menu-targets'

const model = vi.hoisted(() => {
  const groupsByWorktree: Record<string, TabGroup[]> = {}
  const unifiedTabsByWorktree: Record<string, Tab[]> = {}
  const tabSelectionByGroupId: Record<string, TabStripSelection> = {}
  return {
    groupsByWorktree,
    unifiedTabsByWorktree,
    tabSelectionByGroupId,
    createTabCluster: vi.fn(),
    addTabsToCluster: vi.fn(),
    removeTabsFromCluster: vi.fn()
  }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof model) => unknown) => selector(model)
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <button role="menuitem" disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSubTrigger: ({
    children,
    disabled
  }: {
    children: React.ReactNode
    disabled?: boolean
  }) => (
    <button role="menuitem" disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

const CLUSTER: TabCluster = {
  id: 'existing',
  name: '',
  color: 'green',
  collapsed: false,
  tabIds: ['b', 'c']
}
const PANE: TabGroup = {
  id: 'pane',
  worktreeId: 'wt',
  activeTabId: 'a',
  tabOrder: ['a', 'b', 'c'],
  tabClusters: [CLUSTER]
}

beforeEach(() => {
  model.groupsByWorktree = { wt: [PANE] }
  model.unifiedTabsByWorktree = { wt: [] }
  model.tabSelectionByGroupId = {}
})
afterEach(cleanup)

describe('cluster grouping menu targets', () => {
  it('takes a highlighted right-click target as the whole selection in pane order', () => {
    expect(
      getTabClusterMenuTargets({
        tabId: 'b',
        tabOrder: PANE.tabOrder,
        selection: { tabIds: ['c', 'b'], anchorTabId: 'c' },
        pinnedTabIds: new Set(),
        clusters: [CLUSTER]
      })
    ).toEqual({ tabIds: ['b', 'c'], groupableTabIds: ['b', 'c'], hasClusterMembers: true })
  })

  it('takes only the right-clicked tab when it is outside the highlighted selection', () => {
    expect(
      getTabClusterMenuTargets({
        tabId: 'a',
        tabOrder: PANE.tabOrder,
        selection: { tabIds: ['b', 'c'], anchorTabId: 'b' },
        pinnedTabIds: new Set(),
        clusters: [CLUSTER]
      })
    ).toEqual({ tabIds: ['a'], groupableTabIds: ['a'], hasClusterMembers: false })
  })

  it('skips pinned tabs while preserving the multi-selection count', () => {
    expect(
      getTabClusterMenuTargets({
        tabId: 'b',
        tabOrder: PANE.tabOrder,
        selection: { tabIds: ['a', 'b', 'c'], anchorTabId: 'a' },
        pinnedTabIds: new Set(['a', 'b']),
        clusters: [CLUSTER]
      })
    ).toEqual({ tabIds: ['a', 'b', 'c'], groupableTabIds: ['c'], hasClusterMembers: true })
  })
})

describe('cluster grouping menu labels and availability', () => {
  it('names a single-tab action and shows an unnamed existing cluster', () => {
    render(
      <TabClusterMenuSection
        worktreeId="wt"
        groupId="pane"
        tabId="a"
        isPinned={false}
        onQueueNewCluster={() => {}}
      />
    )
    expect(
      screen.getByRole('menuitem', { name: 'Add Tab to New Group' }).hasAttribute('disabled')
    ).toBe(false)
    expect(screen.getByRole('menuitem', { name: 'Unnamed group' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: 'Remove from Group' })).toBeNull()
  })

  it('names the whole selection when a selected member is right-clicked', () => {
    model.tabSelectionByGroupId = { pane: { tabIds: ['a', 'b', 'c'], anchorTabId: 'a' } }
    render(
      <TabClusterMenuSection
        worktreeId="wt"
        groupId="pane"
        tabId="b"
        isPinned={false}
        onQueueNewCluster={() => {}}
      />
    )
    expect(screen.getByRole('menuitem', { name: 'Add 3 Tabs to New Group' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Remove from Group' })).toBeDefined()
  })

  it('does not let an unrelated highlighted selection change a single-tab menu', () => {
    model.tabSelectionByGroupId = { pane: { tabIds: ['b', 'c'], anchorTabId: 'b' } }
    render(
      <TabClusterMenuSection
        worktreeId="wt"
        groupId="pane"
        tabId="a"
        isPinned={false}
        onQueueNewCluster={() => {}}
      />
    )
    expect(screen.getByRole('menuitem', { name: 'Add Tab to New Group' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: 'Add 2 Tabs to New Group' })).toBeNull()
  })

  it('disables grouping for a pinned-only target', () => {
    render(
      <TabClusterMenuSection
        worktreeId="wt"
        groupId="pane"
        tabId="a"
        isPinned
        onQueueNewCluster={() => {}}
      />
    )
    expect(
      screen.getByRole('menuitem', { name: 'Add Tab to New Group' }).hasAttribute('disabled')
    ).toBe(true)
    expect(screen.getByRole('menuitem', { name: 'Add to Group' }).hasAttribute('disabled')).toBe(
      true
    )
  })
})
