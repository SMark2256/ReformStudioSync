import { BookingDto } from '@reform/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import React, { useId, useState } from 'react';
import { BOOKING_QUERY_KEYS, formatDayKey } from '@/entities/booking';
import { bookingApi } from '@/shared/api';
import { APP_ROUTES } from '@/shared/config';
import {
  Alert,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';
import { shiftDay, weekDayKeys } from '../model/calendarLayout';
import { studioToday } from '../model/dateInput';
import { useBookingLiveUpdates } from '../model/useBookingLiveUpdates';
import { BookingCalendar, dayColumns, weekColumns } from './BookingCalendar';
import { BookingDetailsDialog } from './BookingDetailsDialog';
import { BookingSettingsSection } from './BookingSettingsSection';
import { NewBookingDialog } from './NewBookingDialog';
import { WaitlistSection } from './WaitlistSection';

type Tab = 'calendar' | 'waitlist' | 'settings';
type View = 'day' | 'week';

/**
 * Foglalások (`/bookings`, TICKET-57): valós idejű napi naptár gépenként, heti nézet egy gépre,
 * várólista és foglalási beállítások.
 */
export const BookingsPage: React.FC = () => {
  const fieldId = useId();
  useBookingLiveUpdates();
  const [tab, setTab] = useState<Tab>('calendar');
  const [view, setView] = useState<View>('day');
  const [dayKey, setDayKey] = useState(studioToday);
  const [resourceId, setResourceId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<BookingDto | null>(null);

  const week = weekDayKeys(dayKey);
  const from = view === 'week' ? week[0] : dayKey;
  const to = view === 'week' ? week[week.length - 1] : dayKey;
  const calendar = useQuery({
    queryKey: BOOKING_QUERY_KEYS.calendar(from, to),
    queryFn: () => bookingApi.getCalendar(from, to),
    // A socket kiesése esetére percenként frissül.
    refetchInterval: 60_000,
  });
  const sync = useQuery({ queryKey: BOOKING_QUERY_KEYS.sync, queryFn: () => bookingApi.getSyncStatus() });
  const data = calendar.data;
  const activeResourceId = resourceId || data?.resources[0]?.id || '';
  const columns = data
    ? view === 'day'
      ? dayColumns(data, dayKey)
      : weekColumns(data, activeResourceId, weekDayKeys(dayKey, data.days))
    : [];

  return (
    <>
      <PageHeader
        title={APP_ROUTES.bookings.title}
        description="Napi és heti foglalási naptár gépenként és kozmetikusonként, várólista és foglalási szabályok."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} disabled={!data}>
            <Plus aria-hidden="true" />
            Új foglalás
          </Button>
        }
      />

      <div className="space-y-4 md:space-y-6">
        <ToggleGroup
          type="single"
          aria-label="Foglalások nézete"
          value={tab}
          onValueChange={(value) => value && setTab(value as Tab)}
          className="flex-wrap"
        >
          <ToggleGroupItem value="calendar">Naptár</ToggleGroupItem>
          <ToggleGroupItem value="waitlist">Várólista</ToggleGroupItem>
          <ToggleGroupItem value="settings">Beállítások</ToggleGroupItem>
        </ToggleGroup>

        {sync.data?.configured && sync.data.failed > 0 && (
          <Alert variant="destructive">
            A Google Naptár szinkron {sync.data.failed} tételnél sikertelen. Részletek és újrapróbálás a Beállításokban.
          </Alert>
        )}

        {tab === 'calendar' && (
          <Card>
            <CardHeader className="flex-wrap gap-3">
              <CardTitle>{view === 'day' ? formatDayKey(dayKey) : `${formatDayKey(from, false)} – ${formatDayKey(to, false)}`}</CardTitle>
              <CardActions className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                  type="single"
                  aria-label="Naptár nézet"
                  value={view}
                  onValueChange={(value) => value && setView(value as View)}
                >
                  <ToggleGroupItem value="day">Nap</ToggleGroupItem>
                  <ToggleGroupItem value="week">Hét (erőforrásonként)</ToggleGroupItem>
                </ToggleGroup>
                {view === 'week' && data && (
                  <Select value={activeResourceId} onValueChange={setResourceId}>
                    <SelectTrigger aria-label="Gép vagy kozmetikus" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.resources.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="icon" aria-label="Előző" onClick={() => setDayKey((d) => shiftDay(d, view, -1))}>
                  <ChevronLeft />
                </Button>
                <Button onClick={() => setDayKey(studioToday())}>Ma</Button>
                <Button size="icon" aria-label="Következő" onClick={() => setDayKey((d) => shiftDay(d, view, 1))}>
                  <ChevronRight />
                </Button>
                <Label htmlFor={`${fieldId}-day`} className="sr-only">
                  Nap választása
                </Label>
                <Input
                  id={`${fieldId}-day`}
                  type="date"
                  value={dayKey}
                  onChange={(e) => e.target.value && setDayKey(e.target.value)}
                  className="w-40"
                />
              </CardActions>
            </CardHeader>
            <CardContent className="p-0 md:p-0">
              {calendar.isError ? (
                <div className="space-y-3 p-5">
                  <Alert variant="destructive">A naptár nem töltődött be.</Alert>
                  <Button onClick={() => void calendar.refetch()}>Újrapróbálás</Button>
                </div>
              ) : !data ? (
                <div className="space-y-2 p-5">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <BookingCalendar data={data} columns={columns} onOpenBooking={setSelected} />
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'waitlist' && <WaitlistSection treatments={data?.treatments ?? []} />}
        {tab === 'settings' && <BookingSettingsSection />}
      </div>

      {data && (
        <NewBookingDialog open={creating} onOpenChange={setCreating} treatments={data.treatments} initialDayKey={dayKey} />
      )}
      <BookingDetailsDialog booking={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
};
