import { Telegraf, session, Markup } from 'telegraf';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import fs from 'fs';

// --- الثوابت والإعدادات ---
const BOT_TOKEN = '8637324981:AAHSWvdfvEP_0vKoDi_Qef8xVhdbcv07m5o';
const ADMIN_ID = 6234126115; 
const GROUP_ID = -1003916605151; 
const DB_FILE = './database.json';
const IMAGE_URL = 'https://i.postimg.cc/5yj416Fm/IMG-1782.jpg';

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

// --- إدارة قاعدة البيانات ---
let db = { 
    emails: [], 
    maintenance: false, 
    channel: "@damon_email",
    users: {}, 
    lastUsedEmailIndex: 0 
};

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) { console.error("❌ خطأ في تحميل قاعدة البيانات."); }
}

const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// --- الدوال المساعدة ---
const maskNumber = (num) => num.substring(0, 6) + "****" + num.substring(num.length - 2);
const isAuth = (userId) => userId === ADMIN_ID || (db.users[userId] && db.users[userId].isAdmin);

const checkReset = (userId) => {
    const today = new Date().toDateString();
    if (!db.users[userId]) {
        db.users[userId] = { dailyCount: 0, lastReset: today, isVip: false, isAdmin: false };
    }
    if (db.users[userId].lastReset !== today) {
        db.users[userId].dailyCount = 0;
        db.users[userId].lastReset = today;
    }
    saveDB();
};

const getNextEmail = () => {
    const now = Date.now();
    const available = db.emails.filter(e => !e.cooldownUntil || e.cooldownUntil < now);
    if (available.length === 0) return null;
    db.lastUsedEmailIndex = (db.lastUsedEmailIndex + 1) % available.length;
    saveDB();
    return available[db.lastUsedEmailIndex];
};

// --- لوحات التحكم ---
const adminKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.callback("➕ إضافة إيميل", "add_email"), Markup.button.callback("🗑️ حذف إيميل", "delete_one_email")],
    [Markup.button.callback("👑 منح VIP", "add_vip_user"), Markup.button.callback("🚫 سحب VIP", "rem_vip_user")],
    [Markup.button.callback("📢 إذاعة للكل", "broadcast"), Markup.button.callback("📊 إحصائيات", "show_stats")],
    [Markup.button.callback("📢 القناة", "edit_channel"), Markup.button.callback(db.maintenance ? "🔓 فتح البوت" : "🔒 صيانة", "toggle_main")]
]);

const commonKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.url("👨‍💻 المطور", "https://t.me/DVNsuii"), Markup.button.url("📢 القناة", `https://t.me/${db.channel.replace('@','')}`)]
]);

// --- محرك المراقبة الذكي المحمي ---
async function monitorInbox(acc, targetNumber, chatId, userTag, userId) {
    let responded = false;
    const client = new ImapFlow({
        host: 'imap.gmail.com', port: 993, secure: true,
        auth: { user: acc.user, pass: acc.pass }, logger: false
    });

    const timeout = setTimeout(async () => {
        if (!responded) {
            try { await bot.telegram.sendMessage(ADMIN_ID, `⚠️ تنبيه: الإيميل ${acc.user} لم يتلقَ رد للرقم ${targetNumber}`); } catch (e) {}
            try { await client.logout(); } catch(e){}
        }
    }, 120000);

    try {
        await client.connect();
        await client.getMailboxLock('INBOX');
        client.on('exists', async () => {
            const message = await client.fetchOne(client.mailbox.exists, { source: true });
            const content = message.source.toString().toLowerCase();
            if (content.includes('whatsapp') && content.includes(targetNumber)) {
                responded = true; 
                clearTimeout(timeout);
                
                if (!isAuth(userId) && !db.users[userId]?.isVip) { 
                    db.users[userId].dailyCount++; 
                    saveDB(); 
                }
                
                // حماية إرسال نتيجة النجاح للمستخدم
                try {
                    await bot.telegram.sendPhoto(chatId, IMAGE_URL, { caption: `✅ تم فك الرقم بنجاح: ${targetNumber}` });
                } catch (e) { console.log(`[Block] تعذر إرسال النتيجة للمستخدم: ${chatId}`); }

                // إشعار القناة
                try {
                    await bot.telegram.sendPhoto(GROUP_ID, IMAGE_URL, { 
                        caption: `📢 تم فك التقييد بنجاح!\n\n👤 المستخدم: ${userTag}\n📱 الرقم: ${maskNumber(targetNumber)}`,
                        reply_markup: commonKeyboard().reply_markup
                    });
                } catch (e) {}
                
                await client.logout();
            }
        });
    } catch (err) { 
        clearTimeout(timeout); 
        try { await client.logout(); } catch(e){}
    }
}

