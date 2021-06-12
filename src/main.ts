type ReadTrap = [handled: boolean, value: number]
type ReadHook = (address: number) => ReadTrap
type WriteHook = (address: number, value: number) => boolean

const stoh16 = (u16: number) => u16.toString(16).padStart(4, '0')
const stob16 = (u16: number) => u16.toString(2).padStart(16, '0')
const stoh8 = (u8: number) => u8.toString(16).padStart(2, '0')
const stob8 = (u8: number) => u8.toString(2).padStart(8, '0')
const bmatch = (a: number, match: number, mask: number) => (a & mask) == match
const signed7bit = (x: number) => x & 0b1000000 ? (x & ~(1 << 6)) - 64 : x

enum flags {
  C = 0b00000001,
  Z = 0b00000010,
  N = 0b00000100,
  V = 0b00001000,
  S = 0b00010000,
  H = 0b00100000,
  T = 0b01000000,
  I = 0b10000000
}

export class avrcpu {
  flashView: DataView
  sramView: Uint8Array
  registers: Uint8Array
  peripherals: Uint8Array
  
  pc: number = 0    // Program Counter
  sreg: number = 0  // ITHSVNZC
  
  get x() { return this.registers[27] << 8 | this.registers[26] }
  get y() { return this.registers[29] << 8 | this.registers[28] }
  get z() { return this.registers[31] << 8 | this.registers[30] }

  incZ() {
    if (this.registers[30] === 0xFF) this.registers[31] += 1
    this.registers[30] += 1
  }

  peripheralsName = new Map([[0x24, "DDRB"], [0x25, "PORTB"], [0x6E, "TIMSK0"]])

  constructor(private flash: Uint8Array, private dataspace = new Uint8Array(0x08FF + 0x100 + 1)) {
    this.flashView = new DataView(this.flash.buffer, 0, this.flash.length)    
    this.sramView = new Uint8Array(this.dataspace.buffer, 0x100, this.dataspace.length - 0x100)
    this.registers = new Uint8Array(this.dataspace.buffer, 0, 32)
    this.peripherals = new Uint8Array(this.dataspace.buffer, 0x20, 224)

    this.onIORead(address => [true, this.peripherals[address]])
    this.onIOWrite((address, value) => {
      console.log(`${this.peripheralsName.get(address)} set to ${stob8(value)}`)
      this.peripherals[address] = value
      return true 
    })
  }

  private readHooks = new Array<ReadHook>()
  private writeHooks = new Array<WriteHook>()

  onRead(hook: ReadHook) { this.readHooks.push(hook) }
  onWrite(hook: WriteHook) { this.writeHooks.push(hook)}

  peek(addr: number): number {
    console.log(`Load from peripheral ${this.peripheralsName.get(addr)}`)
    const result = this.readHooks.reduce((acc, h) => (!acc[0]) ? h(addr) : acc, [false, 0] as ReadTrap)
    return result[0] ? result[1] : this.dataspace[addr]
  }

  poke(addr: number, data: number): void {
    if (!this.writeHooks.some(h => h(addr, data))) 
      this.flash[addr] = data
  }

  private readIOHooks = new Array<ReadHook>()
  private writeIOHooks = new Array<WriteHook>()

  onIORead(hook: ReadHook) { this.readIOHooks.push(hook) }
  onIOWrite(hook: WriteHook) { this.writeIOHooks.push(hook) }

  peekIO(addr: number): number {
    const result = this.readIOHooks.reduce((acc, h) => (!acc[0]) ? h(addr) : acc, [false, 0] as ReadTrap)
    if (!result[0]) {
      console.log(`Unrecognized Peripheral ${addr}`)
      return 0xFF
    } else return result[1]
  }

  pokeIO(addr: number, data: number): void {
    const result = this.writeIOHooks.some(h => h(addr, data))
    if (!result) console.log(`Unrecognized Peripheral ${addr}`)
  }

  updateFlags(result: number) {
    this.sreg &= ~flags.V // Clear V

    // Set/Clear N and S according to MSB (since V is always 0)
    if (result & (1 << 7)) this.sreg |= flags.N | flags.S
    else this.sreg &= ~(flags.N | flags.S)

    // Set/Clear Z if value is equal to Zero
    if (result === 0) this.sreg |= flags.Z
    else this.sreg &= ~flags.Z
  }

