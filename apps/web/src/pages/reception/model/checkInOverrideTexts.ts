import type { DebtDeniedReason } from '@reform/shared';

/** A kivételes beengedés (TICKET-15) felületi szövegei. */
export const CHECK_IN_OVERRIDE_TEXTS = {
  action: 'Kivételes beengedés',
  title: 'Kivételes beengedés',
  description:
    'A tartozás miatti elutasítás feloldása. Az indoklás kötelező, a beengedés naplózódik.',
  reasonLabel: 'Indoklás',
  reasonPlaceholder: 'Pl. a vendég ma átutalta a tagdíjat, a bizonylatot bemutatta',
  reasonRequired: 'Az indoklás megadása kötelező.',
  cancel: 'Mégse',
  submit: 'Beengedés',
  submitting: 'Beengedés…',
  overriddenBadge: 'Kivételesen beengedve',
  deniedReasonTitle: 'Elutasítás oka',
} as const;

/** A tartozás miatti elutasítás okainak rövid címkéje a recepciós kártyán. */
export const DEBT_DENIED_REASON_LABELS: Record<DebtDeniedReason, string> = {
  DUES_OVERDUE: 'Tagdíj-elmaradás',
  PASS_DEBT: 'Bérlet-hátralék',
  PASS_DEBT_UNKNOWN: 'Ismeretlen hátralék',
};
