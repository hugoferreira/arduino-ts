import { readFileSync } from 'fs'
import { avrcpu } from './avrcpu'
import * as c from 'colors'

const isPrintable = (keycode: number) => (keycode >= 32 && keycode < 127)

export const stoh16 = (u16: number) => u16.toString(16).padStart(4, '0').toUpperCase()
export const stob16 = (u16: number) => u16.toString(2).padStart(16, '0')
export const stoh8 = (u8: number) => u8.toString(16).padStart(2, '0').toUpperCase()
export const stob8 = (u8: number) => u8.toString(2).padStart(8, '0')
export const bmatch = (a: number, match: number, mask: number) => (a & mask) == match
export const signed7bit = (x: number) => x & (1 << 6) ? (x & ~(1 << 6)) - (2 ** 6) : x
export const signed12bit = (x: number) => x & (1 << 11) ? (x & ~(1 << 11)) - (2 ** 11) : x

const shade0 = (s: string) => [...s].map(s => s === '1' ? '1' : c.dim('0') ).join('')

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

export function dumpRAM(ram: Uint8Array) {
  console.log(c.green('     00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F\n'))
  for (let i = 0; i < 16; i += 1) {
    const vals = Array<number>(...ram.subarray(i * 16, (i + 1) * 16).values())
    const row = vals.map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      .map((s, j) => ((i * 16 + j) < 32) ? c.cyan(s) : s)
      .map(s => (s === '00') ? c.dim('00') : s)
      .map((s, j) => j === 8 ? ' ' + s : s)
      .join(' ')

    const ascii = vals.map(v => isPrintable(v) ? String.fromCharCode(v) : c.dim('.'))
      .map((s, j) => j === 8 ? ' ' + s : s)
      .join('')

    console.log(`${c.green(i.toString(16).toUpperCase().padEnd(2, '0'))}   ${row} ${ascii}`)
  }
}

export function dumpInfo(cpu: avrcpu) {
  const sreg = c.green('SREG') + '\t' + [...'ITHSVNZC'].map((f, bit) => ((cpu.sreg >> (7 - bit)) & 1) ? f : '.').join('')
  const pc = c.green('PC') + '\t' + stoh16(cpu.pc)
  const sp = c.green('SP') + '\t' + stoh16(cpu.sp)
  const instruction = c.green('OP') + "\t" + stoh16(cpu.nextInstruction()) + '  ' + c.dim(stob16(cpu.nextInstruction()))
  const ddrb = c.green('DDRB') + '\t' + shade0(stob8(cpu.peripherals[0x24]))
  const portb = c.green('PORTB') + '\t' + shade0(stob8(cpu.peripherals[0x25]))

  console.log(`${pc}\t\t${instruction}`)
  console.log(`${sp}\t\t${sreg}`)
  console.log(`${ddrb}\t${portb}`)
  c.enable
}