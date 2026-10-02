// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TabCluster, TabGroup } from '../../../../shared/tab-types'
import { TabClusterChip } from './TabClusterChip'
import type { TabBarProps } from './tab-bar-props'
import type { TabStripSelection } from '@/store/slices/tabs/tabs-slice-contract'
import { useTabBarClusterInteractions } from './use-tab-bar-cluster-interactions'

const actions = vi.hoisted(() => {
  const tabSelectionByGroupId: Record<string, TabStripSelection> = {}
  return { renameTabCluster: vi.fn(), setTabClusterCollapsed: vi.fn(), tabSelectionByGroupId }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof actions) => unknown) => selector(actions)
}))
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: undefined,
    setNodeRef: () => {}
  })
}))
vi.mock('./SortableTab', () => ({ CLOSE_ALL_CONTEXT_MENUS_EVENT: 'orca-close-all-context-menus' }))
vi.mock('./TabClusterContextMenu', () => ({ TabClusterContextMenu: () => null }))
vi.mock('../tab-group/useTabDragSplit', () => ({ TAB_DRAG_ACTIVATION_DISTANCE_PX: 5 }))

const CLUSTER: TabCluster = {
  id: 'cluster',
  name: 'Work',
  color: 'blue',
  collapsed: false,
  tabIds: ['a', 'b', 'c']
}

function mount(cluster: TabCluster = CLUSTER, autoRename = false): RenderResult {
  return render(
    <TooltipProvider>
      <TabClusterChip
        cluster={cluster}
        groupId="pane"
        worktreeId="wt"
        onClose={() => {}}
        autoRename={autoRename}
      />
    </TooltipProvider>
  )
}

const noop = (): void => {}
const BAR_PROPS: TabBarProps = {
  tabs: [],
  activeTabId: null,
  worktreeId: 'wt',
  expandedPaneByTabId: {},
  onActivate: noop,
  onClose: noop,
  onCloseOthers: noop,
  onCloseToRight: noop,
  onCloseToLeft: noop,
  onNewTerminalTab: noop,
  onNewBrowserTab: noop,
  onSetCustomTitle: noop,
  onSetTabColor: noop,
  onTogglePaneExpand: noop
}

