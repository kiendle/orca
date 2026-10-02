// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab, TabCluster, TabGroup } from '../../../../shared/tab-types'
import { useRunningTerminalCloseConfirmStore } from '@/store/running-terminal-close-confirm'
import type { AppState } from '@/store/types'
import type { TabBarItem } from './tab-bar-item-model'
import type { TabBarProps } from './tab-bar-props'
import { useTabBarClusterInteractions } from './use-tab-bar-cluster-interactions'

const { getStateMock, inspectRuntimeTerminalProcessMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
  inspectRuntimeTerminalProcessMock: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: AppState) => unknown) => selector(getStateMock()), {
    getState: getStateMock
  })
}))
vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  inspectRuntimeTerminalProcess: inspectRuntimeTerminalProcessMock
}))
vi.mock('@/lib/workspace-tab-commands', () => ({ dispatchWorkspaceTabCommand: vi.fn() }))

const LEAF = '11111111-1111-4111-8111-111111111111'
const CLUSTER: TabCluster = {
  id: 'cluster',
  name: 'Development',
  color: 'blue',
  collapsed: true,
  tabIds: ['unified-first', 'file-tab', 'unified-second']
}
const GROUP: TabGroup = {
  id: 'pane',
  worktreeId: 'wt',
  activeTabId: 'outside',
  tabOrder: [...CLUSTER.tabIds, 'outside'],
  tabClusters: [CLUSTER]
}

function terminalItem(
  unifiedTabId: string,
  entityId: string,
  label: string,
  customTitle: string | null = null
): TabBarItem {
  return {
    type: 'terminal',
    id: entityId,
    unifiedTabId,
    isPinned: false,
    data: {
      id: entityId,
      worktreeId: 'wt',
      ptyId: null,
      title: label,
      customTitle,
      color: null,
      sortOrder: 0,
      createdAt: 0
    }
  }
}

const ITEMS: TabBarItem[] = [
  terminalItem('unified-first', 'terminal-first', 'Build'),
  {
    type: 'editor',
    id: 'file-tab',
    unifiedTabId: 'file-tab',
    isPinned: false,
    data: {
      id: 'file-entity',
      filePath: '/workspace/README.md',
      relativePath: 'README.md',
      worktreeId: 'wt',
      language: 'markdown',
      isDirty: true,
      mode: 'edit'
    }
  },
  terminalItem('unified-second', 'terminal-second', 'Agent', 'Review changes'),
  terminalItem('outside', 'terminal-outside', 'Shell')
]
const UNIFIED_TABS: Tab[] = ITEMS.map((item, sortOrder) => ({
  id: item.unifiedTabId,
  entityId: item.data.id,
  groupId: 'pane',
  worktreeId: 'wt',
  contentType: item.type,
  label: item.type === 'terminal' ? item.data.title : 'README.md',
  customLabel: item.type === 'terminal' ? item.data.customTitle : null,
  color: null,
  sortOrder,
  createdAt: 0
}))
const PROPS: TabBarProps = {
  tabs: [],
  activeTabId: 'terminal-outside',
  worktreeId: 'wt',
  expandedPaneByTabId: {},
  onActivate: vi.fn(),
  onClose: vi.fn(),
  onCloseOthers: vi.fn(),
  onCloseToRight: vi.fn(),
  onCloseToLeft: vi.fn(),
  onNewTerminalTab: vi.fn(),
  onNewBrowserTab: vi.fn(),
  onSetCustomTitle: vi.fn(),
  onSetTabColor: vi.fn(),
  onTogglePaneExpand: vi.fn()
}

function mount(props: TabBarProps, allItems = ITEMS) {
  return renderHook(() =>
    useTabBarClusterInteractions({
      props,
      groupId: GROUP.id,
      group: GROUP,
      groups: [GROUP],
      allItems,
      visibleItems: ITEMS.filter((item) => item.unifiedTabId === 'outside'),
      activeVisibleTabId: 'terminal-outside'
    })
  )
}

