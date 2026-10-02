import { useCallback, useRef, useState } from 'react'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'

export function useTabStripRename({
  value,
  onCommit,
  autoStart = false
}: {
  value: string
  onCommit: (value: string) => void
  autoStart?: boolean
}) {
  const [isEditing, setIsEditing] = useState(autoStart)
  const [renameValue, setRenameValue] = useState(autoStart ? value : '')
  const renameFocusFrameRef = useRef<number | null>(null)
  const resolvedRef = useRef(false)

  const handleRenameOpen = useCallback(() => {
    resolvedRef.current = false
    // Why: background title updates must not replace a name the user is editing.
    setRenameValue(value)
    setIsEditing(true)
  }, [value])

  const commitRename = useCallback(() => {
    if (resolvedRef.current) {
      return
    }
    // Why: the input's trailing blur must not commit after Enter or Escape.
    resolvedRef.current = true
    onCommit(renameValue.trim())
    setIsEditing(false)
  }, [onCommit, renameValue])

  const cancelRename = useCallback(() => {
    resolvedRef.current = true
    setIsEditing(false)
  }, [])

  const setRenameInputElement = useCallback((input: HTMLInputElement | null) => {
    if (renameFocusFrameRef.current !== null) {
      cancelAnimationFrame(renameFocusFrameRef.current)
      renameFocusFrameRef.current = null
    }
    if (!input) {
      return
    }
    // Why: Radix focus restoration must finish before the newly mounted field takes focus.
    renameFocusFrameRef.current = requestAnimationFrame(() => {
      renameFocusFrameRef.current = null
      input.focus()
      input.select()
    })
  }, [])

  const onRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation()
    if (isImeCompositionKeyDown(event)) {
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      commitRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelRename()
    }
  }

  return {
    isEditing,
    renameValue,
    setRenameValue,
    handleRenameOpen,
    commitRename,
    setRenameInputElement,
    onRenameKeyDown
  }
}
