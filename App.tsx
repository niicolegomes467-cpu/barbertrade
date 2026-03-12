/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Scissors, 
  Calendar, 
  MessageSquare, 
  User as UserIcon, 
  Home as HomeIcon,
  Search,
  Plus,
  ArrowRightLeft,
  LogOut,
  Shield,
  Gift,
  Clock,
  Check
} from 'lucide-react';

// Components
import Auth from './components/Auth';
import RoleSelection from './components/RoleSelection';
import ClientHome from './components/ClientHome';
import BarberHome from './components/BarberHome';
import BarbershopList from './components/BarbershopList';
import BarbershopDetail from './components/BarbershopDetail';
import Negotiations from './components/Negotiations';
import Profile from './components/Profile';
import CollectiveVault from './components/CollectiveVault';
import Sweepstakes from './components/Sweepstakes';
import Transactions from './components/Transactions';
import AdminPanel from './components/AdminPanel';
import NotificationCenter from './components/NotificationCenter';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'cancel' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment');
    if (status === 'success' || status === 'cancel') {
      setPaymentStatus(status as 'success' | 'cancel');
      // Clear the URL param without refreshing
      window.history.replaceState({}, '', window.location.pathname);
      
      // Auto-hide after 5 seconds
      setTimeout(() => setPaymentStatus(null), 5000);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setUser(user);
      
      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // Fallback Seguro: Se o documento não existe, cria como 'client' por padrão
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'Usuário',
              photoURL: user.photoURL || '',
              role: 'client', // Novo usuário vira client por padrão
              referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
              referralCount: 0,
              balance: 0,
              createdAt: new Date().toISOString(),
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
        } catch (err) {
          console.error("Erro ao carregar perfil:", err);
          // Se houver erro de permissão ou rede, não deixa o app quebrado
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Scissors className="text-amber-500 w-12 h-12" />
        </motion.div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Auth />;
  }

  const renderContent = () => {
    if (selectedShopId) {
      return <BarbershopDetail shopId={selectedShopId} onBack={() => setSelectedShopId(null)} />;
    }

    switch (activeTab) {
      case 'home':
        return profile.role === 'barber' ? <BarberHome /> : <ClientHome onSelectShop={setSelectedShopId} />;
      case 'search':
        return <BarbershopList onSelectShop={setSelectedShopId} />;
      case 'negotiations':
        return <Negotiations />;
      case 'vault':
        return <CollectiveVault />;
      case 'sweepstakes':
        return <Sweepstakes />;
      case 'transactions':
        return <Transactions />;
      case 'admin':
        return <AdminPanel />;
      case 'profile':
        return <Profile profile={profile} onLogout={() => auth.signOut()} />;
      default:
        return profile.role === 'barber' ? <BarberHome /> : <ClientHome onSelectShop={setSelectedShopId} />;
    }
  };

  const renderNav = () => {
    if (profile.role === 'admin') {
      return (
        <nav className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-white/10 p-2 flex justify-around items-center z-50 max-w-md mx-auto">
          <NavButton 
            active={activeTab === 'admin'} 
            onClick={() => { setActiveTab('admin'); setSelectedShopId(null); }} 
            icon={<Shield size={20} />} 
            label="Admin" 
          />
          <NavButton 
            active={activeTab === 'profile'} 
            onClick={() => { setActiveTab('profile'); setSelectedShopId(null); }} 
            icon={<UserIcon size={20} />} 
            label="Perfil" 
          />
        </nav>
      );
    }

    if (profile.role === 'barber') {
      return (
        <nav className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-white/10 p-2 flex justify-around items-center z-50 max-w-md mx-auto">
          <NavButton 
            active={activeTab === 'home'} 
            onClick={() => { setActiveTab('home'); setSelectedShopId(null); }} 
            icon={<HomeIcon size={20} />} 
            label="Home" 
          />
          <NavButton 
            active={activeTab === 'vault'} 
            onClick={() => { setActiveTab('vault'); setSelectedShopId(null); }} 
            icon={<Shield size={20} />} 
            label="Cofre" 
          />
          <NavButton 
            active={activeTab === 'transactions'} 
            onClick={() => { setActiveTab('transactions'); setSelectedShopId(null); }} 
            icon={<ArrowRightLeft size={20} />} 
            label="Extrato" 
          />
          <NavButton 
            active={activeTab === 'profile'} 
            onClick={() => { setActiveTab('profile'); setSelectedShopId(null); }} 
            icon={<UserIcon size={20} />} 
            label="Perfil" 
          />
        </nav>
      );
    }

    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-white/10 p-2 flex justify-around items-center z-50 max-w-md mx-auto">
        <NavButton 
          active={activeTab === 'home'} 
          onClick={() => { setActiveTab('home'); setSelectedShopId(null); }} 
          icon={<HomeIcon size={20} />} 
          label="Home" 
        />
        <NavButton 
          active={activeTab === 'search'} 
          onClick={() => { setActiveTab('search'); setSelectedShopId(null); }} 
          icon={<Search size={20} />} 
          label="Explorar" 
        />
        <NavButton 
          active={activeTab === 'sweepstakes'} 
          onClick={() => { setActiveTab('sweepstakes'); setSelectedShopId(null); }} 
          icon={<Gift size={20} />} 
          label="Sorteios" 
        />
        <NavButton 
          active={activeTab === 'negotiations'} 
          onClick={() => { setActiveTab('negotiations'); setSelectedShopId(null); }} 
          icon={<ArrowRightLeft size={20} />} 
          label="Trocas" 
        />
        <NavButton 
          active={activeTab === 'transactions'} 
          onClick={() => { setActiveTab('transactions'); setSelectedShopId(null); }} 
          icon={<Clock size={20} />} 
          label="Extrato" 
        />
        <NavButton 
          active={activeTab === 'profile'} 
          onClick={() => { setActiveTab('profile'); setSelectedShopId(null); }} 
          icon={<UserIcon size={20} />} 
          label="Perfil" 
        />
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans pb-20">
      <header className="p-4 border-b border-white/10 flex justify-between items-center sticky top-0 bg-neutral-950/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2">
          <Scissors className="text-amber-500 w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tighter text-amber-500">BARBER<span className="text-white">TRADE</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationCenter />
          <span className="text-xs text-neutral-400">{profile.displayName}</span>
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center overflow-hidden">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-4 h-4 text-amber-500" />
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {paymentStatus && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-20 left-4 right-4 z-[100] p-4 rounded-2xl border flex items-center justify-between shadow-2xl ${paymentStatus === 'success' ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-red-500/10 border-red-500 text-red-500'}`}
          >
            <div className="flex items-center gap-3">
              {paymentStatus === 'success' ? <Check size={20} /> : <Shield size={20} />}
              <span className="text-xs font-bold uppercase tracking-widest">
                {paymentStatus === 'success' ? 'Pagamento realizado com sucesso!' : 'Pagamento cancelado ou falhou.'}
              </span>
            </div>
            <button onClick={() => setPaymentStatus(null)}>
              <LogOut size={16} className="rotate-90" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-md mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + (selectedShopId || '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {renderNav()}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 transition-colors ${active ? 'text-amber-500' : 'text-neutral-500'}`}
    >
      {icon}
      <span className="text-[10px] uppercase font-bold tracking-widest">{label}</span>
    </button>
  );
}
