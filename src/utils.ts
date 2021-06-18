import { readFileSync } from 'fs'

export function readIntelHex(path: string, mem: Uint8Array) {
  readFileSync(path).toString().split('\n').forEach(line => {
    if (line.length > 11) {
      const bytes = parseInt(line.substring(1, 3), 16)
      const address = parseInt(line.substring(3, 7), 16)
      const type = line.substring(7, 9)
      if (type == '00') {
        for (let i = 0; i < bytes; i += 1)
          mem[address + i] = parseInt(line.substring(9 + i * 2, 11 + i * 2), 16)
      }
    }
  })
}