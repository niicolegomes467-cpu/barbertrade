import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { Barbershop, Appointment } from '../types';
import { motion } from 'motion/react';
import { Search, MapPin, Star, Calendar, Clock, ArrowRightLeft, Scissors } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientHomeProps {
  onSelectShop: (id: string) => void;
}

export default function ClientHome({ onSelectShop }: ClientHomeProps) {
  const [shops, setShops] = useState<Barbershop[]>([]);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch nearby shops (mocking nearby for now)
        const shopsSnap = await getDocs(query(collection(db, 'barbershops'), limit(5)));
        setShops(shopsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barbershop)));

        // Fetch user appointments
        if (auth.currentUser) {
          const appointmentsSnap = await getDocs(
            query(
              collection(db, 'appointments'), 
              where('clientId', '==', auth.currentUser.uid),
              where('status', 'in', ['accepted', 'trading']),
              orderBy('startTime', 'asc'),
              limit(3)
            )
          );
          setMyAppointments(appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="p-6 space-y-8">
      {/* Welcome Section */}
      <section className="space-y-1">
        <h2 className="text-2xl font-bold">Olá, {auth.currentUser?.displayName?.split(' ')[0]}!</h2>
        <p className="text-neutral-400 text-sm">Pronto para um novo visual hoje?</p>
      </section>

      {/* Quick Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
        <input 
          type="text" 
          placeholder="Buscar barbearia ou barbeiro..."
          className="w-full bg-neutral-900 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-amber-500 outline-none transition-all"
        />
      </div>

      {/* Next Appointment */}
      {myAppointments.length > 0 && (
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Seu Próximo Corte</h3>
            <button className="text-amber-500 text-xs font-bold uppercase tracking-widest">Ver Todos</button>
          </div>
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-gradient-to-br from-amber-500 to-amber-600 p-5 rounded-3xl text-black shadow-xl shadow-amber-500/20 relative overflow-hidden"
          >
            <div className="relative z-10 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-tighter opacity-70">Barbearia</p>
                  <h4 className="text-xl font-bold leading-tight">Vintage Club</h4>
                </div>
                <div className="bg-black/10 p-2 rounded-xl backdrop-blur-sm">
                  <Calendar size={20} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Clock size={16} />
                  <span className="text-sm font-bold">{format(new Date(myAppointments[0].startTime), 'HH:mm')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} />
                  <span className="text-sm font-bold">{format(new Date(myAppointments[0].startTime), "dd 'de' MMM", { locale: ptBR })}</span>
                </div>
              </div>
              <div className="pt-2 flex gap-2">
                <button className="flex-1 bg-black text-white py-2 rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all">
                  Check-in
                </button>
                <button className="flex-1 bg-white/20 text-black py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
                  <ArrowRightLeft size={14} /> Negociar
                </button>
              </div>
            </div>
            <Scissors className="absolute -right-4 -bottom-4 w-32 h-32 text-black/5 rotate-12" />
          </motion.div>
        </section>
      )}

      {/* Nearby Shops */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Próximas de Você</h3>
          <button className="text-amber-500 text-xs font-bold uppercase tracking-widest">Ver Mapa</button>
        </div>
        <div className="space-y-4">
          {shops.length > 0 ? shops.map(shop => (
            <motion.div 
              key={shop.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectShop(shop.id)}
              className="bg-neutral-900 p-4 rounded-3xl border border-white/5 flex gap-4 cursor-pointer hover:border-amber-500/30 transition-all"
            >
              <div className="w-20 h-20 rounded-2xl bg-neutral-800 overflow-hidden flex-shrink-0">
                <img 
                  src={shop.imageUrl || `https://picsum.photos/seed/${shop.id}/200`} 
                  alt={shop.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-lg">{shop.name}</h4>
                    <div className="flex items-center gap-1 text-amber-500">
                      <Star size={12} fill="currentColor" />
                      <span className="text-xs font-bold">{shop.rating || '4.9'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-neutral-500 text-xs mt-1">
                    <MapPin size={12} />
                    <span>{shop.address.split(',')[0]}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-amber-500 font-bold">R$ {shop.price.toFixed(2)}</span>
                  <button className="bg-amber-500/10 text-amber-500 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                    Agendar
                  </button>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="text-center py-10 text-neutral-500">
              <p>Nenhuma barbearia encontrada.</p>
            </div>
          )}
        </div>
      </section>

      {/* Quick Action */}
      <button className="w-full bg-neutral-900 border border-amber-500/30 text-amber-500 py-4 rounded-2xl font-bold uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all">
        <Clock size={20} />
        Horários Disponíveis Hoje
      </button>
    </div>
  );
}
