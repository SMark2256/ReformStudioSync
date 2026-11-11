import { MoreHorizontal, Plus, ScanLine } from 'lucide-react';
import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DataList,
  DataListItem,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogSummary,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  PageHeader,
  Progress,
  RadioGroup,
  RadioGroupItem,
  ResponsiveTable,
  type ResponsiveTableColumn,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatCard,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui';
import {
  SURFACE_COLORS,
  isSurfaceColor,
  saveSurface,
  saveTheme,
  useSurfaceStore,
  useThemeStore,
} from '@/shared/theme';

// Fejlesztői előnézet a `shared/ui` komponenseihez (csak `npm run dev:web` alatt, `/dev/ui`).
// Nem éles oldal: a buildbe nem kerül be (App.tsx, `import.meta.env.DEV`). Az alkalmazáskereten
// belül fut, így az oldalsáv és a fejléc is látszik.

interface EntryRow {
  id: string;
  time: string;
  name: string;
  mode: string;
  status: 'in' | 'left' | 'denied';
}

const ENTRIES: EntryRow[] = [
  { id: '1', time: '14:52', name: 'Nagy Eszter', mode: 'Kártya', status: 'in' },
  {
    id: '2',
    time: '14:10',
    name: 'Kovács Bence',
    mode: 'Kézi',
    status: 'left',
  },
  {
    id: '3',
    time: '13:47',
    name: 'Szabó Lilla',
    mode: 'Kártya',
    status: 'denied',
  },
];

const STATUS_BADGE = {
  in: <Badge variant="success">Bent van</Badge>,
  left: <Badge variant="secondary">Távozott</Badge>,
  denied: <Badge variant="destructive">Elutasítva</Badge>,
} as const;

const ENTRY_COLUMNS: ResponsiveTableColumn<EntryRow>[] = [
  {
    key: 'time',
    header: 'Idő',
    cell: (row) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.time}
      </span>
    ),
  },
  {
    key: 'name',
    header: 'Vendég',
    rowHeader: true,
    cell: (row) => (
      <span className="inline-flex items-center gap-2.5">
        <Avatar name={row.name} size="sm" />
        {row.name}
      </span>
    ),
  },
  { key: 'mode', header: 'Mód', cell: (row) => row.mode, hideOnMobile: true },
  { key: 'status', header: 'Állapot', cell: (row) => STATUS_BADGE[row.status] },
  {
    key: 'action',
    header: 'Művelet',
    srOnlyHeader: true,
    align: 'right',
    cell: (row) =>
      row.status === 'in' ? (
        <Button variant="link" aria-label={`${row.name} kiléptetése`}>
          Kiléptetés
        </Button>
      ) : null,
  },
];

