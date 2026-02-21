import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Notification } from '../models';

// const API_URL = 'http://localhost:3001/api';
const API_URL = "https://vms.uathayam.in:4300/TICKETING-API/api"

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications = signal<Notification[]>([]);
  readonly unreadCount = computed(() => this.notifications().filter(n => !n.isRead).length);

  constructor(private http: HttpClient) {}

  async fetchNotifications(userId: number) {
    try {
      const notifications = await firstValueFrom(this.http.get<Notification[]>(`${API_URL}/notifications/${userId}`));
      this.notifications.set(notifications);
    } catch (error) {
      console.log('Failed to fetch notifications', error);
    }
  }

  async markAsRead(userId: number) {
    if (this.unreadCount() === 0) return;

    // Optimistically update the UI
    this.notifications.update(current => 
        current.map(n => ({ ...n, isRead: true }))
    );

    try {
      await firstValueFrom(this.http.post(`${API_URL}/notifications/read/${userId}`, {}));
    } catch (error) {
      console.log('Failed to mark notifications as read', error);
      // Revert optimistic update on failure (optional, but good practice)
      this.fetchNotifications(userId);
    }
  }

  async clearAll(userId: number) {
    if (this.notifications().length === 0) return;

    // Optimistically update the UI
    const previousNotifications = this.notifications();
    this.notifications.set([]);
    
    try {
      await firstValueFrom(this.http.delete(`${API_URL}/notifications/${userId}`));
    } catch (error) {
       console.log('Failed to clear notifications', error);
       // Revert on failure
       this.notifications.set(previousNotifications);
    }
  }

  clearNotifications() {
    this.notifications.set([]);
  }
}
