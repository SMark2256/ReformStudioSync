import { INTAKE_LEGAL_REVIEW_LABEL, IntakeDocumentSnapshotDto } from '@reform/shared';
import { useMutation } from '@tanstack/react-query';
import React from 'react';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import { Badge, Button } from '@/shared/ui';

const formatSignedAt = (iso: string) =>
  new Date(iso).toLocaleString('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Az aláírt felvételi dokumentumok (TICKET-56): a PDF lejáró linkkel nyílik meg (naplózva), és
 * újraküldhető a vendégnek e-mailben.
 */
export const IntakeDocumentsList: React.FC<{ documents: IntakeDocumentSnapshotDto[] }> = ({
  documents,
}) => {
  // Az új lapot a kattintásra nyitjuk meg (különben a böngésző felugró ablakként tiltaná), a
  // lejáró link a válasz után kerül bele. A demó PDF data URL: blobként nyitható meg.
  const openMutation = useMutation({
    mutationFn: async ({ id }: { id: string; target: Window | null }) => {
      const link = await api.getIntakeDocumentLink(id);
      if (!link.url.startsWith('data:')) return link.url;
      return URL.createObjectURL(await (await fetch(link.url)).blob());
    },
    onSuccess: (url, { target }) => {
      if (target) target.location.href = url;
      else window.open(url, '_blank', 'noopener');
    },
    onError: (_error, { target }) => target?.close(),
  });
  const emailMutation = useMutation({
    mutationFn: (id: string) => api.emailIntakeDocument(id),
    onSuccess: () => notify.success('A dokumentumot elküldtük a vendégnek e-mailben.'),
  });

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Még nincs aláírt felvételi dokumentum.</p>;
  }

  return (
    <ul aria-label="Aláírt felvételi dokumentumok" className="divide-y divide-border rounded-md border border-border">
      {documents.map((doc) => (
        <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{doc.title}</span>
              <span className="text-xs text-muted-foreground">v{doc.formVersion}</span>
              {doc.legalReviewPending && <Badge variant="warning">{INTAKE_LEGAL_REVIEW_LABEL}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Aláírva: {formatSignedAt(doc.signedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!doc.pdfAvailable || openMutation.isPending}
              aria-label={`${doc.title}: PDF megnyitása`}
              onClick={() => openMutation.mutate({ id: doc.id, target: window.open('', '_blank') })}
            >
              PDF megnyitása
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!doc.pdfAvailable || emailMutation.isPending}
              aria-label={`${doc.title}: küldés e-mailben`}
              onClick={() => emailMutation.mutate(doc.id)}
            >
              Küldés e-mailben
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
};
