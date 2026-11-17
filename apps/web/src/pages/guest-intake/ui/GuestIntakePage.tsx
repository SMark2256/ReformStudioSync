import { IntakeSessionSummaryDto } from '@reform/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  INTAKE_QUERY_KEYS,
  IntakeStatusBadge,
  useIntakeSession,
  useIntakeSessions,
} from '@/entities/intake';
import { useAuthStore } from '@/shared/auth';
import { APP_ROUTES } from '@/shared/config';
import { useIntakeSocket } from '@/shared/lib/intake-socket';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  PageHeader,
  ResponsiveTable,
  Skeleton,
  type ResponsiveTableColumn,
} from '@/shared/ui';
import { IntakeReviewPanel } from './IntakeReviewPanel';
import { NewIntakeDialog } from './NewIntakeDialog';

const formatUpdatedAt = (iso: string) =>
  new Date(iso).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const COLUMNS: ResponsiveTableColumn<IntakeSessionSummaryDto>[] = [
  { key: 'guest', header: 'Vendég', rowHeader: true, cell: (row) => row.guestName },
  { key: 'packages', header: 'Csomag', cell: (row) => row.packageLabels.join(', '), hideOnMobile: true },
  { key: 'status', header: 'Állapot', cell: (row) => <IntakeStatusBadge status={row.status} /> },
  {
    key: 'updated',
    header: 'Frissítve',
    align: 'right',
    hideOnMobile: true,
    cell: (row) => formatUpdatedAt(row.updatedAt),
  },
];

/**
 * Vendégfelvétel (`/intake`, TICKET-56): előkészítés PC-ről, átadás a tabletre, ellenőrzés és
 * jóváhagyás. A tablet állapotváltozásai socketen (`intake:updated`) frissítik a listát.
 */
export const GuestIntakePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);
  const selectedId = searchParams.get('session');
  const sessionsQuery = useIntakeSessions();
  const sessionQuery = useIntakeSession(selectedId);
  const accessToken = useAuthStore((s) => s.accessToken);

  useIntakeSocket(accessToken, {
    onUpdated: () => void queryClient.invalidateQueries({ queryKey: INTAKE_QUERY_KEYS.all }),
  });

  const select = (id: string) => setSearchParams({ session: id }, { replace: true });

  return (
    <>
      <PageHeader
        title={APP_ROUTES.intake.title}
        description="Új vendég vagy új szolgáltatás: a vendég a tableten tölti ki és írja alá, te ellenőrzöd és jóváhagyod."
        actions={
          <Button variant="primary" onClick={() => setNewOpen(true)}>
            <Plus aria-hidden className="size-4" />
            Új vendégfelvétel
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Vendégfelvételek</CardTitle>
          </CardHeader>
          {sessionsQuery.isPending ? (
            <div className="space-y-2 p-5" aria-busy="true">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <ResponsiveTable
              caption="Vendégfelvételek"
              columns={COLUMNS}
              rows={sessionsQuery.data ?? []}
              getRowId={(row) => row.id}
              onRowOpen={(row) => select(row.id)}
              selectedRowId={selectedId}
              emptyText="Nincs nyitott vendégfelvétel. Indíts egyet az „Új vendégfelvétel” gombbal."
            />
          )}
        </Card>
        <div className="min-w-0">
          {sessionQuery.data ? (
            <IntakeReviewPanel session={sessionQuery.data} />
          ) : selectedId && sessionQuery.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Részletek</CardTitle>
              </CardHeader>
              <p className="p-5 text-sm text-muted-foreground">
                Válassz egy vendégfelvételt a listából az ellenőrzéshez és a jóváhagyáshoz.
              </p>
            </Card>
          )}
        </div>
      </div>
      <NewIntakeDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(session) => {
          setNewOpen(false);
          queryClient.setQueryData(INTAKE_QUERY_KEYS.session(session.id), session);
          void queryClient.invalidateQueries({ queryKey: INTAKE_QUERY_KEYS.sessions });
          select(session.id);
        }}
      />
    </>
  );
};
