import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, updateDoc, runTransaction } from 'firebase/firestore';
import { Barbershop, Appointment, UserProfile, Voucher } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Star, MapPin, Clock, Calendar, Check, ArrowRightLeft, MessageSquare, CreditCard, Smartphone, ShieldCheck, Gift } from 'lucide-react';
import { format, addDays, startOfDay, addHours, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BarbershopDetailProps {
  shopId: string;
  onBack: () => void;
}

export default function BarbershopDetail({ shopId, onBack }: BarbershopDetailProps) {
  const [shop, setShop] = useState<Barbershop | null>(null);
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [showNegotiateModal, setShowNegotiateModal] = useState<Appointment | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<Date | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [offerAmount, setOfferAmount] = useState('');
  const [myVouchers, setMyVouchers] = useState<Voucher[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);

  useEffect(() => {
    if (auth.currentUser) {
      const q = query(
        collection(db, 'vouchers'),
        where('clientId', '==', auth.currentUser.uid),
        where('status', '==', 'active')
      );
      const unsub = onSnapshot(q, (snap) => {
        setMyVouchers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Voucher)));
      });
      return unsub;
    }
  }, []);

  useEffect(() => {
    const fetchShop = async () => {
      const docSnap = await getDoc(doc(db, 'barbershops', shopId));
      if (docSnap.exists()) {
        setShop({ id: docSnap.id, ...docSnap.data() } as Barbershop);
      }
      setLoading(false);
    };
    fetchShop();
  }, [shopId]);

  useEffect(() => {
    const fetchAppointments = async () => {
      const q = query(
        collection(db, 'appointments'),
        where('barbershopId', '==', shopId),
        where('startTime', '>=', selectedDate.toISOString()),
        where('startTime', '<', addDays(selectedDate, 1).toISOString()),
        where('status', 'in', ['accepted', 'trading'])
      );
      const snap = await getDocs(q);
      setAppointments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    };
    fetchAppointments();
  }, [shopId, selectedDate]);

  const timeSlots = Array.from({ length: 12 }, (_, i) => addHours(addHours(selectedDate, 8), i));

  const handleConfirmBooking = async () => {
    if (!auth.currentUser || !shop || !showPaymentModal) return;
    setBooking(true);
    try {
      const startTimeStr = showPaymentModal.toISOString();
      
      await runTransaction(db, async (transaction) => {
        // 1. Verificar se o horário ainda está disponível
        const appointmentsRef = collection(db, 'appointments');
        const q = query(
          appointmentsRef,
          where('barbershopId', '==', shopId),
          where('startTime', '==', startTimeStr),
          where('status', 'in', ['accepted', 'trading'])
        );
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          throw new Error('Este horário acabou de ser reservado por outra pessoa.');
        }

        // 2. Criar o agendamento
        const newAppointmentRef = doc(collection(db, 'appointments'));
        const appointmentData = {
          barbershopId: shopId,
          clientId: auth.currentUser!.uid,
          startTime: startTimeStr,
          endTime: addHours(showPaymentModal, 1).toISOString(),
          status: 'accepted',
          paymentStatus: 'paid',
          paymentMethod: selectedVoucher ? 'voucher' : paymentMethod,
          price: shop.price,
          createdAt: serverTimestamp()
        };
        transaction.set(newAppointmentRef, appointmentData);

        // 3. Lógica Financeira (Voucher ou Pagamento Direto)
        if (selectedVoucher) {
          const voucherRef = doc(db, 'vouchers', selectedVoucher.id);
          const vSnap = await transaction.get(voucherRef);
          
          if (!vSnap.exists() || vSnap.data().status !== 'active') {
            throw new Error("Este voucher já foi utilizado ou é inválido.");
          }

          const voucherData = vSnap.data();
          const now = new Date().toISOString();
          if (voucherData.expiryDate < now) {
            throw new Error("Este voucher está expirado.");
          }

          transaction.update(voucherRef, {
            status: 'used',
            usedAt: now,
            barberId: shop.ownerId,
            appointmentId: newAppointmentRef.id
          });

          // Payout do Cofre para o Barbeiro (Limitado ao valor do voucher)
          const vaultRef = doc(db, 'vaults', 'main_vault');
          const vaultSnap = await transaction.get(vaultRef);
          
          if (vaultSnap.exists()) {
            const payoutAmount = voucherData.value || 30; // Valor nominal do prêmio
            transaction.update(vaultRef, {
              reservedBalance: (vaultSnap.data().reservedBalance || 0) - payoutAmount
            });

            // Registrar Transação do Cofre
            const vaultTransRef = doc(collection(db, 'vault_transactions'));
            transaction.set(vaultTransRef, {
              type: 'payout',
              amount: payoutAmount,
              userId: shop.ownerId,
              description: `Pagamento de Voucher #${voucherData.code} (Corte Grátis)`,
              createdAt: now,
              voucherId: selectedVoucher.id,
              appointmentId: newAppointmentRef.id
            });

            // Atualizar saldo do Barbeiro
            const barberRef = doc(db, 'users', shop.ownerId);
            const barberSnap = await transaction.get(barberRef);
            if (barberSnap.exists()) {
              transaction.update(barberRef, { 
                balance: (barberSnap.data().balance || 0) + payoutAmount 
              });
            }
          }
        } else {
          // Pagamento Regular (Simulando PIX/Card confirmado)
          const platformFee = 2.00;
          const barberPayout = shop.price - platformFee;

          // 1. Taxa da Plataforma
          const feeRef = doc(collection(db, 'platform_transactions'));
          transaction.set(feeRef, {
            type: 'appointment_fee',
            amount: platformFee,
            userId: auth.currentUser!.uid,
            description: `Taxa de agendamento: ${shop.name}`,
            createdAt: new Date().toISOString()
          });

          // 2. Repasse para o Barbeiro
          const barberRef = doc(db, 'users', shop.ownerId);
          const barberSnap = await transaction.get(barberRef);
          if (barberSnap.exists()) {
            transaction.update(barberRef, { balance: (barberSnap.data().balance || 0) + barberPayout });
          }

          // 3. Registro de Transação para o Barbeiro (Recebido)
          const barberTransRef = doc(collection(db, 'user_transactions'));
          transaction.set(barberTransRef, {
            userId: shop.ownerId,
            type: 'received',
            amount: barberPayout,
            description: `Recebimento de agendamento: ${auth.currentUser?.displayName}`,
            relatedId: newAppointmentRef.id,
            createdAt: new Date().toISOString()
          });
        }

        // 4. Notificações
        const barberNotifRef = doc(collection(db, 'notifications'));
        transaction.set(barberNotifRef, {
          userId: shop.ownerId,
          title: 'Novo Agendamento!',
          message: `Você tem um novo agendamento para ${format(showPaymentModal, "dd/MM 'às' HH:mm", { locale: ptBR })}.`,
          type: 'appointment',
          read: false,
          createdAt: new Date().toISOString(),
          relatedId: newAppointmentRef.id
        });

        const clientNotifRef = doc(collection(db, 'notifications'));
        transaction.set(clientNotifRef, {
          userId: auth.currentUser!.uid,
          title: 'Agendamento Confirmado',
          message: `Seu horário na ${shop.name} para ${format(showPaymentModal, "dd/MM 'às' HH:mm", { locale: ptBR })} foi reservado.`,
          type: 'appointment',
          read: false,
          createdAt: new Date().toISOString(),
          relatedId: newAppointmentRef.id
        });
      });

      setShowPaymentModal(null);
      setSelectedVoucher(null);
      alert('Agendamento realizado com sucesso!');
      
      // Refresh local list
      const q = query(
        collection(db, 'appointments'),
        where('barbershopId', '==', shopId),
        where('startTime', '>=', selectedDate.toISOString()),
        where('startTime', '<', addDays(selectedDate, 1).toISOString()),
        where('status', 'in', ['accepted', 'trading'])
      );
      const snap = await getDocs(q);
      setAppointments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao realizar agendamento.');
    } finally {
      setBooking(false);
    }
  };

  const handleNegotiate = async () => {
    if (!auth.currentUser || !showNegotiateModal) return;
    try {
      await addDoc(collection(db, 'negotiations'), {
        appointmentId: showNegotiateModal.id,
        proposerId: auth.currentUser.uid,
        ownerId: showNegotiateModal.clientId,
        offerAmount: parseFloat(offerAmount) || 0,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      // Notificar o dono do agendamento
      await addDoc(collection(db, 'notifications'), {
        userId: showNegotiateModal.clientId,
        title: 'Nova Proposta de Troca',
        message: `${auth.currentUser.displayName} enviou uma proposta de R$ ${offerAmount || '0'} pelo seu horário.`,
        type: 'negotiation',
        read: false,
        createdAt: new Date().toISOString(),
        relatedId: showNegotiateModal.id
      });

      setShowNegotiateModal(null);
      setOfferAmount('');
      alert('Proposta enviada com sucesso!');
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !shop) return <div className="p-10 text-center">Carregando...</div>;

  return (
    <div className="pb-10">
      {/* Header Image */}
      <div className="relative h-64 w-full">
        <img 
          src={shop.imageUrl || `https://picsum.photos/seed/${shop.id}/800/600`} 
          className="w-full h-full object-cover"
          alt={shop.name}
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 to-transparent" />
        <button 
          onClick={onBack}
          className="absolute top-6 left-6 p-3 bg-black/50 backdrop-blur-md rounded-2xl text-white border border-white/10"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="px-6 -mt-10 relative z-10 space-y-6">
        <div className="bg-neutral-900 p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{shop.name}</h2>
              <div className="flex items-center gap-1 text-neutral-400 text-sm mt-1">
                <MapPin size={14} />
                <span>{shop.address}</span>
              </div>
            </div>
            <div className="bg-amber-500/10 px-3 py-1 rounded-xl flex items-center gap-1 text-amber-500">
              <Star size={14} fill="currentColor" />
              <span className="font-bold">{shop.rating || '4.9'}</span>
            </div>
          </div>
          <p className="text-neutral-400 text-sm leading-relaxed">
            {shop.description || 'A melhor experiência de barbearia da região. Profissionais qualificados e ambiente premium.'}
          </p>
          <div className="flex justify-between items-center pt-2">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 text-xs uppercase tracking-widest font-bold">Preço Médio</span>
              <span className="text-xl font-bold text-amber-500 font-mono">R$ {shop.price.toFixed(2)}</span>
            </div>
            <button className="p-2 bg-neutral-800 rounded-xl text-neutral-400">
              <MessageSquare size={20} />
            </button>
          </div>
        </div>

        {/* Date Selector */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">Selecione o Dia</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)).map(date => {
              const isSelected = startOfDay(date).getTime() === selectedDate.getTime();
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(startOfDay(date))}
                  className={`flex-shrink-0 w-16 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border ${isSelected ? 'bg-amber-500 border-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-neutral-900 border-white/5 text-neutral-500'}`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest">{format(date, 'EEE', { locale: ptBR })}</span>
                  <span className="text-xl font-bold">{format(date, 'dd')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Slots */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">Horários Disponíveis</h3>
          <div className="grid grid-cols-1 gap-3">
            {timeSlots.map(slot => {
              const appointment = appointments.find(a => new Date(a.startTime).getTime() === slot.getTime());
              const isPast = isBefore(slot, new Date());
              const isMine = appointment?.clientId === auth.currentUser?.uid;

              return (
                <div 
                  key={slot.toISOString()}
                  className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${appointment ? 'bg-neutral-900/50 border-white/5 opacity-80' : 'bg-neutral-900 border-white/10 hover:border-amber-500/50'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-mono font-bold ${appointment ? 'bg-neutral-800 text-neutral-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      {format(slot, 'HH:mm')}
                    </div>
                    <div>
                      <p className={`font-bold ${appointment ? 'text-neutral-500' : 'text-white'}`}>
                        {appointment ? (isMine ? 'Seu Horário' : 'Ocupado') : 'Disponível'}
                      </p>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Corte de Cabelo</p>
                    </div>
                  </div>

                  {appointment ? (
                    !isMine && !isPast && (
                      <button 
                        onClick={() => setShowNegotiateModal(appointment)}
                        className="flex items-center gap-2 bg-amber-500/10 text-amber-500 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all"
                      >
                        <ArrowRightLeft size={14} /> Negociar
                      </button>
                    )
                  ) : (
                    !isPast && (
                      <button 
                        disabled={booking}
                        onClick={() => setShowPaymentModal(slot)}
                        className="bg-amber-500 text-black px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                      >
                        Agendar
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-neutral-900 w-full max-w-sm rounded-3xl border border-white/10 p-8 space-y-6 shadow-2xl"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck className="text-emerald-500 w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold">Pagamento Seguro</h3>
              <p className="text-neutral-400 text-sm">Confirme seu agendamento para {format(showPaymentModal, 'HH:mm')}</p>
            </div>

            <div className="space-y-4">
              {myVouchers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 px-1">Você tem Vouchers de Corte Grátis!</p>
                  <div className="space-y-2">
                    {myVouchers.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVoucher(selectedVoucher?.id === v.id ? null : v)}
                        className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${selectedVoucher?.id === v.id ? 'bg-amber-500 border-amber-500 text-black' : 'bg-black border-white/5 text-neutral-500'}`}
                      >
                        <div className="flex items-center gap-3">
                          <Gift size={18} />
                          <div className="text-left">
                            <p className="text-xs font-bold">Corte Grátis</p>
                            <p className="text-[10px] opacity-60">Válido até {format(new Date(v.expiryDate), 'dd/MM')}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold">#{v.code}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center p-4 bg-black rounded-2xl border border-white/5">
                <span className="text-neutral-500 text-xs font-bold uppercase tracking-widest">Total a Pagar</span>
                <span className="text-xl font-bold text-amber-500 font-mono">
                  {selectedVoucher ? 'R$ 0.00' : `R$ ${shop.price.toFixed(2)}`}
                </span>
              </div>

              {!selectedVoucher && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">Método de Pagamento</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setPaymentMethod('pix')}
                      className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${paymentMethod === 'pix' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-black border-white/5 text-neutral-500'}`}
                    >
                      <Smartphone size={20} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">PIX</span>
                    </button>
                    <button 
                      onClick={() => setPaymentMethod('card')}
                      className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${paymentMethod === 'card' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-black border-white/5 text-neutral-500'}`}
                    >
                      <CreditCard size={20} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Cartão</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowPaymentModal(null)}
                className="flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-widest text-neutral-500 bg-neutral-800"
              >
                Voltar
              </button>
              <button 
                disabled={booking}
                onClick={handleConfirmBooking}
                className="flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-widest text-black bg-amber-500 shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {booking ? 'Processando...' : 'Pagar Agora'}
              </button>
            </div>
            
            <p className="text-[10px] text-center text-neutral-600 uppercase tracking-widest">Pagamento processado via BarberTrade Pay</p>
          </motion.div>
        </div>
      )}

      {/* Negotiation Modal */}
      {showNegotiateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-neutral-900 w-full max-w-sm rounded-3xl border border-white/10 p-8 space-y-6 shadow-2xl"
          >
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <ArrowRightLeft className="text-amber-500 w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold">Negociar Horário</h3>
              <p className="text-neutral-400 text-sm">Ofereça um valor para comprar este horário das {format(new Date(showNegotiateModal.startTime), 'HH:mm')}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">Valor da Oferta (R$)</label>
                <input 
                  type="number" 
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  placeholder="Ex: 10.00"
                  className="w-full bg-black border border-white/10 rounded-xl py-4 px-4 text-amber-500 font-mono font-bold text-xl outline-none focus:border-amber-500 transition-all"
                />
              </div>
              
              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mb-1">Dica</p>
                <p className="text-xs text-neutral-400 leading-relaxed">Oferecer um valor extra aumenta suas chances do outro cliente aceitar a troca ou venda do horário.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowNegotiateModal(null)}
                className="flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-widest text-neutral-500 bg-neutral-800"
              >
                Cancelar
              </button>
              <button 
                onClick={handleNegotiate}
                className="flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-widest text-black bg-amber-500 shadow-lg shadow-amber-500/20"
              >
                Enviar Proposta
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
