import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { focusRingClassName } from './focus-styles';
import {
  modalBodyClassName,
  modalCloseButtonClassName,
  modalContentClassName,
  modalFooterClassName,
  modalHeaderClassName,
  modalOverlayClassName,
  modalSizeClassName,
  modalTitleClassName,
  type ModalSize,
} from './modal-styles';

// Modál (UI-specifikáció 5.12). A Radix fókuszkezelését (fókuszcsapda, Escape, a fókusz
// visszaadása) nem írjuk felül, és nem állítjuk meg a billentyűesemények terjedését, így a
// vonalkódolvasó nyitott modál mellett is működik.
const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(modalOverlayClassName, className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** `default`: 640 px, `form`: 480 px. */
    size?: ModalSize;
  }
>(({ className, size = 'default', children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(modalContentClassName, modalSizeClassName[size], className)}
      {...props}
    >
      {children}
      {/* A bezárás gomb a DOM végén van (látszólag a fejlécben, jobbra), így megnyitáskor a
          Radix az első mezőre vagy a kiválasztott rádiógombra fókuszál, nem erre. */}
      <DialogPrimitive.Close
        aria-label="Bezárás"
        className={cn(
          'absolute right-3 top-[9px] coarse:top-[3px]',
          modalCloseButtonClassName,
          focusRingClassName,
        )}
      >
        <X aria-hidden strokeWidth={1.75} className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// Fejléc: a cím (`DialogTitle`); jobbra a `DialogContent` bezárás gombjának helye.
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(modalHeaderClassName, 'block pr-14 coarse:pr-16', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

// Görgethető törzs; az alblokkok címe `h3` 12 px 600 `muted-foreground`.
const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(modalBodyClassName, className)} {...props} />
);
DialogBody.displayName = 'DialogBody';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(modalFooterClassName, className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

// A lábléc bal oldala: 12 px címke, felette 18 px 600 érték, `aria-live="polite"`.
const DialogSummary = ({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) => (
  <div
    aria-live="polite"
    className={cn('mr-auto max-md:w-full max-md:pb-1', className)}
  >
    <p className="text-lg font-semibold tabular-nums text-foreground">
      {value}
    </p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);
DialogSummary.displayName = 'DialogSummary';

// A modál címe `h2`.
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(modalTitleClassName, className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('mt-0.5 text-xs text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogSummary,
  DialogTitle,
  DialogDescription,
};