async function settleProbe(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getStateMock.mockReturnValue({
    settings: { activeRuntimeEnvironmentId: null },
    tabSelectionByGroupId: {},
    unifiedTabsByWorktree: { wt: UNIFIED_TABS },
    ptyIdsByTabId: {
      'terminal-first': ['pty-first'],
      'terminal-second': ['pty-second'],
      'terminal-outside': ['pty-outside']
    },
    terminalLayoutsByTabId: {
      'terminal-first': { ptyIdsByLeafId: { [LEAF]: 'pty-first' } },
      'terminal-second': { ptyIdsByLeafId: { [LEAF]: 'pty-second' } }
    },
    agentStatusByPaneKey: { [`terminal-second:${LEAF}`]: { agentType: 'claude' } }
  })
  inspectRuntimeTerminalProcessMock.mockResolvedValue({
    foregroundProcess: 'sleep',
    hasChildProcesses: true
  })
})

afterEach(() => {
  cleanup()
  const store = useRunningTerminalCloseConfirmStore.getState()
  while (useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm) {
    store.dismissRunningTerminalClose()
  }
})

describe('closeCluster', () => {
  it('bulk-closes every collapsed member only after the group confirmation', async () => {
    const onCloseTabs = vi.fn()
    const onCloseTab = vi.fn()
    const { result } = mount({ ...PROPS, onCloseTabs, onCloseTab })

    act(() => result.current.closeCluster(CLUSTER))
    expect(onCloseTabs).not.toHaveBeenCalled()
    expect(onCloseTab).not.toHaveBeenCalled()
    await settleProbe()

    const store = useRunningTerminalCloseConfirmStore.getState()
    expect(store.runningTerminalCloseConfirm).toMatchObject({
      terminalTabId: 'tab-cluster:cluster',
      tabLabel: 'Development',
      groupTerminals: [
        { terminalTabId: 'terminal-first', tabLabel: 'Build', copyKind: 'command' },
        { terminalTabId: 'terminal-second', tabLabel: 'Review changes', copyKind: 'agent' }
      ]
    })
    expect(onCloseTabs).not.toHaveBeenCalled()
    act(() => store.confirmRunningTerminalClose())

    expect(onCloseTabs).toHaveBeenCalledTimes(1)
    expect(onCloseTabs).toHaveBeenCalledWith(CLUSTER.tabIds)
    expect(onCloseTab).not.toHaveBeenCalled()
    expect(PROPS.onClose).not.toHaveBeenCalled()
    expect(useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('cancelling the group prompt leaves every hidden member open', async () => {
    const onCloseTabs = vi.fn()
    const onCloseTab = vi.fn()
    const { result } = mount({ ...PROPS, onCloseTabs, onCloseTab })

    act(() => result.current.closeCluster(CLUSTER))
    await settleProbe()
    act(() => useRunningTerminalCloseConfirmStore.getState().dismissRunningTerminalClose())

    expect(onCloseTabs).not.toHaveBeenCalled()
    expect(onCloseTab).not.toHaveBeenCalled()
    expect(PROPS.onClose).not.toHaveBeenCalled()
    expect(useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('bulk-closes the whole group without a running prompt when its terminals are idle', async () => {
    inspectRuntimeTerminalProcessMock.mockResolvedValue({
      foregroundProcess: 'zsh',
      hasChildProcesses: false
    })
    const onCloseTabs = vi.fn()
    const { result } = mount({ ...PROPS, onCloseTabs })

    act(() => result.current.closeCluster(CLUSTER))
    await settleProbe()

    expect(onCloseTabs).toHaveBeenCalledTimes(1)
    expect(onCloseTabs).toHaveBeenCalledWith(CLUSTER.tabIds)
    expect(useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm).toBeNull()
  })

  it('still guards a host-backed member absent from the strip projection', async () => {
    const onCloseTabs = vi.fn()
    const { result } = mount(
      { ...PROPS, onCloseTabs },
      ITEMS.filter((item) => item.unifiedTabId !== 'unified-second')
    )

    act(() => result.current.closeCluster({ ...CLUSTER, name: '' }))
    await settleProbe()

    expect(
      useRunningTerminalCloseConfirmStore.getState().runningTerminalCloseConfirm
    ).toMatchObject({
      tabLabel: '',
      groupTerminals: [
        { terminalTabId: 'terminal-first', tabLabel: 'Build' },
        { terminalTabId: 'terminal-second', tabLabel: 'Review changes' }
      ]
    })
    expect(onCloseTabs).not.toHaveBeenCalled()
  })
})
