import * as React from 'react';

import { cn } from '@/shared/lib/utils';
import { fieldClassName } from './field-styles';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldClassName, 'min-h-20 py-2', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
