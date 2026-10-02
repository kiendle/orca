import { describe, expect, it } from 'vitest'
import { tabClusterSchema } from './workspace-session-tab-cluster-schema'

const cluster = {
  id: 'cluster',
  name: 'Work',
  color: 'blue',
  collapsed: true,
  tabIds: ['a', 'b']
}

describe('tab cluster sticky member schema', () => {
  it('discards corrupt shownTabId without losing valid cluster metadata', () => {
    const parsed = tabClusterSchema.parse({ ...cluster, shownTabId: 42 })
    expect(parsed).toMatchObject(cluster)
    expect(parsed.shownTabId).toBeUndefined()
  })
})
