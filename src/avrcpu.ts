import { bmatch, signed12bit, signed7bit, stob16, stob8, bitExtractor, bitExtractMask } from './utils'

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
  #opcodes = new Array<[string, (args: any) => void]>(
    ['1001_0100_0111_1000', this.sei],
    ['1001_000d_dddd_0100', this.lpm],
    ['1001_000d_dddd_0101', this.lpmzi],
    ['1001_000d_dddd_0000', this.lds],
    ['1001_001d_dddd_0000', this.sts],
    ['1001_010k_kkkk_110k', this.jmp],
    ['1001_010k_kkkk_111k', this.call],
    ['1111_00kk_kkkk_k001', this.breq],
    ['1111_01kk_kkkk_k001', this.brne],
    ['1001_1010_AAAA_Abbb', this.sbi],
    ['1001_1000_AAAA_Abbb', this.cbi],
    ['0000_0001_dddd_rrrr', this.movw],
    ['1001_0111_KKdd_KKKK', this.sbiw],
    ['0010_01rd_dddd_rrrr', this.eor],
    ['0000_11rd_dddd_rrrr', this.add],
    ['0001_11rd_dddd_rrrr', this.adc],
    ['0010_00rd_dddd_rrrr', this.and],
    ['1011_0AAd_dddd_AAAA', this.in],
    ['1011_1AAd_dddd_AAAA', this.out],
    ['0110_KKKK_dddd_KKKK', this.ori],
    ['1100_kkkk_kkkk_kkkk', this.rjmp],
    ['1110_KKKK_dddd_KKKK', this.ldi],
  )

  #lookuptable = new Array<[number, number, string, (args: any) => void]>()

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

    this.#lookuptable = this.#opcodes.map(([p, f]) => [...bitExtractMask(p), f])
    if (this.debug) this.#lookuptable.forEach(([e, m, p, f]) => console.log(stob16(e), stob16(m), p, f))
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

  // SEI: Set Global Interrupt Flag
  sei() {
    this.setFlag(flags.I, 1)
  }

  // SBI: Load an I/O Location to Register
  sbi({ A, b }: { A: number, b: number }) {
    A += this.#PERIPHERALS_BEGIN_ADDR
    this.poke(A, this.peek(A) | (1 << b))
  }

  // CBI: Load an I/O Location to Register
  cbi({ A, b }: { A: number, b: number }) {
    A += this.#PERIPHERALS_BEGIN_ADDR
    this.poke(A, this.peek(A) & (~(1 << b) & 0xFF))
  }

  // IN: Load an I/O Location to Register
  in({ A, d }: { A: number, d: number }) {
    this.registers[d] = this.peek(A)
  }

  // OUT: Store Register to I/O Location
  out({ A, d }: { A: number, d: number }) {
    this.poke(A, this.registers[d])
  }

  // ORI: Logical OR with Immediate
  ori({ K, d }: { K: number, d: number }) {
    d += 16
    const res = this.registers[d] | K
    this.registers[d] = res
    this.updateFlags(res)
    this.setFlag(flags.V, 0)
  }

  // EOR: Exclusive OR
  eor({ d, r }: { d: number, r: number }) {
    const res = this.registers[d] ^ this.registers[r]
    this.registers[d] = res
    this.updateFlags(res)
    this.setFlag(flags.V, 0)
  }

  // ADD: Add without Carry
  add({ d, r }: { d: number, r: number }) {
    const a = this.registers[d]
    const b = this.registers[r]
    const res = (a + b) & 0xFF
    this.registers[d] = res
    this.updateFlags(res)
    this.setFlag(flags.V,
      (a & (1 << 7)) & (b & (1 << 7)) & ~(res & (1 << 7)) |
      ~(a & (1 << 7)) & ~(b & (1 << 7)) & (res & (1 << 7)))
  }

  // ADC: Add with Carry
  adc({ d, r }: { d: number, r: number }) {
    const a = this.registers[d]
    const b = this.registers[r]
    const res = (a + b + this.C ? 1 : 0) & 0xFF
    this.registers[d] = res
    this.updateFlags(res)
    this.setFlag(flags.V,
      (a & (1 << 7)) & (b & (1 << 7)) & ~(res & (1 << 7)) |
      ~(a & (1 << 7)) & ~(b & (1 << 7)) & (res & (1 << 7)))
  }

  // AND: Logical AND
  and({ d, r }: { d: number, r: number }) {
    const res = this.registers[d] & this.registers[r]
    this.registers[d] = res
    this.updateFlags(res)
    this.setFlag(flags.V, 0)
  }

  // LPM: Load Program Memory
  lpm({ d }: { d: number }) {
    this.registers[d] = this.flash[this.z]
  }

  // LPM: Load Program Memory (Z+)
  lpmzi({ d }: { d: number }) {
    this.registers[d] = this.flash[this.z]
    this.incz()
  }

  // BREQ: Branch if Equal
  breq({ k }: { k: number }) {
    if (this.Z) this.#_pc += signed7bit(k) * 2
  }

  // BRNE: Branch if Not Equal
  brne({ k }: { k: number }) {
    if (!this.Z) this.#_pc += signed7bit(k) * 2
  }

  // RJMP: Relative Jump
  rjmp({ k }: { k: number }) {
    this.#_pc += signed12bit(k) * 2
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
  ldi({ K, d }: { K: number, d: number }) {
    this.registers[d + 16] = K
  }

  // MOVW: Copy Register Word
  movw({ d, r }: { d: number, r: number }) {
    d <<= 1; r <<= 1
    this.registers[d] = this.registers[r]
    this.registers[d + 1] = this.registers[r + 1]
  }

  // SBIW: Subtract Immediate from Word
  sbiw({ K, d }: { K: number, d: number }) {
    d = (d << 1) + 24
    const value = (this.registers[d + 1] << 8 | this.registers[d]) - K
    this.registers[d + 1] = (value >> 8) & 0xFF
    this.registers[d] = value & 0xFF
    this.updateFlagsW(value)
  }

  // LDS: Load Direct from Data Space
  lds({ d }: { d: number }) {
    const k = this.flashView.getUint16(this.#_pc, true)
    this.registers[d] = this.peek(k)
    this.#_pc += 2
  }

  // STS: Store Direct to Data Space
  sts({ d }: { d: number }) {
    const k = this.flashView.getUint16(this.#_pc, true)
    this.poke(k, this.registers[d])
    this.#_pc += 2
  }

  step() {
    this.#insn = this.nextInstruction()
    this.#_pc = this.pc + 2

    // A quick boost would be to pre-generate the 2**16 = 65536 possible opcodes
    let _f = this.#lookuptable.find(op => bmatch(this.#insn, op[0], op[1]))
    if (_f !== undefined) _f[3].call(this, bitExtractor(this.#insn, _f[2]))
    else if (this.debug) console.log(`Undefined Opcode: ${stob16(this.#insn)}`)

    this.pc = this.#_pc
  }
}