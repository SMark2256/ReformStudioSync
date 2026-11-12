import { ServiceCategory, toAppError } from '@reform/shared';
import { useMutation } from '@tanstack/react-query';
import React, { useId, useState } from 'react';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui';
import { FormField, RequiredFieldNote } from './FormField';
import { SERVICE_CATEGORY_LABELS } from './labels';

interface ServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

// „Új szolgáltatás” modál. Az űrlap a modállal együtt csatolódik fel, így minden
// megnyitás az alapértékekkel indul.
export const ServiceDialog: React.FC<ServiceDialogProps> = ({
  open,
  onOpenChange,
  onCreated,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent size="form" onInteractOutside={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Új szolgáltatás</DialogTitle>
        <DialogDescription>
          Kezelés vagy óra kategóriával, időtartammal és listaárral.
        </DialogDescription>
      </DialogHeader>
      <ServiceForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
    </DialogContent>
  </Dialog>
);

const ServiceForm: React.FC<{
  onClose: () => void;
  onCreated: () => void;
}> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>(
    ServiceCategory.BODY_SHAPING,
  );
  const [duration, setDuration] = useState<number>(30);
  const [price, setPrice] = useState<number>(7500);
  const [womenOnly, setWomenOnly] = useState(false);
  const womenOnlyId = useId();

  const createServiceMutation = useMutation({
    mutationFn: api.createService,
    onSuccess: (srv) => {
      notify.success(
        'Új szolgáltatás létrehozva',
        `${srv.name} (${srv.durationMinutes} perc)`,
      );
      onCreated();
      onClose();
    },
  });

  return (
    <form
      aria-label="Új szolgáltatás"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        createServiceMutation.mutate({
          name,
          category,
          durationMinutes: duration,
          priceHuf: price,
          womenOnly,
        });
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {createServiceMutation.isError && (
          <Alert variant="destructive" className="sm:col-span-2">
            <AlertDescription>
              {toAppError(createServiceMutation.error).message}
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
              placeholder="Pl. Hypoxi Dermology"
            />
          )}
        </FormField>
        <FormField label="Kategória" className="sm:col-span-2">
          {(id) => (
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ServiceCategory)}
            >
              <SelectTrigger id={id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ServiceCategory).map((value) => (
                  <SelectItem key={value} value={value}>
                    {SERVICE_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="Időtartam (perc)">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="tabular-nums"
            />
          )}
        </FormField>
        <FormField label="Listaár (Ft)">
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
        <div className="flex flex-col gap-1 sm:col-span-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={womenOnlyId}
              checked={womenOnly}
              onCheckedChange={(checked) => setWomenOnly(checked === true)}
              aria-describedby={`${womenOnlyId}-hint`}
            />
            <Label
              htmlFor={womenOnlyId}
              className="text-[13px] font-normal text-foreground"
            >
              Csak nőknek
            </Label>
          </div>
          <p
            id={`${womenOnlyId}-hint`}
            className="text-xs text-muted-foreground"
          >
            Férfi vendégnek nem adható el ilyen bérlet vagy tagság, és vele nem
            léptethető be (pl. női köredzés).
          </p>
        </div>
        <RequiredFieldNote className="sm:col-span-2" />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Mégse
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={createServiceMutation.isPending}
        >
          Szolgáltatás hozzáadása
        </Button>
      </DialogFooter>
    </form>
  );
};
