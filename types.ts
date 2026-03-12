export type UserRole = 'client' | 'barber' | 'admin' | 'pending';

export interface PlatformTransaction {
  id: string;
  type: 'appointment_fee' | 'negotiation_fee' | 'subscription' | 'vault_fee' | 'deposit' | 'withdraw';
  amount: number;
  userId: string;
  description: string;
  createdAt: string;
  status?: 'pending' | 'completed' | 'rejected';
}

export interface FinancialReport {
  id: string;
  period: string; // e.g., "2026-03"
  totalRevenue: number;
  appointmentFees: number;
  negotiationFees: number;
  subscriptionRevenue: number;
  vaultFees: number;
  updatedAt: string;
}

export interface AdminLog {
  id: string;
  adminId: string;
  action: string;
  targetId?: string;
  details: string;
  createdAt: string;
}

export interface SweepstakeRegistration {
  id: string;
  sweepstakeId: string;
  clientId: string;
  createdAt: string;
}

export interface Vault {
  id: string;
  totalBalance: number;
  reservedBalance: number;
  sharePrice: number;
  totalShares: number;
  activeBarbersCount: number;
}

export interface VaultShare {
  id: string;
  barberId: string;
  count: number;
  amountInvested: number;
  createdAt: string;
}

export interface Sweepstake {
  id: string;
  title: string;
  description: string;
  drawDate: string;
  status: 'open' | 'drawn' | 'cancelled';
  winnersCount: number;
  prizeValue: number;
}

export interface Voucher {
  id: string;
  sweepstakeId: string;
  clientId: string;
  code: string;
  status: 'active' | 'used' | 'expired';
  expiryDate: string;
  value: number;
  usedAt?: string;
  barberId?: string; // Barber who performed the service
}

export interface VaultTransaction {
  id: string;
  type: 'contribution' | 'payout' | 'adjustment' | 'campaign_launch';
  amount: number;
  userId: string; // Barber who contributed, was paid, or launched campaign
  description: string;
  createdAt: string;
  voucherId?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  phoneNumber?: string;
  referralCode?: string;
  referralCount?: number;
  balance?: number;
  createdAt: string;
  vaultShares?: number; // Total shares owned by this barber
  isBlocked?: boolean;
  subscriptionStatus?: 'free' | 'premium';
  subscriptionExpiry?: string;
}

export interface Barbershop {
  id: string;
  name: string;
  ownerId: string;
  address: string;
  price: number;
  description: string;
  imageUrl?: string;
  rating: number;
}

export interface Appointment {
  id: string;
  barbershopId: string;
  clientId: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'completed' | 'trading';
  paymentStatus?: 'pending' | 'paid' | 'refunded';
  paymentMethod?: 'pix' | 'card' | 'cash' | 'voucher';
  price: number;
}

export interface Negotiation {
  id: string;
  appointmentId: string;
  proposerId: string;
  ownerId: string;
  offerAmount?: number;
  suggestedAppointmentId?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  negotiationId: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'appointment' | 'negotiation' | 'sweepstake' | 'voucher' | 'system';
  read: boolean;
  createdAt: string;
  link?: string;
  relatedId?: string;
}