  step() {
    const insn = this.flashView.getUint16(this.pc, true)
    const regs = Array(...this.registers).map(r => stoh8(r)).join(' ')
    const sreg = [...'ITHSVNZC'].map((f, bit) => ((this.sreg >> (7 - bit)) & 1) ? f : '.').join('')
    console.log(`${stoh16(this.pc)}: ${stoh16(insn)} ${stob16(insn)} ${sreg} ${regs}`)

    let _pc = this.pc + 2

    // SEI: Set Global Interrupt Flag
    if (bmatch(insn, 0b1001010001111000, 0b1111111111111111)) {        
      this.sreg |= flags.I 
    
    // IN: Load an I/O Location to Register
    } else if (bmatch(insn, 0b1011000000000000, 0b1111100000000000)) {    
      const Rd = (insn >> 4) & 0b11111
      const A = ((insn >> 5) & 0b110000) | (insn & 0b1111)
      this.registers[Rd] = this.peekIO(A) 
           
    // OUT: Store Register to I/O Location
    } else if (bmatch(insn, 0b1011100000000000, 0b1111100000000000)) {    
      const Rd = (insn >> 4) & 0b11111
      const A = ((insn >> 5) & 0b110000) | (insn & 0b1111)
      this.pokeIO(A, this.registers[Rd])

    // ORI: Logical OR with Immediate
    } else if (bmatch(insn, 0b0110000000000000, 0b1111000000000000)) {
      const Rd = ((insn >> 4) & 0b1111) + 16
      const K = (insn >> 4) & 0b11110000 | (insn & 0b1111)
      const result = this.registers[Rd] | K
      this.registers[Rd] = result
      this.updateFlags(result)

    // AND: Logical AND
    } else if (bmatch(insn, 0b0010000000000000, 0b1111110000000000)) {
      const Rd = (insn >> 4) & 0b11111
      const Rr = (insn >> 5) & 0b10000 | (insn & 0b1111)
      const result = this.registers[Rd] & this.registers[Rr]
      this.registers[Rd] = result
      this.updateFlags(result)
    
    // LPM: Load Program Memory
    } else if (bmatch(insn, 0b1001000000000100, 0b1111111000001111)) {
      const Rd = (insn >> 4) & 0b11111
      const value = this.flash[this.z]
      this.registers[Rd] = value

    // BREQ: Branch if Equal
    } else if (bmatch(insn, 0b1111000000000001, 0b1111110000000001)) {
      if (this.sreg & flags.Z)  // sets PC if Z flag is set
        _pc += signed7bit((insn >> 3) & 0b1111111) * 2 + 2
 
    // LPM: Load Program Memory (Z+)
    } else if (bmatch(insn, 0b1001000000000101, 0b1111111000001111)) {
      const Rd = (insn >> 4) & 0b11111
      const value = this.flash[this.z]
      this.registers[Rd] = value
      this.incZ()

    // LDI: Load Immediate
    } else if (bmatch(insn, 0b1110000000000000, 0b1111000000000000)) {
      const Rd = ((insn >> 4) & 0b1111) + 16
      const K = (insn >> 4) & 0b11110000 | (insn & 0b1111)
      this.registers[Rd] = K
    
    // LDS: Load Direct from Data Space
    } else if (bmatch(insn, 0b1001000000000000, 0b1111111000001111)) {
      const Rd = (insn >> 4) & 0b11111
      const k = this.flashView.getUint16(_pc, true)
      const value = this.peek(k)
      this.registers[Rd] = value
      _pc += 2
    
    // STS: Store Direct to Data Space
    } else if (bmatch(insn, 0b1001001000000000, 0b1111111000001111)) {
      const Rd = (insn >> 4) & 0b11111
      const k = this.flashView.getUint16(_pc, true)
      this.poke(k, this.registers[Rd])
      _pc += 2
    } else {
      console.log(`Undefined Opcode: ${stob16(insn)}`)
    }

    this.pc = _pc
  }
}