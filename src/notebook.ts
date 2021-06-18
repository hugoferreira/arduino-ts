import { avrcpu } from "./avrcpu"
import { readIntelHex } from "./utils"

const mem = new Uint8Array(0xFFFF)
mem.fill(0)
const cpu = new avrcpu(mem)

readIntelHex('./hexdumps/Blink-PB5.hex', mem)

cpu.pc = 0x124
for (let i = 0; i < 8000; i+=1) cpu.step(false) 
