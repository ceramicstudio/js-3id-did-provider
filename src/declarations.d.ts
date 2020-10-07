// not sure why this is needed
declare module 'ipfs' {
  export type Ipfs = any
}

declare module 'uint8arrays' {
  export function toString(b: Uint8Array, enc?: string): string
  export function fromString(s: string, enc?: string): Uint8Array
  export function concat(bs: Array<Uint8Array>): Uint8Array
}
