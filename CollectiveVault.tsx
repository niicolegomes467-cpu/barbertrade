import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  TrendingUp, 
  Users, 
  History, 
  Plus, 
  ChevronRight, 
  Info, 
  Gift,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Award,
  Sparkles
} from 'lucide-react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc,
  getDocs,
  runTransaction,
  orderBy,
  limit,
  setDoc
} from 'firebase/firestore';
import { Vault, VaultShare, VaultTransaction, UserProfile } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function CollectiveVault() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [myShares, setMyShares] = useState<VaultShare[]>([]);
  const [transactions, setTransactions] = useState<VaultTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [shareCount, setShareCount] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("Sorteio de Fim de Semana");
  const [campaignWinners, setCampaignWinners] = useState(5);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const handleLaunchCampaign = async () => {
    if (!vault || !auth.currentUser) return;
    
    const totalCost = campaignWinners * 30;
    if (vault.totalBalance < totalCost) {
      alert("Saldo do cofre insuficiente para esta campanha.");
      return;
    }

    setProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const vaultRef = doc(db, 'vaults', 'main_vault');
        const vaultSnap = await transaction.get(vaultRef);

        if (!vaultSnap.exists()) throw new Error("Cofre não encontrado");
        
        const currentBalance = vaultSnap.data().totalBalance || 0;
        if (currentBalance < totalCost) {
          throw new Error("Saldo insuficiente no cofre.");
        }

        // 1. Reservar Saldo do Cofre
        transaction.update(vaultRef, {
          totalBalance: currentBalance - totalCost,
          reservedBalance: (vaultSnap.data().reservedBalance || 0) + totalCost
        });

        // 2. Criar o Sorteio
        const sweepstakeRef = doc(collection(db, 'sweepstakes'));
        transaction.set(sweepstakeRef, {
          title: campaignTitle,
          description: `Ganhe um dos ${campaignWinners} cortes grátis oferecidos pelos barbeiros participantes!`,
          drawDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h from now
          status: 'open',
          winnersCount: campaignWinners,
          prizeValue: 30,
          createdAt: new Date().toISOString(),
          launchedBy: auth.currentUser!.uid
        });

        // 3. Registrar Transação do Cofre
        const vaultTransRef = doc(collection(db, 'vault_transactions'));
        transaction.set(vaultTransRef, {
          type: 'campaign_launch',
          amount: totalCost,
          userId: auth.currentUser!.uid,
          description: `Lançamento de Campanha: ${campaignTitle}`,
          createdAt: new Date().toISOString()
        });
      });

      setShowLaunchModal(false);
      alert("Campanha lançada com sucesso! O saldo foi reservado do cofre.");
    } catch (err: any) {
      console.error("Erro ao lançar campanha:", err);
      alert(err.message || "Erro ao lançar campanha.");
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    // Listen to main vault
    const vaultRef = doc(db, 'vaults', 'main_vault');
    const unsubVault = onSnapshot(vaultRef, (doc) => {
      if (doc.exists()) {
        setVault({ id: doc.id, ...doc.data() } as Vault);
      } else {
        // Initialize vault if it doesn't exist
        setDoc(vaultRef, {
          totalBalance: 0,
          reservedBalance: 0,
          sharePrice: 20,
          totalShares: 0,
          activeBarbersCount: 0
        });
      }
    });

    // Listen to my shares
    if (auth.currentUser) {
      const unsubProfile = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
        setProfile(snap.data() as UserProfile);
      });

      const sharesQuery = query(
        collection(db, 'vault_shares'),
        where('barberId', '==', auth.currentUser.uid)
      );
      const unsubShares = onSnapshot(sharesQuery, (snapshot) => {
        setMyShares(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VaultShare)));
      });

      // Listen to transactions
      const transQuery = query(
        collection(db, 'vault_transactions'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const unsubTrans = onSnapshot(transQuery, (snapshot) => {
        setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VaultTransaction)));
      });

      setLoading(false);
      return () => {
        unsubVault();
        unsubProfile();
        unsubShares();
        unsubTrans();
      };
    }
  }, []);

  const handleBuyShares = async () => {
    if (!auth.currentUser || !vault) return;
    setProcessing(true);
    
    try {
      const totalCost = shareCount * vault.sharePrice;
      const barberId = auth.currentUser.uid;

      await runTransaction(db, async (transaction) => {
        const vaultRef = doc(db, 'vaults', 'main_vault');
        const userRef = doc(db, 'users', barberId);
        
        // Check if barber already has shares to update activeBarbersCount correctly
        const sharesQuery = query(
          collection(db, 'vault_shares'),
          where('barberId', '==', barberId)
        );
        const sharesSnap = await getDocs(sharesQuery);
        const isNewParticipant = sharesSnap.empty;

        const vaultDoc = await transaction.get(vaultRef);
        const userDoc = await transaction.get(userRef);

        if (!vaultDoc.exists()) throw new Error("Cofre não encontrado");
        if (!userDoc.exists()) throw new Error("Usuário não encontrado");

        const userData = userDoc.data() as UserProfile;
        if ((userData.balance || 0) < totalCost) {
          throw new Error("Saldo insuficiente na sua carteira.");
        }

        // Update Vault
        transaction.update(vaultRef, {
          totalBalance: (vaultDoc.data().totalBalance || 0) + totalCost,
          totalShares: (vaultDoc.data().totalShares || 0) + shareCount,
          activeBarbersCount: (vaultDoc.data().activeBarbersCount || 0) + (isNewParticipant ? 1 : 0)
        });

        // Update User
        transaction.update(userRef, {
          balance: userData.balance! - totalCost,
          vaultShares: (userData.vaultShares || 0) + shareCount
        });

        // Platform Fee (5%)
        const platformFee = totalCost * 0.05;
        const platformTransRef = doc(collection(db, 'platform_transactions'));
        transaction.set(platformTransRef, {
          type: 'vault_fee',
          amount: platformFee,
          userId: barberId,
          description: `Taxa de participação no cofre (${shareCount} cotas)`,
          createdAt: new Date().toISOString()
        });

        // Create Share Record
        const shareRef = doc(collection(db, 'vault_shares'));
        transaction.set(shareRef, {
          barberId,
          count: shareCount,
          amountInvested: totalCost,
          createdAt: new Date().toISOString()
        });

        // Create Transaction Record
        const transRef = doc(collection(db, 'vault_transactions'));
        transaction.set(transRef, {
          type: 'contribution',
          amount: totalCost,
          userId: barberId,
          description: `Compra de ${shareCount} cotas do Cofre Coletivo`,
          createdAt: new Date().toISOString()
        });
      });

      setShowBuyModal(false);
      setShareCount(1);
      alert("Cotas compradas com sucesso!");
    } catch (err: any) {
      console.error("Erro ao comprar cotas:", err);
      alert(err.message || "Erro ao processar compra.");
    } finally {
      setProcessing(false);
    }
  };

  const totalMyShares = myShares.reduce((acc, s) => acc + s.count, 0);
  const totalMyInvestment = myShares.reduce((acc, s) => acc + s.amountInvested, 0);

  if (loading) return <div className="p-6 text-center">Carregando cofre...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="text-amber-500" />
          Cofre Coletivo
        </h2>
        <p className="text-sm text-neutral-500">Marketing compartilhado para barbeiros</p>
      </div>

      {/* Main Vault Stats */}
      <section className="bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-3xl p-6 border border-white/5 relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Saldo Total do Fundo</p>
              <h3 className="text-3xl font-bold">R$ {vault?.totalBalance.toFixed(2) || '0.00'}</h3>
            </div>
            <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20">
              <TrendingUp className="text-amber-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Cotas Ativas</p>
              <p className="text-lg font-bold">{vault?.totalShares || 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Barbeiros</p>
              <p className="text-lg font-bold">{vault?.activeBarbersCount || 0}</p>
            </div>
          </div>
        </div>
        <DollarSign className="absolute -right-8 -bottom-8 w-48 h-48 text-white/5 -rotate-12" />
      </section>

      {/* My Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-neutral-900 p-5 rounded-3xl border border-white/5 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Minhas Cotas</p>
          <p className="text-2xl font-bold text-amber-500">{totalMyShares}</p>
          <p className="text-[10px] text-neutral-500">Investido: R$ {totalMyInvestment.toFixed(2)}</p>
        </div>
        <div className="grid grid-rows-2 gap-4">
          <button 
            onClick={() => setShowBuyModal(true)}
            className="bg-amber-500 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all text-black font-bold text-[10px] uppercase tracking-widest"
          >
            <Plus size={14} />
            Comprar Cotas
          </button>
          <button 
            onClick={() => setShowLaunchModal(true)}
            className="bg-neutral-800 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all text-white font-bold text-[10px] uppercase tracking-widest border border-white/5"
          >
            <Sparkles size={14} className="text-amber-500" />
            Lançar Sorteio
          </button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-5 flex gap-4">
        <Info className="text-amber-500 shrink-0" size={20} />
        <div className="space-y-1">
          <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Como funciona?</p>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Seu investimento financia cortes grátis para novos clientes. Quando você atende um ganhador, o valor é pago pelo cofre.
          </p>
        </div>
      </div>

      {/* Recent Transactions */}
      <section className="space-y-4">
        <div className="flex justify-between items-end px-1">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Histórico Recente</h3>
          <button className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Ver Tudo</button>
        </div>
        
        <div className="space-y-2">
          {transactions.length > 0 ? (
            transactions.map(t => (
              <div key={t.id} className="bg-neutral-900/50 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl ${t.type === 'contribution' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                    {t.type === 'contribution' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{t.description}</p>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest">{format(new Date(t.createdAt), "dd MMM, HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>
                <p className={`font-bold ${t.type === 'contribution' ? 'text-red-500' : 'text-green-500'}`}>
                  {t.type === 'contribution' ? '-' : '+'} R$ {t.amount.toFixed(2)}
                </p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-neutral-600">
              <History size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-xs uppercase font-bold tracking-widest">Nenhuma movimentação</p>
            </div>
          )}
        </div>
      </section>

      {/* Buy Modal */}
      <AnimatePresence>
        {showBuyModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBuyModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-md bg-neutral-900 rounded-t-[40px] sm:rounded-[40px] p-8 space-y-8 border-t border-white/10"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                  <Award className="text-amber-500 w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold">Comprar Cotas</h3>
                <p className="text-sm text-neutral-500">Cada cota custa R$ {vault?.sharePrice.toFixed(2)}</p>
              </div>

              <div className="flex items-center justify-center gap-8">
                <button 
                  onClick={() => setShareCount(Math.max(1, shareCount - 1))}
                  className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-2xl active:scale-90 transition-all"
                >
                  -
                </button>
                <span className="text-4xl font-bold w-16 text-center">{shareCount}</span>
                <button 
                  onClick={() => setShareCount(shareCount + 1)}
                  className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-2xl active:scale-90 transition-all"
                >
                  +
                </button>
              </div>

              <div className="bg-black/40 p-6 rounded-3xl border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-500">Seu Saldo</span>
                  <span className="text-sm font-bold text-white">R$ {(profile?.balance || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-500">Total a Investir</span>
                  <span className="text-xl font-bold text-amber-500">R$ {(shareCount * (vault?.sharePrice || 0)).toFixed(2)}</span>
                </div>
                <div className="h-px bg-white/5" />
                <p className="text-[10px] text-center text-neutral-500 uppercase tracking-widest leading-relaxed">
                  O valor será debitado do seu saldo e investido no fundo comum.
                </p>
              </div>

              <button 
                disabled={processing}
                onClick={handleBuyShares}
                className="w-full bg-amber-500 text-black py-5 rounded-3xl font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
              >
                {processing ? 'Processando...' : 'Confirmar Investimento'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Launch Modal */}
      <AnimatePresence>
        {showLaunchModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLaunchModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-md bg-neutral-900 rounded-t-[40px] sm:rounded-[40px] p-8 space-y-8 border-t border-white/10"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                  <Sparkles className="text-amber-500 w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold">Lançar Campanha</h3>
                <p className="text-sm text-neutral-500">Use o saldo do cofre para atrair clientes</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Título da Campanha</label>
                  <input 
                    type="text" 
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm focus:border-amber-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 ml-1">Número de Ganhadores</label>
                  <div className="flex items-center gap-4 mt-1">
                    {[5, 10, 20].map(n => (
                      <button 
                        key={n}
                        onClick={() => setCampaignWinners(n)}
                        className={`flex-1 py-3 rounded-xl border font-bold text-xs transition-all ${campaignWinners === n ? 'bg-amber-500 border-amber-500 text-black' : 'bg-black/40 border-white/10 text-neutral-500'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-black/40 p-6 rounded-3xl border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-neutral-500">Custo do Cofre</span>
                  <span className="text-xl font-bold text-amber-500">R$ {(campaignWinners * 30).toFixed(2)}</span>
                </div>
                <div className="h-px bg-white/5" />
                <p className="text-[10px] text-center text-neutral-500 uppercase tracking-widest leading-relaxed">
                  O valor será reservado do cofre coletivo para pagar os barbeiros que atenderem os ganhadores.
                </p>
              </div>

              <button 
                disabled={processing || (vault?.totalBalance || 0) < (campaignWinners * 30)}
                onClick={handleLaunchCampaign}
                className="w-full bg-amber-500 text-black py-5 rounded-3xl font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
              >
                {processing ? 'Processando...' : (vault?.totalBalance || 0) < (campaignWinners * 30) ? 'Saldo Insuficiente' : 'Lançar Agora'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
