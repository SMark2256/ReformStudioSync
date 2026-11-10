import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';

import { useThemeStore } from '@/shared/theme';

type ToasterProps = ComponentProps<typeof Sonner>;

const iconProps = {
  'aria-hidden': true,
  strokeWidth: 1.75,
  className: 'size-4',
} as const;

// Toast (UI-specifikáció 5.13): jobb alul, mobilon alul teljes szélességben, 64 px-re az aljától;
// `bg-foreground text-background`, 13 px, `rounded-md`. Az akciógomb `link` stílusú. A toastokat
// továbbra is a `shared/lib/notify` adja, ez csak a megjelenésük; egy `<Toaster />` legyen.
const Toaster = (props: ToasterProps) => {
  const theme = useThemeStore((state) => state.theme);

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      offset={{ bottom: 64, right: 20 }}
      mobileOffset={{ bottom: 64, left: 12, right: 12 }}
      className="toaster z-[60]"
      icons={{
        success: <CircleCheck {...iconProps} />,
        info: <Info {...iconProps} />,
        warning: <TriangleAlert {...iconProps} />,
        error: <OctagonX {...iconProps} />,
        loading: (
          <LoaderCircle
            {...iconProps}
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            'rounded-md border-0 bg-foreground px-3.5 py-2.5 text-[13px] text-background shadow-lg',
          title: 'font-semibold',
          description: 'text-background/80',
          actionButton:
            '!h-auto !bg-transparent !p-0 !text-[13px] font-semibold !text-background underline decoration-1 underline-offset-[3px] hover:decoration-2',
          cancelButton:
            '!h-auto !bg-transparent !p-0 !text-[13px] !text-background/80 underline decoration-1 underline-offset-[3px]',
          closeButton: '!border-border !bg-card !text-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
