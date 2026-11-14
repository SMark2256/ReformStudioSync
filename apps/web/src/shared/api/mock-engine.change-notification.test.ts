import { Gender } from '@reform/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockStudioEngine } from './mock-engine';

const STORAGE_KEY = 'reform-studio-mock-sandbox-v4';

/** Az értesítés mikrotaszkban fut; ezzel megvárjuk. */
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve));

/** TICKET-3: a demó sandbox a mock adatbázis változására (ez a fül és más fül) frissül. */
describe('mock-engine — változás-értesítés (TICKET-3)', () => {
  let unsubscribe: (() => void) | null = null;

  beforeEach(async () => {
    localStorage.clear();
    mockStudioEngine.resetDatabase();
    await flushMicrotasks();
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  it('új vendég felvételekor egyszer értesít, és nő a változásszámláló', async () => {
    const listener = vi.fn();
    unsubscribe = mockStudioEngine.subscribe(listener);
    const before = mockStudioEngine.getVersion();

    const guest = mockStudioEngine.createGuest({
      firstName: 'Eszter',
      lastName: 'Teszt',
      gender: Gender.FEMALE,
    });
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(mockStudioEngine.getVersion()).toBe(before + 1);
    expect(mockStudioEngine.getGuests().some((g) => g.id === guest.id)).toBe(true);
  });

  it('olvasás nem értesít', async () => {
    const listener = vi.fn();
    unsubscribe = mockStudioEngine.subscribe(listener);

    mockStudioEngine.getGuests();
    mockStudioEngine.getServices(true);
    mockStudioEngine.getTodayCheckIns();
    await flushMicrotasks();

    expect(listener).not.toHaveBeenCalled();
  });

  it('más fül írása (storage esemény a demó kulcsra) értesít, más kulcs nem', async () => {
    const listener = vi.fn();
    unsubscribe = mockStudioEngine.subscribe(listener);

    window.dispatchEvent(new StorageEvent('storage', { key: 'valami-mas' }));
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('leiratkozás után nem értesít', async () => {
    const listener = vi.fn();
    mockStudioEngine.subscribe(listener)();

    mockStudioEngine.createGuest({
      firstName: 'Béla',
      lastName: 'Teszt',
      gender: Gender.MALE,
    });
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    await flushMicrotasks();

    expect(listener).not.toHaveBeenCalled();
  });
});
