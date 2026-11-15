import { signal } from '@iwsdk/core';

/** Shared view state between systems (not persisted). */
export const ui = {
  weekOpen: signal(false),
  /** 'idle' | 'radial' | 'aiming' | 'flying' | 'carrying' */
  /** Voice coach: idle | listening | thinking | heard | error. */
  coach: signal<'idle' | 'listening' | 'thinking' | 'heard' | 'error'>('idle'),
  mode: signal<'idle' | 'radial' | 'aiming' | 'flying' | 'carrying'>('idle'),
};
