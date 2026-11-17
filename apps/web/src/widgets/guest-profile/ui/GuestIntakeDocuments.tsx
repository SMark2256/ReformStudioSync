import React from 'react';
import { Link } from 'react-router-dom';
import { IntakeDocumentsList, useGuestIntakeDocuments } from '@/entities/intake';
import { APP_ROUTES } from '@/shared/config';
import { Button, Skeleton } from '@/shared/ui';

// A vendégfelvétel aláírt, változatlan dokumentumai PDF-ként (TICKET-56).
export const GuestIntakeDocuments: React.FC<{ guestId: string }> = ({ guestId }) => {
  const documentsQuery = useGuestIntakeDocuments(guestId);
  return (
    <section
      aria-labelledby={`intake-documents-${guestId}`}
      className="space-y-4 rounded-lg border border-border p-4 md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`intake-documents-${guestId}`} className="text-[13px] font-semibold text-foreground">
          Felvételi dokumentumok (PDF)
        </h3>
        <Button variant="link" asChild>
          <Link to={APP_ROUTES.intake.path}>Vendégfelvétel</Link>
        </Button>
      </div>
      {documentsQuery.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <IntakeDocumentsList documents={documentsQuery.data ?? []} />
      )}
    </section>
  );
};
