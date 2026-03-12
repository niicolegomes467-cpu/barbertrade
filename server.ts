import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import cron from "node-cron";
import webpush from "web-push";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import Stripe from "stripe";

dotenv.config();

const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY) 
  : null;

// Load Firebase Config
const firebaseConfig = JSON.parse(readFileSync(join(process.cwd(), "firebase-applet-config.json"), "utf8"));

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(), // This works in Cloud Run if permissions are set
  projectId: firebaseConfig.projectId,
});

// Respect the named database if provided
const firestore = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(firebaseConfig.firestoreDatabaseId)
  : getFirestore();

// Configure Web Push
const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:example@example.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Stripe Webhook (Must be before express.json())
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      if (endpointSecret && sig && stripe) {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } else {
        // Fallback for dev if no secret is set (NOT SECURE FOR PROD)
        event = JSON.parse(req.body);
      }
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const userId = session.metadata.userId;
      const amount = session.amount_total / 100;

      try {
        const userRef = firestore.collection("users").doc(userId);
        await firestore.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists) throw new Error("User not found");
          
          const currentBalance = userDoc.data()!.balance || 0;
          transaction.update(userRef, { balance: currentBalance + amount });

          const transRef = firestore.collection("platform_transactions").doc();
          transaction.set(transRef, {
            type: "deposit",
            amount: amount,
            userId: userId,
            description: `Depósito via Stripe (Session: ${session.id})`,
            createdAt: new Date().toISOString()
          });
        });
        console.log(`Balance updated for user ${userId}: +R$ ${amount}`);
      } catch (err) {
        console.error("Error updating balance from webhook:", err);
      }
    }

    res.json({ received: true });
  });

  app.use(express.json());

  // API: Create Stripe Checkout Session
  app.post("/api/create-checkout-session", async (req, res) => {
    const { amount, userId } = req.body;
    if (!stripe) return res.status(500).json({ error: "Stripe not configured" });

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "brl",
              product_data: {
                name: "Recarga de Saldo - BarberTrade",
                description: `Adição de R$ ${amount.toFixed(2)} ao seu saldo`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.APP_URL || "http://localhost:3000"}/?payment=success`,
        cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/?payment=cancel`,
        metadata: {
          userId,
        },
      });

      res.json({ url: session.url });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // API: Save Push Subscription
  app.post("/api/notifications/subscribe", async (req, res) => {
    const { subscription, userId } = req.body;
    if (!subscription || !userId) return res.status(400).json({ error: "Missing data" });

    try {
      await firestore.collection("push_subscriptions").doc(userId).set({
        subscription,
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // API: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(join(process.cwd(), "dist/index.html"));
    });
  }

  // Cron job for financial reports (runs at midnight on the 1st of each month)
cron.schedule("0 0 1 * *", async () => {
  console.log("Generating monthly financial report...");
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const period = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  
  try {
    const start = lastMonth.toISOString();
    const end = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const transSnap = await firestore.collection("platform_transactions")
      .where("createdAt", ">=", start)
      .where("createdAt", "<", end)
      .get();

    let totalRevenue = 0;
    let appointmentFees = 0;
    let negotiationFees = 0;
    let subscriptionRevenue = 0;
    let vaultFees = 0;

    transSnap.forEach(doc => {
      const data = doc.data();
      totalRevenue += data.amount;
      if (data.type === "appointment_fee") appointmentFees += data.amount;
      if (data.type === "negotiation_fee") negotiationFees += data.amount;
      if (data.type === "subscription") subscriptionRevenue += data.amount;
      if (data.type === "vault_fee") vaultFees += data.amount;
    });

    await firestore.collection("financial_reports").add({
      period,
      totalRevenue,
      appointmentFees,
      negotiationFees,
      subscriptionRevenue,
      vaultFees,
      updatedAt: new Date().toISOString()
    });

    console.log(`Financial report for ${period} generated.`);
  } catch (err) {
    console.error("Error generating financial report:", err);
  }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // --- AUTOMATIC SWEEPSTAKE DRAW ---
  // Runs every minute to check for pending draws
  cron.schedule("* * * * *", async () => {
    console.log("Checking for sweepstakes to draw...");
    const now = new Date().toISOString();
    
    try {
      const sweepstakesSnapshot = await firestore
        .collection("sweepstakes")
        .where("status", "==", "open")
        .where("drawDate", "<=", now)
        .get();

      for (const sweepDoc of sweepstakesSnapshot.docs) {
        const sweep = sweepDoc.data();
        const sweepId = sweepDoc.id;

        console.log(`Drawing winners for sweepstake: ${sweep.title}`);

        // 1. Get registrations
        const registrationsSnapshot = await firestore
          .collection("sweepstake_registrations")
          .where("sweepstakeId", "==", sweepId)
          .get();

        const participants = registrationsSnapshot.docs.map(doc => doc.data().clientId);
        
        if (participants.length === 0) {
          console.log("No participants for this sweepstake.");
          await firestore.runTransaction(async (transaction) => {
            const vaultRef = firestore.collection("vaults").doc("main_vault");
            const vaultSnap = await transaction.get(vaultRef);
            const totalPrize = sweep.winnersCount * sweep.prizeValue;
            
            if (vaultSnap.exists) {
              transaction.update(vaultRef, {
                totalBalance: (vaultSnap.data()!.totalBalance || 0) + totalPrize,
                reservedBalance: (vaultSnap.data()!.reservedBalance || 0) - totalPrize
              });
            }
            transaction.update(sweepDoc.ref, { 
              status: "cancelled", 
              description: sweep.description + " (Cancelado: Sem participantes)" 
            });
          });
          continue;
        }

        // 2. Pick winners
        const shuffled = participants.sort(() => 0.5 - Math.random());
        const winners = shuffled.slice(0, sweep.winnersCount);

        // 3. Process Draw in Transaction
        await firestore.runTransaction(async (transaction) => {
          // No need to deduct from vault here as it was reserved at launch
          // We just create the vouchers and update status
          
          // Create Vouchers
          for (const winnerId of winners) {
            const voucherRef = firestore.collection("vouchers").doc();
            transaction.set(voucherRef, {
              sweepstakeId: sweepId,
              clientId: winnerId,
              code: Math.random().toString(36).substring(2, 10).toUpperCase(),
              status: "active",
              expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
              value: sweep.prizeValue,
              createdAt: now
            });
          }

          // Create Transaction Record (Audit only, balance already moved at launch)
          const transRef = firestore.collection("vault_transactions").doc();
          transaction.set(transRef, {
            type: "payout",
            amount: winners.length * sweep.prizeValue,
            userId: "system",
            description: `Vouchers gerados para ${winners.length} ganhadores do sorteio: ${sweep.title}`,
            createdAt: now,
            sweepstakeId: sweepId
          });

          // Update Sweepstake Status
          transaction.update(sweepDoc.ref, { status: "drawn" });
        });

        console.log(`Successfully drawn ${winners.length} winners for ${sweep.title}`);
        
        // 4. Notify Winners
        for (const winnerId of winners) {
          // In-app notification
          const notifRef = firestore.collection("notifications").doc();
          await notifRef.set({
            userId: winnerId,
            title: "Você ganhou!",
            message: `Parabéns! Você ganhou um corte grátis no sorteio: ${sweep.title}. Confira seus vouchers!`,
            type: "voucher",
            read: false,
            createdAt: now,
            relatedId: sweepId
          });

          sendPushNotification(winnerId, {
            title: "Você ganhou!",
            body: `Parabéns! Você ganhou um corte grátis no sorteio: ${sweep.title}`,
            icon: "/gift.png"
          });
        }
      }
    } catch (err) {
      console.error("Error in sweepstake cron job:", err);
    }
  });

  // --- APPOINTMENT REMINDERS ---
  // Runs every hour to remind users of appointments in the next 2 hours
  cron.schedule("30 * * * *", async () => {
    console.log("Checking for upcoming appointments...");
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    try {
      const upcomingAppointments = await firestore
        .collection("appointments")
        .where("status", "==", "accepted")
        .where("startTime", ">=", now.toISOString())
        .where("startTime", "<=", twoHoursFromNow.toISOString())
        .get();

      for (const appDoc of upcomingAppointments.docs) {
        const app = appDoc.data();
        const appId = appDoc.id;
        
        // Check if reminder already sent (to avoid duplicates)
        const reminderSentKey = `reminder_sent_${appId}`;
        const alreadySent = await firestore.collection("notifications")
          .where("userId", "==", app.clientId)
          .where("relatedId", "==", appId)
          .where("type", "==", "appointment")
          .where("title", "==", "Lembrete de Agendamento")
          .get();

        if (alreadySent.empty) {
          const startTime = new Date(app.startTime);
          const timeStr = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          // Notify Client
          await firestore.collection("notifications").add({
            userId: app.clientId,
            title: "Lembrete de Agendamento",
            message: `Você tem um corte agendado para hoje às ${timeStr}. Não se atrasre!`,
            type: "appointment",
            read: false,
            createdAt: new Date().toISOString(),
            relatedId: appId
          });

          // Notify Barber
          await firestore.collection("notifications").add({
            userId: app.barberId || (await firestore.collection("barbershops").doc(app.barbershopId).get()).data()?.ownerId,
            title: "Lembrete de Agendamento",
            message: `Você tem um cliente agendado para hoje às ${timeStr}.`,
            type: "appointment",
            read: false,
            createdAt: new Date().toISOString(),
            relatedId: appId
          });
        }
      }
    } catch (err) {
      console.error("Error in reminder cron job:", err);
    }
  });
}

async function sendPushNotification(userId: string, payload: any) {
  try {
    const subDoc = await firestore.collection("push_subscriptions").doc(userId).get();
    if (subDoc.exists) {
      const { subscription } = subDoc.data()!;
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log(`Notification sent to user ${userId}`);
    }
  } catch (err) {
    console.error(`Failed to send notification to user ${userId}:`, err);
  }
}

startServer();
