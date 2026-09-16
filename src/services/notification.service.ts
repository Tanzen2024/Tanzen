import { mockRequest } from './api-client';
import { notifications, type Notification } from '@/mocks/operations/notifications';

export const notificationService = {
  list: (tenantId: string, userId: string) => mockRequest(() => notifications.filter((notification) => notification.tenantId === tenantId && notification.userId === userId)),

  /**
   * Point d'entrée d'ÉCRITURE générique — absent jusqu'ici (mandat « Moteur
   * générique de workflow de validation », besoin §24) : `notifications` était
   * une liste de seed jamais alimentée à l'exécution (confirmé par
   * `docs/PHASE_09_OPERATIONS_WORKFLOWS_DOCUMENTS.md` §11, "non implémenté").
   * Minimal et générique, pas spécifique au workflow : n'importe quel domaine
   * peut l'appeler pour notifier un utilisateur.
   */
  notify: (entry: { tenantId: string; userId: string; type: Notification['type']; title: string; message: string; priority?: Notification['priority']; source: Notification['source']; link?: string }): Notification => {
    const notification: Notification = {
      id: `N-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: entry.tenantId,
      userId: entry.userId,
      type: entry.type,
      title: entry.title,
      message: entry.message,
      priority: entry.priority ?? 'medium',
      read: false,
      createdAt: new Date().toISOString(),
      source: entry.source,
      link: entry.link,
    };
    notifications.push(notification);
    return notification;
  },

  markAsRead: (tenantId: string, userId: string, notificationId: string) =>
    mockRequest(() => {
      const notification = notifications.find((item) => item.id === notificationId && item.tenantId === tenantId && item.userId === userId);
      if (notification) notification.read = true;
      return notification;
    }),

  markAllAsRead: (tenantId: string, userId: string) =>
    mockRequest(() => {
      notifications.filter((notification) => notification.tenantId === tenantId && notification.userId === userId).forEach((notification) => { notification.read = true; });
      return notifications.filter((notification) => notification.tenantId === tenantId && notification.userId === userId);
    }),
};
