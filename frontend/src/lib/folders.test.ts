import { describe, expect, it } from 'vitest'
import type { Folder } from '../types'
import { folderChain, folderOptions, folderPath, subtreeIds } from './folders'

const f = (folderId: string, name: string, parentId = ''): Folder => ({ folderId, name, parentId, createdAt: '', updatedAt: '' })
const tree = [f('a', 'Characters'), f('b', 'Hero', 'a'), f('c', 'Weapons', 'b'), f('d', 'Audio')]

describe('folder helpers', () => {
  it('builds the chain and path from the top level down', () => {
    expect(folderChain(tree, 'c').map((x) => x.name)).toEqual(['Characters', 'Hero', 'Weapons'])
    expect(folderPath(tree, 'c')).toBe('Characters / Hero / Weapons')
    expect(folderChain(tree, '')).toEqual([])
    expect(folderChain(tree, 'missing')).toEqual([])
  })

  it('collects a folder and all its descendants', () => {
    expect([...subtreeIds(tree, 'a')].sort()).toEqual(['a', 'b', 'c'])
    expect([...subtreeIds(tree, 'd')]).toEqual(['d'])
  })

  it('offers sorted path options and can exclude a subtree (for moving)', () => {
    expect(folderOptions(tree).map((o) => o.label)).toEqual(['Audio', 'Characters', 'Characters / Hero', 'Characters / Hero / Weapons'])
    expect(folderOptions(tree, subtreeIds(tree, 'a')).map((o) => o.id)).toEqual(['d'])
  })

  it('does not loop forever on corrupt cyclic data', () => {
    const cyclic = [f('x', 'X', 'y'), f('y', 'Y', 'x')]
    expect(folderChain(cyclic, 'x').length).toBeLessThanOrEqual(2)
  })
})
