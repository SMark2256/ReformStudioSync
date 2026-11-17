// A Levelezés oldal lekérdezési kulcsai (TICKET-55); a vendégadatlap levelei külön kulcson.
export const MAIL_QUERY_KEYS = {
  status: ['mail', 'status'] as const,
  templates: ['mail', 'templates'] as const,
  automations: ['mail', 'automations'] as const,
  audience: ['mail', 'audience'] as const,
  messages: ['mail', 'messages'] as const,
};

export const formatMailDateTime = (iso: string | null | undefined): string =>
  iso
    ? new Date(iso).toLocaleString('hu-HU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–';