function StripRenameHarness({ groups }: { groups: readonly TabGroup[] }): React.JSX.Element {
  const group = groups.find((item) => item.id === 'pane') ?? null
  const interactions = useTabBarClusterInteractions({
    props: BAR_PROPS,
    groupId: 'pane',
    group,
    groups,
    allItems: [],
    visibleItems: [],
    activeVisibleTabId: null
  })
  return (
    <TooltipProvider>
      {group?.tabClusters?.map((cluster) => (
        <TabClusterChip
          key={cluster.id}
          cluster={cluster}
          groupId="pane"
          worktreeId="wt"
          onClose={noop}
          autoRename={interactions.autoRenameClusterIds.has(cluster.id)}
        />
      ))}
    </TooltipProvider>
  )
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('cluster chip rename', () => {
  it('automatically starts editing the empty name of a newly created cluster', () => {
    mount({ ...CLUSTER, name: '' }, true)
    expect(screen.getByRole('textbox', { name: 'Rename Group' })).toBe(screen.getByDisplayValue(''))
  })

  it('opens the inline field when an unnamed cluster is added to a mounted strip', () => {
    const pane: TabGroup = {
      id: 'pane',
      worktreeId: 'wt',
      activeTabId: 'a',
      tabOrder: ['a', 'b', 'c']
    }
    const view = render(<StripRenameHarness groups={[pane]} />)
    view.rerender(
      <StripRenameHarness groups={[{ ...pane, tabClusters: [{ ...CLUSTER, name: '' }] }]} />
    )
    expect(screen.getByRole('textbox', { name: 'Rename Group' })).toBe(screen.getByDisplayValue(''))
  })

  it('does not reopen rename when an existing unnamed cluster moves between pane strips', () => {
    const pane: TabGroup = { id: 'pane', worktreeId: 'wt', activeTabId: null, tabOrder: [] }
    const other: TabGroup = {
      id: 'other',
      worktreeId: 'wt',
      activeTabId: 'a',
      tabOrder: ['a', 'b', 'c'],
      tabClusters: [{ ...CLUSTER, name: '' }]
    }
    const view = render(<StripRenameHarness groups={[pane, other]} />)
    view.rerender(
      <StripRenameHarness
        groups={[
          { ...pane, activeTabId: 'a', tabOrder: other.tabOrder, tabClusters: other.tabClusters }
        ]}
      />
    )
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Unnamed group' })).toBeDefined()
  })

  it('keeps a restored unnamed cluster color-only without taking rename focus', () => {
    mount({ ...CLUSTER, name: '' })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Unnamed group' }).getAttribute('aria-expanded')
    ).toBe('true')
  })

  it('opens rename on the second mouse press after the first collapse re-renders', () => {
    const view = mount()
    const chip = screen.getByRole('button', { name: 'Work' })
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseDown(chip, { button: 0, detail: 1 })
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
    expect(actions.setTabClusterCollapsed).toHaveBeenCalledWith('pane', 'cluster', true)
    view.rerender(
      <TooltipProvider>
        <TabClusterChip
          cluster={{ ...CLUSTER, collapsed: true }}
          groupId="pane"
          worktreeId="wt"
          onClose={() => {}}
        />
      </TooltipProvider>
    )
    const collapsedChip = screen.getByRole('button', { name: 'Work' })
    fireEvent.pointerDown(collapsedChip, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseDown(collapsedChip, { button: 0, detail: 2 })
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('textbox', { name: 'Rename Group' })).toBeDefined()
    expect(actions.setTabClusterCollapsed).toHaveBeenCalledTimes(1)
  })

  it('does not interpret a second press that becomes a drag as rename', () => {
    mount()
    const chip = screen.getByRole('button', { name: 'Work' })
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseDown(chip, { button: 0, detail: 2 })
    fireEvent.pointerUp(window, { clientX: 30, clientY: 10 })
    fireEvent.doubleClick(chip)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(actions.setTabClusterCollapsed).not.toHaveBeenCalled()
  })

  it('commits a trimmed name on Enter and leaves the editing state', () => {
    mount()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename Group' })
    fireEvent.change(input, { target: { value: '  Research  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(actions.renameTabCluster).toHaveBeenCalledWith('pane', 'cluster', 'Research')
    expect(actions.renameTabCluster).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('commits on blur, including an intentionally empty color-only name', () => {
    mount()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename Group' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(actions.renameTabCluster).toHaveBeenCalledWith('pane', 'cluster', '')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('cancels on Escape without committing the discarded name', () => {
    mount()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename Group' })
    fireEvent.change(input, { target: { value: 'Discard me' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(actions.renameTabCluster).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('does not commit an Enter that confirms an IME candidate', () => {
    mount()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename Group' })
    fireEvent.change(input, { target: { value: '調査' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(actions.renameTabCluster).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBe(input)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 13 })
    expect(actions.renameTabCluster).toHaveBeenCalledWith('pane', 'cluster', '調査')
  })
})

describe('cluster chip collapse activation', () => {
  it('toggles only on pointer release and suppresses a drag', () => {
    mount()
    const chip = screen.getByRole('button', { name: 'Work' })
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 })
    expect(actions.setTabClusterCollapsed).not.toHaveBeenCalled()
    fireEvent.pointerUp(window, { clientX: 11, clientY: 10 })
    expect(actions.setTabClusterCollapsed).toHaveBeenCalledWith('pane', 'cluster', true)
    actions.setTabClusterCollapsed.mockClear()
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(window, { clientX: 30, clientY: 10 })
    expect(actions.setTabClusterCollapsed).not.toHaveBeenCalled()
  })

  it('exposes expanded state and toggles a collapsed group with the keyboard', () => {
    mount({ ...CLUSTER, collapsed: true })
    const chip = screen.getByRole('button', { name: 'Work' })
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(chip.textContent).toContain('3')
    fireEvent.keyDown(chip, { key: ' ' })
    expect(actions.setTabClusterCollapsed).toHaveBeenCalledWith('pane', 'cluster', false)
  })
})
