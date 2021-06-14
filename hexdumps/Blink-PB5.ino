void setup() {
  DDRB |= 0b00100000;
}

void loop() {
  PORTB |= 0b00100000;
  delayMicroseconds(50);                       
  PORTB &= 0b11011111;
  delayMicroseconds(50);                       
}