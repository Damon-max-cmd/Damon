import { Telegraf, session, Markup } from 'telegraf';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import fs from 'fs';

// --- إعدادات أساسية ---
// الـ Token يتم جلبه من إعدادات Render تلقائياً
const BOT_TOKEN = process.env.BOT_TOKEN; 
const ADMIN_ID = 6234126115; 
const GROUP_ID = -1003916605151; 
const DB_FILE = './database.json';
const IMAGE_URL = 'https://i.postimg.cc/5yj416Fm/IMG-1782.jpg';

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// --- تحميل البيانات ---
let db = { emails: [], maintenance: false, channel: "@damon_email", users: {}, lastUsedEmailIndex: 0 };

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) { console.error("❌ خطأ في تحميل قاعدة البيانات."); }
}

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- الدوال المساعدة ---
const isAuth = (userId) => userId === ADMIN_ID || (db.users[userId] && db.users[userId].isAdmin);

// --- الأوامر الأساسية ---
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const caption = isAuth(userId) ? "مرحباً بك يا سيدي دامون 🦇" : "أرسل الرقم الدولي الآن:";
    await ctx.replyWithPhoto(IMAGE_URL, { caption });
});

// تشغيل البوت
bot.launch().then(() => console.log("🚀 البوت يعمل الآن!"));

// معالجة الأخطاء
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
