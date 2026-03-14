import React, { useState } from 'react';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  LogOut, 
  Settings, 
  Shield, 
  Bell, 
  BellOff, 
  Gift, 
  Copy, 
  Check, 
  Share2, 
  Wallet, 
  CreditCard, 
  Plus,
  Crown,
  Zap,
  ArrowUpRight,
  Scissors
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { registerPushNotifications } from '../services/notificationService';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, runTransaction } from 'firebase/firestore';

interface ProfileProps {
  profile: UserProfile;
  onLogout: () => void;
}

export default function Profile({ profile, onLogout }: ProfileProps) {
  const [copied, setCopied] = useState(false);
  const [notifsEnabled, setNotifsEnabled] = useState(Notification.permission === 'granted');
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState(50);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleToggleNotifications = async () => {
    if (notifsEnabled) return;
    await registerPushNotifications(profile.uid);
    setNotifsEnabled(Notification.permission === 'granted');
  };

  const handleWithdraw = async () => {
    const val = parseFloat(withdrawAmount);
    if (isNaN(val) || val <= 0) return;
    
    setProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', profile.uid);
        const userSnap = await transaction.get(userRef);
        
        if (!userSnap.exists()) throw new Error("Usuário não encontrado");
        
        const currentBalance = userSnap.data().balance || 0;
        if (val > currentBalance) {
          throw new Error("Saldo insuficiente para este saque.");
        }

        // 1. Atualizar saldo
        transaction.update(userRef, { balance: currentBalance - val });
        
        // 2. Registrar transação do usuário
        const userTransRef = doc(collection(db, 'user_transactions'));
        transaction.set(userTransRef, {
          userId: profile.uid,
          type: 'withdraw',
          amount: val,
          description: `Saque solicitado via PIX`,
          createdAt: new Date().toISOString()
        });

        // 3. Registrar para auditoria da plataforma
        const platformTransRef = doc(collection(db, 'platform_transactions'));
        transaction.set(platformTransRef, {
          type: 'withdraw',
          amount: val,
          userId: profile.uid,
          description: `Saque solicitado via PIX`,
          createdAt: new Date().toISOString(),
          status: 'pending'
        });
      });

      setShowWithdraw(false);
      setWithdrawAmount('');
      alert("Solicitação de saque enviada com sucesso!");
    } catch (err: any) {
      console.error("Error withdrawing:", err);
      alert(err.message || "Erro ao processar saque.");
    } finally {
      setProcessing(false);
    }
  };

  const handleAddFunds = async () => {
    setProcessing(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, userId: profile.uid })
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Falha ao criar sessão de pagamento');
      }
    } catch (err) {
      console.error("Error adding funds:", err);
      alert("Erro ao processar pagamento. Verifique se as chaves do Stripe estão configuradas.");
    } finally {
      setProcessing(false);
    }
  };

  const handleUpgrade = async () => {
    setProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, 'users', profile.uid);
        const userSnap = await transaction.get(userRef);
        
        if (!userSnap.exists()) throw new Error("Usuário não encontrado");
        
        const currentBalance = userSnap.data().balance || 0;
        const price = 29.90;

        if (currentBalance < price) {
          throw new Error("Saldo insuficiente para assinatura mensal (R$ 29,90)");
        }

        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + 1);

        // 1. Atualizar Perfil
        transaction.update(userRef, { 
          balance: currentBalance - price,
          subscriptionStatus: 'premium',
          subscriptionExpiry: expiry.toISOString()
        });

        // 2. Registrar Transação do Usuário
        const userTransRef = doc(collection(db, 'user_transactions'));
        transaction.set(userTransRef, {
          userId: profile.uid,
          type: 'payment',
          amount: price,
          description: `Assinatura Mensal Premium`,
          createdAt: new Date().toISOString()
        });

        // 3. Registrar Receita da Plataforma
        const platformTransRef = doc(collection(db, 'platform_transactions'));
        transaction.set(platformTransRef, {
          type: 'subscription',
          amount: price,
          userId: profile.uid,
          description: `Assinatura Mensal Premium`,
          createdAt: new Date().toISOString()
        });
      });

      alert("Upgrade realizado com sucesso! Bem-vindo ao Premium.");
    } catch (err: any) {
      console.error("Error upgrading:", err);
      alert(err.message || "Erro ao realizar upgrade.");
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = () => {
    if (profile.referralCode) {
      navigator.clipboard.writeText(profile.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const referralProgress = Math.min((profile.referralCount || 0) / 3 * 100, 100);

  const switchRole = async () => {
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const docRef = doc(db, 'users', profile.uid);
      const newRole = profile.role === 'barber' ? 'client' : 'barber';
      await updateDoc(docRef, { role: newRole });
      window.location.reload(); // Simple way to refresh profile state in App
    } catch (err) {
      console.error("Error switching role:", err);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Profile Header */}
      <section className="flex flex-col items-center text-center space-y-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-amber-500/20 border-2 border-amber-500 p-1">
            <div className="w-full h-full rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
              {profile.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-amber-500" />
              )}
            </div>
          </div>
          <button className="absolute bottom-0 right-0 p-2 bg-amber-500 rounded-full text-black shadow-lg">
            <Settings size={14} />
          </button>
        </div>
        <div>
          <h2 className="text-2xl font-bold">{profile.displayName}</h2>
          <div className="flex flex-col items-center gap-2 mt-1">
            <div className="bg-amber-500/10 px-3 py-1 rounded-full inline-block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">{profile.role === 'barber' ? 'Barbeiro Profissional' : 'Cliente Premium'}</span>
            </div>
            <button 
              onClick={switchRole}
              className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors underline underline-offset-4"
            >
              Alternar para {profile.role === 'barber' ? 'Cliente' : 'Barbeiro'}
            </button>
          </div>
        </div>
      </section>

      {/* Referral Section */}
      <section className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-3xl p-6 text-black shadow-xl shadow-amber-500/20 space-y-4 relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-black/10 p-2 rounded-xl">
              <Gift size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Ganhe R$ 10,00</h3>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70">Convide 3 amigos para o app</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-end text-[10px] font-bold uppercase tracking-widest">
              <span>Progresso</span>
              <span>{profile.referralCount || 0} / 3 Amigos</span>
            </div>
            <div className="h-2 bg-black/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${referralProgress}%` }}
                className="h-full bg-black"
              />
            </div>
          </div>

          <div className="pt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-2">Seu Código de Convite</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-black/10 rounded-xl py-3 px-4 font-mono font-bold text-center border border-black/5">
                {profile.referralCode || '------'}
              </div>
              <button 
                onClick={copyToClipboard}
                className="bg-black text-white px-4 rounded-xl flex items-center justify-center active:scale-95 transition-all"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
              <button className="bg-white/20 text-black px-4 rounded-xl flex items-center justify-center active:scale-95 transition-all">
                <Share2 size={18} />
              </button>
            </div>
          </div>
        </div>
        <Gift className="absolute -right-4 -bottom-4 w-32 h-32 text-black/5 rotate-12" />
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-4">
        <StatCard label="Cortes" value="12" />
        <StatCard label="Saldo" value={`R$ ${profile.balance?.toFixed(2) || '0.00'}`} />
        <StatCard label="Pontos" value="450" />
      </section>

      {/* Wallet & Subscription Section */}
      <section className="bg-neutral-900 rounded-[40px] p-6 border border-white/5 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Wallet className="text-amber-500" size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest">Minha Carteira</h3>
              <p className="text-2xl font-bold">R$ {(profile.balance || 0).toFixed(2)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowAddFunds(true)}
              className="w-10 h-10 rounded-2xl bg-amber-500 text-black flex items-center justify-center hover:scale-105 transition-transform"
            >
              <Plus size={20} />
            </button>
            {profile.role === 'barber' && (
              <button 
                onClick={() => setShowWithdraw(true)}
                className="w-10 h-10 rounded-2xl bg-neutral-800 text-amber-500 border border-white/5 flex items-center justify-center hover:scale-105 transition-transform"
              >
                <ArrowUpRight size={20} />
              </button>
            )}
          </div>
        </div>

        <div className={`p-4 rounded-3xl border flex items-center justify-between ${profile.subscriptionStatus === 'premium' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-neutral-800 border-white/5'}`}>
          <div className="flex items-center gap-3">
            {profile.subscriptionStatus === 'premium' ? (
              <Crown className="text-amber-500" size={18} />
            ) : (
              <Zap className="text-neutral-500" size={18} />
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Plano Atual</p>
              <p className="text-xs font-bold uppercase tracking-widest">
                {profile.subscriptionStatus === 'premium' ? 'Premium' : 'Gratuito'}
              </p>
            </div>
          </div>
          {profile.subscriptionStatus !== 'premium' && (
            <button 
              onClick={handleUpgrade}
              disabled={processing}
              className="bg-amber-500 text-black text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl hover:scale-105 transition-transform disabled:opacity-50"
            >
              Upgrade
            </button>
          )}
        </div>
      </section>

      {/* Info List */}
      <section className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1 mb-2">Informações Pessoais</h3>
        <div className="bg-neutral-900 rounded-3xl border border-white/5 divide-y divide-white/5">
          <InfoItem icon={<Mail size={18} />} label="Email" value={profile.email} />
          <InfoItem icon={<Phone size={18} />} label="Telefone" value={profile.phoneNumber || 'Não informado'} />
          <InfoItem icon={<Calendar size={18} />} label="Membro desde" value={format(new Date(profile.createdAt), "MMMM 'de' yyyy", { locale: ptBR })} />
        </div>
      </section>

      {/* Settings List */}
      <section className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1 mb-2">Configurações</h3>
        <div className="bg-neutral-900 rounded-3xl border border-white/5 divide-y divide-white/5">
          <button 
            onClick={handleToggleNotifications}
            className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="text-neutral-500">
                {notifsEnabled ? <Bell size={18} className="text-green-500" /> : <BellOff size={18} />}
              </div>
              <span className="text-sm font-bold text-white uppercase tracking-widest">
                {notifsEnabled ? 'Notificações Ativas' : 'Ativar Notificações'}
              </span>
            </div>
            <div className={`w-2 h-2 rounded-full ${notifsEnabled ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-neutral-700'}`}></div>
          </button>
          <SettingsItem icon={<Shield size={18} />} label="Privacidade e Segurança" />
          
          {profile.role === 'client' && (
            <button 
              onClick={async () => {
                if (window.confirm("Deseja mudar seu perfil para Barbeiro? Você precisará cadastrar sua barbearia em seguida.")) {
                  try {
                    await updateDoc(doc(db, 'users', profile.uid), { role: 'barber' });
                    window.location.reload(); // Recarrega para atualizar o estado global do App.tsx
                  } catch (err) {
                    console.error("Erro ao mudar papel:", err);
                  }
                }
              }}
              className="w-full flex items-center gap-4 p-5 text-amber-500 hover:bg-amber-500/5 transition-colors border-t border-white/5"
            >
              <Scissors size={18} />
              <span className="font-bold text-sm uppercase tracking-widest">Seja um Barbeiro</span>
            </button>
          )}

          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-4 p-5 text-red-500 hover:bg-red-500/5 transition-colors"
          >
            <LogOut size={18} />
            <span className="font-bold text-sm uppercase tracking-widest">Sair da Conta</span>
          </button>
        </div>
      </section>
      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdraw && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWithdraw(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-neutral-900 rounded-[40px] border border-white/10 p-8 space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <ArrowUpRight className="text-amber-500" size={32} />
                </div>
                <h3 className="text-xl font-bold tracking-tighter">SOLICITAR SAQUE</h3>
                <p className="text-xs text-neutral-500 uppercase tracking-widest">O valor será enviado para sua chave PIX cadastrada</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 font-bold">R$</span>
                  <input 
                    type="number" 
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm outline-none focus:border-amber-500 transition-all font-mono"
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest px-1">
                  <span className="text-neutral-500">Saldo Disponível</span>
                  <span className="text-amber-500">R$ {(profile.balance || 0).toFixed(2)}</span>
                </div>
              </div>

              <button 
                onClick={handleWithdraw}
                disabled={processing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                className="w-full bg-amber-500 text-black py-4 rounded-2xl font-bold uppercase tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? 'Processando...' : 'Confirmar Saque'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Funds Modal */}
      <AnimatePresence>
        {showAddFunds && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddFunds(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-neutral-900 rounded-[40px] border border-white/10 p-8 space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="text-amber-500" size={32} />
                </div>
                <h3 className="text-xl font-bold tracking-tighter">ADICIONAR SALDO</h3>
                <p className="text-xs text-neutral-500 uppercase tracking-widest">Escolha o valor para recarregar via Cartão ou PIX</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[20, 50, 100].map(val => (
                  <button 
                    key={val}
                    onClick={() => setAmount(val)}
                    className={`py-3 rounded-2xl font-bold text-sm transition-all ${amount === val ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-400 border border-white/5'}`}
                  >
                    R$ {val}
                  </button>
                ))}
              </div>

              <button 
                onClick={handleAddFunds}
                disabled={processing}
                className="w-full bg-amber-500 text-black py-4 rounded-2xl font-bold uppercase tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? 'Redirecionando...' : (
                  <>
                    <CreditCard size={18} />
                    Pagar Agora
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-neutral-900 p-4 rounded-2xl border border-white/5 text-center space-y-1">
      <p className="text-sm font-bold text-white truncate">{value}</p>
      <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">{label}</p>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex items-center gap-4 p-5">
      <div className="text-neutral-500">{icon}</div>
      <div>
        <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function SettingsItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <button className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left">
      <div className="flex items-center gap-4">
        <div className="text-neutral-500">{icon}</div>
        <span className="text-sm font-bold text-white uppercase tracking-widest">{label}</span>
      </div>
      <div className="w-2 h-2 rounded-full bg-neutral-700"></div>
    </button>
  );
}
