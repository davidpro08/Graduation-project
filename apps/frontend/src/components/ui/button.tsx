import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn/ui의 공개 Button 구성을 프로젝트에서 관리합니다.
const buttonVariants = cva(
  'button inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'button-primary',
        outline: 'button-outline',
        secondary: 'button-secondary',
        ghost: 'hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
        evidence: 'button-evidence',
        destructive: 'button-destructive',
        'danger-outline': 'button-danger-outline',
      },
      size: { default: 'min-h-12 px-6 py-3', sm: 'min-h-11 px-3 py-2', lg: 'min-h-12 px-8 py-3', icon: 'h-11 w-11 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({ className, variant, size, asChild = false, ...props }:
  React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
