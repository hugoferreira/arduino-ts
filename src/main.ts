import { avrcpu } from "./avrcpu"
import { readIntelHex, dumpRAM, dumpInfo } from "./utils"

const flash = new Uint8Array(0xFFFF)
flash.fill(0)
readIntelHex('./hexdumps/Blink-no-arduino.hex', flash)

const sram = new Uint8Array(0x08FF + 0x100 + 1)
sram.fill(0)

const cpu = new avrcpu(flash, sram)

// TODO: Use an appropriate ncurses library
console.clear()            // Clear Console
console.log('\u001b[?25l') // Hide Cursor
setInterval(() => {
  console.log('\u001b[f')  // Mov to Top Right
  dumpRAM(sram)
  console.log()
  dumpInfo(cpu)
  console.log()
  cpu.step()
}, 10)