import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import {
  getRuntimeEnvironmentIdForWorktree,
  type WorktreeRuntimeOwnerState
} from '@/lib/worktree-runtime-owner'
import { isWebRuntimeSessionActive } from '../../runtime/web-runtime-session-environment'

export function canSplitTabClusterLocally(
  state: WorktreeRuntimeOwnerState,
  worktreeId: string
): boolean {
  if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
    return false
  }
  // Why: the single-tab mirror protocol cannot target the host's newly generated split pane id.
  return !isWebRuntimeSessionActive(getRuntimeEnvironmentIdForWorktree(state, worktreeId))
}
