import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  X, 
  Check, 
  Calendar, 
  MessageSquare, 
  Trophy, 
  Ticket, 
  Info,
  Trash2
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  updateDoc, 
  doc, 
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Notification } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    const batch = writeBatch(db);
    unread.forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'appointment': return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'negotiation': return <MessageSquare className="w-4 h-4 text-purple-500" />;
      case 'sweepstake': return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 'voucher': return <Ticket className="w-4 h-4 text-green-500" />;
      default: return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
            >
              <div className="p-4 border-bottom border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-semibold text-gray-900">Notificações</h3>
                <div className="flex gap-2">
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Ler todas
                    </button>
                  )}
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="max-height-[400px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Bell className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-sm">Nenhuma notificação por aqui.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        className={`p-4 transition-colors relative group ${notification.read ? 'bg-white' : 'bg-blue-50/30'}`}
                      >
                        <div className="flex gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            notification.read ? 'bg-gray-100' : 'bg-white shadow-sm'
                          }`}>
                            {getIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm font-medium truncate ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                                {notification.title}
                              </p>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap mt-1">
                                {format(new Date(notification.createdAt), "HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-gray-400">
                                {format(new Date(notification.createdAt), "dd 'de' MMM", { locale: ptBR })}
                              </span>
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!notification.read && (
                                  <button 
                                    onClick={() => markAsRead(notification.id)}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    title="Marcar como lida"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                )}
                                <button 
                                  onClick={() => deleteNotification(notification.id)}
                                  className="p-1 text-red-400 hover:bg-red-50 rounded"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {notifications.length > 0 && (
                <div className="p-3 bg-gray-50 border-top border-gray-100 text-center">
                  <button className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                    Ver histórico completo
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
