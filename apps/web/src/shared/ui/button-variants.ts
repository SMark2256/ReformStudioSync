import { cva } from 'class-variance-authority';

import { focusRingClassName } from './focus-styles';

// Pontosan három variáns (UI-specifikáció 5.1). Nincs `destructive`, `ghost`, `outline`,
// `default`: a veszélyes művelet `secondary` gomb + `AlertDialog`.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[7px] whitespace-nowrap text-[13px] font-semibold ' +
    'transition-colors duration-150 motion-reduce:transition-none ' +
    `${focusRingClassName} ` +
    'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Fő művelet: egy nézetrészben legfeljebb egy, a sor végén.
        primary:
          'rounded-md border border-primary bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-foreground',
        // Minden más művelet.
        secondary:
          'rounded-md border border-input bg-secondary text-secondary-foreground shadow-sm hover:bg-muted',
        // Navigáció, másodrangú művelet szövegben vagy táblasorban.
        link: 'text-primary-text underline decoration-1 underline-offset-[3px] hover:decoration-2',
      },
      size: {
        default: 'h-9 px-4 coarse:h-11',
        sm: 'h-8 px-3 text-xs coarse:h-11',
        icon: 'h-9 w-9 coarse:h-11 coarse:w-11',
      },
    },
    compoundVariants: [
      {
        variant: 'link',
        className: 'h-auto px-0 coarse:h-auto coarse:min-h-11',
      },
    ],
    // Szándékosan a `secondary`: a `primary`-t mindig tudatosan kell kiírni.
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);
