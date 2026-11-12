import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTestEnvironment } from './demo-mode';

// TICKET-49: a recepció tesztkártyái csak tesztkörnyezetben látszanak.
describe('isTestEnvironment', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a demó preview hoston igaz', () => {
    expect(
      isTestEnvironment('demo-reformstudiosync.smark-siklodi.workers.dev'),
    ).toBe(true);
  });

  it('helyi fejlesztésnél igaz', () => {
    expect(isTestEnvironment('localhost')).toBe(true);
    expect(isTestEnvironment('127.0.0.1')).toBe(true);
  });

  it('élesben hamis', () => {
    expect(isTestEnvironment('reformstudiosync.smark-siklodi.workers.dev')).toBe(
      false,
    );
    expect(isTestEnvironment('www.demo-studio.hu')).toBe(false);
  });

  it('Demó módban a hosttól függetlenül igaz', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    expect(isTestEnvironment('reformstudiosync.smark-siklodi.workers.dev')).toBe(
      true,
    );
  });

  it('host nélkül az aktuális oldal hostját nézi (jsdom: localhost)', () => {
    expect(window.location.hostname).toBe('localhost');
    expect(isTestEnvironment()).toBe(true);
  });
});
