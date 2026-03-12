import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { PlatformTransaction, VaultTransaction } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Gift, 
  Zap, 
  CreditCard,
  Clock,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Transactions() {
  const [platformTransactions, setPlatformTransactions] = useState<PlatformTransaction[]>([]);
  const [vaultTransactions, setVaultTransactions] = useState<VaultTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'platform' | 'vault'>('platform');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const pq = query(
      collection(db, 'platform_transactions'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const vq = query(
      collection(db, 'vault_transactions'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubP = onSnapshot(pq, (snap) => {
      setPlatformTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlatformTransaction)));
      setLoading(false);
    });

    const unsubV = onSnapshot(vq, (snap) => {
      setVaultTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as VaultTransaction)));
    });

    return () => {
      unsubP();
      unsubV();
    };
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownLeft className="text-green-500" />;
      case 'withdraw': return <ArrowUpRight className="text-amber-500" />;
      case 'subscription': return <Zap className="text-amber-500" />;
      case 'appointment_fee': return <CreditCard className="text-blue-500" />;
      case 'negotiation_fee': return <ArrowUpRight className="text-purple-500" />;
      case 'vault_fee': return <Wallet className="text-amber-500" />;
      case 'payout': return <Gift className="text-green-500" />;
      case 'contribution': return <ArrowUpRight className="text-red-500" />;
      default: return <Clock className="text-neutral-500" />;
    }
  };

  const getLabel = (type: string) => {
    switch (type) {
      case 'deposit': return 'Depósito';
      case 'withdraw': return 'Saque';
      case 'subscription': return 'Assinatura';
      case 'appointment_fee': return 'Taxa de Agendamento';
      case 'negotiation_fee': return 'Taxa de Negociação';
      case 'vault_fee': return 'Taxa do Cofre';
      case 'payout': return 'Recebimento (Voucher)';
      case 'contribution': return 'Contribuição ao Cofre';
      default: return type;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tighter">HISTÓRICO</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Acompanhe suas transações</p>
      </header>

      <div className="flex bg-neutral-900 p-1 rounded-2xl border border-white/5">
        <button 
          onClick={() => setActiveTab('platform')}
          className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'platform' ? 'bg-amber-500 text-black' : 'text-neutral-500'}`}
        >
          Plataforma
        </button>
        <button 
          onClick={() => setActiveTab('vault')}
          className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'vault' ? 'bg-amber-500 text-black' : 'text-neutral-500'}`}
        >
          Cofre
        </button>
      </div>

      <div className="space-y-3">
        {activeTab === 'platform' ? (
          platformTransactions.length > 0 ? (
            platformTransactions.map(tx => (
              <TransactionCard key={tx.id} tx={tx} icon={getIcon(tx.type)} label={getLabel(tx.type)} />
            ))
          ) : (
            <EmptyState />
          )
        ) : (
          vaultTransactions.length > 0 ? (
            vaultTransactions.map(tx => (
              <TransactionCard key={tx.id} tx={tx} icon={getIcon(tx.type)} label={getLabel(tx.type)} />
            ))
          ) : (
            <EmptyState />
          )
        )}
      </div>
    </div>
  );
}

function TransactionCard({ tx, icon, label }: { tx: any, icon: React.ReactNode, label: string }) {
  const isNegative = ['subscription', 'appointment_fee', 'negotiation_fee', 'vault_fee', 'contribution', 'withdraw'].includes(tx.type);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-neutral-900 p-4 rounded-3xl border border-white/5 flex items-center justify-between hover:bg-neutral-800 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-black/40 flex items-center justify-center border border-white/5">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold">{label}</h4>
            {tx.status && (
              <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                tx.status === 'completed' ? 'bg-green-500/10 text-green-500' : 
                tx.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 
                'bg-amber-500/10 text-amber-500'
              }`}>
                {tx.status === 'completed' ? 'Pago' : tx.status === 'rejected' ? 'Recusado' : 'Pendente'}
              </span>
            )}
          </div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
            {format(new Date(tx.createdAt), "dd MMM, HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold font-mono ${isNegative ? 'text-red-500' : 'text-green-500'}`}>
          {isNegative ? '-' : '+'} R$ {tx.amount.toFixed(2)}
        </p>
        <p className="text-[10px] text-neutral-500 uppercase tracking-widest truncate max-w-[100px]">
          {tx.description}
        </p>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="py-20 text-center space-y-4 opacity-20">
      <Clock size={48} className="mx-auto" />
      <p className="text-xs font-bold uppercase tracking-widest">Nenhuma transação encontrada</p>
    </div>
  );
}
