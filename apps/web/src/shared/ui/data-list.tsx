import * as React from 'react';

import { cn } from '@/shared/lib/utils';

// Adatlista (UI-specifikáció 5.9): kétoszlopos `dl`, 130 px (mobilon 110 px) címke + érték.
const DataList = React.forwardRef<
  HTMLDListElement,
  React.HTMLAttributes<HTMLDListElement>
>(({ className, ...props }, ref) => (
  <dl
    ref={ref}
    className={cn(
      'grid grid-cols-[110px_minmax(0,1fr)] text-sm md:grid-cols-[130px_minmax(0,1fr)]',
      className,
    )}
    {...props}
  />
));
DataList.displayName = 'DataList';

interface DataListItemProps {
  label: React.ReactNode;
  children: React.ReactNode;
}

// Egy sor: `dt` `muted-foreground`, `dd` 500; kiegészítő info zárójelben `muted-foreground`-dal.
function DataListItem({ label, children }: DataListItemProps) {
  return (
    <>
      <dt className="border-b border-border py-2 text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 border-b border-border py-2 font-medium text-foreground">
        {children}
      </dd>
    </>
  );
}

export { DataList, DataListItem };
