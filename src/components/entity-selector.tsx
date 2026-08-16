import { ChevronDown } from 'lucide-react';

export function EntitySelector({ label, value, options, onChange }: { label?: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="relative inline-flex min-w-44 flex-col gap-1 text-xs font-medium text-muted-foreground">{label && <span>{label}</span>}<span className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-8 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /></span></label>;
}
