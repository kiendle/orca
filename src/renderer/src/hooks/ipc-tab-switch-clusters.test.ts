import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getStateMock } = vi.hoisted(() => ({ getStateMock: vi.fn() }))
vi.mock('../store', () => ({ useAppStore: { getState: getStateMock } }))

import {
  createTestStore,
  makeTab,
  makeTabGroup,
  makeUnifiedTab,
  makeWorktree,
  seedStore
} from '../store/slices/store-test-helpers'
import {
  handleSwitchRecentTab,
  handleSwitchTab,
  handleSwitchTabAcrossAllTypes,
  handleSwitchTerminalTab
} from './ipc-tab-switch'

const WT = 'repo1::/path/wt1'
const GROUP = 'group-1'
const IDS = ['left', 'hidden-before', 'active-member', 'hidden-after', 'right']

function collapsedStore() {
  const store = createTestStore()
  seedStore(store, {
    activeWorktreeId: WT,
    activeTabId: 'term-active-member',
    activeTabType: 'terminal',
    worktreesByRepo: { repo1: [makeWorktree({ id: WT, repoId: 'repo1' })] },
    activeGroupIdByWorktree: { [WT]: GROUP },
    tabsByWorktree: {
      [WT]: IDS.map((id) => makeTab({ id: `term-${id}`, worktreeId: WT }))
    },
    unifiedTabsByWorktree: {
      [WT]: IDS.map((id) =>
        makeUnifiedTab({ id, entityId: `term-${id}`, worktreeId: WT, groupId: GROUP })
      )
    },
    groupsByWorktree: {
      [WT]: [
        makeTabGroup({
          id: GROUP,
          worktreeId: WT,
          activeTabId: 'active-member',
          tabOrder: [...IDS],
          recentTabIds: ['left', 'hidden-before', 'active-member'],
          tabClusters: [
            {
              id: 'cluster',
              name: 'Work',
              color: 'blue',
              collapsed: true,
              tabIds: ['hidden-before', 'active-member', 'hidden-after']
            }
          ]
        })
      ]
    }
  })
  getStateMock.mockImplementation(() => store.getState())
  return store
}

beforeEach(() => vi.clearAllMocks())

describe('collapsed cluster keyboard cycling', () => {
  it.each([
    { name: 'all types', cycle: handleSwitchTabAcrossAllTypes },
    { name: 'same type', cycle: handleSwitchTab },
    { name: 'terminal only', cycle: handleSwitchTerminalTab }
  ])('$name skips hidden members in both directions', ({ cycle }) => {
    for (const direction of [-1, 1]) {
      const store = collapsedStore()
      expect(cycle(direction)).toBe(true)
      const target = direction < 0 ? 'left' : 'right'
      expect(store.getState().getActiveTab(WT)?.id).toBe(target)
      expect(store.getState().activeTabId).toBe(`term-${target}`)
      expect(store.getState().groupsByWorktree[WT]?.[0].tabClusters?.[0].collapsed).toBe(true)
    }
  })

  it('does not mistake intentionally hidden terminals for missing hydrated rows', () => {
    const store = collapsedStore()
    store.setState((state) => ({
      groupsByWorktree: {
        [WT]: state.groupsByWorktree[WT].map((group) => ({
          ...group,
          tabOrder: ['hidden-before', 'active-member', 'hidden-after']
        }))
      },
      unifiedTabsByWorktree: {
        [WT]: state.unifiedTabsByWorktree[WT].filter(
          (tab) => tab.id !== 'left' && tab.id !== 'right'
        )
      },
      tabsByWorktree: {
        [WT]: state.tabsByWorktree[WT].filter(
          (tab) => tab.id !== 'term-left' && tab.id !== 'term-right'
        )
      }
    }))
    expect(handleSwitchTerminalTab(1)).toBe(false)
    expect(handleSwitchTab(1)).toBe(false)
    expect(handleSwitchTabAcrossAllTypes(-1)).toBe(false)
    expect(store.getState().getActiveTab(WT)?.id).toBe('active-member')
  })

  it('keeps hidden members available to Ctrl+Tab MRU', () => {
    const store = collapsedStore()
    expect(handleSwitchRecentTab()).toBe(true)
    expect(store.getState().getActiveTab(WT)?.id).toBe('hidden-before')
    expect(store.getState().groupsByWorktree[WT]?.[0].tabClusters?.[0].collapsed).toBe(true)
  })
})
