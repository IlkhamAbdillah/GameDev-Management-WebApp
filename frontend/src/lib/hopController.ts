import type { HopFn } from './flowModel'

/** Lets code outside the diagram (the test orchestrators) send a packet along an edge. */
export interface HopController {
  hop: HopFn
  bind: (fn: HopFn | null) => void
}

export function createHopController(): HopController {
  let impl: HopFn | null = null
  return {
    hop: (from, to, options) => (impl ? impl(from, to, options) : Promise.resolve()),
    bind: (fn) => {
      impl = fn
    },
  }
}
