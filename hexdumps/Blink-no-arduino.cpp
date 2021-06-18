#include <avr/io.h>

/* Delay for the given number of microseconds. Assumes a 16MHz clock. */
void delayMicroseconds(unsigned int us) {
  // for the 16 MHz clock on most Arduino boards

  // for a one-microsecond delay, simply return.  the overhead
  // of the function call takes 14 (16) cycles, which is 1us
  if (us <= 1)
    return; //  = 3 cycles, (4 when true)

  // the following loop takes 1/4 of a microsecond (4 cycles)
  // per iteration, so execute it four times for each microsecond of
  // delay requested.
  us <<= 2; // x4 us, = 4 cycles

  // account for the time taken in the preceeding commands.
  // we just burned 19 (21) cycles above, remove 5, (5*4=20)
  // us is at least 8 so we can substract 5
  us -= 5; // = 2 cycles,

  // busy wait
  __asm__ __volatile__(
      "1: sbiw %0,1"
      "\n\t" // 2 cycles
      "brne 1b" : "=w"(us) : "0"(us) // 2 cycles
  );
  // return = 4 cycles
}

int main(void) {
  DDRB |= 0b00100000;
  while(1) {
    PORTB |= 0b00100000;
    delayMicroseconds(50);                       
    PORTB &= 0b11011111;
    delayMicroseconds(50);
  }                       
}