import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('created repo groups survive expanding other repos when catalog refresh arrives first', async ({
  orcaPage,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-group-visibility-')))
  registerPostElectronShutdownCleanup(async () => {
    rmSync(root, { recursive: true, force: true })
  })
  const paths = Array.from({ length: 30 }, (_, index) =>
    path.join(root, `repo-${String(index).padStart(2, '0')}`)
  )
  for (const repoPath of paths) {
    mkdirSync(repoPath)
    execFileSync('git', ['init'], { cwd: repoPath, stdio: 'pipe' })
    writeFileSync(path.join(repoPath, 'seed.txt'), 'seed\n')
    execFileSync('git', ['add', '.'], { cwd: repoPath, stdio: 'pipe' })
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'seed'
      ],
      {
        cwd: repoPath,
        stdio: 'pipe'
      }
    )
  }
  const repoIds = await orcaPage.evaluate(async (paths) => {
    const store = window.__store!
    for (const repoPath of paths) {
      await window.api.repos.add({ path: repoPath })
    }
    await store.getState().awaitLocalRepoCatalogSettlement()
    const repos = store.getState().repos.filter((repo) => paths.includes(repo.path))
    for (const repo of repos) {
      await store.getState().fetchWorktrees(repo.id)
    }
    store.getState().setGroupBy('repo')
    store.getState().setProjectOrderBy('manual')
    return repos.map((repo) => repo.id)
  }, paths)
  expect(repoIds).toHaveLength(paths.length)

  // Let the real repos:changed refresh land before releasing the real create response.
  await electronApp.evaluate(({ ipcMain }) => {
    if (!('_invokeHandlers' in ipcMain) || !(ipcMain._invokeHandlers instanceof Map)) {
      throw new Error('Electron invoke handlers unavailable')
    }
    const create = ipcMain._invokeHandlers.get('projectGroups:create')
    if (typeof create !== 'function') {
      throw new Error('Group create handler unavailable')
    }
    const gate = Promise.withResolvers<void>()
    Reflect.set(globalThis, '__releaseGroupCreateResponse', gate.resolve)
    ipcMain.removeHandler('projectGroups:create')
    ipcMain.handle('projectGroups:create', async (...args) => {
      const group = await create(...args)
      await gate.promise
      return group
    })
  })
  const creation = orcaPage.evaluate(() =>
    window.__store!.getState().createProjectGroup('Crowded group')
  )
  await expect
    .poll(() =>
      orcaPage.evaluate(() =>
        window.__store!.getState().projectGroups.some((group) => group.name === 'Crowded group')
      )
    )
    .toBe(true)
  await electronApp.evaluate(() => {
    const release = Reflect.get(globalThis, '__releaseGroupCreateResponse')
    if (typeof release !== 'function') {
      throw new Error('Group create response gate unavailable')
    }
    release()
    Reflect.deleteProperty(globalThis, '__releaseGroupCreateResponse')
  })
  const createdGroup = await creation
  if (!createdGroup) {
    throw new Error('Group creation failed')
  }
  await orcaPage.evaluate(
    async ({ repoIds, groupId }) => {
      const store = window.__store!
      for (const repoId of repoIds.slice(0, 2)) {
        await store.getState().moveProjectToGroup(repoId, groupId)
      }
      const collapsedGroups = store
        .getState()
        .projectHostSetups.map((setup) => `project:${setup.projectId}`)
      await window.api.ui.set({ groupBy: 'repo', collapsedGroups })
      store.setState({ collapsedGroups: new Set(collapsedGroups) })
    },
    { repoIds, groupId: createdGroup.id }
  )

  const scroller = orcaPage.locator('[data-worktree-sidebar]')
  const group = scroller.locator(`[data-project-group-header-id="${createdGroup.id}"]`)
  const groupedRepos = repoIds
    .slice(0, 2)
    .map((id) => scroller.locator(`[data-repo-header-id="${id}"]`))
  for (const repo of groupedRepos) {
    await expect(repo).toBeVisible()
  }
  await orcaPage.screenshot({ path: testInfo.outputPath('before-expansion.png') })
  for (const repoId of repoIds.slice(2, 12)) {
    const repo = scroller.locator(`[data-repo-header-id="${repoId}"]`)
    await expect
      .poll(async () => {
        if (await repo.count()) {
          return true
        }
        await scroller.evaluate((element) => {
          element.scrollTop += element.clientHeight / 2
        })
        return false
      })
      .toBe(true)
    await repo.scrollIntoViewIfNeeded()
    await expect(repo).toHaveAttribute('aria-expanded', 'false')
    await repo.click()
    await scroller.evaluate((element) => {
      element.scrollTop = 0
    })
    for (const groupedRepo of groupedRepos) {
      await expect(groupedRepo).toBeVisible()
    }
  }
  await expect(group).toHaveCount(1)
  await group.click()
  for (const repo of groupedRepos) {
    await expect(repo).toHaveCount(0)
  }
  await group.click()
  for (const repo of groupedRepos) {
    await expect(repo).toBeVisible()
  }
  await orcaPage.screenshot({ path: testInfo.outputPath('after-expansion.png') })
})
