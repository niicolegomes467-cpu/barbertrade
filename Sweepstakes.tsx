import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gift, 
  Ticket, 
  Calendar, 
  Trophy, 
  ChevronRight, 
  Sparkles, 
  Clock,
  CheckCircle2,
  AlertCircle,
  Scissors
} from 'lucide-react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  getDoc,
  updateDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { Sweepstake, Voucher } from '../types';
import { format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Sweepstakes() {
  const [sweepstakes, setSweepstakes] = useState<Sweepstake[]>([]);
  const [myVouchers, setMyVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSweep, setSelectedSweep] = useState<Sweepstake | null>(null);
  const [registering, setRegistering] = useState(false);
  const [myRegistrations, setMyRegistrations] = useState<string[]>([]);
  const [recentWinners, setRecentWinners] = useState<any[]>([]);

  useEffect(() => {
    // Listen to open sweepstakes
    const q = query(
      collection(db, 'sweepstakes'),
      where('status', '==', 'open'),
      orderBy('drawDate', 'asc')
    );
    const unsubSweep = onSnapshot(q, (snapshot) => {
      setSweepstakes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sweepstake)));
    });

    // Listen to recent winners (vouchers that are used or active from drawn sweepstakes)
    const vq_winners = query(
      collection(db, 'vouchers'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const unsubWinners = onSnapshot(vq_winners, async (snapshot) => {
      const winnersData = await Promise.all(snapshot.docs.map(async (vDoc) => {
        const v = vDoc.data();
        const clientDoc = await getDoc(doc(db, 'users', v.clientId));
        return {
          id: vDoc.id,
          name: clientDoc.exists() ? clientDoc.data().displayName.split(' ')[0] + ' ' + (clientDoc.data().displayName.split(' ')[1]?.[0] || '') + '.' : 'Usuário',
          prize: 'Corte Grátis',
          date: format(new Date(v.createdAt), "dd MMM", { locale: ptBR })
        };
      }));
      setRecentWinners(winnersData);
    });

    // Listen to my vouchers
    if (auth.currentUser) {
      const vq = query(
        collection(db, 'vouchers'),
        where('clientId', '==', auth.currentUser.uid),
        orderBy('status', 'asc')
      );
      const unsubVouchers = onSnapshot(vq, (snapshot) => {
        setMyVouchers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Voucher)));
      });

      // Listen to my registrations
      const rq = query(
        collection(db, 'sweepstake_registrations'),
        where('clientId', '==', auth.currentUser.uid)
      );
      const unsubReg = onSnapshot(rq, (snapshot) => {
        setMyRegistrations(snapshot.docs.map(doc => doc.data().sweepstakeId));
      });

      setLoading(false);
      return () => {
        unsubSweep();
        unsubVouchers();
        unsubReg();
      };
    }
  }, []);

  const handleRegister = async (sweepstakeId: string) => {
    if (!auth.currentUser) return;
    setRegistering(true);
    try {
      await addDoc(collection(db, 'sweepstake_registrations'), {
        sweepstakeId,
        clientId: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
      setSelectedSweep(null);
    } catch (err) {
      console.error("Erro ao participar:", err);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) return <div className="p-6 text-center">Carregando sorteios...</div>;

  const isRegistered = (id: string) => myRegistrations.includes(id);

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="text-amber-500" />
          Sorteios & Prêmios
        </h2>
        <p className="text-sm text-neutral-500">Ganhe cortes grátis patrocinados pelo Cofre Coletivo</p>
      </div>

      {/* Active Sweepstakes */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">Sorteios Abertos</h3>
        <div className="space-y-4">
          {sweepstakes.length > 0 ? (
            sweepstakes.map(s => (
              <SweepstakeCard key={s.id} sweepstake={s} onClick={() => setSelectedSweep(s)} />
            ))
          ) : (
            <div className="bg-neutral-900/50 rounded-3xl p-8 text-center border border-white/5">
              <Clock className="mx-auto mb-3 text-neutral-700" size={32} />
              <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Nenhum sorteio ativo no momento</p>
              <p className="text-xs text-neutral-600 mt-1">Fique de olho nas notificações!</p>
            </div>
          )}
        </div>
      </section>

      {/* My Vouchers */}
      <section className="space-y-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">Meus Vouchers</h3>
        <div className="space-y-3">
          {myVouchers.length > 0 ? (
            myVouchers.map(v => (
              <VoucherCard key={v.id} voucher={v} />
            ))
          ) : (
            <div className="bg-neutral-900/30 rounded-3xl p-6 border border-dashed border-white/10 text-center">
              <Ticket className="mx-auto mb-2 text-neutral-700 opacity-30" size={24} />
              <p className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Você ainda não possui vouchers</p>
            </div>
          )}
        </div>
      </section>

      {/* Transparency / Winners Wall */}
      <section className="bg-amber-500/5 rounded-3xl p-6 border border-amber-500/10 space-y-4">
        <div className="flex items-center gap-3">
          <Trophy className="text-amber-500" size={20} />
          <h3 className="text-sm font-bold uppercase tracking-widest">Mural de Ganhadores</h3>
        </div>
        <div className="space-y-3">
          {recentWinners.length > 0 ? (
            recentWinners.map(w => (
              <WinnerItem key={w.id} name={w.name} prize={w.prize} date={w.date} />
            ))
          ) : (
            <p className="text-[10px] text-center text-neutral-600 uppercase tracking-widest">Aguardando primeiros ganhadores...</p>
          )}
        </div>
      </section>

      {/* Sweepstake Detail Modal */}
      <AnimatePresence>
        {selectedSweep && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSweep(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-neutral-900 rounded-[40px] p-8 space-y-6 border border-white/10"
            >
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto border border-amber-500/20">
                  <Sparkles className="text-amber-500 w-10 h-10" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold">{selectedSweep.title}</h3>
                  <p className="text-sm text-neutral-400">{selectedSweep.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Data do Sorteio</p>
                  <p className="text-sm font-bold">{format(new Date(selectedSweep.drawDate), "dd/MM", { locale: ptBR })}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-center">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Ganhadores</p>
                  <p className="text-sm font-bold">{selectedSweep.winnersCount} Vagas</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span>Participação gratuita para clientes ativos</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span>Voucher válido por 15 dias após o sorteio</span>
                </div>
              </div>

              <button 
                disabled={registering || isRegistered(selectedSweep.id)}
                onClick={() => handleRegister(selectedSweep.id)}
                className="w-full bg-amber-500 text-black py-5 rounded-3xl font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                {registering ? 'Processando...' : isRegistered(selectedSweep.id) ? 'Já Inscrito' : 'Participar Agora'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SweepstakeCard({ sweepstake, onClick }: { sweepstake: Sweepstake, onClick: () => void }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full bg-neutral-900 rounded-[32px] p-6 border border-white/5 text-left relative overflow-hidden group"
    >
      <div className="relative z-10 flex justify-between items-center">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="bg-amber-500/20 px-2 py-1 rounded-lg">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Sorteio</span>
            </div>
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Calendar size={12} />
              {format(new Date(sweepstake.drawDate), "dd 'de' MMMM", { locale: ptBR })}
            </span>
          </div>
          <h4 className="text-lg font-bold leading-tight">{sweepstake.title}</h4>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-xs text-neutral-400">
              <Trophy size={14} className="text-amber-500" />
              <span>{sweepstake.winnersCount} ganhadores</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-neutral-400">
              <Gift size={14} className="text-amber-500" />
              <span>R$ {sweepstake.prizeValue.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="bg-white/5 p-3 rounded-2xl group-hover:bg-amber-500 group-hover:text-black transition-colors">
          <ChevronRight size={20} />
        </div>
      </div>
      <Sparkles className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 -rotate-12 group-hover:text-amber-500/10 transition-colors" />
    </motion.button>
  );
}

function VoucherCard({ voucher }: { voucher: Voucher }) {
  const isUsed = voucher.status === 'used';
  const isExpired = voucher.status === 'expired';

  return (
    <div className={`bg-neutral-900 rounded-2xl border ${isUsed ? 'border-white/5 opacity-60' : 'border-amber-500/30'} p-4 flex items-center justify-between`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${isUsed ? 'bg-neutral-800' : 'bg-amber-500/10 text-amber-500'}`}>
          {isUsed ? <CheckCircle2 size={20} /> : <Scissors size={20} />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold">Corte Grátis</p>
            <span className="text-[10px] font-mono text-neutral-500">#{voucher.code}</span>
          </div>
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
            {isUsed ? `Usado em ${format(new Date(voucher.usedAt!), "dd/MM")}` : `Expira em ${format(new Date(voucher.expiryDate), "dd/MM")}`}
          </p>
        </div>
      </div>
      {!isUsed && !isExpired && (
        <div className="bg-amber-500 text-black px-3 py-1 rounded-full">
          <span className="text-[10px] font-bold uppercase tracking-widest">Ativo</span>
        </div>
      )}
    </div>
  );
}

function WinnerItem({ name, prize, date }: { name: string, prize: string, date: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-bold">
          {name[0]}
        </div>
        <span className="font-bold">{name}</span>
      </div>
      <span className="text-neutral-500">{prize}</span>
      <span className="text-neutral-600">{date}</span>
    </div>
  );
}
