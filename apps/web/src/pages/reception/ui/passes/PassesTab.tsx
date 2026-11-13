import { PassTemplateDto, PassType, ServiceDto } from '@reform/shared';
import { Plus } from 'lucide-react';
import React, { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  ResponsiveTable,
  type ResponsiveTableColumn,
} from '@/shared/ui';
import { formatHuf } from '../desk/format';
import { SERVICE_CATEGORY_LABELS } from './labels';
import { PassTemplateDialog } from './PassTemplateDialog';
import { ServiceDialog } from './ServiceDialog';

const templateColumns: ResponsiveTableColumn<PassTemplateDto>[] = [
  {
    key: 'name',
    header: 'Megnevezés',
    rowHeader: true,
    cell: (t) => <span className="font-semibold">{t.name}</span>,
  },
  {
    key: 'passes',
    header: 'Alkalom',
    align: 'right',
    cell: (t) =>
      t.type === PassType.TIME_BASED ? 'Korlátlan' : (t.totalPasses ?? '–'),
  },
  {
    key: 'days',
    header: 'Érvényesség',
    align: 'right',
    cell: (t) => `${t.durationDays} nap`,
  },
  {
    key: 'price',
    header: 'Ár',
    align: 'right',
    cell: (t) => formatHuf(t.price),
  },
];

const serviceColumns: ResponsiveTableColumn<ServiceDto>[] = [
  {
    key: 'name',
    header: 'Megnevezés',
    rowHeader: true,
    cell: (s) => (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">{s.name}</span>
        {s.womenOnly && (
          <Badge variant="secondary" dot={false}>
            Csak nőknek
          </Badge>
        )}
      </span>
    ),
  },
  {
    key: 'category',
    header: 'Kategória',
    cell: (s) => SERVICE_CATEGORY_LABELS[s.category],
  },
  {
    key: 'duration',
    header: 'Időtartam',
    align: 'right',
    cell: (s) => `${s.durationMinutes} perc`,
  },
  {
    key: 'price',
    header: 'Ár',
    align: 'right',
    cell: (s) => formatHuf(s.priceHuf),
  },
];

interface PassesTabProps {
  templates: PassTemplateDto[];
  services: ServiceDto[];
  onRefreshAll: () => void;
}

// Bérletek és termékek (`/passes`): bérletsablonok és szolgáltatások listája; az újak
// felvétele modálban. A vendégmonitorok a fiókpanel Monitorok oldalán (`/monitors`) vannak.
export const PassesTab: React.FC<PassesTabProps> = ({
  templates,
  services,
  onRefreshAll,
}) => (
  <>
    <PageHeader
      title="Bérletek és termékek"
      description="Bérletsablonok és szolgáltatások beállítása."
    />
    {/* A szolgáltatások neve hosszú lehet: a két kártya csak széles kijelzőn kerül egymás mellé. */}
    <div className="grid grid-cols-1 gap-4 md:gap-6 2xl:grid-cols-2">
      <PassTemplatesCard templates={templates} onRefreshAll={onRefreshAll} />
      <ServicesCard services={services} onRefreshAll={onRefreshAll} />
    </div>
  </>
);

const PassTemplatesCard: React.FC<{
  templates: PassTemplateDto[];
  onRefreshAll: () => void;
}> = ({ templates, onRefreshAll }) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card data-tour="passes.templates">
      <CardHeader>
        <CardTitle>Bérletsablonok</CardTitle>
        <CardActions>
          <Button
            variant="secondary"
            data-tour="passes.new-template"
            onClick={() => setDialogOpen(true)}
          >
            <Plus aria-hidden strokeWidth={1.75} />
            Új bérletsablon
          </Button>
        </CardActions>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        <ResponsiveTable
          caption="Bérletsablonok"
          columns={templateColumns}
          rows={templates}
          getRowId={(t) => t.id}
          emptyText="Még nincs bérletsablon. Vegyél fel egyet az „Új bérletsablon” gombbal."
        />
      </CardContent>
      <PassTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={onRefreshAll}
      />
    </Card>
  );
};

const ServicesCard: React.FC<{
  services: ServiceDto[];
  onRefreshAll: () => void;
}> = ({ services, onRefreshAll }) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card data-tour="passes.services">
      <CardHeader>
        <CardTitle>Szolgáltatások és kezelések</CardTitle>
        <CardDescription>törzsadatok</CardDescription>
        <CardActions>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden strokeWidth={1.75} />
            Új szolgáltatás
          </Button>
        </CardActions>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        <ResponsiveTable
          caption="Szolgáltatások és kezelések"
          columns={serviceColumns}
          rows={services}
          getRowId={(s) => s.id}
          emptyText="Még nincs szolgáltatás. Vegyél fel egyet az „Új szolgáltatás” gombbal."
        />
      </CardContent>
      <ServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={onRefreshAll}
      />
    </Card>
  );
};
