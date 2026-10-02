// @vitest-environment happy-dom

import { create } from 'zustand'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { TabsSlice } from '@/store/slices/tabs/tabs-slice-contract'
import type { TabCluster, TabGroup } from '../../../../shared/tab-types'
import { TabClusterChip } from './TabClusterChip'
import { TabClusterMenuSection } from './TabClusterMenuSection'
import { useTabClusterMenuCloseAction } from './use-tab-cluster-menu-close-action'

type ClusterMenuFocusState = Pick<
  TabsSlice,
  | 'groupsByWorktree'
  | 'unifiedTabsByWorktree'
  | 'tabSelectionByGroupId'
  | 'createTabCluster'
  | 'addTabsToCluster'
  | 'removeTabsFromCluster'
  | 'renameTabCluster'
  | 'setTabClusterColor'
  | 'setTabClusterCollapsed'
  | 'ungroupTabCluster'
  | 'moveTabCluster'
>

vi.mock('@/store', () => {
  const store = create<ClusterMenuFocusState>()((set) => ({
    groupsByWorktree: {},
    unifiedTabsByWorktree: {},
    tabSelectionByGroupId: {},
    createTabCluster: (groupId, tabIds) => {
      const cluster: TabCluster = {
        id: 'created-cluster',
        name: '',
        color: 'blue',
        collapsed: false,
        tabIds
      }
      set((state) => ({
        groupsByWorktree: {
          ...state.groupsByWorktree,
          wt: state.groupsByWorktree.wt.map((group) =>
            group.id === groupId ? { ...group, tabClusters: [cluster] } : group
          )
        }
      }))
      return cluster.id
    },
    addTabsToCluster: () => false,
    removeTabsFromCluster: () => {},
    renameTabCluster: vi.fn(),
    setTabClusterColor: () => {},
    setTabClusterCollapsed: () => {},
    ungroupTabCluster: () => {},
    moveTabCluster: () => false
  }))
  return { useAppStore: store }
})
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: undefined,
    setNodeRef: () => {}
  })
}))
vi.mock('./SortableTab', () => ({ CLOSE_ALL_CONTEXT_MENUS_EVENT: 'orca-close-all-context-menus' }))
vi.mock('../tab-group/useTabDragSplit', () => ({ TAB_DRAG_ACTIVATION_DISTANCE_PX: 5 }))
vi.mock('../tab-group/tab-cluster-split-availability', () => ({
  getTabClusterSplitBlocker: () => null
}))

const PANE: TabGroup = {
  id: 'pane',
  worktreeId: 'wt',
  activeTabId: 'a',
  tabOrder: ['a', 'b']
}
const CLUSTER: TabCluster = {
  id: 'existing-cluster',
  name: 'Work',
  color: 'blue',
  collapsed: false,
  tabIds: ['a', 'b']
}
const MENU_EXIT_ANIMATION = `
  [data-slot="dropdown-menu-content"][data-state="open"] { animation-name: none; }
  [data-slot="dropdown-menu-content"][data-state="closed"] {
    animation-name: cluster-menu-close;
    animation-duration: 0.2s;
  }
`

function ChipFromStore({ autoRename = false }: { autoRename?: boolean }): React.JSX.Element | null {
  const cluster = useAppStore((state) => state.groupsByWorktree.wt[0].tabClusters?.[0])
  return cluster ? (
    <TabClusterChip
      cluster={cluster}
      groupId="pane"
      worktreeId="wt"
      autoRename={autoRename}
      onClose={() => {}}
    />
  ) : null
}

function CreationMenu(): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const clusterMenuAction = useTabClusterMenuCloseAction()
  return (
    <TooltipProvider>
      <style>{MENU_EXIT_ANIMATION}</style>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button aria-hidden tabIndex={-1}>
            Tab menu
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onCloseAutoFocus={clusterMenuAction.runAfterClose}>
          {open ? (
            <TabClusterMenuSection
              worktreeId="wt"
              groupId="pane"
              tabId="a"
              isPinned={false}
              onQueueNewCluster={clusterMenuAction.queueAfterClose}
            />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ChipFromStore autoRename />
    </TooltipProvider>
  )
}

function finishMenuExit(menu: HTMLElement): void {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: 'cluster-menu-close' })
  fireEvent(menu, event)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({
    groupsByWorktree: { wt: [PANE] },
    unifiedTabsByWorktree: { wt: [] },
    tabSelectionByGroupId: { pane: { tabIds: ['a', 'b'], anchorTabId: 'a' } }
  })
})
afterEach(cleanup)

describe('cluster rename after a closing menu', () => {
  it('creates the group only after menu exit and keeps its new name field focused', async () => {
    render(<CreationMenu />)
    const menu = await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add 2 Tabs to New Group' }))
    expect(menu.getAttribute('data-state')).toBe('closed')
    expect(screen.queryByRole('textbox', { name: 'Rename Group' })).toBeNull()
    finishMenuExit(menu)
    const input = await screen.findByRole('textbox', { name: 'Rename Group' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: 'Research' } })
    expect(screen.getByDisplayValue('Research')).toBe(input)
    expect(useAppStore.getState().renameTabCluster).not.toHaveBeenCalled()
  })

  it('opens an existing group rename after its chip menu exits without committing on blur', async () => {
    useAppStore.setState({ groupsByWorktree: { wt: [{ ...PANE, tabClusters: [CLUSTER] }] } })
    render(
      <TooltipProvider>
        <style>{MENU_EXIT_ANIMATION}</style>
        <ChipFromStore />
      </TooltipProvider>
    )
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Work' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename Group' }))
    expect(menu.getAttribute('data-state')).toBe('closed')
    expect(screen.queryByRole('textbox', { name: 'Rename Group' })).toBeNull()
    finishMenuExit(menu)
    const input = await screen.findByRole('textbox', { name: 'Rename Group' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect(screen.getByDisplayValue('Work')).toBe(input)
    fireEvent.change(input, { target: { value: 'Research' } })
    expect(screen.getByDisplayValue('Research')).toBe(input)
    expect(useAppStore.getState().renameTabCluster).not.toHaveBeenCalled()
  })
})
