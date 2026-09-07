import { beforeEach, expect, it, vi } from 'vitest'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { createTestStore } from './store-test-helpers'

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
})

it.each([null, 'env-1'])(
  'keeps one group when catalog refresh wins the create response on host %s',
  async (runtimeEnvironmentId) => {
    const projectGroup: ProjectGroup = {
      id: 'group-1',
      name: 'Platform',
      parentPath: null,
      parentGroupId: null,
      createdFrom: 'manual',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 1,
      updatedAt: 1
    }
    const created = Promise.withResolvers<ProjectGroup>()
    const refreshedGroup = { ...projectGroup, name: 'Renamed after creation', updatedAt: 2 }
    const otherHostGroup = { ...projectGroup, executionHostId: 'runtime:other' }
    vi.stubGlobal('window', {
      api: {
        projectGroups: {
          create: () => created.promise,
          list: async () => [refreshedGroup]
        },
        runtimeEnvironments: {
          call: async (request: RuntimeEnvironmentCallRequest) =>
            createCompatibleRuntimeStatusResponseIfNeeded(request) ?? {
              id: 'rpc-project-group',
              ok: true,
              result:
                request.method === 'projectGroup.create'
                  ? { group: await created.promise }
                  : { groups: [refreshedGroup] }
            }
        }
      }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: runtimeEnvironmentId } as never,
      projectGroups: [otherHostGroup]
    })

    const pendingCreate = store.getState().createProjectGroup('Platform')
    await store.getState().fetchProjectGroups()
    created.resolve(projectGroup)
    await pendingCreate

    expect(store.getState().projectGroups).toEqual([
      otherHostGroup,
      {
        ...refreshedGroup,
        executionHostId: runtimeEnvironmentId ? `runtime:${runtimeEnvironmentId}` : 'local'
      }
    ])
  }
)
