import * as React from 'react';

import {
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
} from './alert-dialog';
import { Button, type ButtonProps } from './button';

interface ConfirmActionButtonProps extends Pick<
  ButtonProps,
  'variant' | 'size' | 'disabled' | 'aria-label'
> {
  children: React.ReactNode;
  /** A megerősítő ablak címe és a megerősítő gomb felirata („Fizetés sztornózása”). */
  confirmLabel: string;
  description: React.ReactNode;
  onConfirm: () => void;
}

// Veszélyes művelet (UI-specifikáció 5.1): a gomb `AlertDialog`-ot nyit, a megerősítő gomb
// `primary`, és a műveletet mondja ki.
export const ConfirmActionButton: React.FC<ConfirmActionButtonProps> = ({
  children,
  confirmLabel,
  description,
  onConfirm,
  variant = 'secondary',
  ...buttonProps
}) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant={variant} {...buttonProps}>
        {children}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{confirmLabel}</AlertDialogTitle>
      </AlertDialogHeader>
      <AlertDialogBody>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogBody>
      <AlertDialogFooter>
        <AlertDialogCancel>Mégse</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
