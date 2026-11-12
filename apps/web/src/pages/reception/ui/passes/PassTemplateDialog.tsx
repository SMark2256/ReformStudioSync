import { PassType, toAppError } from '@reform/shared';
import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';
import { formatHuf } from '../desk/format';
import { FormField, RequiredFieldNote } from './FormField';
import { PASS_TYPE_LABELS } from './labels';

interface PassTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

// „Új bérletsablon” modál. Az űrlap a modállal együtt csatolódik fel, így minden
// megnyitás az alapértékekkel indul.
export const PassTemplateDialog: React.FC<PassTemplateDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent size="form" onInteractOutside={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Új bérletsablon</DialogTitle>
        <DialogDescription>
          Az eladható bérlet típusa, alkalomszáma, érvényessége és ára.
        </DialogDescription>
      </DialogHeader>
      <PassTemplateForm
        onClose={() => onOpenChange(false)}
        onCreated={onCreated}
      />
    </DialogContent>
  </Dialog>
);

const PassTemplateForm: React.FC<{
  onClose: () => void;
  onCreated: () => void;
}> = ({ onClose, onCreated }) => {
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
      onCreated();
      onClose();
    },
  });

  return (
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
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {createTemplateMutation.isError && (
          <Alert variant="destructive" className="sm:col-span-2">
            <AlertDescription>
              {toAppError(createTemplateMutation.error).message}
            </AlertDescription>
          </Alert>
        )}
        <FormField label="Megnevezés" required className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              required
              aria-required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pl. 10 alkalmas Hypoxi bérlet"
            />
          )}
        </FormField>
        <FormField label="Típus">
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
        </FormField>
        {type === PassType.OCCASION_BASED && (
          <FormField label="Alkalmak száma">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={passes}
                onChange={(e) => setPasses(Number(e.target.value))}
                className="tabular-nums"
              />
            )}
          </FormField>
        )}
        <FormField label="Érvényesség (nap)">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="tabular-nums"
            />
          )}
        </FormField>
        <FormField label="Ár (Ft)">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="tabular-nums"
            />
          )}
        </FormField>
        <RequiredFieldNote className="sm:col-span-2" />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Mégse
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={createTemplateMutation.isPending}
        >
          Bérletsablon hozzáadása
        </Button>
      </DialogFooter>
    </form>
  );
};
