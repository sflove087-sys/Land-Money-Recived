import { 
  collection, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Customer, CollectionRecord, UserProfile } from '../types';

export const dataService = {
  // User Profile
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const path = `users/${uid}`;
    try {
      const docSnap = await getDoc(doc(db, path));
      return docSnap.exists() ? (docSnap.data() as UserProfile) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  async getAllUserProfiles(): Promise<UserProfile[]> {
    const path = 'users';
    try {
      const q = query(collection(db, path), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => doc.data() as UserProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return [];
    }
  },

  async updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
    const path = `users/${uid}`;
    try {
      await updateDoc(doc(db, path), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteUserProfile(uid: string): Promise<void> {
    const path = `users/${uid}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async createUserProfile(uid: string, email: string, displayName: string, role: 'admin' | 'staff'): Promise<void> {
    const path = `users/${uid}`;
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        email,
        displayName,
        role,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  // Customers
  async addCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'createdBy'>): Promise<string> {
    const path = 'customers';
    try {
      const docRef = await addDoc(collection(db, path), {
        ...customer,
        createdBy: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return '';
    }
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    const path = `customers/${id}`;
    try {
      await updateDoc(doc(db, path), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteCustomer(id: string): Promise<void> {
    const path = `customers/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // Collections
  async addCollection(record: Omit<CollectionRecord, 'id' | 'collectedBy'>): Promise<string> {
    const path = 'collections';
    try {
      const docRef = await addDoc(collection(db, path), {
        ...record,
        collectedBy: auth.currentUser?.uid
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return '';
    }
  },

  async deleteCollection(id: string): Promise<void> {
    const path = `collections/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};
