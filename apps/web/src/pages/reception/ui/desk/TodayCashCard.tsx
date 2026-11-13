import { DailyFinanceSummaryDto } from '@reform/shared';
import React from 'react';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/ui';
import { formatHuf } from './format';

interface TodayCashCardProps {
  finance?: DailyFinanceSummaryDto;
  onOpenFinance: () => void;
}

// A mai kassza összesen és fizetési módonként.
export const TodayCashCard: React.FC<TodayCashCardProps> = ({
  finance,
  onOpenFinance,
}) => (
  <Card data-tour="reception.today-cash">
    <CardHeader>
      <CardTitle>Mai kassza</CardTitle>
      <CardActions className="md:w-auto">
        <Button variant="link" onClick={onOpenFinance}>
          Tartozások és napi zárás
        </Button>
      </CardActions>
    </CardHeader>
    <CardContent>
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {formatHuf(finance?.totalRevenue ?? 0)}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ['Készpénz', finance?.byMethod.CASH],
            ['Bankkártya', finance?.byMethod.POS_CARD],
            ['Átutalás', finance?.byMethod.BANK_TRANSFER],
          ] as const
        ).map(([label, amount]) => (
          <div
            key={label}
            className="min-w-0 rounded-md border border-border bg-muted px-2.5 py-2"
          >
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-[13px] font-semibold tabular-nums text-foreground">
              {formatHuf(amount ?? 0)}
            </dd>
          </div>
        ))}
      </dl>
    </CardContent>
  </Card>
);
