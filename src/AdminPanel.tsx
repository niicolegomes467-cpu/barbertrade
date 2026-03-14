import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc, 
  getDocs, 
  orderBy, 
  limit,
  where,
  addDoc
} from 'firebase/firestore';
import { 
  UserProfile, 
  Barbershop, 
  Vault, 
  PlatformTransaction, 
  Appointment,
  AdminLog
} from '../types';
import { motion } from 'motion/react';
import { 
  Users, 
  Scissors, 
  Shield, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Search,
  Filter,
  BarChart3,
  FileText,
  Lock,
  Unlock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'users' | 'barbers' | 'vaults' | 'financials' | 'logs' | 'withdrawals'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [barbershops, setBarbershops] = useState<Barbershop[]>([]);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [transactions, setTransactions] = useState<PlatformTransaction[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setLoading(true);
    
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile)));
    });

    const unsubShops = onSnapshot(collection(db, 'barbershops'), (snapshot) => {
      setBarbershops(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barbershop)));
    });

    const unsubVaults = onSnapshot(collection(db, 'vaults'), (snapshot) => {
      setVaults(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vault)));
    });

    const unsubTrans = onSnapshot(
      query(collection(db, 'platform_transactions'), orderBy('createdAt', 'desc'), limit(50)), 
      (snapshot) => {
        setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlatformTransaction)));
      }
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'admin_logs'), orderBy('createdAt', 'desc'), limit(50)), 
      (snapshot) => {
        setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminLog)));
      }
    );

    setLoading(false);

    return () => {
      unsubUsers();
      unsubShops();
      unsubVaults();
      unsubTrans();
      unsubLogs();
    };
  }, []);

  const handleBlockUser = async (userId: string, isBlocked: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { isBlocked: !isBlocked });
      await addDoc(collection(db, 'admin_logs'), {
        adminId: 'system_admin', // Should be current user ID
        action: isBlocked ? 'unblock_user' : 'block_user',
        targetId: userId,
        details: `${isBlocked ? 'Desbloqueou' : 'Bloqueou'} o usuário ${userId}`,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error toggling block:", err);
    }
  };

  const handleUpdateWithdrawal = async (transactionId: string, status: 'completed' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'platform_transactions', transactionId), { status });
      
      const trans = transactions.find(t => t.id === transactionId);
      if (status === 'rejected' && trans) {
        // Refund balance if rejected
        const userRef = doc(db, 'users', trans.userId);
        const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', trans.userId)));
        if (!userSnap.empty) {
          const userData = userSnap.docs[0].data() as UserProfile;
          await updateDoc(doc(db, 'users', userSnap.docs[0].id), { 
            balance: (userData.balance || 0) + trans.amount 
          });
        }
      }

      await addDoc(collection(db, 'admin_logs'), {
        adminId: 'system_admin',
        action: `withdrawal_${status}`,
        targetId: transactionId,
        details: `${status === 'completed' ? 'Aprovou' : 'Rejeitou'} o saque ${transactionId}`,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error updating withdrawal:", err);
    }
  };

  const totalRevenue = transactions.reduce((acc, t) => acc + t.amount, 0);

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tighter flex items-center gap-2">
          <Shield className="text-amber-500" />
          PAINEL ADMINISTRATIVO
        </h2>
        <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-2xl">
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Modo Admin Ativo</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-neutral-900 p-4 rounded-3xl border border-white/5">
          <div className="flex items-center gap-2 text-neutral-500 mb-1">
            <Users size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Usuários</span>
          </div>
          <p className="text-2xl font-bold">{users.length}</p>
        </div>
        <div className="bg-neutral-900 p-4 rounded-3xl border border-white/5">
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <DollarSign size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Receita Total</span>
          </div>
          <p className="text-2xl font-bold text-amber-500">R$ {totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users size={16} />} label="Usuários" />
        <TabButton active={activeTab === 'barbers'} onClick={() => setActiveTab('barbers')} icon={<Scissors size={16} />} label="Barbeiros" />
        <TabButton active={activeTab === 'vaults'} onClick={() => setActiveTab('vaults')} icon={<Shield size={16} />} label="Cofres" />
        <TabButton active={activeTab === 'financials'} onClick={() => setActiveTab('financials')} icon={<BarChart3 size={16} />} label="Financeiro" />
        <TabButton active={activeTab === 'withdrawals'} onClick={() => setActiveTab('withdrawals')} icon={<DollarSign size={16} />} label="Saques" />
        <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<FileText size={16} />} label="Logs" />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
        <input 
          type="text" 
          placeholder="Buscar..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-neutral-900 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-amber-500 outline-none transition-colors"
        />
      </div>

      {/* Content Area */}
      <div className="bg-neutral-900 rounded-[40px] border border-white/5 overflow-hidden">
        {activeTab === 'users' && (
          <div className="divide-y divide-white/5">
            {filteredUsers.map(user => (
              <div key={user.uid} className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden border border-white/10">
                    {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <Users size={20} className="text-neutral-600" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{user.displayName}</h4>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest">{user.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleBlockUser(user.uid, !!user.isBlocked)}
                    className={`p-2 rounded-xl border transition-all ${user.isBlocked ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-neutral-800 border-white/5 text-neutral-400'}`}
                  >
                    {user.isBlocked ? <Lock size={18} /> : <Unlock size={18} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Transações Recentes</h3>
              <div className="space-y-3">
                {transactions.map(t => (
                  <div key={t.id} className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold">{t.description}</p>
                      <p className="text-[10px] text-neutral-500">{format(new Date(t.createdAt), "dd MMM, HH:mm", { locale: ptBR })}</p>
                    </div>
                    <p className="font-bold text-green-500">+ R$ {t.amount.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <div className="divide-y divide-white/5">
            {transactions.filter(t => t.type === 'withdraw').map(t => (
              <div key={t.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center border border-white/10">
                      <DollarSign size={20} className="text-amber-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">R$ {t.amount.toFixed(2)}</h4>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Usuário: {t.userId}</p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    t.status === 'completed' ? 'bg-green-500/10 text-green-500' : 
                    t.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 
                    'bg-amber-500/10 text-amber-500'
                  }`}>
                    {t.status || 'Pendente'}
                  </div>
                </div>
                {(!t.status || t.status === 'pending') && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleUpdateWithdrawal(t.id, 'completed')}
                      className="flex-1 bg-green-500 text-black py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={14} />
                      Aprovar
                    </button>
                    <button 
                      onClick={() => handleUpdateWithdrawal(t.id, 'rejected')}
                      className="flex-1 bg-red-500/10 border border-red-500/20 text-red-500 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <XCircle size={14} />
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="p-6 space-y-4">
            {logs.map(log => (
              <div key={log.id} className="text-xs border-l-2 border-amber-500 pl-4 py-1">
                <p className="text-neutral-300">{log.details}</p>
                <p className="text-[10px] text-neutral-500">{format(new Date(log.createdAt), "dd/MM HH:mm")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${active ? 'bg-amber-500 text-black' : 'bg-neutral-900 text-neutral-500 border border-white/5'}`}
    >
      {icon}
      {label}
    </button>
  );
}
