import { signal } from '@iwsdk/core';

/** Shared view state between systems (not persisted). */
export const ui = {
  weekOpen: signal(false),
  /** 'idle' | 'radial' | 'aiming' | 'flying' | 'carrying' */
  mode: signal<'idle' | 'radial' | 'aiming' | 'flying' | 'carrying'>('idle'),
};
