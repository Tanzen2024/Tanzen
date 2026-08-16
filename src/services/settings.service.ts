import { mockRequest } from './api-client';
import { organizationSettingsList } from '@/mocks/settings/organization-settings';
import { localizationSettingsList } from '@/mocks/settings/localization-settings';
import { fiscalYears } from '@/mocks/settings/fiscal-years';
import { notificationChannels, notificationRules, notificationPreferences, type NotificationRuleTrigger } from '@/mocks/settings/notification-settings';
import { passwordPolicies, sessionPolicies, mfaPolicies, loginPolicies, type PasswordPolicy, type SessionPolicy, type MfaPolicy, type LoginPolicy } from '@/mocks/settings/security-policies';
import { moduleConfigs, type ModuleKey } from '@/mocks/settings/modules';
import { integrations } from '@/mocks/settings/integrations';

export const settingsService = {
  getOrganizationSettings: (tenantId: string) => mockRequest(() => organizationSettingsList.find((item) => item.tenantId === tenantId)),
  updateOrganizationSettings: (tenantId: string, patch: { timezone: string; currency: string }) =>
    mockRequest(() => {
      const settings = organizationSettingsList.find((item) => item.tenantId === tenantId);
      if (!settings) return undefined;
      Object.assign(settings, patch);
      return settings;
    }),

  getLocalizationSettings: (tenantId: string) => mockRequest(() => localizationSettingsList.find((item) => item.tenantId === tenantId)),
  updateLocalizationSettings: (tenantId: string, patch: Partial<Omit<(typeof localizationSettingsList)[number], 'tenantId'>>) =>
    mockRequest(() => {
      const settings = localizationSettingsList.find((item) => item.tenantId === tenantId);
      if (!settings) return undefined;
      Object.assign(settings, patch);
      return settings;
    }),

  listFiscalYears: (tenantId: string) => mockRequest(() => fiscalYears.filter((year) => year.tenantId === tenantId).sort((a, b) => b.startDate.localeCompare(a.startDate))),
  getCurrentFiscalYear: (tenantId: string) => mockRequest(() => fiscalYears.find((year) => year.tenantId === tenantId && year.isCurrent)),
  /** Clôture uniquement l'exercice courant (open, isCurrent) — n'ouvre jamais automatiquement le suivant, aucune règle de succession inventée. */
  closeCurrentFiscalYear: (tenantId: string) =>
    mockRequest(() => {
      const year = fiscalYears.find((item) => item.tenantId === tenantId && item.isCurrent);
      if (!year || year.status !== 'open') return undefined;
      year.status = 'closed';
      year.isCurrent = false;
      return year;
    }),
  /** Ouvre un exercice `upcoming` explicitement choisi — l'administrateur décide, jamais une cascade automatique de statut. `isCurrent` reste néanmoins un invariant à un seul exercice par tenant (jamais deux exercices courants simultanés), donc l'ancien exercice courant perd `isCurrent` ici — son `status` n'est pas touché. */
  openFiscalYear: (tenantId: string, fiscalYearId: string) =>
    mockRequest(() => {
      const year = fiscalYears.find((item) => item.id === fiscalYearId && item.tenantId === tenantId);
      if (!year || year.status !== 'upcoming') return undefined;
      const previousCurrent = fiscalYears.find((item) => item.tenantId === tenantId && item.isCurrent);
      if (previousCurrent) previousCurrent.isCurrent = false;
      year.status = 'open';
      year.isCurrent = true;
      return year;
    }),

  listNotificationChannels: (tenantId: string) => mockRequest(() => notificationChannels.filter((channel) => channel.tenantId === tenantId)),
  updateNotificationChannel: (tenantId: string, channelId: string, enabled: boolean) =>
    mockRequest(() => {
      const channel = notificationChannels.find((item) => item.id === channelId && item.tenantId === tenantId);
      if (!channel) return undefined;
      channel.enabled = enabled;
      return channel;
    }),
  listNotificationRules: (tenantId: string) => mockRequest(() => notificationRules.filter((rule) => rule.tenantId === tenantId)),
  updateNotificationRule: (tenantId: string, ruleId: string, enabled: boolean) =>
    mockRequest(() => {
      const rule = notificationRules.find((item) => item.id === ruleId && item.tenantId === tenantId);
      if (!rule) return undefined;
      rule.enabled = enabled;
      return rule;
    }),
  listNotificationPreferences: (userId: string) => mockRequest(() => notificationPreferences.filter((preference) => preference.userId === userId)),
  getNotificationPreference: (userId: string, trigger: NotificationRuleTrigger) => mockRequest(() => notificationPreferences.find((preference) => preference.userId === userId && preference.trigger === trigger)),
  updateNotificationPreference: (userId: string, trigger: NotificationRuleTrigger, patch: Partial<Pick<(typeof notificationPreferences)[number], 'email' | 'push' | 'inApp'>>) =>
    mockRequest(() => {
      const preference = notificationPreferences.find((item) => item.userId === userId && item.trigger === trigger);
      if (!preference) return undefined;
      Object.assign(preference, patch);
      return preference;
    }),

  getPasswordPolicy: (tenantId: string) => mockRequest(() => passwordPolicies.find((policy) => policy.tenantId === tenantId)),
  getSessionPolicy: (tenantId: string) => mockRequest(() => sessionPolicies.find((policy) => policy.tenantId === tenantId)),
  getMfaPolicy: (tenantId: string) => mockRequest(() => mfaPolicies.find((policy) => policy.tenantId === tenantId)),
  getLoginPolicy: (tenantId: string) => mockRequest(() => loginPolicies.find((policy) => policy.tenantId === tenantId)),
  updateSecurityPolicies: (tenantId: string, patch: { password: Omit<PasswordPolicy, 'tenantId'>; session: Omit<SessionPolicy, 'tenantId'>; mfa: Omit<MfaPolicy, 'tenantId'>; login: Omit<LoginPolicy, 'tenantId'> }) =>
    mockRequest(() => {
      const password = passwordPolicies.find((item) => item.tenantId === tenantId);
      const session = sessionPolicies.find((item) => item.tenantId === tenantId);
      const mfa = mfaPolicies.find((item) => item.tenantId === tenantId);
      const login = loginPolicies.find((item) => item.tenantId === tenantId);
      if (!password || !session || !mfa || !login) return undefined;
      Object.assign(password, patch.password);
      Object.assign(session, patch.session);
      Object.assign(mfa, patch.mfa);
      Object.assign(login, patch.login);
      return { password, session, mfa, login };
    }),

  listModules: (tenantId: string) => mockRequest(() => moduleConfigs.filter((module_) => module_.tenantId === tenantId)),
  updateModule: (tenantId: string, key: ModuleKey, enabled: boolean) =>
    mockRequest(() => {
      const module_ = moduleConfigs.find((item) => item.key === key && item.tenantId === tenantId);
      if (!module_) return undefined;
      module_.enabled = enabled;
      return module_;
    }),
  listIntegrations: (tenantId: string) => mockRequest(() => integrations.filter((integration) => integration.tenantId === tenantId)),
};
