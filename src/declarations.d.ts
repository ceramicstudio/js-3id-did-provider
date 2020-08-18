// not sure why this is needed
declare module 'ipfs' {
  export default any
}

declare module 'multihashes' {
  export function encode(digest: Buffer, code: number | string, length?: number): Buffer
}
