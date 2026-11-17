import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailAutomationsService } from './email-automations.service';
import type { MailOutboxService } from './mail-outbox.service';
import { MailingScheduler } from './mailing.scheduler';

describe('MailingScheduler — időzített levelezés (TICKET-55)', () => {
  let runDaily: ReturnType<typeof vi.fn>;
  let processDue: ReturnType<typeof vi.fn>;
  let scheduler: MailingScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    runDaily = vi.fn().mockResolvedValue(0);
    processDue = vi.fn().mockResolvedValue(0);
    scheduler = new MailingScheduler(
      { runDaily } as unknown as EmailAutomationsService,
      { processDue } as unknown as MailOutboxService,
    );
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('indításkor köszöntő és sor, utána a sor percenként, a köszöntők óránként', async () => {
    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(runDaily).toHaveBeenCalledTimes(1);
    expect(processDue).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(processDue).toHaveBeenCalledTimes(2);
    expect(runDaily).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
    expect(runDaily).toHaveBeenCalledTimes(2);
    expect(processDue).toHaveBeenCalledTimes(61);

    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(runDaily).toHaveBeenCalledTimes(2);
  });

  it('adatbázishiba nem dönti el az alkalmazást', async () => {
    runDaily.mockRejectedValueOnce(new Error('db down'));
    processDue.mockRejectedValueOnce(new Error('db down'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn((scheduler as any).logger, 'error').mockImplementation(() => undefined);
    await expect(scheduler.runAutomations()).resolves.toBeUndefined();
    await expect(scheduler.runOutbox()).resolves.toBeUndefined();
  });
});
