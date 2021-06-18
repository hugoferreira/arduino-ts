type ReadTrap = [handled: boolean, value: number]
type ReadHook = (address: number) => ReadTrap
type WriteHook = (address: number, value: number) => boolean

const stoh16 = (u16: number) => u16.toString(16).padStart(4, '0')
const stob16 = (u16: number) => u16.toString(2).padStart(16, '0')
const stoh8 = (u8: number) => u8.toString(16).padStart(2, '0')
const stob8 = (u8: number) => u8.toString(2).padStart(8, '0')
const bmatch = (a: number, match: number, mask: number) => (a & mask) == match
const signed7bit  = (x: number) => x & (1 <<  6) ? (x & ~(1 <<  6)) -  (2**6) : x
const signed12bit = (x: number) => x & (1 << 11) ? (x & ~(1 << 11)) - (2**11) : x

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
  #DATASPACE_BEGIN_ADDR = 0x100
  #DATASPACE_SIZE = 0x900
  #PERIPHERALS_BEGIN_ADDR = 0x20
  
  flashView: DataView
  sramView: Uint8Array
  registers: Uint8Array
  peripherals: Uint8Array
  
  pc: number = 0    // Program Counter
  
  // X, Y, Z Address Registers
  get x() { return this.registers[27] << 8 | this.registers[26] }
  get y() { return this.registers[29] << 8 | this.registers[28] }
  get z() { return this.registers[31] << 8 | this.registers[30] }

  incz() {
    if (this.registers[30] === 0xFF) this.registers[31] += 1
    this.registers[30] += 1
  }

  // Status and Flags (ITHSVNZC)
  get sreg() { return this.peripherals[0x3F] }
  set sreg(v: number) { this.peripherals[0x3F] = v }

  get I() { return this.sreg & flags.I }
  get T() { return this.sreg & flags.T }
  get H() { return this.sreg & flags.H }
  get S() { return this.sreg & flags.S }
  get V() { return this.sreg & flags.V }
  get N() { return this.sreg & flags.N }
  get Z() { return this.sreg & flags.Z }  // Do not confuse with z register
  get C() { return this.sreg & flags.C }

  setFlag(f: flags, v: boolean | number, clear: boolean = true) { 
    if (v) this.sreg |= f
    else if (clear) this.sreg &= ~f 
  }
  
  // Stack Pointer
  get sph() { return this.peripherals[0x5E] }
  set sph(v: number) { this.peripherals[0x5E] = v }
  get spl() { return this.peripherals[0x5D] }
  set spl(v: number) { this.peripherals[0x5D] = v }
  get sp() { return this.sph << 8 | this.spl }
  set sp(v: number) { this.spl = v & 0xFF; this.sph = (v >> 8) & 0xFF }

  // Register Names
  registerName = new Map([
    [0x23, "PINB"], [0x24, "DDRB"], [0x25, "PORTB"], 
    [0x26, "PINC"], [0x27, "DDRC"], [0x28, "PORTC"],
    [0x29, "PIND"], [0x2A, "DDRD"], [0x2B, "PORTD"],
    [0x3D, "SPL"],  [0x3E, "SPH"],  [0x3F, "SREG"],
    [0x6E, "TIMSK0"]])

  constructor(private flash: Uint8Array, private dataspace = new Uint8Array(0x08FF + 0x100 + 1)) {
    this.flashView = new DataView(this.flash.buffer, 0, this.flash.length)    
    this.sramView = new Uint8Array(this.dataspace.buffer, this.#DATASPACE_BEGIN_ADDR, this.dataspace.length - 0x100)
    this.registers = new Uint8Array(this.dataspace.buffer, 0, 32)
    this.peripherals = new Uint8Array(this.dataspace.buffer, this.#PERIPHERALS_BEGIN_ADDR, 224)

    this.onIORead(address => [true, this.peripherals[address]])
    this.onIOWrite((address, value) => {
      console.log(`${this.registerName.get(address)} set to ${stob8(value)}`)
      this.peripherals[address] = value
      return true 
    })
  }

  private readHooks = new Array<ReadHook>()
  private writeHooks = new Array<WriteHook>()

  onRead(hook: ReadHook) { this.readHooks.push(hook) }
  onWrite(hook: WriteHook) { this.writeHooks.push(hook)}

  peek(addr: number): number {
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
      console.log(`Unrecognized IO ${addr}`)
      return 0xFF
    } else return result[1]
  }

  pokeIO(addr: number, data: number): void {
    const result = this.writeIOHooks.some(h => h(addr, data))
    if (!result) console.log(`Unrecognized Peripheral ${addr}`)
  }

  updateFlags(r: number) {
    this.setFlag(flags.N, r & (1 << 7))     // Set/Clear N according to 8bit MSB
    this.setFlag(flags.Z, r === 0)          // Set/Clear Z if value is equal to Zero
    this.setFlag(flags.S, this.N ^ this.V)  // S is N xor V
  }

  updateFlagsW(r: number) {
    this.setFlag(flags.N, r & (1 << 15))    // Set/Clear N according to 16bit MSB
    this.setFlag(flags.Z, r === 0)          // Set/Clear Z if value is equal to Zero
    this.setFlag(flags.S, this.N ^ this.V)  // S is N xor V
  }

  step(debug: boolean = true) {
    const insn = this.flashView.getUint16(this.pc, true)
    
    if (debug) {
      const regs = Array(...this.registers).map(r => stoh8(r)).join(' ')
      const sreg = [...'ITHSVNZC'].map((f, bit) => ((this.sreg >> (7 - bit)) & 1) ? f : '.').join('')
      console.log(`${stoh16(this.pc)}: ${stoh16(insn)} ${stob16(insn)} ${sreg} ${regs}`)
    }

    let _pc = this.pc + 2

    // SEI: Set Global Interrupt Flag
    if (bmatch(insn, 0b1001_0100_0111_1000, 0b1111_1111_1111_1111)) { 
      this.setFlag(flags.I, 1)
    
    // SBI: Load an I/O Location to Register
    } else if (bmatch(insn, 0b1001_1010_0000_0000, 0b1111_1111_0000_0000)) {
      const A = ((insn >> 3) & 0b11111) + this.#PERIPHERALS_BEGIN_ADDR
      const b = insn & 0b111
      this.pokeIO(A, this.peek(A) | (1 << b))

    // CBI: Load an I/O Location to Register
    } else if (bmatch(insn, 0b1001_1000_0000_0000, 0b1111_1111_0000_0000)) {
      const A = ((insn >> 3) & 0b11111) + this.#PERIPHERALS_BEGIN_ADDR
      const b = insn & 0b111
      this.pokeIO(A, this.peek(A) & (~(1 << b) & 0xFF))

    // IN: Load an I/O Location to Register
    } else if (bmatch(insn, 0b1011_0000_0000_0000, 0b1111_1000_0000_0000)) {    
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
      this.setFlag(flags.V, 0)

    // ADD: Add without Carry
    } else if (bmatch(insn, 0b0000110000000000, 0b1111110000000000)) {
      const Rd = (insn >> 4) & 0b11111
      const Rr = (insn >> 5) & 0b10000 | (insn & 0b1111)
      const a = this.registers[Rd]
      const b = this.registers[Rr]
      const r = (a + b) & 0xFF
      this.registers[Rd] = r
      this.updateFlags(r)
      this.setFlag(flags.V, 
         (a & (1 << 7)) &  (b & (1 << 7)) & ~(r & (1 << 7)) |
        ~(a & (1 << 7)) & ~(b & (1 << 7)) &  (r & (1 << 7)))

    // ADC: Add with Carry
    } else if (bmatch(insn, 0b0001110000000000, 0b1111110000000000)) {
      const Rd = (insn >> 4) & 0b11111
      const Rr = (insn >> 5) & 0b10000 | (insn & 0b1111)
      const a = this.registers[Rd]
      const b = this.registers[Rr]
      const r = (a + b + this.C ? 1 : 0) & 0xFF
      this.registers[Rd] = r      
      this.updateFlags(r)
      this.setFlag(flags.V, 
         (a & (1 << 7)) &  (b & (1 << 7)) & ~(r & (1 << 7)) |
        ~(a & (1 << 7)) & ~(b & (1 << 7)) &  (r & (1 << 7)))

    // AND: Logical AND
    } else if (bmatch(insn, 0b0010000000000000, 0b1111110000000000)) {
      const Rd = (insn >> 4) & 0b11111
      const Rr = (insn >> 5) & 0b10000 | (insn & 0b1111)
      const result = this.registers[Rd] & this.registers[Rr]
      this.registers[Rd] = result
      this.updateFlags(result)
      this.setFlag(flags.V, 0)
    
    // LPM: Load Program Memory
    } else if (bmatch(insn, 0b1001000000000100, 0b1111111000001111)) {
      const Rd = (insn >> 4) & 0b11111
      const value = this.flash[this.z]
      this.registers[Rd] = value

    // BREQ: Branch if Equal
    } else if (bmatch(insn, 0b1111_0000_0000_0001, 0b1111_1100_0000_0111)) {
      if (this.Z)  // sets PC if Z flag is set
        _pc += signed7bit((insn >> 3) & 0b1111111) * 2

    // BRNE: Branch if Not Equal
    } else if (bmatch(insn, 0b1111_0100_0000_0001, 0b1111_1100_0000_0111)) {
      if (!this.Z)  // sets PC if Z flag is clear
        _pc += signed7bit((insn >> 3) & 0b1111111) * 2

    // RJMP: Relative Jump
    } else if (bmatch(insn, 0b1100_0000_0000_0000, 0b1111_0000_0000_0000)) {
      _pc += signed12bit(insn & 0b1111_1111_1111) * 2

    // LPM: Load Program Memory (Z+)
    } else if (bmatch(insn, 0b1001000000000101, 0b1111111000001111)) {
      const Rd = (insn >> 4) & 0b11111
      const value = this.flash[this.z]
      this.registers[Rd] = value
      this.incz()

    // LDI: Load Immediate
    } else if (bmatch(insn, 0b1110000000000000, 0b1111000000000000)) {
      const Rd = ((insn >> 4) & 0b1111) + 16
      const K = (insn >> 4) & 0b11110000 | (insn & 0b1111)
      this.registers[Rd] = K
    
    // MOVW: Copy Register Word
    } else if (bmatch(insn, 0b0000000100000000, 0b1111111100000000)) {
      const Rr = (insn & 0b1111) * 2
      const Rd = ((insn >> 4) & 0b1111) * 2
      this.registers[Rd] = this.registers[Rr]
      this.registers[Rd + 1] = this.registers[Rr + 1]

    // SBIW: Subtract Immediate from Word
    } else if (bmatch(insn, 0b1001_0111_0000_0000, 0b1111_1111_0000_0000)) {
      const K = (insn >> 2) & 0b110000 | (insn & 0b1111)
      const Rd = ((insn >> 4) & 0b11) * 2 + 24
      const value = ((this.registers[Rd + 1] << 8 | this.registers[Rd]) - K) 
      this.registers[Rd + 1] = (value >> 8) & 0xFF 
      this.registers[Rd] = value & 0xFF
      this.updateFlagsW(value)

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