import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { motion } from 'motion/react';
import { Scissors, Mail, Lock, User } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'client' | 'barber'>('client');
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Atualiza o perfil nativo do Firebase. O App.tsx cuidará de criar o doc no Firestore.
        await updateProfile(userCredential.user, {
          displayName: name
        });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-white">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md space-y-8"
      >
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Scissors className="text-black w-10 h-10" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tighter text-amber-500 uppercase">BarberTrade</h1>
          <p className="text-neutral-400 text-sm">O mercado inteligente de horários para barbearias</p>
        </div>

        <div className="bg-neutral-900 p-8 rounded-3xl border border-white/5 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">Nome Completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-4 h-4" />
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:border-amber-500 outline-none transition-colors"
                      placeholder="Seu nome"
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 p-1 bg-black rounded-xl border border-white/10">
                  <button 
                    type="button"
                    onClick={() => setRole('client')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${role === 'client' ? 'bg-amber-500 text-black' : 'text-neutral-500'}`}
                  >
                    Cliente
                  </button>
                  <button 
                    type="button"
                    onClick={() => setRole('barber')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${role === 'barber' ? 'bg-amber-500 text-black' : 'text-neutral-500'}`}
                  >
                    Barbeiro
                  </button>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-4 h-4" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:border-amber-500 outline-none transition-colors"
                  placeholder="seu@email.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-widest text-neutral-500 px-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-4 h-4" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:border-amber-500 outline-none transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs text-center">{error}</p>}

            <button 
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-4 rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 uppercase tracking-widest"
            >
              {isLogin ? 'Entrar' : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-neutral-500 text-xs uppercase tracking-widest">ou</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          <button 
            onClick={handleGoogleSignIn}
            className="w-full mt-6 bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Continuar com Google
          </button>
        </div>

        <p className="text-center text-neutral-500 text-sm">
          {isLogin ? 'Não tem uma conta?' : 'Já tem uma conta?'}
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="ml-2 text-amber-500 font-bold hover:underline"
          >
            {isLogin ? 'Cadastre-se' : 'Faça Login'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
