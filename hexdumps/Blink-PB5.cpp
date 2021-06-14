#include "Arduino.h"

int main(void) {
  DDRB |= 0b00100000;
  while(1) {
    PORTB |= 0b00100000;
    delayMicroseconds(50);                       
    PORTB &= 0b11011111;
    delayMicroseconds(50);
  }                       
}