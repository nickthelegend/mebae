import { Types, createComponent } from '@iwsdk/core';

/**
 * Anything the hand can pinch (ray) or poke. `key` routes the press to the
 * handler registered in PressRouter. Tap = release before 1 s, hold = 1 s.
 */
export const Pressable = createComponent('Pressable', {
  key: { type: Types.String, default: '' },
});
