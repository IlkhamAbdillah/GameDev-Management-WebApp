import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, formatBytes, previewKindOf, validateFile } from './assetUi'

const file = (name: string, size = 10) => ({ name, size }) as File

describe('validateFile', () => {
  it('accepts allowed types, case-insensitively', () => {
    for (const name of ['a.glb', 'a.PNG', 'a.jpeg', 'a.fbx', 'a.wav', 'a.zip']) expect(validateFile(file(name))).toBeNull()
  })

  it('rejects unknown types, empty and oversized files', () => {
    expect(validateFile(file('virus.exe'))).toMatch(/not allowed/)
    expect(validateFile(file('noextension'))).toMatch(/not allowed/)
    expect(validateFile(file('a.png', 0))).toMatch(/empty/)
    expect(validateFile(file('a.png', MAX_UPLOAD_BYTES + 1))).toMatch(/too large/)
  })
})

describe('previewKindOf', () => {
  it('matches the server preview rules', () => {
    expect(previewKindOf('hero.glb')).toBe('model')
    expect(previewKindOf('shot.WEBP')).toBe('image')
    expect(previewKindOf('theme.ogg')).toBe('audio')
    for (const name of ['mesh.fbx', 'mesh.obj', 'scene.gltf', 'pack.zip']) expect(previewKindOf(name)).toBe('')
  })
})

describe('formatBytes', () => {
  it('uses B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
