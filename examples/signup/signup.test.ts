import { expect, it } from 'vitest';

function signup(email: string) {
  if (!email.trim()) throw new Error('Email is required');
  return { email };
}

it('rejects an empty email', () => {
  expect(() => signup('')).toThrow('Email is required');
});
