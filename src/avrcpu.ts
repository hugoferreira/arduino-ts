import { bmatch, signed12bit, signed7bit, stob16, stob8 } from './utils'

type ReadTrap = [handled: boolean, value: number]
type ReadHook = (address: number) => ReadTrap
type WriteHook = (address: number, value: number) => boolean

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
  #PERIPHERALS_BEGIN_ADDR = 0x20
  
  flashView: DataView
  sramView: Uint8Array
  registers: Uint8Array
  peripherals: Uint8Array

  debug: boolean = false
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
  
  // Stack
  get sph() { return this.peripherals[0x5E] }
  set sph(v: number) { this.peripherals[0x5E] = v }
  get spl() { return this.peripherals[0x5D] }
  set spl(v: number) { this.peripherals[0x5D] = v }
  get sp() { return this.sph << 8 | this.spl }
  set sp(v: number) { this.spl = v & 0xFF; this.sph = (v >> 8) & 0xFF }

  push8(v: number) { 
    this.sramView[this.sp--] = v & 0xFF
  }

  push16(v: number) { 
    this.sramView[this.sp--] = v & 0xFF
    this.sramView[this.sp--] = (v >> 8) & 0xFF
  }

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
  }

  private readHooks = new Array<ReadHook>()
  private writeHooks = new Array<WriteHook>()

  onRead(hook: ReadHook) { this.readHooks.push(hook) }
  onWrite(hook: WriteHook) { this.writeHooks.push(hook)}

  peek(addr: number): number {
    const result = this.readHooks.reduce((acc, h) => (!acc[0]) ? h(addr) : acc, [false, 0] as ReadTrap)
    return result[0] ? result[1] : this.dataspace[addr]
  }

  poke(addr: number, data: number) {
    if (this.debug && this.registerName.has(addr)) 
      console.log(`${this.registerName.get(addr)} set to ${stob8(data)}`)

    if (!this.writeHooks.some(h => h(addr, data)))
      this.dataspace[addr] = data
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

  nextInstruction() { return this.flashView.getUint16(this.pc, true) }

  #insn: number = 0
  #_pc: number = 0

  opcodes = new Array<[number, number, () => void]>(
    [0b1001_0100_0111_1000, 0b1111_1111_1111_1111, this.sei],
    [0b1001_0000_0000_0100, 0b1111_1110_0000_1111, this.lpm],
    [0b1001_0000_0000_0101, 0b1111_1110_0000_1111, this.lpmzi],
    [0b1001_0000_0000_0000, 0b1111_1110_0000_1111, this.lds],
    [0b1001_0010_0000_0000, 0b1111_1110_0000_1111, this.sts],
    [0b1001_0100_0000_1100, 0b1111_1110_0000_1110, this.jmp],
    [0b1001_0100_0000_1110, 0b1111_1110_0000_1110, this.call],
    [0b1111_0000_0000_0001, 0b1111_1100_0000_0111, this.breq],
    [0b1111_0100_0000_0001, 0b1111_1100_0000_0111, this.brne],
    [0b1001_1010_0000_0000, 0b1111_1111_0000_0000, this.sbi],
    [0b1001_1000_0000_0000, 0b1111_1111_0000_0000, this.cbi],
    [0b0000_0001_0000_0000, 0b1111_1111_0000_0000, this.movw],
    [0b1001_0111_0000_0000, 0b1111_1111_0000_0000, this.sbiw],
    [0b0010_0100_0000_0000, 0b1111_1100_0000_0000, this.eor],
    [0b0000_1100_0000_0000, 0b1111_1100_0000_0000, this.add],
    [0b0001_1100_0000_0000, 0b1111_1100_0000_0000, this.adc],
    [0b0010_0000_0000_0000, 0b1111_1100_0000_0000, this.and],
    [0b1011_0000_0000_0000, 0b1111_1000_0000_0000, this.in],
    [0b1011_1000_0000_0000, 0b1111_1000_0000_0000, this.out],
    [0b0110_0000_0000_0000, 0b1111_0000_0000_0000, this.ori],
    [0b1100_0000_0000_0000, 0b1111_0000_0000_0000, this.rjmp],
    [0b1110_0000_0000_0000, 0b1111_0000_0000_0000, this.ldi],
  )
  
  // SEI: Set Global Interrupt Flag
  sei() {
    this.setFlag(flags.I, 1)
  }

  // SBI: Load an I/O Location to Register
  sbi() {
    const A = ((this.#insn >> 3) & 0b11111) + this.#PERIPHERALS_BEGIN_ADDR
    const b = this.#insn & 0b111
    this.poke(A, this.peek(A) | (1 << b))
  }

  // CBI: Load an I/O Location to Register
  cbi() {
    const A = ((this.#insn >> 3) & 0b11111) + this.#PERIPHERALS_BEGIN_ADDR
    const b = this.#insn & 0b111
    this.poke(A, this.peek(A) & (~(1 << b) & 0xFF))
  }

  // IN: Load an I/O Location to Register
  in() {
    const Rd = (this.#insn >> 4) & 0b11111
    const A = ((this.#insn >> 5) & 0b110000) | (this.#insn & 0b1111)
    this.registers[Rd] = this.peek(A)
  }

  // OUT: Store Register to I/O Location
  out() {
    const Rd = (this.#insn >> 4) & 0b11111
    const A = ((this.#insn >> 5) & 0b110000) | (this.#insn & 0b1111)
    this.poke(A, this.registers[Rd])
  }

  // ORI: Logical OR with Immediate
  ori() {
    const Rd = ((this.#insn >> 4) & 0b1111) + 16
    const K = (this.#insn >> 4) & 0b11110000 | (this.#insn & 0b1111)
    const result = this.registers[Rd] | K
    this.registers[Rd] = result
    this.updateFlags(result)
    this.setFlag(flags.V, 0)
  }

  // EOR: Exclusive OR
  eor() {
    const Rd = (this.#insn >> 4) & 0b11111
    const Rr = ((this.#insn >> 5) & 0b10000) | (this.#insn & 0b1111)
    const result = this.registers[Rd] ^ this.registers[Rr]
    this.registers[Rd] = result
    this.updateFlags(result)
    this.setFlag(flags.V, 0)
  }

  // ADD: Add without Carry
  add() {
    const Rd = (this.#insn >> 4) & 0b11111
    const Rr = (this.#insn >> 5) & 0b10000 | (this.#insn & 0b1111)
    const a = this.registers[Rd]
    const b = this.registers[Rr]
    const r = (a + b) & 0xFF
    this.registers[Rd] = r
    this.updateFlags(r)
    this.setFlag(flags.V,
      (a & (1 << 7)) & (b & (1 << 7)) & ~(r & (1 << 7)) |
      ~(a & (1 << 7)) & ~(b & (1 << 7)) & (r & (1 << 7)))
  }

  // ADC: Add with Carry
  adc() {
    const Rd = (this.#insn >> 4) & 0b11111
    const Rr = (this.#insn >> 5) & 0b10000 | (this.#insn & 0b1111)
    const a = this.registers[Rd]
    const b = this.registers[Rr]
    const r = (a + b + this.C ? 1 : 0) & 0xFF
    this.registers[Rd] = r
    this.updateFlags(r)
    this.setFlag(flags.V,
      (a & (1 << 7)) & (b & (1 << 7)) & ~(r & (1 << 7)) |
      ~(a & (1 << 7)) & ~(b & (1 << 7)) & (r & (1 << 7)))
  }

  // AND: Logical AND
  and() {
    const Rd = (this.#insn >> 4) & 0b11111
    const Rr = (this.#insn >> 5) & 0b10000 | (this.#insn & 0b1111)
    const result = this.registers[Rd] & this.registers[Rr]
    this.registers[Rd] = result
    this.updateFlags(result)
    this.setFlag(flags.V, 0)
  }

  // LPM: Load Program Memory
  lpm() {
    const Rd = (this.#insn >> 4) & 0b11111
    const value = this.flash[this.z]
    this.registers[Rd] = value
  }

  // LPM: Load Program Memory (Z+)
  lpmzi() {
    const Rd = (this.#insn >> 4) & 0b11111
    const value = this.flash[this.z]
    this.registers[Rd] = value
    this.incz()
  }

  // BREQ: Branch if Equal
  breq() {
    if (this.Z)  // sets PC if Z flag is set
      this.#_pc += signed7bit((this.#insn >> 3) & 0b1111111) * 2
  }

  // BRNE: Branch if Not Equal
  brne() {
    if (!this.Z)  // sets PC if Z flag is clear
      this.#_pc += signed7bit((this.#insn >> 3) & 0b1111111) * 2
  }

  // RJMP: Relative Jump
  rjmp() {
    this.#_pc += signed12bit(this.#insn & 0b1111_1111_1111) * 2
  }

  // JMP: Unconditional Jump
  jmp() {
    const ki = this.flashView.getUint16(this.#_pc, true)
    const k = (((this.#insn >> 4) & 0b11111)) << 18 | ((this.#insn & 0b1) << 17) | ki
    this.#_pc = k * 2
  }

  // CALL: Long Call to a Subroutine
  call() {
    const ki = this.flashView.getUint16(this.#_pc, true)
    const k = (((this.#insn >> 4) & 0b11111)) << 18 | ((this.#insn & 0b1) << 17) | ki
    this.push16(this.#_pc)
    this.#_pc = k * 2
  }

  // LDI: Load Immediate
  ldi() {
    const Rd = ((this.#insn >> 4) & 0b1111) + 16
    const K = (this.#insn >> 4) & 0b11110000 | (this.#insn & 0b1111)
    this.registers[Rd] = K
  }

  // MOVW: Copy Register Word
  movw() {
    const Rr = (this.#insn & 0b1111) * 2
    const Rd = ((this.#insn >> 4) & 0b1111) * 2
    this.registers[Rd] = this.registers[Rr]
    this.registers[Rd + 1] = this.registers[Rr + 1]
  }

  // SBIW: Subtract Immediate from Word
  sbiw() {
    const K = (this.#insn >> 2) & 0b110000 | (this.#insn & 0b1111)
    const Rd = ((this.#insn >> 4) & 0b11) * 2 + 24
    const value = ((this.registers[Rd + 1] << 8 | this.registers[Rd]) - K)
    this.registers[Rd + 1] = (value >> 8) & 0xFF
    this.registers[Rd] = value & 0xFF
    this.updateFlagsW(value)
  }

  // LDS: Load Direct from Data Space
  lds() {
    const Rd = (this.#insn >> 4) & 0b11111
    const k = this.flashView.getUint16(this.#_pc, true)
    const value = this.peek(k)
    this.registers[Rd] = value
    this.#_pc += 2
  }

  // STS: Store Direct to Data Space
  sts() {
    const Rd = (this.#insn >> 4) & 0b11111
    const k = this.flashView.getUint16(this.#_pc, true)
    this.poke(k, this.registers[Rd])
    this.#_pc += 2
  }

  step() {
    this.#insn = this.nextInstruction()
    this.#_pc = this.pc + 2

    let _f = this.opcodes.find(op => bmatch(this.#insn, op[0], op[1]))
    if (_f !== undefined) _f[2].call(this)
    else if (this.debug) console.log(`Undefined Opcode: ${stob16(this.#insn)}`)

    this.pc = this.#_pc
  }
}