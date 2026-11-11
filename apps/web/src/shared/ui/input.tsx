import { Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/shared/lib/utils';
import { fieldClassName } from './field-styles';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        fieldClassName,
        'h-[34px] coarse:h-11',
        'file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

// Kereső (5.2): bal oldalt 16 px-es `Search` ikon, `type="search"`; a címkét a hívó adja
// (`Label` `sr-only`-val vagy `aria-label`). Asztalin 320, tableten 240 px, mobilon teljes szélesség.
const SearchInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, ...props }, ref) => (
  <div className={cn('relative w-full md:w-60 xl:w-80', className)}>
    <Search
      aria-hidden
      strokeWidth={1.75}
      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input ref={ref} type="search" className="pl-[34px]" {...props} />
  </div>
));
SearchInput.displayName = 'SearchInput';

export { Input, SearchInput };
