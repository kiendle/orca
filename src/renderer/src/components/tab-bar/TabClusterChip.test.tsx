// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TabCluster, TabGroup } from '../../../../shared/tab-types'
import { TabClusterChip } from './TabClusterChip'
import type { TabBarProps } from './tab-bar-props'
import type { AppState } from '@/store/types'
import {
  createTestStore,
  makeTabGroup,
  makeUnifiedTab,
  seedStore,
  type TestStore
} from '@/store/slices/store-test-helpers'
import { useTabBarClusterInteractions } from './use-tab-bar-cluster-interactions'

let store: TestStore

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: AppState) => unknown) => store(selector), {
    getState: () => store.getState()
  })
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

function ChipFromStore({ autoRename }: { autoRename: boolean }): React.JSX.Element | null {
  const cluster = store((state) => state.groupsByWorktree.wt[0].tabClusters?.[0])
  return cluster ? (
    <TabClusterChip
      cluster={cluster}
      groupId="pane"
      worktreeId="wt"
      onClose={() => {}}
      autoRename={autoRename}
    />
  ) : null
}

function pane(): TabGroup {
  return store.getState().groupsByWorktree.wt[0]
}

function mount(cluster: TabCluster = CLUSTER, autoRename = false, activeTabId = 'a'): RenderResult {
  const tabOrder = [...cluster.tabIds, 'x']
  seedStore(store, {
    activeWorktreeId: 'wt',
    unifiedTabsByWorktree: {
      wt: tabOrder.map((id, sortOrder) =>
        makeUnifiedTab({ id, sortOrder, worktreeId: 'wt', groupId: 'pane', contentType: 'editor' })
      )
    },
    groupsByWorktree: {
      wt: [
        makeTabGroup({
          id: 'pane',
          worktreeId: 'wt',
          activeTabId,
          tabOrder,
          tabClusters: [cluster]
        })
      ]
    }
  })
  return render(
    <TooltipProvider>
      <ChipFromStore autoRename={autoRename} />
    </TooltipProvider>
  )
}

function pressChip(detail: number): void {
  const chip = screen.getByRole('button', { name: 'Work' })
  const pointer = { button: 0, clientX: 10, clientY: 10 }
  fireEvent.pointerDown(chip, pointer)
  fireEvent.mouseDown(chip, { ...pointer, detail })
  fireEvent.pointerUp(chip, pointer)
  fireEvent.mouseUp(chip, { ...pointer, detail })
  fireEvent.click(chip, { detail })
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

beforeEach(() => {
  vi.clearAllMocks()
  store = createTestStore()
})
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

  it.each([
    { label: 'expanded', cluster: CLUSTER, activeTabId: 'a' },
    {
      label: 'collapsed with an outside tab active',
      cluster: { ...CLUSTER, collapsed: true, shownTabId: 'a' },
      activeTabId: 'x'
    },
    {
      label: 'collapsed with another member active',
      cluster: { ...CLUSTER, collapsed: true, shownTabId: 'a' },
      activeTabId: 'b'
    }
  ])(
    'preserves $label presentation through double-click rename and Escape',
    ({ cluster, activeTabId }) => {
      mount(cluster, false, activeTabId)
      const before = pane().tabClusters
      pressChip(1)
      expect(pane().tabClusters?.[0].collapsed).toBe(!cluster.collapsed)
      pressChip(2)
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
      const input = screen.getByRole('textbox', { name: 'Rename Group' })
      expect(pane().tabClusters).toEqual(before)
      expect(pane().activeTabId).toBe(activeTabId)
      fireEvent.change(input, { target: { value: 'Discard me' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      fireEvent.blur(input)
      expect(screen.queryByRole('textbox')).toBeNull()
      expect(pane().tabClusters).toEqual(before)
      expect(pane().activeTabId).toBe(activeTabId)
    }
  )

  it('does not interpret a second press that becomes a drag as rename', () => {
    mount()
    const chip = screen.getByRole('button', { name: 'Work' })
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseDown(chip, { button: 0, detail: 2 })
    fireEvent.pointerUp(window, { clientX: 30, clientY: 10 })
    fireEvent.doubleClick(chip)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(pane().tabClusters).toEqual([CLUSTER])
  })

  it('commits a trimmed name on Enter and leaves the editing state', () => {
    mount()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename Group' })
    fireEvent.change(input, { target: { value: '  Research  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(pane().tabClusters?.[0].name).toBe('Research')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('commits on blur, including an intentionally empty color-only name', () => {
    mount()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename Group' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(pane().tabClusters?.[0].name).toBe('')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('cancels on Escape without committing the discarded name', () => {
    mount()
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
    const input = screen.getByRole('textbox', { name: 'Rename Group' })
    fireEvent.change(input, { target: { value: 'Discard me' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(pane().tabClusters?.[0].name).toBe('Work')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it.each(['before', 'after'])(
    'keeps the IME redispatch %s keyup from committing rename',
    (redispatchTiming) => {
      mount()
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Work' }))
      const input = screen.getByRole('textbox', { name: 'Rename Group' })
      fireEvent.compositionStart(input)
      fireEvent.change(input, { target: { value: '調査' } })
      fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
      fireEvent.compositionEnd(input, { data: '調査' })
      expect(pane().tabClusters?.[0].name).toBe('Work')
      expect(screen.getByRole('textbox')).toBe(input)
      if (redispatchTiming === 'after') {
        fireEvent.keyUp(input, { key: 'Enter', keyCode: 13 })
      }
      fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 13 })
      expect(pane().tabClusters?.[0].name).toBe('Work')
      expect(screen.getByRole('textbox')).toBe(input)
      fireEvent.keyUp(input, { key: 'Enter', keyCode: 13 })
      fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })
      expect(pane().tabClusters?.[0].name).toBe('調査')
      expect(screen.queryByRole('textbox')).toBeNull()
    }
  )
})

describe('cluster chip collapse activation', () => {
  it('toggles only on pointer release and suppresses a drag', () => {
    mount()
    const chip = screen.getByRole('button', { name: 'Work' })
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 })
    expect(pane().tabClusters?.[0].collapsed).toBe(false)
    fireEvent.pointerUp(window, { clientX: 11, clientY: 10 })
    expect(pane().tabClusters?.[0].collapsed).toBe(true)
    expect(pane().tabClusters?.[0].shownTabId).toBe('a')
    fireEvent.pointerDown(chip, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(window, { clientX: 30, clientY: 10 })
    expect(pane().tabClusters?.[0].collapsed).toBe(true)
    expect(pane().tabClusters?.[0].shownTabId).toBe('a')
  })

  it('exposes expanded state and toggles a collapsed group with the keyboard', () => {
    mount({ ...CLUSTER, collapsed: true })
    const chip = screen.getByRole('button', { name: 'Work' })
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(chip.textContent).toContain('3')
    fireEvent.keyDown(chip, { key: ' ' })
    expect(pane().tabClusters?.[0].collapsed).toBe(false)
  })
})
