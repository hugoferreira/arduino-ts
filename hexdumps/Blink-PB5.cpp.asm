
firmware.elf:     file format elf32-avr


Disassembly of section .text:

00000000 <__vectors>:
   0:	0c 94 34 00 	jmp	0x68	; 0x68 <__ctors_end>
   4:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
   8:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
   c:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  10:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  14:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  18:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  1c:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  20:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  24:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  28:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  2c:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  30:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  34:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  38:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  3c:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  40:	0c 94 48 00 	jmp	0x90	; 0x90 <__vector_16>
  44:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  48:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  4c:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  50:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  54:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  58:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  5c:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  60:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>
  64:	0c 94 46 00 	jmp	0x8c	; 0x8c <__bad_interrupt>

00000068 <__ctors_end>:
  68:	11 24       	eor	r1, r1
  6a:	1f be       	out	0x3f, r1	; 63
  6c:	cf ef       	ldi	r28, 0xFF	; 255
  6e:	d8 e0       	ldi	r29, 0x08	; 8
  70:	de bf       	out	0x3e, r29	; 62
  72:	cd bf       	out	0x3d, r28	; 61

00000074 <__do_clear_bss>:
  74:	21 e0       	ldi	r18, 0x01	; 1
  76:	a0 e0       	ldi	r26, 0x00	; 0
  78:	b1 e0       	ldi	r27, 0x01	; 1
  7a:	01 c0       	rjmp	.+2      	; 0x7e <.do_clear_bss_start>

0000007c <.do_clear_bss_loop>:
  7c:	1d 92       	st	X+, r1

0000007e <.do_clear_bss_start>:
  7e:	a9 30       	cpi	r26, 0x09	; 9
  80:	b2 07       	cpc	r27, r18
  82:	e1 f7       	brne	.-8      	; 0x7c <.do_clear_bss_loop>
  84:	0e 94 92 00 	call	0x124	; 0x124 <main>
  88:	0c 94 9e 00 	jmp	0x13c	; 0x13c <_exit>

0000008c <__bad_interrupt>:
  8c:	0c 94 00 00 	jmp	0	; 0x0 <__vectors>

00000090 <__vector_16>:
  90:	1f 92       	push	r1
  92:	0f 92       	push	r0
  94:	0f b6       	in	r0, 0x3f	; 63
  96:	0f 92       	push	r0
  98:	11 24       	eor	r1, r1
  9a:	2f 93       	push	r18
  9c:	3f 93       	push	r19
  9e:	8f 93       	push	r24
  a0:	9f 93       	push	r25
  a2:	af 93       	push	r26
  a4:	bf 93       	push	r27
  a6:	80 91 05 01 	lds	r24, 0x0105	; 0x800105 <timer0_millis>
  aa:	90 91 06 01 	lds	r25, 0x0106	; 0x800106 <timer0_millis+0x1>
  ae:	a0 91 07 01 	lds	r26, 0x0107	; 0x800107 <timer0_millis+0x2>
  b2:	b0 91 08 01 	lds	r27, 0x0108	; 0x800108 <timer0_millis+0x3>
  b6:	30 91 04 01 	lds	r19, 0x0104	; 0x800104 <timer0_fract>
  ba:	23 e0       	ldi	r18, 0x03	; 3
  bc:	23 0f       	add	r18, r19
  be:	2d 37       	cpi	r18, 0x7D	; 125
  c0:	58 f5       	brcc	.+86     	; 0x118 <__vector_16+0x88>
  c2:	01 96       	adiw	r24, 0x01	; 1
  c4:	a1 1d       	adc	r26, r1
  c6:	b1 1d       	adc	r27, r1
  c8:	20 93 04 01 	sts	0x0104, r18	; 0x800104 <timer0_fract>
  cc:	80 93 05 01 	sts	0x0105, r24	; 0x800105 <timer0_millis>
  d0:	90 93 06 01 	sts	0x0106, r25	; 0x800106 <timer0_millis+0x1>
  d4:	a0 93 07 01 	sts	0x0107, r26	; 0x800107 <timer0_millis+0x2>
  d8:	b0 93 08 01 	sts	0x0108, r27	; 0x800108 <timer0_millis+0x3>
  dc:	80 91 00 01 	lds	r24, 0x0100	; 0x800100 <_edata>
  e0:	90 91 01 01 	lds	r25, 0x0101	; 0x800101 <_edata+0x1>
  e4:	a0 91 02 01 	lds	r26, 0x0102	; 0x800102 <_edata+0x2>
  e8:	b0 91 03 01 	lds	r27, 0x0103	; 0x800103 <_edata+0x3>
  ec:	01 96       	adiw	r24, 0x01	; 1
  ee:	a1 1d       	adc	r26, r1
  f0:	b1 1d       	adc	r27, r1
  f2:	80 93 00 01 	sts	0x0100, r24	; 0x800100 <_edata>
  f6:	90 93 01 01 	sts	0x0101, r25	; 0x800101 <_edata+0x1>
  fa:	a0 93 02 01 	sts	0x0102, r26	; 0x800102 <_edata+0x2>
  fe:	b0 93 03 01 	sts	0x0103, r27	; 0x800103 <_edata+0x3>
 102:	bf 91       	pop	r27
 104:	af 91       	pop	r26
 106:	9f 91       	pop	r25
 108:	8f 91       	pop	r24
 10a:	3f 91       	pop	r19
 10c:	2f 91       	pop	r18
 10e:	0f 90       	pop	r0
 110:	0f be       	out	0x3f, r0	; 63
 112:	0f 90       	pop	r0
 114:	1f 90       	pop	r1
 116:	18 95       	reti
 118:	26 e8       	ldi	r18, 0x86	; 134
 11a:	23 0f       	add	r18, r19
 11c:	02 96       	adiw	r24, 0x02	; 2
 11e:	a1 1d       	adc	r26, r1
 120:	b1 1d       	adc	r27, r1
 122:	d2 cf       	rjmp	.-92     	; 0xc8 <__vector_16+0x38>

00000124 <main>:
 124:	25 9a       	sbi	0x04, 5	; 4
 126:	23 ec       	ldi	r18, 0xC3	; 195
 128:	30 e0       	ldi	r19, 0x00	; 0
 12a:	2d 9a       	sbi	0x05, 5	; 5
 12c:	c9 01       	movw	r24, r18
 12e:	01 97       	sbiw	r24, 0x01	; 1
 130:	f1 f7       	brne	.-4      	; 0x12e <main+0xa>
 132:	2d 98       	cbi	0x05, 5	; 5
 134:	c9 01       	movw	r24, r18
 136:	01 97       	sbiw	r24, 0x01	; 1
 138:	f1 f7       	brne	.-4      	; 0x136 <main+0x12>
 13a:	f7 cf       	rjmp	.-18     	; 0x12a <main+0x6>

0000013c <_exit>:
 13c:	f8 94       	cli

0000013e <__stop_program>:
 13e:	ff cf       	rjmp	.-2      	; 0x13e <__stop_program>
