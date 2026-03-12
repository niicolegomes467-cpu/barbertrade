import React from 'react';
import { motion } from 'motion/react';
import { Scissors, User, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { UserRole } from '../types';

interface RoleSelectionProps {
  onSelect: (role: 'client' | 'barber') => void;
}

export default function RoleSelection({ onSelect }: RoleSelectionProps) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto border border-amber-500/20 mb-4"
          >
            <Sparkles className="text-amber-500 w-10 h-10" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bem-vindo ao BarberTrade</h1>
          <p className="text-neutral-400">Para começar, como você pretende usar o app?</p>
        </div>

        <div className="grid gap-4">
          <RoleCard 
            title="Sou Cliente"
            description="Quero encontrar as melhores barbearias e agendar meu corte."
            icon={<User className="w-8 h-8" />}
            onClick={() => onSelect('client')}
            color="amber"
          />
          
          <RoleCard 
            title="Sou Barbeiro"
            description="Quero gerenciar minha agenda, clientes e faturamento."
            icon={<Scissors className="w-8 h-8" />}
            onClick={() => onSelect('barber')}
            color="blue"
          />
        </div>

        <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
          <ShieldCheck size={14} />
          <span>Sua escolha pode ser alterada depois nas configurações</span>
        </div>
      </div>
    </div>
  );
}

function RoleCard({ title, description, icon, onClick, color }: { 
  title: string, 
  description: string, 
  icon: React.ReactNode, 
  onClick: () => void,
  color: 'amber' | 'blue'
}) {
  const colorClasses = color === 'amber' 
    ? 'border-amber-500/20 hover:border-amber-500 bg-amber-500/5 text-amber-500' 
    : 'border-blue-500/20 hover:border-blue-500 bg-blue-500/5 text-blue-500';

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full p-6 rounded-3xl border text-left flex items-center gap-6 transition-all group ${colorClasses}`}
    >
      <div className={`p-4 rounded-2xl bg-black/40 border border-white/5 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          {title}
          <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
        </h3>
        <p className="text-xs text-neutral-400 leading-relaxed">{description}</p>
      </div>
    </motion.button>
  );
}
