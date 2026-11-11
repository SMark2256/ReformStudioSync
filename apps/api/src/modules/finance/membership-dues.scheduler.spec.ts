import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceService } from './finance.service';
import { MembershipDuesScheduler } from './membership-dues.scheduler';

describe('MembershipDuesScheduler — időzített tagdíj-pótlás (TICKET-13)', () => {
  let ensureDuesUpTo: ReturnType<typeof vi.fn>;
  let scheduler: MembershipDuesScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    ensureDuesUpTo = vi.fn().mockResolvedValue(0);
    scheduler = new MembershipDuesScheduler({
      ensureDuesUpTo,
    } as unknown as FinanceService);
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('indításkor, majd óránként pótol', async () => {
    scheduler.onApplicationBootstrap();
    expect(ensureDuesUpTo).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(ensureDuesUpTo).toHaveBeenCalledTimes(2);

    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(ensureDuesUpTo).toHaveBeenCalledTimes(2);
  });

  it('adatbázishiba nem dönti el az alkalmazást', async () => {
    ensureDuesUpTo.mockRejectedValueOnce(new Error('db down'));
    await expect(scheduler.run()).resolves.toBeUndefined();
  });
});
