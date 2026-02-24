export type AppScreen = 'Dashboard' | 'Tickets' | 'User Management' | 'Reports' | 'Dispatch';

export interface Role {
  id: number;
  name: string;
  permissions: AppScreen[];
}

export type Division = 'B and B' | 'B and R Nasiyanur' | 'B and R Thindal';

export const DIVISIONS: Division[] = ['B and B', 'B and R Nasiyanur', 'B and R Thindal'];

export interface User {
  id: number;
  name: string;
  username: string;
  contactEmail: string;
  roleId: number;
}

export type TicketStatus = 'New' | 'Open' | 'In Progress' | 'Resolved' | 'Closed' | 'Reopened';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TicketCategory = 'Hardware' | 'Software';

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category?: TicketCategory;
  subCategory?: string;
  division?: Division;
  reporterId: number;
  assigneeId?: number;
  createdAt: string;
  updatedAt: string;
  screenshotUrl?: string;
  screenshotFileName?: string;
  createdBy?: string;
  employeeId?: string;
  extensionNumber?: string;
}

export interface Notification {
  id: number;
  userId: number;
  ticketId: number | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}