import { CheckInStatus, LoggedCheckInDto } from '@reform/shared';
import React from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/ui';
import { CHECK_IN_STATUS_BADGES } from './checkInStatus';

interface TodayCheckInsCardProps {
  checkIns: LoggedCheckInDto[];
  onRevoke: (checkInId: string) => void;
}

// A mai érkezések és kezelések naplója, sikeres tételnél sztornóval.
export const TodayCheckInsCard: React.FC<TodayCheckInsCardProps> = ({
  checkIns,
  onRevoke,
}) => (
  <Card data-tour="reception.today-check-ins">
    <CardHeader>
      <CardTitle>Mai érkezések és kezelések ({checkIns.length})</CardTitle>
    </CardHeader>
    <CardContent className="p-0 md:p-0">
      {checkIns.length === 0 ? (
        <p className="py-7 text-center text-[13px] text-muted-foreground">
          Még nincs belépés ma.
        </p>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto">
          {checkIns.map((log) => {
            const status = CHECK_IN_STATUS_BADGES[log.status];
            return (
              <li
                key={log.id}
                className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-foreground">
                      {log.guestName}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      #{log.guestBarcode}
                    </span>
                    {log.serviceName && (
                      <Badge variant="secondary" dot={false}>
                        {log.serviceName}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {log.status === CheckInStatus.CANCELLED
                      ? `Visszavonva (${log.reversalReason ?? 'Sztornó'})`
                      : (log.passName ?? log.reason ?? status.label)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <time
                      dateTime={log.createdAt}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {new Date(log.createdAt).toLocaleTimeString('hu-HU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  {log.status === CheckInStatus.SUCCESS && (
                    <Button
                      variant="link"
                      aria-label={`${log.guestName} beléptetésének sztornózása`}
                      onClick={() => onRevoke(log.id)}
                    >
                      Sztornó
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);
