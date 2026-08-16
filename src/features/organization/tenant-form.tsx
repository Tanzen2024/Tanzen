import { useId, useState, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { FormSection, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { TenantInput } from '@/services/organization.service';
import type { Tenant } from '@/mocks/organization/tenants';

/**
 * Partagé entre `PlatformTenantCreate`/`TenantEdit` (déjà consommateurs,
 * `src/features/platform/platform-module.tsx`) et `CheckoutPage` (tunnel de
 * souscription public, `src/features/public/checkout-page.tsx`) — voir
 * docs/ARCHITECTURE_PLATFORM_TENANT_FINAL.md §7/E5 et
 * docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md §12/§21 Décision B) : les deux
 * parcours décrivent « à quoi ressemble un tenant », seule l'orchestration
 * de page diffère (création immédiate par un opérateur vs. étape d'un
 * tunnel multi-étapes post-paiement) — non partagée ici intentionnellement.
 *
 * `tone` (2026-08-16, refonte UX du Checkout) : bascule purement visuelle,
 * aucun champ/validation/comportement ne change. `'admin'` (défaut) est
 * inchangé — Platform Administration continue de recevoir exactement le même
 * rendu qu'avant. `'checkout'` habille les mêmes champs avec la palette
 * `landing-*` du site public (inputs plus doux, sections sans `fieldset`
 * encadré, CTA dominant) pour que le formulaire réutilisé se fonde dans le
 * tunnel de souscription au lieu de trancher visuellement avec lui.
 */
export type T = (section: 'organization' | 'nav', key: string, values?: Record<string, string>) => string;

function SoftSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div>
        <h3 id={headingId} className="text-base font-bold text-landing-primary">{title}</h3>
        {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export type TenantFormValues = TenantInput;
export type TenantFormErrors = Partial<Record<'name' | 'legalName' | 'email', string>>;

export function useTenantFormValues(tenant?: Tenant) {
  return useState<TenantFormValues>(() => ({ name: tenant?.name ?? '', legalName: tenant?.legalName ?? '', code: tenant?.code ?? '', type: tenant?.type ?? 'cooperative', country: tenant?.country ?? 'Sénégal', city: tenant?.city ?? '', email: tenant?.email ?? '', phone: tenant?.phone ?? '', address: tenant?.address ?? '', website: tenant?.website ?? '', description: tenant?.description ?? '' }));
}

export function validateTenant(values: TenantFormValues, t: T): TenantFormErrors {
  const errors: TenantFormErrors = {};
  if (!values.name.trim()) errors.name = t('organization', 'fieldRequired');
  if (!values.legalName.trim()) errors.legalName = t('organization', 'fieldRequired');
  if (!values.email.trim()) errors.email = t('organization', 'fieldRequired');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = t('organization', 'invalidEmail');
  return errors;
}

export function TenantForm({ values, onChange, errors, t, onCancel, onSave, saving, cancelLabel, saveLabel, tone = 'admin' }: { values: TenantFormValues; onChange: (patch: Partial<TenantFormValues>) => void; errors: TenantFormErrors; t: T; onCancel: () => void; onSave: () => void; saving: boolean; cancelLabel?: string; saveLabel?: string; tone?: 'admin' | 'checkout' }) {
  const soft = tone === 'checkout';
  const Section = soft ? SoftSection : FormSection;
  const fieldClass = soft ? 'h-11 rounded-xl border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-0' : undefined;
  const areaClass = soft ? 'rounded-xl border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-0' : undefined;
  const selectClass = soft ? 'flex h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent' : 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';
  const labelClass = soft ? 'text-sm font-semibold text-slate-700' : undefined;
  const wrapperClass = soft ? 'space-y-8' : 'grid gap-5 lg:grid-cols-2';
  const actionsClass = soft ? 'flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between' : 'flex justify-end gap-2 lg:col-span-2';
  const cancelClass = soft ? 'text-slate-500 hover:bg-transparent hover:text-landing-primary' : undefined;
  const saveClass = soft ? 'h-12 w-full rounded-xl bg-landing-accent px-6 text-base font-bold text-landing-primary shadow-sm hover:bg-landing-accent-dark focus-visible:ring-landing-accent sm:w-auto' : undefined;
  return <div className={wrapperClass}>
    <Section title={t('organization', 'general')} description={t('organization', 'tenantsDescription')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="tenant-name" className={labelClass}>{t('organization', 'name')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="tenant-name" className={fieldClass} value={values.name} onChange={(event) => onChange({ name: event.target.value })} placeholder={t('organization', 'name')} required aria-required="true" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'tenant-name-error' : undefined} /><span id="tenant-name-error"><FieldError message={errors.name} /></span></div>
        <div className="space-y-2"><Label htmlFor="legal-name" className={labelClass}>{t('organization', 'legalName')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="legal-name" className={fieldClass} value={values.legalName} onChange={(event) => onChange({ legalName: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.legalName)} aria-describedby={errors.legalName ? 'legal-name-error' : undefined} /><span id="legal-name-error"><FieldError message={errors.legalName} /></span></div>
        <div className="space-y-2"><Label htmlFor="tenant-code" className={labelClass}>{t('organization', 'code')}</Label><Input id="tenant-code" className={fieldClass} value={values.code} onChange={(event) => onChange({ code: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="tenant-type" className={labelClass}>{t('organization', 'tenantType')}</Label><select id="tenant-type" value={values.type} onChange={(event) => onChange({ type: event.target.value as TenantFormValues['type'] })} className={selectClass}><option value="cooperative">{t('organization', 'cooperative')}</option><option value="tontine">{t('organization', 'tontine')}</option><option value="association">{t('organization', 'association')}</option><option value="mutuelle">{t('organization', 'mutuelle')}</option></select></div>
        <div className="space-y-2"><Label htmlFor="country" className={labelClass}>{t('organization', 'country')}</Label><Input id="country" className={fieldClass} value={values.country} onChange={(event) => onChange({ country: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="city" className={labelClass}>{t('organization', 'city')}</Label><Input id="city" className={fieldClass} value={values.city} onChange={(event) => onChange({ city: event.target.value })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="tenant-description" className={labelClass}>{t('organization', 'description')}</Label><Textarea id="tenant-description" className={areaClass} value={values.description} onChange={(event) => onChange({ description: event.target.value })} /></div>
      </div>
    </Section>
    <Section title={t('organization', 'contact')}>
      <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="tenant-email" className={labelClass}>{t('organization', 'email')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="tenant-email" type="email" className={fieldClass} value={values.email} onChange={(event) => onChange({ email: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'tenant-email-error' : undefined} /><span id="tenant-email-error"><FieldError message={errors.email} /></span></div>
        <div className="space-y-2"><Label htmlFor="tenant-phone" className={labelClass}>{t('organization', 'phone')}</Label><Input id="tenant-phone" className={fieldClass} value={values.phone} onChange={(event) => onChange({ phone: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="tenant-address" className={labelClass}>{t('organization', 'address')}</Label><Input id="tenant-address" className={fieldClass} value={values.address} onChange={(event) => onChange({ address: event.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="tenant-website" className={labelClass}>{t('organization', 'website')}</Label><Input id="tenant-website" className={fieldClass} value={values.website} onChange={(event) => onChange({ website: event.target.value })} /></div>
      </div>
    </Section>
    <div className={actionsClass}>
      <Button type="button" variant={soft ? 'ghost' : 'outline'} className={cancelClass} disabled={saving} onClick={onCancel}>{cancelLabel ?? t('organization', 'cancel')}</Button>
      <Button type="button" className={saveClass} disabled={saving} onClick={onSave}>
        {soft ? <>{saving ? t('organization', 'saving') : (saveLabel ?? t('organization', 'save'))}{!saving && <ArrowRight size={17} />}</> : <><Check size={15} />{saving ? t('organization', 'saving') : (saveLabel ?? t('organization', 'save'))}</>}
      </Button>
    </div>
  </div>;
}
