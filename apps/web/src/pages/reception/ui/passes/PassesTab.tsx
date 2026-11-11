import {
  PassTemplateDto,
  PassType,
  ServiceCategory,
  ServiceDto,
} from '@reform/shared';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import React, { useId, useState } from 'react';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import { cn } from '@/shared/lib/utils';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  ResponsiveTable,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ResponsiveTableColumn,
} from '@/shared/ui';
import { formatHuf } from '../desk/format';

const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.BODY_SHAPING]: 'Alakformáló kezelés',
  [ServiceCategory.COSMETIC]: 'Kozmetikai kezelés',
  [ServiceCategory.CIRCUIT]: 'Női köredzés',
};

const PASS_TYPE_LABELS: Record<PassType, string> = {
  [PassType.OCCASION_BASED]: 'Alkalom alapú',
  [PassType.TIME_BASED]: 'Időkorlátos, korlátlan',
};

// Címke a mező fölött, 5 px réssel (UI-specifikáció 5.2).
const Field: React.FC<{
  label: string;
  className?: string;
  children: (id: string) => React.ReactNode;
}> = ({ label, className, children }) => {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
};

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
    cell: (s) => <span className="font-semibold">{s.name}</span>,
  },
  {
    key: 'category',
    header: 'Kategória',
    cell: (s) => (
      <span className="flex flex-wrap items-center gap-2">
        {SERVICE_CATEGORY_LABELS[s.category]}
        {s.womenOnly && (
          <Badge variant="secondary" dot={false}>
            Csak nőknek
          </Badge>
        )}
      </span>
    ),
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

// Bérletek és termékek (`/passes`): bérletsablonok és szolgáltatások. A vendégmonitorok a
// fiókpanel Monitorok oldalán (`/monitors`) vannak.
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <PassTemplatesCard templates={templates} onRefreshAll={onRefreshAll} />
      <ServicesCard services={services} onRefreshAll={onRefreshAll} />
    </div>
  </>
);

const PassTemplatesCard: React.FC<{
  templates: PassTemplateDto[];
  onRefreshAll: () => void;
}> = ({ templates, onRefreshAll }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<PassType>(PassType.OCCASION_BASED);
  const [passes, setPasses] = useState<number>(10);
  const [days, setDays] = useState<number>(60);
  const [price, setPrice] = useState<number>(54000);

  const createTemplateMutation = useMutation({
    mutationFn: api.createPassTemplate,
    onSuccess: (tpl) => {
      notify.success(
        'Új bérletsablon létrehozva',
        `${tpl.name} (${formatHuf(tpl.price)})`,
      );
      setName('');
      onRefreshAll();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bérletsablonok</CardTitle>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        <ResponsiveTable
          caption="Bérletsablonok"
          columns={templateColumns}
          rows={templates}
          getRowId={(t) => t.id}
          emptyText="Még nincs bérletsablon. Vegyél fel egyet lent."
        />
      </CardContent>
      <CardContent className="border-t border-border">
        <form
          aria-label="Új bérletsablon"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createTemplateMutation.mutate({
              name,
              type,
              totalPasses: type === PassType.OCCASION_BASED ? passes : null,
              durationDays: days,
              price,
            });
          }}
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"
        >
          <h3 className="text-xs font-semibold text-muted-foreground sm:col-span-2">
            Új bérletsablon
          </h3>
          <Field label="Megnevezés" className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pl. 10 alkalmas Hypoxi bérlet"
              />
            )}
          </Field>
          <Field label="Típus">
            {(id) => (
              <Select
                value={type}
                onValueChange={(value) => setType(value as PassType)}
              >
                <SelectTrigger id={id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PassType).map((value) => (
                    <SelectItem key={value} value={value}>
                      {PASS_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {type === PassType.OCCASION_BASED && (
            <Field label="Alkalmak száma">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  value={passes}
                  onChange={(e) => setPasses(Number(e.target.value))}
                />
              )}
            </Field>
          )}
          <Field label="Érvényesség (nap)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            )}
          </Field>
          <Field label="Ár (Ft)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            )}
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button
              type="submit"
              variant="primary"
              disabled={createTemplateMutation.isPending}
            >
              <Plus aria-hidden strokeWidth={1.75} />
              Bérletsablon hozzáadása
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const ServicesCard: React.FC<{
  services: ServiceDto[];
  onRefreshAll: () => void;
}> = ({ services, onRefreshAll }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>(
    ServiceCategory.BODY_SHAPING,
  );
  const [duration, setDuration] = useState<number>(30);
  const [price, setPrice] = useState<number>(7500);
  const [womenOnly, setWomenOnly] = useState(false);
  const womenOnlyId = useId();

  const createServiceMutation = useMutation({
    mutationFn: api.createService,
    onSuccess: (srv) => {
      notify.success(
        'Új szolgáltatás létrehozva',
        `${srv.name} (${srv.durationMinutes} perc)`,
      );
      setName('');
      setWomenOnly(false);
      onRefreshAll();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Szolgáltatások és kezelések</CardTitle>
        <CardDescription>törzsadatok</CardDescription>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        <ResponsiveTable
          caption="Szolgáltatások és kezelések"
          columns={serviceColumns}
          rows={services}
          getRowId={(s) => s.id}
          emptyText="Még nincs szolgáltatás. Vegyél fel egyet lent."
        />
      </CardContent>
      <CardContent className="border-t border-border">
        <form
          aria-label="Új szolgáltatás"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createServiceMutation.mutate({
              name,
              category,
              durationMinutes: duration,
              priceHuf: price,
              womenOnly,
            });
          }}
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2"
        >
          <h3 className="text-xs font-semibold text-muted-foreground sm:col-span-2">
            Új szolgáltatás
          </h3>
          <Field label="Megnevezés" className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pl. Hypoxi Dermology"
              />
            )}
          </Field>
          <Field label="Kategória">
            {(id) => (
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as ServiceCategory)}
              >
                <SelectTrigger id={id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ServiceCategory).map((value) => (
                    <SelectItem key={value} value={value}>
                      {SERVICE_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Időtartam (perc)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            )}
          </Field>
          <Field label="Listaár (Ft)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            )}
          </Field>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id={womenOnlyId}
                checked={womenOnly}
                onCheckedChange={(checked) => setWomenOnly(checked === true)}
                aria-describedby={`${womenOnlyId}-hint`}
              />
              <Label
                htmlFor={womenOnlyId}
                className="text-[13px] font-normal text-foreground"
              >
                Csak nőknek
              </Label>
            </div>
            <p
              id={`${womenOnlyId}-hint`}
              className="text-xs text-muted-foreground"
            >
              Férfi vendégnek nem adható el ilyen bérlet vagy tagság, és vele
              nem léptethető be (pl. női köredzés).
            </p>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button
              type="submit"
              variant="primary"
              disabled={createServiceMutation.isPending}
            >
              <Plus aria-hidden strokeWidth={1.75} />
              Szolgáltatás hozzáadása
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
