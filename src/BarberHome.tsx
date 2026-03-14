import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, addDoc } from 'firebase/firestore';
import { Barbershop, Appointment } from '../types';
import { motion } from 'motion/react';
import { Calendar, Users, DollarSign, Plus, Scissors, Clock, Check, X, TrendingUp, UserPlus, CreditCard, ArrowUpRight } from 'lucide-react';
import { format, startOfDay, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function BarberHome() {
  const [shop, setShop] = useState<Barbershop | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [monthlyApps, setMonthlyApps] = useState<Appointment[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateShop, setShowCreateShop] = useState(false);

  // Shop Creation State
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPrice, setShopPrice] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubProfile = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      setProfile(snap.data());
    });

    const q = query(collection(db, 'barbershops'), where('ownerId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const shopData = { id: snap.docs[0].id, ...snap.docs[0].data() } as Barbershop;
        setShop(shopData);
        
        // Fetch appointments for today
        const todayStart = startOfDay(new Date()).toISOString();
        const todayEnd = addDays(startOfDay(new Date()), 1).toISOString();
        
        const appQ = query(
          collection(db, 'appointments'),
          where('barbershopId', '==', shopData.id),
          where('startTime', '>=', todayStart),
          where('startTime', '<', todayEnd)
        );
        
        onSnapshot(appQ, (appSnap) => {
          setAppointments(appSnap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
        });

        // Fetch monthly stats
        const monthStart = startOfMonth(new Date()).toISOString();
        const monthEnd = endOfMonth(new Date()).toISOString();
        const monthQ = query(
          collection(db, 'appointments'),
          where('barbershopId', '==', shopData.id),
          where('startTime', '>=', monthStart),
          where('startTime', '<', monthEnd),
          where('status', '==', 'accepted')
        );
        getDocs(monthQ).then(snap => {
          setMonthlyApps(snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
        });

      } else {
        setShowCreateShop(true);
      }
      setLoading(false);
    });

    return () => {
      unsubProfile();
      unsubscribe();
    };
  }, []);

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'barbershops'), {
        name: shopName,
        address: shopAddress,
        price: parseFloat(shopPrice),
        ownerId: auth.currentUser.uid,
        rating: 5.0,
        createdAt: new Date().toISOString()
      });
      setShowCreateShop(false);
    } catch (err) {
      console.error(err);
    }
  };

  const todayRevenue = appointments
    .filter(a => a.status === 'accepted' || a.status === 'completed')
    .reduce((acc, curr) => acc + curr.price, 0);

  const monthlyRevenue = monthlyApps.reduce((acc, curr) => acc + curr.price, 0);
  
  // Mocking new clients for demo
  const newClientsCount = Math.floor(monthlyApps.length * 0.4);
  const totalSlots = 12; // Assuming 12 slots per day
  const freeSlots = totalSlots - appointments.length;

  if (loading) return <div className="p-10 text-center">Carregando Painel...</div>;

  if (showCreateShop) {
    return (
      <div className="p-6 space-y-8">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto border border-amber-500/20">
            <Scissors className="text-amber-500 w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold">Crie sua Barbearia</h2>
          <p className="text-neutral-400 text-sm">Comece a gerenciar seus horários e clientes hoje mesmo.</p>
        </div>

        <form onSubmit={handleCreateShop} className="bg-neutral-900 p-8 rounded-3xl border border-white/5 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">Nome da Barbearia</label>
            <input 
              type="text" 
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl py-4 px-4 outline-none focus:border-amber-500 transition-all"
              placeholder="Ex: Vintage Club"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">Endereço</label>
            <input 
              type="text" 
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl py-4 px-4 outline-none focus:border-amber-500 transition-all"
              placeholder="Rua, Número, Bairro"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 px-1">Preço Base do Corte (R$)</label>
            <input 
              type="number" 
              value={shopPrice}
              onChange={(e) => setShopPrice(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl py-4 px-4 outline-none focus:border-amber-500 transition-all"
              placeholder="Ex: 50.00"
              required
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-amber-500 text-black font-bold py-4 rounded-xl uppercase tracking-widest shadow-lg shadow-amber-500/20 mt-4"
          >
            Criar Perfil Profissional
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Today's Overview */}
      <section className="space-y-4">
        <div className="bg-amber-500 p-6 rounded-[40px] shadow-2xl shadow-amber-500/20 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-black/60">Saldo Disponível</p>
            <p className="text-3xl font-bold text-black font-mono">R$ {(profile?.balance || 0).toFixed(2)}</p>
          </div>
          <div className="w-12 h-12 bg-black/10 rounded-2xl flex items-center justify-center">
            <DollarSign className="text-black" size={24} />
          </div>
        </div>

        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">Resumo de Hoje</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-neutral-900 p-5 rounded-3xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                <DollarSign size={18} />
              </div>
              <TrendingUp size={14} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">R$ {todayRevenue.toFixed(2)}</p>
              <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Receita Estimada</p>
            </div>
          </div>
          <div className="bg-neutral-900 p-5 rounded-3xl border border-white/5 space-y-2">
            <div className="flex justify-between items-center">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                <Users size={18} />
              </div>
              <span className="text-[10px] font-bold text-amber-500">{freeSlots} livres</span>
            </div>
            <div>
              <p className="text-2xl font-bold">{appointments.length}</p>
              <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Agendamentos</p>
            </div>
          </div>
        </div>
      </section>

      {/* Monthly Performance */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">Desempenho Mensal</h3>
        <div className="bg-neutral-900 p-6 rounded-3xl border border-white/5 space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-3xl font-bold text-white font-mono">R$ {monthlyRevenue.toFixed(2)}</p>
              <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Faturamento em {format(new Date(), 'MMMM', { locale: ptBR })}</p>
            </div>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
              <TrendingUp size={24} />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                <UserPlus size={20} />
              </div>
              <div>
                <p className="text-lg font-bold">{newClientsCount}</p>
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Novos Clientes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-lg font-bold">{monthlyApps.length}</p>
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Total Cortes</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Today's Agenda */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Agenda de Hoje</h3>
          <button className="text-amber-500 text-xs font-bold uppercase tracking-widest flex items-center gap-1">
            <Plus size={14} /> Novo Horário
          </button>
        </div>

        <div className="space-y-3">
          {appointments.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((app) => (
            <div key={app.id} className="bg-neutral-900 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-black rounded-xl flex flex-col items-center justify-center border border-white/5">
                  <span className="text-sm font-bold text-amber-500">{format(new Date(app.startTime), 'HH:mm')}</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm">Cliente #{app.clientId.slice(0, 4)}</h4>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Corte & Barba</p>
                    {app.paymentStatus === 'paid' && (
                      <span className="bg-emerald-500/10 text-emerald-500 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest">Pago</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 bg-neutral-800 text-neutral-400 rounded-lg">
                  <Clock size={16} />
                </button>
                <button className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                  <Check size={16} />
                </button>
              </div>
            </div>
          ))}

          {appointments.length === 0 && (
            <div className="text-center py-10 bg-neutral-900/50 rounded-3xl border border-dashed border-white/10">
              <p className="text-neutral-500 text-sm">Nenhum agendamento para hoje.</p>
            </div>
          )}
        </div>
      </section>

      {/* Payment Settings */}
      <section className="bg-neutral-900 p-6 rounded-3xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
              <CreditCard size={24} />
            </div>
            <div>
              <h3 className="font-bold">Pagamentos no App</h3>
              <p className="text-xs text-neutral-500">PIX e Cartão Ativados</p>
            </div>
          </div>
          <ArrowUpRight className="text-neutral-500" size={20} />
        </div>
        <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-neutral-500">Taxa por transação</span>
            <span className="text-emerald-500 font-bold">1.99%</span>
          </div>
        </div>
      </section>
    </div>
  );
}
