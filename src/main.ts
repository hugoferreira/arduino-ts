import { avrcpu } from "./avrcpu"
import { readIntelHex } from "./utils"

const mem = new Uint8Array(0xFFFF)
mem.fill(0)
readIntelHex('./hexdumps/Blink-no-arduino.hex', mem)

const cpu = new avrcpu(mem)
for (let i = 0; i < 8000; i+=1) cpu.step(false) 
