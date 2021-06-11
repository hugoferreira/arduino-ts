type ReadTrap = [handled: boolean, value: number]
type ReadHook = (address: number) => ReadTrap
type WriteHook = (address: number, value: number) => boolean

const stoh16 = (u16: number) => u16.toString(16).padStart(4, '0')
const stob16 = (u16: number) => u16.toString(2).padStart(16, '0')
const stoh8 = (u8: number) => u8.toString(16).padStart(2, '0')
const stob8 = (u8: number) => u8.toString(2).padStart(8, '0')

export class avrcpu {
  flashView: DataView
  sramView: Uint8Array
  registers: Uint8Array
  peripherals: Uint8Array
  
  pc: number = 0      // Program Counter
  status: number = 0  // ITHSVNZC
  
  get z() { return this.registers[31] << 8 | this.registers[30] }
  get y() { return this.registers[29] << 8 | this.registers[28] }
  get x() { return this.registers[27] << 8 | this.registers[26] }

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

  step() {
    const insn = this.flashView.getUint16(this.pc, true)
    const regs = Array(...this.registers).map(r => stoh8(r)).join(' ')
    const sreg = [...'ITHSVNZC'].map((f, bit) => ((this.status >> (8 - bit)) & 1) ? f : '.').join('')
    console.log(`${stoh16(this.pc)}: ${stoh16(insn)} ${stob16(insn)} ${sreg} ${regs}`)

    let _pc = this.pc + 2

    if (insn == 0b1001010001111000) {        // SEI: Set Global Interrupt Flag
      this.status |= 1 << 8 
    } else if ((insn >> 11) == 0b10110) {    // IN: Load an I/O Location to Register
      const Rd = (insn >> 4) & 0b11111
      const A = ((insn >> 5) & 0b110000) | (insn & 0b1111)
      this.registers[Rd] = this.peekIO(A)      
    } else if ((insn >> 11) == 0b10111) {    // OUT: Store Register to I/O Location
      const Rd = (insn >> 4) & 0b11111
      const A = ((insn >> 5) & 0b110000) | (insn & 0b1111)
      this.pokeIO(A, this.registers[Rd])
    } else if ((insn >> 12) == 0b0110) {     // ORI: Logical OR with Immediate
      const Rd = ((insn >> 4) & 0b1111) + 16
      const K = (insn >> 4) & 0b11110000 | (insn & 0b1111)
      this.registers[Rd] = this.registers[Rd] | K
    } else if ((insn >> 12) == 0b1110) {     // LDI
      const Rd = ((insn >> 4) & 0b1111) + 16
      const K = (insn >> 4) & 0b11110000 | (insn & 0b1111)
      this.registers[Rd] = K
    } else if (((insn >> 9) == 0b1001000) && ((insn & 0b1111) == 0b0000)) {  // LDS: Load Direct from Data Space
      const Rd = (insn >> 4) & 0b11111
      const k = this.flashView.getUint16(_pc, true)
      const value = this.peek(k)
      this.registers[Rd] = value
      _pc += 2
    } else if (((insn >> 9) == 0b1001001) && ((insn & 0b1111) == 0b0000)) {  // STS: Store Direct to Data Space
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