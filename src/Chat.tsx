import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  orderBy, 
  serverTimestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { ChatMessage, Negotiation, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Send, X, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ChatProps {
  negotiationId: string;
  onClose: () => void;
}

export default function Chat({ negotiationId, onClose }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [negotiation, setNegotiation] = useState<Negotiation | null>(null);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch negotiation details
    const fetchNeg = async () => {
      const negSnap = await getDoc(doc(db, 'negotiations', negotiationId));
      if (negSnap.exists()) {
        const negData = { id: negSnap.id, ...negSnap.data() } as Negotiation;
        setNegotiation(negData);

        // Fetch other user profile
        const otherId = negData.proposerId === auth.currentUser?.uid ? negData.ownerId : negData.proposerId;
        const userSnap = await getDoc(doc(db, 'users', otherId));
        if (userSnap.exists()) {
          setOtherUser({ uid: userSnap.id, ...userSnap.data() } as UserProfile);
        }
      }
    };
    fetchNeg();

    // Listen to messages
    const q = query(
      collection(db, 'messages'),
      where('negotiationId', '==', negotiationId),
      orderBy('timestamp', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage)));
    });

    return unsub;
  }, [negotiationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser) return;

    const messageText = newMessage;
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        negotiationId,
        senderId: auth.currentUser.uid,
        text: messageText,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="relative w-full max-w-md bg-neutral-900 h-[80vh] sm:h-[600px] rounded-t-[40px] sm:rounded-[40px] flex flex-col overflow-hidden border border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-bottom border-white/5 bg-neutral-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500 border border-amber-500/20">
              {otherUser?.photoURL ? (
                <img src={otherUser.photoURL} className="w-full h-full rounded-xl object-cover" alt="" referrerPolicy="no-referrer" />
              ) : (
                <User size={20} />
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm">{otherUser?.displayName || 'Carregando...'}</h3>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Negociação #{negotiationId.slice(0, 6)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <X size={20} className="text-neutral-500" />
          </button>
        </div>

        {/* Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-30">
              <Clock size={32} />
              <p className="text-xs font-bold uppercase tracking-widest">Inicie a conversa</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.senderId === auth.currentUser?.uid;
            return (
              <div 
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] p-4 rounded-2xl ${isMe ? 'bg-amber-500 text-black rounded-tr-none' : 'bg-neutral-800 text-white rounded-tl-none'}`}>
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                  <p className={`text-[8px] mt-1 uppercase font-bold tracking-widest ${isMe ? 'text-black/50' : 'text-neutral-500'}`}>
                    {msg.timestamp ? format((msg.timestamp as any).toDate(), "HH:mm") : '...'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="p-6 bg-neutral-800/30 border-t border-white/5">
          <div className="relative">
            <input 
              type="text" 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-6 pr-14 text-sm outline-none focus:border-amber-500 transition-all"
            />
            <button 
              type="submit"
              disabled={!newMessage.trim()}
              className="absolute right-2 top-2 bottom-2 w-10 bg-amber-500 text-black rounded-xl flex items-center justify-center active:scale-90 transition-all disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
