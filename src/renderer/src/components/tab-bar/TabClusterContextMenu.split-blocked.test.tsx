// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TabCluster } from '../../../../shared/tab-types'
import type { TabClusterSplitBlocker } from '../tab-group/tab-cluster-split-availability'
import { TabClusterContextMenu } from './TabClusterContextMenu'

const blocker = vi.hoisted((): { current: TabClusterSplitBlocker | null } => ({ current: null }))
const moveTabCluster = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => {
  const state = {
    setTabClusterColor: () => {},
    setTabClusterCollapsed: () => {},
    ungroupTabCluster: () => {},
    moveTabCluster
  }
  return { useAppStore: (selector: (s: typeof state) => unknown) => selector(state) }
})
vi.mock('../tab-group/tab-cluster-split-availability', () => ({
  getTabClusterSplitBlocker: () => blocker.current
}))

const CLUSTER: TabCluster = {
  id: 'c',
  name: 'Work',
  color: 'blue',
  collapsed: false,
  tabIds: ['a']
}

function renderMenu(): void {
  render(
    <TooltipProvider delayDuration={0}>
      <TabClusterContextMenu
        cluster={CLUSTER}
        groupId="pane"
        worktreeId="wt"
        open
        point={{ x: 0, y: 0 }}
        onOpenChange={() => {}}
        onRename={() => {}}
        onClose={() => {}}
      />
    </TooltipProvider>
  )
}

afterEach(() => {
  cleanup()
  blocker.current = null
  moveTabCluster.mockClear()
})

describe('Move Group to New Split availability', () => {
  it('greys the item out and explains a remote-server block on hover', async () => {
    blocker.current = 'remote-server'
    renderMenu()
    const item = screen.getByRole('menuitem', { name: 'Move Group to New Split' })
    expect(item.getAttribute('data-disabled')).not.toBeNull()
    fireEvent.click(item)
    expect(moveTabCluster).not.toHaveBeenCalled()
    const trigger = document.querySelector('[data-tab-cluster-split-unavailable="remote-server"]')
    expect(trigger).not.toBeNull()
    fireEvent.pointerMove(trigger!)
    fireEvent.focus(trigger!)
    expect(
      (await screen.findAllByText(/Not available for workspaces on a remote Orca server/)).length
    ).toBeGreaterThan(0)
  })

  it('names the floating panel as the reason there', async () => {
    blocker.current = 'floating-panel'
    renderMenu()
    const trigger = document.querySelector('[data-tab-cluster-split-unavailable="floating-panel"]')
    fireEvent.pointerMove(trigger!)
    fireEvent.focus(trigger!)
    expect(
      (await screen.findAllByText('Not available in the floating terminal panel.')).length
    ).toBeGreaterThan(0)
  })

  it('offers the split directions when nothing blocks it', () => {
    renderMenu()
    const trigger = screen.getByRole('menuitem', { name: 'Move Group to New Split' })
    expect(trigger.getAttribute('data-disabled')).toBeNull()
    expect(document.querySelector('[data-tab-cluster-split-unavailable]')).toBeNull()
  })
})
