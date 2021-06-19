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

const highlight1 = (s: string) => [...s].map(s => s === '1' ? c.white('1') : c.grey('0') ).join('')
const mask1 = (s: string, mask: string) => [...s].map((s, i) => mask[i] === '1' ? c.white(s) : c.grey(s)).join('')

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
    const row = vals.map(b => stoh8(b))
      .map((s, j) => ((i * 16 + j) < 32) ? c.cyan(s) : s)
      .map(s => (s === '00') ? c.dim('00') : s)
      .map((s, j) => j === 8 ? ' ' + s : s)
      .join(' ')

    const ascii = vals.map(v => isPrintable(v) ? String.fromCharCode(v) : c.dim('.'))
      .map((s, j) => j === 8 ? ' ' + s : s)
      .join('')

    console.log(`${c.green(stoh8(i))}   ${row} ${ascii}`)
  }
}

export function dumpInfo(cpu: avrcpu) {
  const sreg = c.green('STATUS') + '\t' + [...'ITHSVNZC'].map((f, bit) => ((cpu.sreg >> (7 - bit)) & 1) ? f : '.').join('')
  const pc = c.green('PC') + '\t' + stoh16(cpu.pc)
  const sp = c.green('SP') + '\t' + stoh16(cpu.sp)
  const op = c.green('OP') + "\t" + stoh16(cpu.nextInstruction()) + '\t' + c.dim(stob16(cpu.nextInstruction()))

  const pinb = c.green('PINB') + '\t' + highlight1(stob8(cpu.peek(0x23)))
  const ddrb = c.green('DDRB') + '\t' + stob8(cpu.peek(0x24))
  const portb = c.green('PORTB') + '\t' + mask1(stob8(cpu.peek(0x25)), stob8(cpu.peek(0x24)))
  const pinc = c.green('PINC') + '\t' + highlight1(stob8(cpu.peek(0x26)))
  const ddrc = c.green('DDRC') + '\t' + stob8(cpu.peek(0x27))
  const portc = c.green('PORTC') + '\t' + mask1(stob8(cpu.peek(0x28)), stob8(cpu.peek(0x27)))
  const pind = c.green('PIND') + '\t' + highlight1(stob8(cpu.peek(0x29)))
  const ddrd = c.green('DDRD') + '\t' + stob8(cpu.peek(0x2A))
  const portd = c.green('PORTD') + '\t' + mask1(stob8(cpu.peek(0x2B)), stob8(cpu.peek(0x2A)))

  const x = c.green('X') + '\t' + stoh16(cpu.x) 
  const y = c.green('Y') + '\t' + stoh16(cpu.y)
  const z = c.green('Z') + '\t' + stoh16(cpu.z)

  console.log(`${pc}\t${sp}\t${op}`)
  console.log(`${x}\t${y}\t${z}\t${sreg}`)
  console.log()
  console.log(`${ddrb}\t${ddrc}\t${ddrd}`)
  console.log(`${portb}\t${portc}\t${portd}`)
  console.log(`${pinb}\t${pinc}\t${pind}`)
}