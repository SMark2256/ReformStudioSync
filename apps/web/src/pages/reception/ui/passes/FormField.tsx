import React, { useId } from 'react';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui';

// Címke a mező fölött, 6 px réssel (UI-specifikáció 5.2); kötelező mezőnél `*`.
export const FormField: React.FC<{
  label: string;
  required?: boolean;
  className?: string;
  children: (id: string) => React.ReactNode;
}> = ({ label, required, className, children }) => {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span aria-hidden> *</span>}
      </Label>
      {children(id)}
    </div>
  );
};

export const RequiredFieldNote: React.FC<{ className?: string }> = ({
  className,
}) => (
  <p className={cn('text-xs text-muted-foreground', className)}>
    * kötelező mező
  </p>
);