// --- الأوامر الرئيسية مع حماية ---
bot.start(async (ctx) => {
    try {
        const userId = ctx.from.id;
        checkReset(userId);
        const caption = isAuth(userId) ? "مرحباً بك يا سيدي دامون 🦇" : "أرسل الرقم الدولي الآن لبدء الهجوم:";
        const keyboard = isAuth(userId) ? adminKeyboard() : commonKeyboard();
        await ctx.replyWithPhoto(IMAGE_URL, { caption, reply_markup: keyboard.reply_markup });
    } catch (e) { console.error("Error in Start command"); }
});

// --- إدارة الأفعال (Actions) ---
bot.action('add_email', (ctx) => { ctx.session = { step: 'mail' }; ctx.reply("📧 أرسل الإيميل:"); });
bot.action('broadcast', (ctx) => { ctx.session = { step: 'bc' }; ctx.reply("📢 أرسل رسالة الإذاعة:"); });
bot.action('add_vip_user', (ctx) => { ctx.session = { step: 'add_vip' }; ctx.reply("👑 أرسل ID المستخدم:"); });
bot.action('rem_vip_user', (ctx) => { ctx.session = { step: 'rem_vip' }; ctx.reply("🚫 أرسل ID المستخدم:"); });
bot.action('edit_channel', (ctx) => { ctx.session = { step: 'edit_ch' }; ctx.reply("📢 يوزر القناة مع @:"); });

bot.action('delete_one_email', (ctx) => {
    if (db.emails.length === 0) return ctx.reply("لا توجد إيميلات.");
    const btns = db.emails.map((e, i) => [Markup.button.callback(`🗑️ ${e.user}`, `del_${i}`)]);
    ctx.reply("اختر الإيميل للحذف:", Markup.inlineKeyboard(btns));
});

bot.action(/^del_(\d+)$/, (ctx) => {
    const idx = parseInt(ctx.match[1]);
    db.emails.splice(idx, 1);
    saveDB(); ctx.reply("✅ تم الحذف.");
});

bot.action('toggle_main', (ctx) => {
    db.maintenance = !db.maintenance; saveDB();
    ctx.reply(db.maintenance ? "🔒 وضع الصيانة: مفعل" : "🔓 وضع الصيانة: معطل", adminKeyboard());
});

bot.action('show_stats', (ctx) => {
    const stats = `📊 الإحصائيات:\n\n📧 الإيميلات: ${db.emails.length}\n👤 المستخدمين: ${Object.keys(db.users).length}`;
    ctx.reply(stats);
});

