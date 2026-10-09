// @ts-ignore
import * as wasm from './pkg/sheep_spindle.js'

let initialized = false

export async function initWasm() {
  initialized = true
  return wasm
}

export function getWasm() {
  if (!initialized) throw new Error('WASM not initialized. Call initWasm() first.')
  return wasm
}

export function isWasmReady() {
  return initialized
}
