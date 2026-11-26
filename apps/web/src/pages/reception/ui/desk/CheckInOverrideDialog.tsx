import { CHECK_IN_OVERRIDE_REASON_MAX_LENGTH } from '@reform/shared';
import React, { useId, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@/shared/ui';
import { CHECK_IN_OVERRIDE_TEXTS as T } from '../../model/checkInOverrideTexts';

interface CheckInOverrideDialogProps {
  guestName: string;
  /** Az elutasítás oka a szervertől (összeggel, napokkal). */
  deniedReason?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  /** Az indoklás szóközök nélkül; üresen a dialógus nem küldi el. */
  onConfirm: (reason: string) => void;
}

// Kivételes beengedés (TICKET-15): tartozás miatti elutasítás feloldása kötelező indoklással.
// A döntés és a napló a szerveré; ez csak bekéri az indoklást.
export const CheckInOverrideDialog: React.FC<CheckInOverrideDialogProps> = ({
  guestName,
  deniedReason,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const fieldId = useId();
  const [reason, setReason] = useState('');
  const [showError, setShowError] = useState(false);
  const trimmed = reason.trim();
  const reasonError = showError && !trimmed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) {
      setShowError(true);
      return;
    }
    if (!isSubmitting) onConfirm(trimmed);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="form" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {T.title}: {guestName}
          </DialogTitle>
          <DialogDescription>{T.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {deniedReason && (
              <Alert variant="destructive">
                <AlertDescription>{deniedReason}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-reason`}>{T.reasonLabel}</Label>
              <Textarea
                id={`${fieldId}-reason`}
                data-barcode-ignore
                value={reason}
                maxLength={CHECK_IN_OVERRIDE_REASON_MAX_LENGTH}
                onChange={(e) => setReason(e.target.value)}
                placeholder={T.reasonPlaceholder}
                aria-invalid={reasonError || undefined}
                aria-describedby={reasonError ? `${fieldId}-reason-error` : undefined}
                aria-required
              />
              {reasonError && (
                <p
                  id={`${fieldId}-reason-error`}
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {T.reasonRequired}
                </p>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {T.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? T.submitting : T.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