// --- معالجة النصوص المحمية ---
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;

    if (isAuth(userId) && ctx.session?.step) {
        const step = ctx.session.step;
        
        if (step === 'bc') {
            const allUsers = Object.keys(db.users);
            let success = 0, blocked = 0;
            await ctx.reply(`⏳ جاري الإذاعة لـ ${allUsers.length}...`);
            for (const id of allUsers) {
                try {
                    await bot.telegram.sendMessage(id, text);
                    success++;
                } catch (e) { if (e.response?.error_code === 403) blocked++; }
            }
            ctx.session = null;
            return ctx.reply(`✅ النتيجة:\n🟢 نجاح: ${success}\n🔴 حظر: ${blocked}`);
        }
        
        if (step === 'mail') { ctx.session.tempMail = text; ctx.session.step = 'pass'; return ctx.reply("🔑 أرسل كلمة سر التطبيق:"); }
        if (step === 'pass') { db.emails.push({ user: ctx.session.tempMail, pass: text.replace(/\s+/g, ''), cooldownUntil: null }); saveDB(); ctx.session = null; return ctx.reply("✅ تم الحفظ."); }
        if (step === 'add_vip') { checkReset(text); db.users[text].isVip = true; saveDB(); ctx.session = null; return ctx.reply("✅ تم المنح."); }
        if (step === 'rem_vip') { if(db.users[text]) db.users[text].isVip = false; saveDB(); ctx.session = null; return ctx.reply("✅ تم السحب."); }
        if (step === 'edit_ch') { db.channel = text; saveDB(); ctx.session = null; return ctx.reply("✅ تم التحديث."); }
    }

    if (/^\+?[0-9]{7,15}$/.test(text.replace(/\s/g, ''))) {
        if (db.maintenance && !isAuth(userId)) return ctx.reply("⚠️ وضع الصيانة مفعل.");
        checkReset(userId);
        if (!isAuth(userId) && !db.users[userId].isVip && db.users[userId].dailyCount >= 7) {
            return ctx.reply("❌ استنفدت حصتك اليومية.");
        }

        const acc = getNextEmail();
        if (!acc) return ctx.reply("⚠️ لا توجد إيميلات متاحة.");

        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: acc.user, pass: acc.pass } });
        
        const russianSubject = "УЛЬТИМАТУМ: Досудебное уведомление о незаконном удержании персональных данных и связи";
        const russianMessage = `Кому: Юридический департамент Meta Platforms Inc. / Служба экстренного технического надзора WhatsApp

Я направляю данное обращение в качестве ФИНАЛЬНОГО ДОСУДЕБНОГО УВЕДОМЛЕНИЯ (Ultimatum) в связи с неправомерным, грубым и безосновательным ограничением доступа к моей учетной записи: ${text}

Ваша автоматизированная система модерации, работающая с критическими программными ошибками, заблокировала мой аккаунт в режиме «False Positive». Я официально и под юридическую ответственность заявляю: никаких нарушений «Условий предоставления услуг» со стороны данного номера совершено не было. Не использовались никакие запрещенные скрипты, сторонние эмуляторы или спам-инструменты. 

Ваша компания заблокировала доступ к моим личным, коммерческим и зашифрованным данным, что классифицируется как прямое нарушение конфиденциальности, незаконное присвоение цифровой личности и умышленное нанесение материального и репутационного ущерба.

В СВЯЗИ С ЭТИМ Я КАТЕГОРИЧЕСКИ ТРЕБУЮ:
1. НЕМЕДЛЕННО (в течение 6 часов) передать данное производство в Департамент высшей правовой и технической экспертизы для ручного аудита логов активности.
2. Полностью восстановить доступ к номеру ${text} и аннулировать его из всех автоматических стоп-листов (Blacklists) вашей нейросети.
3. В случае продления блокировки — предоставить официальный верифицированный технический отчет с доказательствами нарушений, подписанный ответственным сотрудником, для его последующей передачи в международные судебные инстанции и органы по надзору за цифровыми правами.

Любые стандартные шаблонные ответы от роботов будут расценены как сознательный отказ от досудебного урегулирования конфликта. Я настроен решительно и готов защищать свои права.

Требую немедленного восстановления связи.

Официальный владелец аккаунта: Полный аутентификационный ID ${text}
`;

        try {
            await transporter.sendMail({
                from: acc.user,
                to: 'android@whatsapp.com, android@support.whatsapp.com, support@support.whatsapp.com',
                subject: russianSubject,
                text: russianMessage
            });
            await ctx.reply(`⏳ جاري الهجوم بـ: ${acc.user}\n🔋 الرصيد: [ ${isAuth(userId) || db.users[userId].isVip ? '∞' : db.users[userId].dailyCount + 1} / 7 ]`);
            monitorInbox(acc, text, ctx.chat.id, ctx.from.first_name, userId);
        } catch (e) { ctx.reply("❌ فشل الإرسال، تحقق من كلمة سر التطبيق."); }
    }
});

bot.catch((err) => { console.error("Global Bot Error:", err.message); });
bot.launch().then(() => console.log("🚀 البوت يعمل الآن بأقصى حماية!"));
