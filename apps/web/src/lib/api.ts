import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  DailyFinanceSummaryDto,
  DisplayDeviceDto,
  GuestDto,
  GuestPassDto,
  LoggedCheckInDto,
  LoginResponseDto,
  OfflineScanItemDto,
  OfflineSyncResponseDto,
  PairDisplayResponseDto,
  PassTemplateDto,
  PassType,
  PaymentDto,
  PaymentMethod,
} from '@reform/shared';
import { broadcastToLocalMonitors } from '../hooks/useMonitorChannel';
import { useAuthStore } from '../stores/authStore';
import { mockStudioEngine } from './mock-engine';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
  fallbackFn?: () => T | Promise<T>,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = Array.isArray(errBody.message)
        ? errBody.message.join(', ')
        : errBody.message || `Szerver hiba (${response.status})`;
      throw new Error(msg);
    }

    return (await response.json()) as T;
  } catch (err) {
    // Ha a lokális backend nem fut (TypeError: Failed to fetch), és van definiált mock fallback,
    // zökkenőmentesen kiszolgáljuk a kliensoldali adatmotorból, hogy minden funkció azonnal működjön.
    if (
      fallbackFn &&
      err instanceof TypeError &&
      err.message.toLowerCase().includes('fetch')
    ) {
      return await fallbackFn();
    }
    throw err;
  }
}

export const api = {
  login(email: string, password: string): Promise<LoginResponseDto> {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getGuests(query?: string): Promise<GuestDto[]> {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    return request(`/guests${qs}`, {}, () => mockStudioEngine.getGuests(query));
  },

  getGuest(id: string): Promise<GuestDto> {
    return request(`/guests/${id}`, {}, () =>
      mockStudioEngine.getGuestById(id),
    );
  },

  createGuest(data: {
    firstName: string;
    lastName: string;
    barcode?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }): Promise<GuestDto> {
    return request(
      '/guests',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.createGuest(data),
    );
  },

  updateGuest(
    id: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      barcode: string;
      email: string;
      phone: string;
      notes: string;
    }>,
  ): Promise<GuestDto> {
    return request(
      `/guests/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.updateGuest(id, data),
    );
  },

  getPassTemplates(includeInactive = false): Promise<PassTemplateDto[]> {
    return request(
      `/passes/templates?includeInactive=${includeInactive}`,
      {},
      () => mockStudioEngine.getTemplates(includeInactive),
    );
  },

  createPassTemplate(data: {
    name: string;
    type: PassType;
    totalPasses?: number | null;
    durationDays: number;
    price: number;
  }): Promise<PassTemplateDto> {
    return request(
      '/passes/templates',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.createTemplate(data),
    );
  },

  updatePassTemplate(
    id: string,
    data: Partial<{
      name: string;
      price: number;
      durationDays: number;
      isActive: boolean;
    }>,
  ): Promise<PassTemplateDto> {
    return request(
      `/passes/templates/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.updateTemplate(id, data),
    );
  },

  sellPass(data: {
    guestId: string;
    passTemplateId: string;
    paymentMethod: PaymentMethod;
    customAmount?: number;
    note?: string;
  }): Promise<{ pass: GuestPassDto; paymentId: string; amount: number }> {
    return request(
      '/passes/sell',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.sellPass(data),
    );
  },

  extendPass(
    passId: string,
    additionalDays: number,
    note: string,
  ): Promise<GuestPassDto> {
    return request(
      `/passes/${passId}/extend`,
      {
        method: 'PATCH',
        body: JSON.stringify({ additionalDays, note }),
      },
      () => mockStudioEngine.extendPass(passId, additionalDays, note),
    );
  },

  toggleFreezePass(passId: string, note?: string): Promise<GuestPassDto> {
    return request(
      `/passes/${passId}/toggle-freeze`,
      {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      },
      () => mockStudioEngine.toggleFreezePass(passId, note),
    );
  },

  scanCheckIn(data: {
    barcode: string;
    forceDuplicate?: boolean;
    idempotencyKey?: string;
  }): Promise<CheckInResultPayload> {
    return request<CheckInResultPayload>(
      '/check-ins/scan',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      () => mockStudioEngine.scanCheckIn(data),
    ).then((res) => {
      broadcastToLocalMonitors({ type: 'CHECKIN_RESULT', payload: res });
      return res;
    });
  },

  revokeCheckIn(checkInId: string): Promise<CheckInRevokedPayload> {
    return request<CheckInRevokedPayload>(
      `/check-ins/${checkInId}/revoke`,
      {
        method: 'POST',
      },
      () => mockStudioEngine.revokeCheckIn(checkInId),
    ).then((res) => {
      broadcastToLocalMonitors({ type: 'CHECKIN_REVOKED', payload: res });
      return res;
    });
  },

  getTodayCheckIns(): Promise<LoggedCheckInDto[]> {
    return request('/check-ins/today', {}, () =>
      mockStudioEngine.getTodayCheckIns(),
    );
  },

  syncOfflineScans(items: OfflineScanItemDto[]): Promise<OfflineSyncResponseDto> {
    return request(
      '/check-ins/sync-offline',
      {
        method: 'POST',
        body: JSON.stringify({ items }),
      },
      () => mockStudioEngine.syncOfflineScans(items),
    );
  },

  getDailyFinanceSummary(date?: string): Promise<DailyFinanceSummaryDto> {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return request(`/finance/daily-summary${qs}`, {}, () =>
      mockStudioEngine.getDailyFinanceSummary(date),
    );
  },

  cancelPayment(paymentId: string, reason?: string): Promise<PaymentDto> {
    return request(
      `/finance/payments/${paymentId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      () => mockStudioEngine.cancelPayment(paymentId, reason),
    );
  },

  initDisplayPairing(name: string): Promise<DisplayDeviceDto> {
    return request(
      '/auth/monitor/pair-init',
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      },
      () => mockStudioEngine.initDisplayPairing(name),
    );
  },

  verifyDisplayPairing(pairingCode: string): Promise<PairDisplayResponseDto> {
    return request(
      '/auth/monitor/pair-verify',
      {
        method: 'POST',
        body: JSON.stringify({ pairingCode }),
      },
      () => mockStudioEngine.verifyDisplayPairing(pairingCode),
    );
  },

  getDisplayDevices(): Promise<DisplayDeviceDto[]> {
    return request('/auth/monitor/devices', {}, () =>
      mockStudioEngine.getDisplayDevices(),
    );
  },
};
