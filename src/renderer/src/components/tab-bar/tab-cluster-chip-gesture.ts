import { useRef } from 'react'
import { useAppStore } from '@/store'
import type { TabCluster } from '../../../../shared/tab-types'
import { useTabStripPointerActivation } from './tab-strip-pointer-activation'

export function useTabClusterChipGesture({
  cluster,
  groupId,
  isEditing,
  onRename,
  dragListener
}: {
  cluster: TabCluster
  groupId: string
  isEditing: boolean
  onRename: () => void
  dragListener?: (event: React.PointerEvent<Element>) => void
}) {
  const setCollapsed = useAppStore((state) => state.setTabClusterCollapsed)
  const restoreCollapseState = useAppStore((state) => state.restoreTabClusterCollapseState)
  const pointerClickRef = useRef(false)
  const collapseBeforeClickRef = useRef<Pick<TabCluster, 'collapsed' | 'shownTabId'> | null>(null)
  const { onPointerDown } = useTabStripPointerActivation({
    // Collapse must not remove the pressed child before Chromium dispatches its click.
    onActivate: () => {
      pointerClickRef.current = true
    },
    disabled: isEditing
  })

  return {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>): void => {
      pointerClickRef.current = false
      onPointerDown(event, dragListener)
    },
    onClick: (event: React.MouseEvent<HTMLDivElement>): void => {
      const pointerWasClick = pointerClickRef.current
      pointerClickRef.current = false
      if (isEditing || (event.detail !== 0 && !pointerWasClick)) {
        return
      }
      // Chromium emits dblclick after click(detail=2), so rename cannot depend on its delivery.
      if (event.detail === 2) {
        if (collapseBeforeClickRef.current) {
          // Toggling back would recapture the active member instead of the original sticky one.
          restoreCollapseState(groupId, cluster.id, collapseBeforeClickRef.current)
        }
        collapseBeforeClickRef.current = null
        onRename()
      } else {
        collapseBeforeClickRef.current =
          event.detail === 0
            ? null
            : { collapsed: cluster.collapsed, shownTabId: cluster.shownTabId }
        setCollapsed(groupId, cluster.id, !cluster.collapsed)
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (isEditing || (event.key !== 'Enter' && event.key !== ' ')) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      collapseBeforeClickRef.current = null
      setCollapsed(groupId, cluster.id, !cluster.collapsed)
    }
  }
}
