import { useState } from 'react';
import { Check } from 'lucide-react';
import { FormSection, FieldError } from '@/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { TenantInput } from '@/services/organization.service';
import type { Tenant } from '@/mocks/organization/tenants';

/**
 * Partagé entre `PlatformTenantCreate`/`TenantEdit` (déjà consommateurs,
 * `src/features/platform/platform-module.tsx`) et un futur
 * `SaaSTenantOnboarding` (tunnel de souscription public, non construit —
 * voir docs/ARCHITECTURE_PLATFORM_TENANT_FINAL.md §7/E5 et
 * docs/DECISION_PLATFORM_SAAS_TENANT_FINAL.md §12/§21 Décision B) : les deux
 * parcours décrivent « à quoi ressemble un tenant », seule l'orchestration
 * de page diffère (création immédiate par un opérateur vs. étape d'un
 * tunnel multi-étapes post-paiement) — non partagée ici intentionnellement.
 */
export type T = (section: 'organization' | 'nav', key: string, values?: Record<string, string>) => string;

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

export function TenantForm({ values, onChange, errors, t, onCancel, onSave, saving }: { values: TenantFormValues; onChange: (patch: Partial<TenantFormValues>) => void; errors: TenantFormErrors; t: T; onCancel: () => void; onSave: () => void; saving: boolean }) {
  return <div className="grid gap-5 lg:grid-cols-2"><FormSection title={t('organization', 'general')} description={t('organization', 'tenantsDescription')}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="tenant-name">{t('organization', 'name')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="tenant-name" value={values.name} onChange={(event) => onChange({ name: event.target.value })} placeholder={t('organization', 'name')} required aria-required="true" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'tenant-name-error' : undefined} /><span id="tenant-name-error"><FieldError message={errors.name} /></span></div><div className="space-y-2"><Label htmlFor="legal-name">{t('organization', 'legalName')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="legal-name" value={values.legalName} onChange={(event) => onChange({ legalName: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.legalName)} aria-describedby={errors.legalName ? 'legal-name-error' : undefined} /><span id="legal-name-error"><FieldError message={errors.legalName} /></span></div><div className="space-y-2"><Label htmlFor="tenant-code">{t('organization', 'code')}</Label><Input id="tenant-code" value={values.code} onChange={(event) => onChange({ code: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="tenant-type">{t('organization', 'tenantType')}</Label><select id="tenant-type" value={values.type} onChange={(event) => onChange({ type: event.target.value as TenantFormValues['type'] })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="cooperative">{t('organization', 'cooperative')}</option><option value="tontine">{t('organization', 'tontine')}</option><option value="association">{t('organization', 'association')}</option><option value="mutuelle">{t('organization', 'mutuelle')}</option></select></div><div className="space-y-2"><Label htmlFor="country">{t('organization', 'country')}</Label><Input id="country" value={values.country} onChange={(event) => onChange({ country: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="city">{t('organization', 'city')}</Label><Input id="city" value={values.city} onChange={(event) => onChange({ city: event.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="tenant-description">{t('organization', 'description')}</Label><Textarea id="tenant-description" value={values.description} onChange={(event) => onChange({ description: event.target.value })} /></div></div></FormSection><FormSection title={t('organization', 'contact')}><div className="space-y-4"><div className="space-y-2"><Label htmlFor="tenant-email">{t('organization', 'email')} <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="tenant-email" type="email" value={values.email} onChange={(event) => onChange({ email: event.target.value })} required aria-required="true" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'tenant-email-error' : undefined} /><span id="tenant-email-error"><FieldError message={errors.email} /></span></div><div className="space-y-2"><Label htmlFor="tenant-phone">{t('organization', 'phone')}</Label><Input id="tenant-phone" value={values.phone} onChange={(event) => onChange({ phone: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="tenant-address">{t('organization', 'address')}</Label><Input id="tenant-address" value={values.address} onChange={(event) => onChange({ address: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="tenant-website">{t('organization', 'website')}</Label><Input id="tenant-website" value={values.website} onChange={(event) => onChange({ website: event.target.value })} /></div></div></FormSection><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" disabled={saving} onClick={onCancel}>{t('organization', 'cancel')}</Button><Button disabled={saving} onClick={onSave}><Check size={15} />{saving ? t('organization', 'saving') : t('organization', 'save')}</Button></div></div>;
}
