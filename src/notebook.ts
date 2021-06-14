import { readFileSync } from 'fs'

import { avrcpu } from "./main"
import { op } from "./microcode"

const mem = new Uint8Array(0xFFFF)
mem.fill(0)
const cpu = new avrcpu(mem)

function readIntelHex(path: string, mem: Uint8Array) {
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

readIntelHex('./hexdumps/Blink-PB5.cpp.hex', mem)

cpu.pc = 0x124
for (let i = 0; i < 8000; i+=1) cpu.step(false) 
