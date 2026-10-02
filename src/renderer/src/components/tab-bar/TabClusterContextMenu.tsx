import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Columns2,
  Pencil,
  Ungroup,
  X
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { TAB_CLUSTER_COLORS, type TabCluster } from '../../../../shared/tab-types'
import { getTabClusterSplitBlocker } from '../tab-group/tab-cluster-split-availability'
import { TAB_CONTEXT_MENU_CONTENT_CLASS } from './tab-context-menu-sizing'
import { TAB_CLUSTER_COLOR_CLASSES, TAB_CLUSTER_COLOR_LABELS } from './tab-cluster-colors'
import { useTabClusterMenuCloseAction } from './use-tab-cluster-menu-close-action'

export function TabClusterContextMenu({
  cluster,
  groupId,
  worktreeId,
  open,
  point,
  onOpenChange,
  onRename,
  onClose
}: {
  cluster: TabCluster
  groupId: string
  worktreeId: string
  open: boolean
  point: { x: number; y: number }
  onOpenChange: (open: boolean) => void
  onRename: () => void
  onClose: () => void
}): React.JSX.Element {
  const splitBlocker = useAppStore((state) => getTabClusterSplitBlocker(state, worktreeId))
  const setColor = useAppStore((state) => state.setTabClusterColor)
  const setCollapsed = useAppStore((state) => state.setTabClusterCollapsed)
  const ungroup = useAppStore((state) => state.ungroupTabCluster)
  const moveCluster = useAppStore((state) => state.moveTabCluster)
  const clusterMenuAction = useTabClusterMenuCloseAction()
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed size-px opacity-0"
          style={{ left: point.x, top: point.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={TAB_CONTEXT_MENU_CONTENT_CLASS}
        sideOffset={0}
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          clusterMenuAction.runAfterClose(event)
        }}
      >
        <DropdownMenuItem onSelect={() => clusterMenuAction.queueAfterClose(onRename)}>
          <Pencil className="size-3.5" />
          {translate('components.tabCluster.rename', 'Rename Group')}
        </DropdownMenuItem>
        <DropdownMenuLabel>
          {translate('components.tabCluster.color', 'Group Color')}
        </DropdownMenuLabel>
        <div className="flex flex-wrap gap-1 px-2 pb-1">
          {TAB_CLUSTER_COLORS.map((color) => (
            <DropdownMenuItem
              key={color}
              className="size-8 justify-center"
              role="menuitemradio"
              aria-checked={cluster.color === color}
              aria-label={translate(
                `components.tabCluster.colors.${color}`,
                TAB_CLUSTER_COLOR_LABELS[color]
              )}
              onSelect={() => setColor(groupId, cluster.id, color)}
            >
              <span
                aria-hidden
                className={cn(
                  'size-3.5 rounded-full',
                  TAB_CLUSTER_COLOR_CLASSES[color],
                  cluster.color === color &&
                    'ring-1 ring-foreground ring-offset-2 ring-offset-popover'
                )}
              />
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCollapsed(groupId, cluster.id, !cluster.collapsed)}>
          {cluster.collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
          {cluster.collapsed
            ? translate('components.tabCluster.expand', 'Expand Group')
            : translate('components.tabCluster.collapse', 'Collapse Group')}
        </DropdownMenuItem>
        {splitBlocker ? (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Why: disabled items ignore pointer events, so the wrapper owns the hover. */}
              <div className="cursor-not-allowed" data-tab-cluster-split-unavailable={splitBlocker}>
                <DropdownMenuItem disabled>
                  <Columns2 className="size-3.5" />
                  {translate('components.tabCluster.moveToSplit', 'Move Group to New Split')}
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="z-[80] max-w-64">
              {splitBlocker === 'remote-server'
                ? translate(
                    'components.tabCluster.moveToSplitUnavailableRemote',
                    'Not available for workspaces on a remote Orca server. Drag the group into an existing split instead.'
                  )
                : translate(
                    'components.tabCluster.moveToSplitUnavailableFloating',
                    'Not available in the floating terminal panel.'
                  )}
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Columns2 className="size-3.5" />
              {translate('components.tabCluster.moveToSplit', 'Move Group to New Split')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-w-[calc(100vw-1rem)] whitespace-nowrap">
              <DropdownMenuItem
                onSelect={() =>
                  moveCluster(groupId, cluster.id, { groupId, splitDirection: 'right' })
                }
              >
                <ArrowRight className="size-3.5" />
                {translate('components.tabCluster.splitRight', 'Right')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  moveCluster(groupId, cluster.id, { groupId, splitDirection: 'left' })
                }
              >
                <ArrowLeft className="size-3.5" />
                {translate('components.tabCluster.splitLeft', 'Left')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  moveCluster(groupId, cluster.id, { groupId, splitDirection: 'down' })
                }
              >
                <ArrowDown className="size-3.5" />
                {translate('components.tabCluster.splitDown', 'Down')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => moveCluster(groupId, cluster.id, { groupId, splitDirection: 'up' })}
              >
                <ArrowUp className="size-3.5" />
                {translate('components.tabCluster.splitUp', 'Up')}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => ungroup(groupId, cluster.id)}>
          <Ungroup className="size-3.5" />
          {translate('components.tabCluster.ungroup', 'Ungroup')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onClose}>
          <X className="size-3.5" />
          {translate('components.tabCluster.close', 'Close Group')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
