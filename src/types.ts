import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'staff';
  createdAt: Timestamp;
}

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  address?: string;
  validityDate: Timestamp;
  balance: number;
  status: 'active' | 'expired';
  createdBy: string;
  createdAt: Timestamp;
}

export interface CollectionRecord {
  id?: string;
  customerId: string;
  customerName: string;
  amount: number;
  date: Timestamp;
  previousValidity: Timestamp;
  newValidity: Timestamp;
  collectedBy: string;
}
