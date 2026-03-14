import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Barbershop } from '../types';
import { motion } from 'motion/react';
import { Search, Filter, Star, MapPin } from 'lucide-react';

interface BarbershopListProps {
  onSelectShop: (id: string) => void;
}

export default function BarbershopList({ onSelectShop }: BarbershopListProps) {
  const [shops, setShops] = useState<Barbershop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const q = query(collection(db, 'barbershops'), orderBy('name'));
        const snap = await getDocs(q);
        setShops(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barbershop)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchShops();
  }, []);

  const filteredShops = shops.filter(shop => 
    shop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    shop.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Explorar</h2>
        <button className="p-2 bg-neutral-900 rounded-xl border border-white/5 text-neutral-400">
          <Filter size={20} />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
        <input 
          type="text" 
          placeholder="Buscar por nome ou localização..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-neutral-900 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-amber-500 outline-none transition-all"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredShops.map((shop, index) => (
          <motion.div
            key={shop.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onSelectShop(shop.id)}
            className="group relative overflow-hidden rounded-3xl bg-neutral-900 border border-white/5 cursor-pointer"
          >
            <div className="aspect-video w-full overflow-hidden">
              <img 
                src={shop.imageUrl || `https://picsum.photos/seed/${shop.id}/600/400`} 
                alt={shop.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2">
              <div className="flex justify-between items-end">
                <div>
                  <h3 className="text-xl font-bold">{shop.name}</h3>
                  <div className="flex items-center gap-1 text-neutral-400 text-xs">
                    <MapPin size={12} />
                    <span>{shop.address}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-amber-500 justify-end mb-1">
                    <Star size={14} fill="currentColor" />
                    <span className="text-sm font-bold">{shop.rating || '4.8'}</span>
                  </div>
                  <span className="text-lg font-bold text-white">R$ {shop.price.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        
        {filteredShops.length === 0 && !loading && (
          <div className="text-center py-20 text-neutral-500">
            <p>Nenhuma barbearia encontrada para "{searchTerm}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
