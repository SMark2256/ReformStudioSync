import { IntakeGuestExitResponseDto } from '@reform/shared';
import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';
import { api } from '@/shared/api';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@/shared/ui';

/** Kilépés a vendégmódból: csak a munkatárs kilépési kódjával (a szerver ellenőrzi). */
export const ExitGuestModeDialog: React.FC<{
  guestToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExited: (result: IntakeGuestExitResponseDto) => void;
}> = ({ guestToken, open, onOpenChange, onExited }) => {
  const [code, setCode] = useState('');
  const exitMutation = useMutation({
    mutationFn: () => api.exitIntakeGuestMode(guestToken, code),
    onSuccess: (result) => {
      setCode('');
      onExited(result);
    },
    onError: () => setCode(''),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="form">
        <DialogHeader>
          <DialogTitle>Kilépés a vendégmódból</DialogTitle>
          <DialogDescription>Csak a recepció munkatársa léphet ki.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) exitMutation.mutate();
          }}
        >
          <DialogBody className="space-y-1.5">
            <Label htmlFor="intake-exit-code">Kilépési kód</Label>
            <Input
              id="intake-exit-code"
              data-barcode-ignore
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={code.length < 6 || exitMutation.isPending}
            >
              Kilépés
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
