import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, getDoc, addDoc, runTransaction } from 'firebase/firestore';
import { Negotiation, Appointment } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRightLeft, Check, X, MessageSquare, Clock, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Chat from './Chat';

export default function Negotiations() {
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'negotiations'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const allNegs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Negotiation));
      // Filter client-side because Firestore doesn't support OR queries easily without complex indexes
      const myNegs = allNegs.filter(n => n.proposerId === auth.currentUser?.uid || n.ownerId === auth.currentUser?.uid);
      setNegotiations(myNegs);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleAction = async (neg: Negotiation, action: 'accepted' | 'rejected') => {
    try {
      if (action === 'rejected') {
        await updateDoc(doc(db, 'negotiations', neg.id), { status: 'rejected' });
        
        // Notificar o proponente
        await addDoc(collection(db, 'notifications'), {
          userId: neg.proposerId,
          title: 'Proposta Recusada',
          message: `Sua proposta de troca para o agendamento foi recusada pelo proprietário.`,
          type: 'negotiation',
          read: false,
          createdAt: new Date().toISOString(),
          relatedId: neg.id
        });
        return;
      }

      await runTransaction(db, async (transaction) => {
        const negRef = doc(db, 'negotiations', neg.id);
        const appRef = doc(db, 'appointments', neg.appointmentId);
        
        const negSnap = await transaction.get(negRef);
        const appSnap = await transaction.get(appRef);

        if (!negSnap.exists() || negSnap.data().status !== 'pending') {
          throw new Error('Esta negociação não está mais ativa.');
        }

        if (!appSnap.exists() || appSnap.data().status !== 'booked') {
          throw new Error('O agendamento original não é mais válido.');
        }

        const appointmentData = appSnap.data() as Appointment;

        // Verificar se o proponente já tem um agendamento nesse mesmo horário
        const conflictQuery = query(
          collection(db, 'appointments'),
          where('clientId', '==', neg.proposerId),
          where('startTime', '==', appointmentData.startTime),
          where('status', '==', 'booked')
        );
        const conflictSnap = await getDocs(conflictQuery);
        
        if (!conflictSnap.empty) {
          throw new Error('O comprador já possui um agendamento neste mesmo horário.');
        }

        // Executar a troca
        transaction.update(negRef, { status: 'accepted' });
        transaction.update(appRef, { clientId: neg.proposerId });

        // Notificar o proponente (Comprador)
        const proposerNotifRef = doc(collection(db, 'notifications'));
        transaction.set(proposerNotifRef, {
          userId: neg.proposerId,
          title: 'Proposta Aceita!',
          message: `Sua proposta de troca foi aceita! O agendamento agora é seu.`,
          type: 'negotiation',
          read: false,
          createdAt: new Date().toISOString(),
          relatedId: neg.id
        });

        // Lógica Financeira da Negociação
        if (neg.offerAmount && neg.offerAmount > 0) {
          const platformFee = neg.offerAmount * 0.1;
          const ownerPayout = neg.offerAmount - platformFee;

          // 1. Verificar saldo do Proponente (Comprador)
          const proposerRef = doc(db, 'users', neg.proposerId);
          const proposerSnap = await transaction.get(proposerRef);
          if (!proposerSnap.exists()) throw new Error("Comprador não encontrado");
          
          const proposerBalance = proposerSnap.data().balance || 0;
          if (proposerBalance < neg.offerAmount) {
            throw new Error("O comprador não possui saldo suficiente para esta oferta.");
          }

          // 2. Deduzir do Proponente
          transaction.update(proposerRef, { balance: proposerBalance - neg.offerAmount });
          
          const proposerTransRef = doc(collection(db, 'user_transactions'));
          transaction.set(proposerTransRef, {
            userId: neg.proposerId,
            type: 'payment',
            amount: neg.offerAmount,
            description: `Pagamento por troca de horário`,
            relatedId: neg.id,
            createdAt: new Date().toISOString()
          });

          // 3. Repasse para o Dono Original (Vendedor)
          const ownerRef = doc(db, 'users', neg.ownerId);
          const ownerSnap = await transaction.get(ownerRef);
          if (ownerSnap.exists()) {
            const ownerBalance = ownerSnap.data().balance || 0;
            transaction.update(ownerRef, { balance: ownerBalance + ownerPayout });

            const ownerTransRef = doc(collection(db, 'user_transactions'));
            transaction.set(ownerTransRef, {
              userId: neg.ownerId,
              type: 'received',
              amount: ownerPayout,
              description: `Recebido por troca de horário`,
              relatedId: neg.id,
              createdAt: new Date().toISOString()
            });
          }

          // 4. Taxa da Plataforma (10%)
          const feeRef = doc(collection(db, 'platform_transactions'));
          transaction.set(feeRef, {
            type: 'negotiation_fee',
            amount: platformFee,
            userId: neg.proposerId,
            description: `Taxa de negociação de horário`,
            relatedId: neg.id,
            createdAt: new Date().toISOString()
          });
        }
      });

      alert('Negociação aceita! O horário foi transferido.');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao processar negociação.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Negociações</h2>
        <div className="bg-amber-500/10 px-3 py-1 rounded-full text-amber-500 text-[10px] font-bold uppercase tracking-widest">
          {negotiations.length} Pendentes
        </div>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {negotiations.map((neg) => (
            <NegotiationCard 
              key={neg.id} 
              neg={neg} 
              isProposer={neg.proposerId === auth.currentUser?.uid}
              onAccept={() => handleAction(neg, 'accepted')}
              onReject={() => handleAction(neg, 'rejected')}
              onOpenChat={() => setActiveChat(neg.id)}
            />
          ))}
        </AnimatePresence>

        {activeChat && (
          <Chat 
            negotiationId={activeChat} 
            onClose={() => setActiveChat(null)} 
          />
        )}

        {negotiations.length === 0 && !loading && (
          <div className="text-center py-20 space-y-4">
            <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center mx-auto border border-white/5">
              <ArrowRightLeft className="text-neutral-600 w-10 h-10" />
            </div>
            <div className="space-y-1">
              <p className="text-neutral-400 font-bold">Nenhuma negociação ativa</p>
              <p className="text-neutral-600 text-xs">Suas propostas de troca aparecerão aqui.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NegotiationCard({ neg, isProposer, onAccept, onReject, onOpenChat }: { neg: Negotiation, isProposer: boolean, onAccept: () => void, onReject: () => void, onOpenChat: () => void }) {
  const [appointment, setAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    const fetchApp = async () => {
      const docSnap = await getDoc(doc(db, 'appointments', neg.appointmentId));
      if (docSnap.exists()) {
        setAppointment({ id: docSnap.id, ...docSnap.data() } as Appointment);
      }
    };
    fetchApp();
  }, [neg.appointmentId]);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-neutral-900 rounded-3xl border border-white/5 p-5 space-y-4"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${isProposer ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'}`}>
            <ArrowRightLeft size={20} />
          </div>
          <div>
            <h4 className="font-bold text-sm">{isProposer ? 'Sua Proposta' : 'Nova Proposta'}</h4>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
              {appointment ? format(new Date(appointment.startTime), "dd MMM 'às' HH:mm", { locale: ptBR }) : 'Carregando...'}
            </p>
          </div>
        </div>
        {neg.offerAmount && neg.offerAmount > 0 && (
          <div className="bg-emerald-500/10 px-3 py-1 rounded-xl text-emerald-500 flex items-center gap-1">
            <DollarSign size={12} />
            <span className="text-xs font-bold">R$ {neg.offerAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-2">
        <p className="text-xs text-neutral-400 leading-relaxed">
          {isProposer 
            ? `Você ofereceu R$ ${neg.offerAmount?.toFixed(2)} para ficar com este horário.`
            : `Um cliente ofereceu R$ ${neg.offerAmount?.toFixed(2)} pelo seu horário.`
          }
        </p>
      </div>

      <div className="flex gap-2">
        {!isProposer ? (
          <>
            <button 
              onClick={onReject}
              className="flex-1 bg-neutral-800 text-neutral-400 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <X size={14} /> Recusar
            </button>
            <button 
              onClick={onAccept}
              className="flex-1 bg-amber-500 text-black py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Check size={14} /> Aceitar
            </button>
          </>
        ) : (
          <button 
            onClick={onReject}
            className="w-full bg-neutral-800 text-neutral-400 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest"
          >
            Cancelar Proposta
          </button>
        )}
        <button 
          onClick={onOpenChat}
          className="p-3 bg-neutral-800 text-neutral-400 rounded-xl hover:bg-neutral-700 transition-colors"
        >
          <MessageSquare size={18} />
        </button>
      </div>
    </motion.div>
  );
}
