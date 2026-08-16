import { mockRequest } from './api-client';
import { notifications } from '@/mocks/operations/notifications';

export const notificationService = {
  list: (tenantId: string, userId: string) => mockRequest(() => notifications.filter((notification) => notification.tenantId === tenantId && notification.userId === userId)),

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
