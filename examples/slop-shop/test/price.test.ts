import { expect, it } from 'vitest';
import { applyDiscount } from '../src/price.js';

it('takes 10% off', () => {
  expect(applyDiscount(100, 0.1)).toBe(90);
});

it('leaves the price alone with no discount', () => {
  expect(applyDiscount(49.99, 0)).toBe(49.99);
});
