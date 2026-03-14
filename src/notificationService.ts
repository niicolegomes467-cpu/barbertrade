import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Notification } from '../types';

export const sendNotification = async (notification: Omit<Notification, 'id'>) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      ...notification,
      createdAt: new Date().toISOString(),
      read: false
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const registerPushNotifications = async (userId: string) => {
  if (!('Notification' in window)) {
    console.log('This browser does not support desktop notification');
    return false;
  }

  const permission = await window.Notification.requestPermission();
  if (permission === 'granted') {
    // In a real app, we would register the service worker and get the subscription
    // For now, we'll just simulate it or use a placeholder
    console.log('Notification permission granted');
    return true;
  }
  return false;
};
