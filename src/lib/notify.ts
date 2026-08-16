import { toast } from '@/hooks/use-toast';

const AUTO_DISMISS_MS = 4000;

function show(title: string, variant?: 'destructive') {
  const { dismiss } = toast({ title, variant });
  window.setTimeout(dismiss, AUTO_DISMISS_MS);
}

export const notify = {
  success: (message: string) => show(message),
  error: (message: string) => show(message, 'destructive'),
};
