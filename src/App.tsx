/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  UserPlus, 
  Users, 
  UserX, 
  Wallet, 
  FileText, 
  LogOut, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar,
  Phone,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Printer,
  ChevronRight,
  Menu,
  X,
  Bell,
  Settings,
  Shield,
  UserCog,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult
} from 'firebase/auth';
import { 
  Mail,
  Lock,
  Smartphone,
  ArrowRight
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp,
  where
} from 'firebase/firestore';
import { format, addMonths, isAfter, isBefore, startOfDay, endOfDay, differenceInDays } from 'date-fns';
import { bn } from 'date-fns/locale';

import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { dataService } from './services/dataService';
import { Customer, CollectionRecord, UserProfile } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';

// --- Components ---

const NavItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 ${
      active 
        ? 'sidebar-item-active' 
        : 'sidebar-item-inactive'
    }`}
  >
    <Icon size={18} />
    <span className="text-xs font-semibold tracking-wide">{label}</span>
  </button>
);

const LoadingSpinner = ({ show }: { show: boolean }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center space-y-4"
      >
        <div className="animate-spin rounded-full border-4 border-slate-100 border-t-slate-900 h-12 w-12"></div>
        <p className="text-sm font-bold text-slate-900 tracking-widest uppercase">প্রসেসিং হচ্ছে...</p>
      </motion.div>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, color }: { label: string, value: string | number, icon: any, color: string }) => (
  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/60 flex items-center justify-between card-hover">
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-slate-900 font-mono">{value}</h3>
    </div>
    <div className={`p-3 rounded-2xl ${color} shadow-lg shadow-inherit/20`}>
      <Icon size={20} className="text-white" />
    </div>
  </div>
);

const StatusBadge = ({ active }: { active: boolean }) => (
  <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center w-fit ${
    active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
  }`}>
    {active ? <CheckCircle2 size={12} className="mr-1" /> : <AlertCircle size={12} className="mr-1" />}
    {active ? 'সক্রিয়' : 'মেয়াদোত্তীর্ণ'}
  </span>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [googleTokens, setGoogleTokens] = useState<any>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(localStorage.getItem('gsheet_id'));

  // Auth UI State
  const [loginMode, setLoginMode] = useState<'google' | 'email' | 'phone'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  // Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form State
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    address: '',
    validityMonths: 1,
    balance: 0,
    startDate: format(new Date(), 'yyyy-MM-dd')
  });

  const [collectionForm, setCollectionForm] = useState({
    amount: 0,
    monthsToAdd: 1
  });

  const [reportRange, setReportRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const profile = await dataService.getUserProfile(firebaseUser.uid);
        if (profile) {
          // Ensure primary admin is always admin
          if (firebaseUser.email === 'sflove087@gmail.com' && profile.role !== 'admin') {
            await dataService.updateUserProfile(firebaseUser.uid, { role: 'admin' });
            const updatedProfile = await dataService.getUserProfile(firebaseUser.uid);
            setUserProfile(updatedProfile);
          } else {
            setUserProfile(profile);
          }
        } else {
          // Create default profile if not exists
          const defaultRole = firebaseUser.email === 'sflove087@gmail.com' ? 'admin' : 'staff';
          await dataService.createUserProfile(firebaseUser.uid, firebaseUser.email || '', firebaseUser.displayName || '', defaultRole);
          const newProfile = await dataService.getUserProfile(firebaseUser.uid);
          setUserProfile(newProfile);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (activeTab === 'settings' && userProfile?.role === 'admin') {
      dataService.getAllUserProfiles().then(setAllUsers);
    }
  }, [activeTab, userProfile]);

  const handleUpdateUserRole = async (uid: string, newRole: 'admin' | 'staff') => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে আপনি এই ব্যবহারকারীর রোল '${newRole === 'admin' ? 'অ্যাডমিন' : 'স্টাফ'}' এ পরিবর্তন করতে চান?`)) return;
    
    setIsSubmitting(true);
    try {
      await dataService.updateUserProfile(uid, { role: newRole });
      const updatedUsers = await dataService.getAllUserProfiles();
      setAllUsers(updatedUsers);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে আপনি এই ব্যবহারকারীকে মুছে ফেলতে চান? এটি ব্যবহারকারীর প্রোফাইল মুছে ফেলবে।')) return;
    
    setIsSubmitting(true);
    try {
      await dataService.deleteUserProfile(uid);
      const updatedUsers = await dataService.getAllUserProfiles();
      setAllUsers(updatedUsers);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed", error);
      if (error.code === 'auth/unauthorized-domain') {
        alert("এই ডোমেইনটি Firebase-এ অনুমোদিত নয়। দয়া করে Firebase Console-এ গিয়ে Authorized Domains-এ এই ডোমেইনটি যুক্ত করুন।");
      } else {
        alert("লগইন ব্যর্থ হয়েছে: " + (error.message || "অজানা সমস্যা"));
      }
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Email auth failed", error);
      alert("অথেন্টিকেশন ব্যর্থ হয়েছে: " + (error.message || "অজানা সমস্যা"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const setupRecaptcha = () => {
    try {
      if (!(window as any).recaptchaVerifier) {
        const container = document.getElementById('recaptcha-container');
        if (!container) return;

        (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'invisible',
          'callback': () => {
            console.log("Recaptcha verified");
          },
          'expired-callback': () => {
            console.log("Recaptcha expired");
            if ((window as any).recaptchaVerifier) {
              (window as any).recaptchaVerifier.clear();
              (window as any).recaptchaVerifier = null;
            }
          }
        });
      }
    } catch (error) {
      console.error("Recaptcha setup error", error);
      if ((window as any).recaptchaVerifier) {
        try { (window as any).recaptchaVerifier.clear(); } catch(e) {}
        (window as any).recaptchaVerifier = null;
      }
    }
  };

  useEffect(() => {
    // Setup recaptcha when in phone login mode and container is available
    if (loginMode === 'phone' && !isOtpSent && !user) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        setupRecaptcha();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loginMode, isOtpSent, user]);

  useEffect(() => {
    // Clear recaptcha when switching away from phone mode or OTP is sent
    if ((loginMode !== 'phone' || isOtpSent || user) && (window as any).recaptchaVerifier) {
      try {
        (window as any).recaptchaVerifier.clear();
      } catch (e) {
        console.error("Error clearing recaptcha", e);
      }
      (window as any).recaptchaVerifier = null;
    }
  }, [loginMode, isOtpSent, user]);

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Strip all non-digit characters except '+'
      let formattedPhone = phoneNumber.trim().replace(/[^\d+]/g, '');
      
      // Basic E.164 formatting for common BD inputs
      if (!formattedPhone.startsWith('+')) {
        if (formattedPhone.startsWith('0')) {
          formattedPhone = '+88' + formattedPhone;
        } else if (formattedPhone.length === 10) {
          // Case for 1XXXXXXXXX
          formattedPhone = '+880' + formattedPhone;
        } else {
          // Fallback, just add +
          formattedPhone = '+' + formattedPhone;
        }
      }
      
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      if (!appVerifier) throw new Error("reCAPTCHA লোড হতে ব্যর্থ হয়েছে। দয়া করে পেজটি রিফ্রেশ করুন।");
      
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setIsOtpSent(true);
    } catch (error: any) {
      console.error("Phone login failed", error);
      
      let errorMessage = "ফোন লগইন ব্যর্থ হয়েছে: " + (error.message || "অজানা সমস্যা");
      
      if (error.code === 'auth/billing-not-enabled') {
        errorMessage = "Firebase Phone Authentication-এর জন্য আপনার Firebase প্রজেক্টে Billing (Blaze Plan) চালু করা প্রয়োজন। দয়া করে Firebase Console-এ গিয়ে এটি চেক করুন।";
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = "SMS সার্ভিসটি আপনার Firebase প্রজেক্টে চালু করা নেই। দয়া করে Authentication > Sign-in method-এ গিয়ে Phone চালু করুন।";
      }
      
      alert(errorMessage);
      
      // Reset reCAPTCHA if it fails
      if ((window as any).recaptchaVerifier) {
        try { (window as any).recaptchaVerifier.clear(); } catch(e) {}
        (window as any).recaptchaVerifier = null;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setIsSubmitting(true);
    try {
      await confirmationResult.confirm(otp);
    } catch (error: any) {
      console.error("OTP verification failed", error);
      alert("OTP ভেরিফিকেশন ব্যর্থ হয়েছে: " + (error.message || "অজানা সমস্যা"));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      if ((window as any).recaptchaVerifier) {
        try { (window as any).recaptchaVerifier.clear(); } catch(e) {}
        (window as any).recaptchaVerifier = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGoogleTokens(event.data.tokens);
        // In a real app, you'd save these to Firestore
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGoogleConnect = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (error) {
      console.error("Google Auth URL fetch failed", error);
    }
  };

  const handleSyncToSheets = async () => {
    if (!googleTokens) return;
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/gsheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: googleTokens,
          data: customers.map(c => ({
            ...c,
            validityDate: format(c.validityDate.toDate(), 'yyyy-MM-dd')
          })),
          spreadsheetId
        })
      });
      const result = await response.json();
      if (result.success) {
        setSpreadsheetId(result.spreadsheetId);
        localStorage.setItem('gsheet_id', result.spreadsheetId);
        alert('গুগল শিট সফলভাবে সিঙ্ক হয়েছে!');
      }
    } catch (error) {
      console.error("Sync failed", error);
      alert('সিঙ্ক করতে সমস্যা হয়েছে।');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleCollectionRequest = (customer: Customer) => {
    const isExpired = isAfter(new Date(), customer.validityDate.toDate());
    setSelectedCustomer(customer);
    if (isExpired) {
      setIsCollectionModalOpen(true);
    } else {
      setIsWarningModalOpen(true);
    }
  };

    // --- Data Fetching ---
  useEffect(() => {
    if (!user || !userProfile) return;

    let qCustomers;
    if (userProfile.role === 'admin') {
      qCustomers = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    } else {
      qCustomers = query(
        collection(db, 'customers'), 
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'customers');
    });

    let qCollections;
    if (userProfile.role === 'admin') {
      qCollections = query(collection(db, 'collections'), orderBy('date', 'desc'));
    } else {
      qCollections = query(
        collection(db, 'collections'), 
        where('collectedBy', '==', user.uid),
        orderBy('date', 'desc')
      );
    }

    const unsubCollections = onSnapshot(qCollections, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CollectionRecord));
      setCollections(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'collections');
    });

    return () => {
      unsubCustomers();
      unsubCollections();
    };
  }, [user, userProfile]);

  // --- Handlers ---
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const validityDate = addMonths(new Date(newCustomer.startDate), newCustomer.validityMonths);
      
      await dataService.addCustomer({
        name: newCustomer.name,
        phone: newCustomer.phone,
        address: newCustomer.address,
        validityDate: Timestamp.fromDate(validityDate),
        balance: Number(newCustomer.balance),
        status: 'active'
      });

      setNewCustomer({ 
        name: '', 
        phone: '', 
        address: '', 
        validityMonths: 1, 
        balance: 0,
        startDate: format(new Date(), 'yyyy-MM-dd')
      });
      setActiveTab('all-customers');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    setIsSubmitting(true);
    try {
      await dataService.updateCustomer(selectedCustomer.id, {
        name: selectedCustomer.name,
        phone: selectedCustomer.phone,
        address: selectedCustomer.address,
        balance: Number(selectedCustomer.balance)
      });

      setIsEditModalOpen(false);
      setSelectedCustomer(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (window.confirm('আপনি কি নিশ্চিত যে আপনি এই গ্রাহককে মুছে ফেলতে চান?')) {
      await dataService.deleteCustomer(id);
    }
  };

  const handleAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    setIsSubmitting(true);
    try {
      const currentValidity = selectedCustomer.validityDate.toDate();
      const baseDate = isAfter(new Date(), currentValidity) ? new Date() : currentValidity;
      const newValidity = addMonths(baseDate, collectionForm.monthsToAdd);

      await dataService.addCollection({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        amount: Number(collectionForm.amount),
        date: Timestamp.now(),
        previousValidity: selectedCustomer.validityDate,
        newValidity: Timestamp.fromDate(newValidity)
      });

      // Update customer validity and balance
      await dataService.updateCustomer(selectedCustomer.id, {
        validityDate: Timestamp.fromDate(newValidity),
        balance: selectedCustomer.balance - Number(collectionForm.amount),
        status: 'active'
      });

      setIsCollectionModalOpen(false);
      setCollectionForm({ amount: 0, monthsToAdd: 1 });
      setSelectedCustomer(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Computed Data ---
  const stats = useMemo(() => {
    const totalCustomers = customers.length;
    const totalCollections = collections.reduce((sum, c) => sum + c.amount, 0);
    const expiredCount = customers.filter(c => isAfter(new Date(), c.validityDate.toDate())).length;
    const totalDue = customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);

    return { totalCustomers, totalCollections, expiredCount, totalDue };
  }, [customers, collections]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  const expiredCustomers = customers.filter(c => isAfter(new Date(), c.validityDate.toDate()));

  const reportData = useMemo(() => {
    const start = startOfDay(new Date(reportRange.start));
    const end = endOfDay(new Date(reportRange.end));
    return collections.filter(c => {
      const date = c.date.toDate();
      return !isBefore(date, start) && !isAfter(date, end);
    });
  }, [collections, reportRange]);

  const expiringSoonCustomers = useMemo(() => {
    const today = new Date();
    return customers.filter(c => {
      const expiryDate = c.validityDate.toDate();
      const daysLeft = differenceInDays(expiryDate, today);
      return daysLeft >= 0 && daysLeft <= 7;
    });
  }, [customers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full border-4 border-slate-200 border-t-slate-900 h-12 w-12"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-md w-full text-center border border-gray-100"
        >
          <div className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-slate-200">
            <LayoutDashboard size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">LAND<span className="text-slate-400 font-light">PRO</span></h1>
          <p className="text-slate-500 mb-10 font-medium">আপনার ব্যবসার হিসাব সহজ করুন।</p>

          <div className="flex p-1 bg-slate-100 rounded-2xl mb-8">
            <button 
              onClick={() => setLoginMode('google')}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${loginMode === 'google' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Google
            </button>
            <button 
              onClick={() => setLoginMode('email')}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${loginMode === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Email
            </button>
            <button 
              onClick={() => setLoginMode('phone')}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${loginMode === 'phone' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Phone
            </button>
          </div>

          {loginMode === 'google' && (
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center space-x-4 bg-white border-2 border-slate-100 py-5 rounded-3xl font-black text-xs uppercase tracking-[0.2em] text-slate-700 hover:bg-slate-50 hover:border-slate-900 transition-all duration-300 shadow-sm active:scale-[0.98]"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              <span>গুগল দিয়ে লগইন করুন</span>
            </button>
          )}

          {loginMode === 'email' && (
            <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ইমেইল</label>
                <div className="relative group">
                  <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="example@mail.com"
                    className="w-full pl-14 pr-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-medium"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">পাসওয়ার্ড</label>
                <div className="relative group">
                  <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-14 pr-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-medium"
                  />
                </div>
              </div>
              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center space-x-2 active:scale-[0.98]"
              >
                <span>{isSignUp ? 'সাইন আপ করুন' : 'লগইন করুন'}</span>
                <ArrowRight size={16} />
              </button>
              <p className="text-center text-xs text-slate-400 font-medium">
                {isSignUp ? 'ইতিমধ্যে অ্যাকাউন্ট আছে?' : 'অ্যাকাউন্ট নেই?'} 
                <button 
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="ml-2 text-slate-900 font-black underline"
                >
                  {isSignUp ? 'লগইন করুন' : 'সাইন আপ করুন'}
                </button>
              </p>
            </form>
          )}

          {loginMode === 'phone' && (
            <div className="space-y-4 text-left">
              {!isOtpSent ? (
                <form onSubmit={handlePhoneLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">ফোন নম্বর</label>
                    <div className="relative group">
                      <Smartphone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                      <input 
                        type="tel" 
                        required
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        placeholder="+8801XXXXXXXXX"
                        className="w-full pl-14 pr-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-medium"
                      />
                    </div>
                  </div>
                  <div id="recaptcha-container"></div>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center space-x-2 active:scale-[0.98]"
                  >
                    <span>OTP পাঠান</span>
                    <ArrowRight size={16} />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">OTP কোড</label>
                    <div className="relative group">
                      <Smartphone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                      <input 
                        type="text" 
                        required
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                        placeholder="123456"
                        className="w-full pl-14 pr-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-medium text-center tracking-[0.5em] text-xl"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center space-x-2 active:scale-[0.98]"
                  >
                    <span>ভেরিফাই করুন</span>
                    <ArrowRight size={16} />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsOtpSent(false)}
                    className="w-full text-center text-xs text-slate-400 font-bold uppercase tracking-widest hover:text-slate-900 transition-colors"
                  >
                    নম্বর পরিবর্তন করুন
                  </button>
                </form>
              )}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <LoadingSpinner show={isSubmitting} />
      <div className="min-h-screen bg-gray-50 flex font-sans">
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200/60 transform transition-transform duration-500 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-full flex flex-col p-8">
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200">
                  <LayoutDashboard size={20} className="text-white" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">LAND<span className="text-slate-400 font-light">PRO</span></h1>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-slate-900 transition-colors">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 space-y-2">
              <NavItem icon={LayoutDashboard} label="ড্যাশবোর্ড" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
              <NavItem icon={UserPlus} label="নতুন গ্রাহক" active={activeTab === 'add-customer'} onClick={() => setActiveTab('add-customer')} />
              <NavItem icon={Users} label="সকল গ্রাহক" active={activeTab === 'all-customers'} onClick={() => setActiveTab('all-customers')} />
              <NavItem icon={UserX} label="মেয়াদোত্তীর্ণ গ্রাহক" active={activeTab === 'expired-customers'} onClick={() => setActiveTab('expired-customers')} />
              <NavItem icon={Wallet} label="কালেকশন" active={activeTab === 'collections'} onClick={() => setActiveTab('collections')} />
              <NavItem icon={FileText} label="রিপোর্ট" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />
              {userProfile?.role === 'admin' && (
                <NavItem icon={Settings} label="সেটিংস" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
              )}
            </nav>

            <div className="mt-auto pt-8 border-t border-slate-100">
              <div className="flex items-center space-x-4 mb-6 p-2 rounded-2xl bg-slate-50 border border-slate-100">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-10 h-10 rounded-xl border-2 border-white shadow-sm" />
                ) : (
                  <div className="w-10 h-10 rounded-xl border-2 border-white shadow-sm bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                    {(user.displayName || user.email || user.phoneNumber || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-900 truncate">{user.displayName || user.email || user.phoneNumber}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{userProfile?.role === 'admin' ? 'অ্যাডমিন' : 'স্টাফ'}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-300 group"
              >
                <LogOut size={18} className="group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-widest">লগআউট</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 min-w-0 overflow-auto transition-all duration-500 ${isSidebarOpen ? 'lg:ml-72' : 'ml-0'}`}>
          <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 p-4 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center space-x-6">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-2xl transition-all duration-300">
                {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <h1 className="text-lg font-bold lg:hidden tracking-tight">LAND<span className="text-slate-400 font-light">PRO</span></h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-2xl transition-all duration-300 relative"
                >
                  <Bell size={20} />
                  {expiringSoonCustomers.length > 0 && (
                    <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                      {expiringSoonCustomers.length}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {isNotificationsOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsNotificationsOpen(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-80 bg-white rounded-3xl shadow-2xl border border-slate-200/60 z-50 overflow-hidden"
                      >
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="text-sm font-bold text-slate-900">নোটিফিকেশন</h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">মেয়াদ শেষ হতে যাওয়া গ্রাহক</p>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                          {expiringSoonCustomers.length > 0 ? (
                            expiringSoonCustomers.map(customer => {
                              const daysLeft = differenceInDays(customer.validityDate.toDate(), new Date());
                              return (
                                <div 
                                  key={customer.id} 
                                  className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                                  onClick={() => {
                                    setActiveTab('all-customers');
                                    setSearchTerm(customer.phone);
                                    setIsNotificationsOpen(false);
                                  }}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-bold text-slate-900">{customer.name}</p>
                                    <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                                      {daysLeft === 0 ? 'আজ শেষ' : `${daysLeft} দিন বাকি`}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500">{customer.phone}</p>
                                </div>
                              );
                            })
                          ) : (
                            <div className="p-10 text-center">
                              <Bell size={32} className="mx-auto text-slate-200 mb-3" />
                              <p className="text-xs text-slate-400 font-medium">নতুন কোনো নোটিফিকেশন নেই</p>
                            </div>
                          )}
                        </div>
                        {expiringSoonCustomers.length > 0 && (
                          <button 
                            onClick={() => {
                              setActiveTab('expired-customers');
                              setIsNotificationsOpen(false);
                            }}
                            className="w-full p-4 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors uppercase tracking-widest border-t border-slate-100"
                          >
                            সব মেয়াদোত্তীর্ণ দেখুন
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <div className="hidden lg:block text-right">
                <p className="text-xs font-bold text-slate-900">{user.displayName}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{userProfile?.role === 'admin' ? 'অ্যাডমিন' : 'স্টাফ'}</p>
              </div>
              <img src={user.photoURL || ''} alt="User" className="w-9 h-9 rounded-xl border-2 border-white shadow-md" />
            </div>
          </header>

          <div className="p-6 lg:p-10 max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                  <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">স্বাগতম, {user.displayName}!</h2>
                      <p className="text-gray-500">আপনার ব্যবসার আজকের সারসংক্ষেপ এখানে দেখুন।</p>
                    </div>
                    <button
                      onClick={() => { setSelectedCustomer(null); setIsCollectionModalOpen(true); }}
                      className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2"
                    >
                      <Plus size={20} />
                      <span>নতুন কালেকশন</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                    <StatCard label="মোট গ্রাহক" value={stats.totalCustomers} icon={Users} color="bg-blue-600" />
                    <StatCard label="মোট কালেকশন" value={`${stats.totalCollections} ৳`} icon={Wallet} color="bg-green-600" />
                    <StatCard label="মেয়াদোত্তীর্ণ" value={stats.expiredCount} icon={UserX} color="bg-red-600" />
                    <StatCard label="মোট বকেয়া" value={`${stats.totalDue} ৳`} icon={AlertCircle} color="bg-orange-600" />
                  </div>

                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="text-xl font-bold text-gray-900">সাম্প্রতিক গ্রাহক</h3>
                      <button onClick={() => setActiveTab('all-customers')} className="text-blue-600 font-semibold text-sm hover:underline">সব দেখুন</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-4 font-semibold">নাম</th>
                            <th className="px-6 py-4 font-semibold">ফোন</th>
                            <th className="px-6 py-4 font-semibold">মেয়াদ</th>
                            <th className="px-6 py-4 font-semibold">অবস্থা</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {customers.slice(0, 5).map(customer => (
                            <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 font-medium text-gray-900">{customer.name}</td>
                              <td className="px-6 py-4 text-gray-600">{customer.phone}</td>
                              <td className="px-6 py-4 text-gray-600">{format(customer.validityDate.toDate(), 'dd MMM, yyyy', { locale: bn })}</td>
                              <td className="px-6 py-4">
                                <StatusBadge active={!isAfter(new Date(), customer.validityDate.toDate())} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'add-customer' && (
                <motion.div key="add-customer" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                  <div className="max-w-4xl mx-auto">
                    <div className="mb-12 text-center">
                      <motion.div 
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                        className="w-24 h-24 bg-slate-900 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-slate-200 rotate-3 hover:rotate-0 transition-transform duration-500"
                      >
                        <UserPlus size={40} />
                      </motion.div>
                      <h2 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">নতুন গ্রাহক যুক্ত করুন</h2>
                      <p className="text-slate-500 font-medium">সঠিক তথ্য দিয়ে ডিজিটাল রেজিস্টারে গ্রাহক নথিভুক্ত করুন।</p>
                    </div>

                    <form onSubmit={handleAddCustomer} className="space-y-8">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Section 1: Personal Info */}
                        <div className="lg:col-span-2 space-y-8">
                          <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl shadow-slate-100 border border-slate-100 space-y-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 z-0" />
                            
                            <div className="relative z-10">
                              <div className="flex items-center space-x-3 mb-8">
                                <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                                  <Shield size={16} />
                                </div>
                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">ব্যক্তিগত তথ্য</h3>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">গ্রাহকের নাম</label>
                                  <div className="relative group">
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                                      <Users size={20} />
                                    </div>
                                    <input
                                      required
                                      type="text"
                                      value={newCustomer.name}
                                      onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                      className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 placeholder:text-slate-300 placeholder:font-medium text-lg"
                                      placeholder="যেমন: মোঃ রহিম আলী"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">ফোন নম্বর</label>
                                  <div className="relative group">
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                                      <Phone size={20} />
                                    </div>
                                    <input
                                      required
                                      type="tel"
                                      value={newCustomer.phone}
                                      onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                      className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 placeholder:text-slate-300 placeholder:font-medium text-lg"
                                      placeholder="০১XXXXXXXXX"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="mt-8 space-y-3">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">ঠিকানা (ঐচ্ছিক)</label>
                                <div className="relative group">
                                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                                    <MapPin size={20} />
                                  </div>
                                  <input
                                    type="text"
                                    value={newCustomer.address}
                                    onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                    className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 placeholder:text-slate-300 placeholder:font-medium text-lg"
                                    placeholder="গ্রাম, পোস্ট, উপজেলা..."
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Section 2: Account Info */}
                        <div className="space-y-8">
                          <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl shadow-slate-100 border border-slate-100 space-y-8 relative overflow-hidden h-full">
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-50/50 rounded-full -ml-16 -mb-16 z-0" />
                            
                            <div className="relative z-10">
                              <div className="flex items-center space-x-3 mb-8">
                                <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                                  <Wallet size={16} />
                                </div>
                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">হিসাব ও মেয়াদ</h3>
                              </div>

                              <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">শুরুর তারিখ</label>
                                    <div className="relative group">
                                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                                        <Calendar size={20} />
                                      </div>
                                      <input
                                        required
                                        type="date"
                                        value={newCustomer.startDate}
                                        onChange={e => setNewCustomer({ ...newCustomer, startDate: e.target.value })}
                                        className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-lg"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">মেয়াদ (মাস)</label>
                                    <div className="relative group">
                                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                                        <Calendar size={20} />
                                      </div>
                                      <input
                                        required
                                        type="number"
                                        min="1"
                                        value={newCustomer.validityMonths}
                                        onChange={e => setNewCustomer({ ...newCustomer, validityMonths: parseInt(e.target.value) || 1 })}
                                        className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-lg"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex items-center justify-between shadow-inner">
                                  <div>
                                    <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mb-1">মেয়াদ শেষ হবে</p>
                                    <p className="text-lg font-black text-indigo-900">
                                      {format(addMonths(new Date(newCustomer.startDate), newCustomer.validityMonths), 'dd MMM, yyyy', { locale: bn })}
                                    </p>
                                  </div>
                                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                                    <CheckCircle2 size={20} />
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">বকেয়া পরিমাণ (৳)</label>
                                  <div className="relative group">
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors font-bold text-xl">
                                      ৳
                                    </div>
                                    <input
                                      type="number"
                                      value={newCustomer.balance}
                                      onChange={e => setNewCustomer({ ...newCustomer, balance: parseInt(e.target.value) || 0 })}
                                      className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-lg"
                                    />
                                  </div>
                                </div>

                                <div className="pt-4">
                                  <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-slate-900 text-white py-7 rounded-[2.5rem] font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 shadow-2xl shadow-slate-200 transition-all duration-500 flex items-center justify-center space-x-4 disabled:opacity-50 group active:scale-[0.98]"
                                  >
                                    <UserPlus size={20} className="group-hover:scale-110 transition-transform" />
                                    <span>নথিভুক্ত করুন</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </form>
                  </div>
                </motion.div>
              )}

              {(activeTab === 'all-customers' || activeTab === 'expired-customers') && (
                <motion.div key="customers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900">
                        {activeTab === 'all-customers' ? 'সকল গ্রাহক' : 'মেয়াদোত্তীর্ণ গ্রাহক'}
                      </h2>
                      <p className="text-gray-500">মোট {activeTab === 'all-customers' ? filteredCustomers.length : expiredCustomers.length} জন গ্রাহক পাওয়া গেছে।</p>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                          type="text"
                          placeholder="নাম বা ফোন নম্বর দিয়ে খুঁজুন..."
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          className="pl-12 pr-6 py-3 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none w-full md:w-80 transition-all"
                        />
                      </div>
                      <button
                        onClick={() => { setSelectedCustomer(null); setIsCollectionModalOpen(true); }}
                        className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all flex items-center justify-center space-x-2"
                      >
                        <Plus size={18} />
                        <span className="text-sm uppercase tracking-widest">নতুন কালেকশন</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(activeTab === 'all-customers' ? filteredCustomers : expiredCustomers).map(customer => {
                      const isExpired = isAfter(new Date(), customer.validityDate.toDate());
                      const initials = customer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                      
                      return (
                        <motion.div
                          layout
                          key={customer.id}
                          className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 hover:shadow-2xl hover:shadow-slate-200/50 hover:border-slate-300 transition-all duration-500 group overflow-hidden flex flex-col"
                        >
                          {/* Card Header with Background Accent */}
                          <div className={`h-2 w-full ${isExpired ? 'bg-red-500' : 'bg-indigo-600'}`} />
                          
                          <div className="p-8 flex-1">
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center space-x-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold shadow-inner ${
                                  isExpired ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
                                }`}>
                                  {initials}
                                </div>
                                <div>
                                  <h4 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{customer.name}</h4>
                                  <div className="mt-1">
                                    <StatusBadge active={!isExpired} />
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex -mr-2">
                                <button 
                                  onClick={() => { setSelectedCustomer(customer); setIsEditModalOpen(true); }}
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                  title="সম্পাদনা করুন"
                                >
                                  <Edit2 size={16} />
                                </button>
                                {userProfile?.role === 'admin' && (
                                  <button 
                                    onClick={() => customer.id && handleDeleteCustomer(customer.id)}
                                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all group/delete"
                                    title="মুছে ফেলুন"
                                  >
                                    <Trash2 size={18} className="group-hover/delete:scale-110 transition-transform" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 mb-8">
                              <div className="flex items-center p-3 rounded-2xl bg-slate-50/50 border border-transparent hover:border-slate-100 transition-all group/item">
                                <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center mr-3 text-slate-400 group-hover/item:text-indigo-600 transition-colors">
                                  <Phone size={14} />
                                </div>
                                <span className="text-xs font-bold text-slate-600">{customer.phone}</span>
                              </div>
                              
                              <div className="flex items-center p-3 rounded-2xl bg-slate-50/50 border border-transparent hover:border-slate-100 transition-all group/item">
                                <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center mr-3 text-slate-400 group-hover/item:text-indigo-600 transition-colors">
                                  <Calendar size={14} />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">মেয়াদ শেষ</span>
                                  <span className="text-xs font-bold text-slate-900">{format(customer.validityDate.toDate(), 'dd MMM, yyyy', { locale: bn })}</span>
                                </div>
                              </div>

                              {customer.address && (
                                <div className="flex items-center p-3 rounded-2xl bg-slate-50/50 border border-transparent hover:border-slate-100 transition-all group/item">
                                  <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center mr-3 text-slate-400 group-hover/item:text-indigo-600 transition-colors">
                                    <MapPin size={14} />
                                  </div>
                                  <span className="text-xs font-medium text-slate-500 truncate">{customer.address}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">বকেয়া পরিমাণ</p>
                              <p className={`text-xl font-bold ${customer.balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                {customer.balance} <span className="text-sm">৳</span>
                              </p>
                            </div>
                            <button
                              onClick={() => handleCollectionRequest(customer)}
                              className="inline-flex items-center space-x-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-200"
                            >
                              <Plus size={12} />
                              <span>কালেকশন</span>
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {activeTab === 'collections' && (
                <motion.div key="collections" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-2">কালেকশন হিস্ট্রি</h2>
                      <p className="text-gray-500">আপনার সকল পেমেন্ট কালেকশন এখানে দেখুন।</p>
                    </div>
                    <button
                      onClick={() => { setSelectedCustomer(null); setIsCollectionModalOpen(true); }}
                      className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2"
                    >
                      <Plus size={20} />
                      <span>নতুন কালেকশন</span>
                    </button>
                  </div>

                  <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-4 font-semibold">তারিখ</th>
                            <th className="px-6 py-4 font-semibold">গ্রাহক</th>
                            <th className="px-6 py-4 font-semibold">পরিমাণ</th>
                            <th className="px-6 py-4 font-semibold">পূর্বের মেয়াদ</th>
                            <th className="px-6 py-4 font-semibold">নতুন মেয়াদ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {collections.map(record => (
                            <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 text-gray-600">{format(record.date.toDate(), 'dd MMM, yyyy HH:mm', { locale: bn })}</td>
                              <td className="px-6 py-4 font-medium text-gray-900">{record.customerName}</td>
                              <td className="px-6 py-4 font-bold text-green-600">{record.amount} ৳</td>
                              <td className="px-6 py-4 text-gray-500">{format(record.previousValidity.toDate(), 'dd MMM, yyyy', { locale: bn })}</td>
                              <td className="px-6 py-4 text-blue-600 font-medium">{format(record.newValidity.toDate(), 'dd MMM, yyyy', { locale: bn })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'reports' && (
                <motion.div key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-slate-900 mb-2">রিপোর্ট জেনারেট করুন</h2>
                    <p className="text-slate-500">নির্দিষ্ট সময়ের কালেকশন রিপোর্ট দেখুন।</p>
                  </div>

                  <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200/60 mb-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">শুরুর তারিখ</label>
                        <input
                          type="date"
                          value={reportRange.start}
                          onChange={e => setReportRange({ ...reportRange, start: e.target.value })}
                          className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">শেষ তারিখ</label>
                        <input
                          type="date"
                          value={reportRange.end}
                          onChange={e => setReportRange({ ...reportRange, end: e.target.value })}
                          className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900"
                        />
                      </div>
                      <button
                        onClick={() => window.print()}
                        className="bg-slate-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all flex items-center justify-center space-x-3 shadow-xl shadow-slate-200 active:scale-[0.98]"
                      >
                        <Printer size={18} />
                        <span>প্রিন্ট করুন</span>
                      </button>
                    </div>
                  </div>

                  <div id="printable-report" className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 overflow-hidden">
                    <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <div>
                        <h3 className="text-2xl font-bold text-slate-900">কালেকশন রিপোর্ট</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {format(new Date(reportRange.start), 'dd MMM, yyyy', { locale: bn })} থেকে {format(new Date(reportRange.end), 'dd MMM, yyyy', { locale: bn })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">মোট কালেকশন</p>
                        <p className="text-3xl font-black text-emerald-600">
                          {reportData.reduce((sum, c) => sum + c.amount, 0)} ৳
                        </p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest border-b border-slate-100">
                          <tr>
                            <th className="px-10 py-5 font-bold">তারিখ</th>
                            <th className="px-10 py-5 font-bold">গ্রাহক</th>
                            <th className="px-10 py-5 font-bold text-right">পরিমাণ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reportData.map(record => (
                            <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-10 py-6 text-sm text-slate-600 font-medium">{format(record.date.toDate(), 'dd MMM, yyyy', { locale: bn })}</td>
                              <td className="px-10 py-6 font-bold text-slate-900">{record.customerName}</td>
                              <td className="px-10 py-6 font-black text-emerald-600 text-right">{record.amount} ৳</td>
                            </tr>
                          ))}
                          {reportData.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-10 py-20 text-center text-slate-400 font-bold italic">এই সময়ে কোনো কালেকশন পাওয়া যায়নি।</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'settings' && userProfile?.role === 'admin' && (
                <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                  <div className="mb-10">
                    <h2 className="text-3xl font-bold text-slate-900 mb-2">সিস্টেম সেটিংস</h2>
                    <p className="text-slate-500">ব্যবহারকারীর রোল এবং সিস্টেম কনফিগারেশন পরিচালনা করুন।</p>
                  </div>

                  <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 overflow-hidden">
                    <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                          <UserCog size={20} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">ব্যবহারকারী ব্যবস্থাপনা</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">মোট ব্যবহারকারী: {allUsers.length}</p>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest border-b border-slate-100">
                          <tr>
                            <th className="px-8 py-5 font-bold">ব্যবহারকারী</th>
                            <th className="px-8 py-5 font-bold">ইমেইল</th>
                            <th className="px-8 py-5 font-bold">বর্তমান রোল</th>
                            <th className="px-8 py-5 font-bold text-right">অ্যাকশন</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allUsers.map(u => (
                            <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-8 py-6">
                                <div className="flex items-center space-x-4">
                                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                                    {u.displayName?.charAt(0) || u.email.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-sm font-bold text-slate-900">{u.displayName || 'নাম নেই'}</span>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-xs text-slate-500 font-medium">{u.email}</td>
                              <td className="px-8 py-6">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                                  u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {u.role === 'admin' ? 'অ্যাডমিন' : 'স্টাফ'}
                                </span>
                              </td>
                              <td className="px-8 py-6 text-right">
                                {u.uid !== user.uid ? (
                                  <div className="flex items-center justify-end space-x-2">
                                    <button
                                      onClick={() => handleUpdateUserRole(u.uid, u.role === 'admin' ? 'staff' : 'admin')}
                                      className="flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                                    >
                                      <Shield size={12} />
                                      <span>রোল পরিবর্তন</span>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteUser(u.uid)}
                                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all group/delete"
                                      title="ব্যবহারকারী মুছুন"
                                    >
                                      <Trash2 size={18} className="group-hover/delete:scale-110 transition-transform" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">আপনি নিজে</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-10 bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 overflow-hidden">
                    <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-green-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-200">
                          <FileSpreadsheet size={20} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">গুগল শিট ইন্টিগ্রেশন</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">আপনার ডেটা গুগল শিটে সিঙ্ক করুন</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-8">
                      {!googleTokens ? (
                        <div className="text-center py-10">
                          <p className="text-slate-500 mb-6">আপনার গুগল অ্যাকাউন্ট কানেক্ট করে ডেটা সরাসরি গুগল শিটে সেভ করুন।</p>
                          <button
                            onClick={handleGoogleConnect}
                            className="inline-flex items-center space-x-3 px-8 py-4 rounded-2xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                          >
                            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                            <span>গুগল অ্যাকাউন্ট কানেক্ট করুন</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="p-6 rounded-3xl bg-green-50 border border-green-100 flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                                <FileSpreadsheet size={24} className="text-green-600" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">গুগল অ্যাকাউন্ট কানেক্টেড</p>
                                {spreadsheetId && (
                                  <a 
                                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[10px] font-bold text-green-600 uppercase tracking-widest hover:underline"
                                  >
                                    শিটটি ওপেন করুন
                                  </a>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={handleSyncToSheets}
                              disabled={isSubmitting}
                              className="px-6 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-100 disabled:opacity-50"
                            >
                              {isSubmitting ? 'সিঙ্ক হচ্ছে...' : 'এখনই সিঙ্ক করুন'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Modals */}
        <AnimatePresence>
          {isEditModalOpen && selectedCustomer && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setIsEditModalOpen(false); setSelectedCustomer(null); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
              <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
                <div className="p-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                  <div className="flex items-center space-x-6">
                    <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-slate-200 rotate-3">
                      <Edit2 size={28} />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight">তথ্য পরিবর্তন</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">ID: {selectedCustomer.id?.slice(-8)}</p>
                    </div>
                  </div>
                  <button onClick={() => { setIsEditModalOpen(false); setSelectedCustomer(null); }} className="p-5 hover:bg-white hover:shadow-2xl rounded-[1.5rem] transition-all text-slate-400 hover:text-slate-900 border border-transparent hover:border-slate-100"><X size={24} /></button>
                </div>
                
                <form onSubmit={handleUpdateCustomer} className="p-10 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">গ্রাহকের নাম</label>
                      <div className="relative group">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                          <Users size={18} />
                        </div>
                        <input
                          required
                          type="text"
                          value={selectedCustomer.name}
                          onChange={e => setSelectedCustomer({ ...selectedCustomer, name: e.target.value })}
                          className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-lg"
                          placeholder="গ্রাহকের নাম"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">ফোন নম্বর</label>
                      <div className="relative group">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                          <Phone size={18} />
                        </div>
                        <input
                          required
                          type="tel"
                          value={selectedCustomer.phone}
                          onChange={e => setSelectedCustomer({ ...selectedCustomer, phone: e.target.value })}
                          className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-lg"
                          placeholder="ফোন নম্বর"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">ঠিকানা</label>
                    <div className="relative group">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                        <MapPin size={18} />
                      </div>
                      <input
                        type="text"
                        value={selectedCustomer.address}
                        onChange={e => setSelectedCustomer({ ...selectedCustomer, address: e.target.value })}
                        className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-lg"
                        placeholder="গ্রাহকের ঠিকানা"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">বকেয়া পরিমাণ (৳)</label>
                    <div className="relative group">
                      <span className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl group-focus-within:text-slate-900 transition-colors">৳</span>
                      <input
                        type="number"
                        value={selectedCustomer.balance}
                        onChange={e => setSelectedCustomer({ ...selectedCustomer, balance: parseInt(e.target.value) || 0 })}
                        className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-2xl"
                      />
                    </div>
                  </div>

                  <div className="pt-8 flex space-x-6">
                    <button 
                      type="button"
                      onClick={() => { setIsEditModalOpen(false); setSelectedCustomer(null); }}
                      className="flex-1 px-10 py-6 rounded-3xl font-bold text-[10px] uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all"
                    >
                      বাতিল করুন
                    </button>
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="flex-[2] bg-slate-900 text-white py-6 rounded-3xl font-black text-[10px] uppercase tracking-[0.3em] hover:bg-slate-800 shadow-2xl shadow-slate-200 transition-all disabled:opacity-50 active:scale-[0.98]"
                    >
                      তথ্য আপডেট করুন
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {isCollectionModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setIsCollectionModalOpen(false); setSelectedCustomer(null); }} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
              <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
                <div className="p-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                  <div className="flex items-center space-x-6">
                    <div className="w-16 h-16 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-slate-200 -rotate-3">
                      <Wallet size={28} />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight">কালেকশন যুক্ত করুন</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">পেমেন্ট রেকর্ড করুন</p>
                    </div>
                  </div>
                  <button onClick={() => { setIsCollectionModalOpen(false); setSelectedCustomer(null); }} className="p-5 hover:bg-white hover:shadow-2xl rounded-[1.5rem] transition-all text-slate-400 hover:text-slate-900 border border-transparent hover:border-slate-100"><X size={24} /></button>
                </div>
                
                <div className="p-10 space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">গ্রাহক নির্বাচন করুন</label>
                    <div className="relative group">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                        <Users size={20} />
                      </div>
                      <select
                        value={selectedCustomer?.id || ''}
                        onChange={(e) => {
                          const customer = customers.find(c => c.id === e.target.value);
                          setSelectedCustomer(customer || null);
                          setCollectionForm({ amount: 0, monthsToAdd: 1 });
                        }}
                        className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 appearance-none text-lg"
                      >
                        <option value="">গ্রাহক নির্বাচন করুন...</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                        ))}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronRight size={20} className="rotate-90" />
                      </div>
                    </div>
                  </div>

                  {selectedCustomer && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-2 gap-6"
                    >
                      <div className="p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100 shadow-inner">
                        <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mb-2">বর্তমান বকেয়া</p>
                        <p className="text-2xl font-black text-indigo-900">{selectedCustomer.balance} ৳</p>
                      </div>
                      <div className="p-6 bg-orange-50 rounded-[2rem] border border-orange-100 shadow-inner">
                        <p className="text-[10px] text-orange-600 font-black uppercase tracking-widest mb-2">বর্তমান মেয়াদ</p>
                        <p className="text-xl font-black text-orange-900">
                          {format(selectedCustomer.validityDate.toDate(), 'dd MMM, yyyy', { locale: bn })}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {selectedCustomer && (
                  <form onSubmit={handleAddCollection} className="p-10 pt-0 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">কালেকশন পরিমাণ (৳)</label>
                        <div className="relative group">
                          <span className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl group-focus-within:text-slate-900 transition-colors">৳</span>
                          <input
                            required
                            type="number"
                            autoFocus
                            value={collectionForm.amount}
                            onChange={e => setCollectionForm({ ...collectionForm, amount: parseInt(e.target.value) })}
                            className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-2xl"
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">মেয়াদ বৃদ্ধি (মাস)</label>
                        <div className="relative group">
                          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
                            <Calendar size={20} />
                          </div>
                          <input
                            required
                            type="number"
                            min="1"
                            value={collectionForm.monthsToAdd}
                            onChange={e => setCollectionForm({ ...collectionForm, monthsToAdd: parseInt(e.target.value) })}
                            className="w-full pl-16 pr-8 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50/50 focus:bg-white focus:border-slate-900 outline-none transition-all font-bold text-slate-900 text-lg"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-8 bg-indigo-50 rounded-[2.5rem] border border-indigo-100 flex items-center justify-between shadow-inner">
                      <div>
                        <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mb-1">নতুন মেয়াদ হবে</p>
                        <p className="text-xl font-black text-indigo-900">
                          {format(addMonths(isAfter(new Date(), selectedCustomer.validityDate.toDate()) ? new Date() : selectedCustomer.validityDate.toDate(), collectionForm.monthsToAdd), 'dd MMM, yyyy', { locale: bn })}
                        </p>
                      </div>
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                        <CheckCircle2 size={24} />
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="w-full bg-slate-900 text-white py-7 rounded-[2.5rem] font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 shadow-2xl shadow-slate-200 transition-all disabled:opacity-50 flex items-center justify-center space-x-4 active:scale-[0.98]"
                    >
                      <Plus size={20} />
                      <span>কালেকশন সম্পন্ন করুন</span>
                    </button>
                  </form>
                )}
              </motion.div>
            </div>
          )}

          {isWarningModalOpen && selectedCustomer && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsWarningModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
              <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }} className="bg-white w-full max-w-md rounded-[3.5rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100">
                <div className="p-10 text-center">
                  <div className="w-24 h-24 bg-orange-50 text-orange-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-orange-100 rotate-6">
                    <AlertCircle size={48} />
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">সতর্কবার্তা!</h3>
                  <p className="text-slate-500 leading-relaxed mb-10 font-medium">
                    গ্রাহক <span className="font-black text-slate-900">"{selectedCustomer.name}"</span> এর মেয়াদ এখনো শেষ হয়নি। আপনি কি নিশ্চিত যে আপনি এখনই কালেকশন করতে চান?
                  </p>
                  <div className="flex flex-col space-y-4">
                    <button
                      onClick={() => {
                        setIsWarningModalOpen(false);
                        setIsCollectionModalOpen(true);
                      }}
                      className="w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 active:scale-[0.98]"
                    >
                      হ্যাঁ, কালেকশন করুন
                    </button>
                    <button
                      onClick={() => {
                        setIsWarningModalOpen(false);
                        setSelectedCustomer(null);
                      }}
                      className="w-full py-6 bg-slate-50 text-slate-400 rounded-3xl font-bold text-xs uppercase tracking-[0.2em] hover:bg-slate-100 hover:text-slate-900 transition-all"
                    >
                      না, ফিরে যান
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <style>{`
          @media print {
            aside, header, nav, button, .no-print { display: none !important; }
            main { padding: 0 !important; margin: 0 !important; }
            #printable-report { border: none !important; box-shadow: none !important; }
            body { background: white !important; }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}