export const UiPreviewPage: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);
  const surface = useSurfaceStore((state) => state.surface);
  const [selected, setSelected] = React.useState<string | null>('1');

  return (
    <>
      <PageHeader
        title="UI-előnézet"
        description="A shared/ui komponensei világos és sötét témában. Csak fejlesztői módban érhető el."
        actions={
          <>
            <Button variant="secondary">
              <ScanLine aria-hidden strokeWidth={1.75} /> Kártya
              olvasása
            </Button>
            <Button variant="primary">
              <Plus aria-hidden strokeWidth={1.75} /> Új vendég
            </Button>
          </>
        }
      />

      <section aria-labelledby="stats-h" className="mb-4">
        <h2 id="stats-h" className="sr-only">
          Napi összesítő
        </h2>
        <div className="grid grid-cols-2 gap-2.5 md:gap-4 xl:grid-cols-4">
          <StatCard label="Bent tartózkodik" value={7} />
          <StatCard
            label="Mai belépések"
            value={42}
            hint="ebből 35 kártyával"
          />
          <StatCard
            label="Elutasított belépés"
            value={2}
            hint="lejárt vagy elfogyott bérlet"
          />
          <StatCard
            label="Lejáró bérletek"
            value={5}
            hint="3 napon belül vagy lejárt"
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Mai belépések</CardTitle>
              <CardActions>
                <Label htmlFor="preview-search" className="sr-only">
                  Keresés
                </Label>
                <SearchInput
                  id="preview-search"
                  placeholder="Név, kártyaszám vagy telefon"
                />
              </CardActions>
            </CardHeader>
            <CardContent className="p-0 md:p-0">
              <ResponsiveTable
                caption="Mai belépések"
                columns={ENTRY_COLUMNS}
                rows={ENTRIES}
                getRowId={(row) => row.id}
                selectedRowId={selected}
                onRowOpen={(row) => setSelected(row.id)}
                emptyText="Még nincs belépés ma."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gombok és jelvények</CardTitle>
              <CardDescription>három variáns</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary">Hosszabbítás</Button>
                <Button variant="secondary" size="sm">
                  Kicsi
                </Button>
                <Button variant="secondary" disabled>
                  Letiltva
                </Button>
                <Button variant="primary">Beléptetés</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="link">Teljes órarend</Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button variant="secondary" disabled>
                        Új termék
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Nincs jogosultságod ehhez
                  </TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="További műveletek"
                    >
                      <MoreHorizontal aria-hidden strokeWidth={1.75} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      Digitális kártya
                    </DropdownMenuItem>
                    <DropdownMenuItem>Fagyasztás</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>+7 nap</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">Érvényes</Badge>
                <Badge variant="warning">Hamarosan lejár</Badge>
                <Badge variant="destructive">Lejárt</Badge>
                <Badge variant="secondary">Távozott</Badge>
                <Badge variant="secondary" dot={false}>
                  Kiegészítő
                </Badge>
              </div>
              <Alert>
                <AlertDescription>
                  Érvényes bérletnél az új időszak a mostani lejárat
                  után indul.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertDescription>
                  A bérlet nov. 7. napon lejárt. Beléptetés előtt
                  hosszabbítás vagy új bérlet szükséges.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Vendég adatai</CardTitle>
              <CardActions className="md:w-auto">
                <Badge variant="success">Érvényes</Badge>
              </CardActions>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-center gap-3">
                <Avatar name="Nagy Eszter" size="lg" />
                <div>
                  <p className="text-base font-semibold">Nagy Eszter</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    RS-04821 · +36 30 412 8831
                  </p>
                </div>
              </div>
              <DataList>
                <DataListItem label="Bérlet">
                  8 alkalmas Reformer
                </DataListItem>
                <DataListItem label="Érvényes">
                  nov. 29.{' '}
                  <span className="font-normal text-muted-foreground">
                    (még 19 nap)
                  </span>
                </DataListItem>
                <DataListItem label="Fennmaradó">
                  <span className="grid gap-1.5">
                    4 / 8 alkalom
                    <Progress value={4} max={8} aria-hidden />
                  </span>
                </DataListItem>
              </DataList>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary">Hosszabbítás</Button>
                <PurchaseDialog />
                <ConfirmDialog />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Megjelenés</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ToggleGroup
                type="single"
                aria-label="Téma"
                value={theme}
                onValueChange={(value) =>
                  (value === 'light' || value === 'dark') && saveTheme(value)
                }
              >
                <ToggleGroupItem value="light">Világos</ToggleGroupItem>
                <ToggleGroupItem value="dark">Sötét</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup
                type="single"
                aria-label="Felületszín"
                value={surface}
                onValueChange={(value) =>
                  isSurfaceColor(value) && saveSurface(value)
                }
                className="gap-2 overflow-visible rounded-none border-0 bg-transparent shadow-none"
              >
                {SURFACE_COLORS.map((color) => (
                  <ToggleGroupItem
                    key={color.id}
                    value={color.id}
                    data-surface={color.id}
                    aria-label={color.name}
                    className="size-[30px] flex-none rounded-md border border-border bg-primary p-0 first:border-l hover:bg-primary data-[state=on]:bg-primary data-[state=on]:outline data-[state=on]:outline-2 data-[state=on]:outline-offset-2 data-[state=on]:outline-foreground coarse:size-10"
                  />
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-2">
                <Switch id="preview-collapsed" />
                <Label
                  htmlFor="preview-collapsed"
                  className="text-[13px] font-normal text-foreground"
                >
                  Összecsukott oldalsáv
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="preview-check" defaultChecked />
                <Label
                  htmlFor="preview-check"
                  className="text-[13px] font-normal text-foreground"
                >
                  Recepciós: Bérlet hosszabbítása
                </Label>
              </div>
              <RadioGroup defaultValue="card" aria-label="Fizetési mód">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="card" id="preview-card" />
                  <Label
                    htmlFor="preview-card"
                    className="text-[13px] font-normal text-foreground"
                  >
                    Bankkártya
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cash" id="preview-cash" />
                  <Label
                    htmlFor="preview-cash"
                    className="text-[13px] font-normal text-foreground"
                  >
                    Készpénz
                  </Label>
                </div>
              </RadioGroup>
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

const PurchaseDialog: React.FC = () => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="secondary">Új vásárlás</Button>
    </DialogTrigger>
    <DialogContent size="form">
      <DialogHeader>
        <DialogTitle>Vásárlás · Nagy Eszter</DialogTitle>
      </DialogHeader>
      <DialogBody className="grid gap-3.5">
        <div className="grid gap-1.5">
          <Label htmlFor="preview-pay">Fizetési mód</Label>
          <Select defaultValue="card">
            <SelectTrigger id="preview-pay">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="card">Bankkártya</SelectItem>
              <SelectItem value="cash">Készpénz</SelectItem>
              <SelectItem value="szep">SZÉP-kártya</SelectItem>
              <SelectItem value="transfer">Átutalás</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="preview-name">Név</Label>
          <Input id="preview-name" defaultValue="Nagy Eszter" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="preview-note">Megjegyzés a számlára</Label>
          <Textarea id="preview-note" />
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogSummary label="Új lejárat: dec. 24." value="52 000 Ft" />
        <Button variant="secondary">Mégse</Button>
        <Button variant="primary">Fizetés rögzítése</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const ConfirmDialog: React.FC = () => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant="secondary">Sztornó</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Beléptetés sztornózása</AlertDialogTitle>
      </AlertDialogHeader>
      <AlertDialogBody>
        <AlertDialogDescription>
          Nagy Eszter 14:52-es beléptetése törlődik, és az alkalom visszakerül a
          bérletre.
        </AlertDialogDescription>
      </AlertDialogBody>
      <AlertDialogFooter>
        <AlertDialogCancel>Mégse</AlertDialogCancel>
        <AlertDialogAction>Beléptetés sztornózása</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
