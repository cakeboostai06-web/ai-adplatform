require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { networkInterfaces } = require('os');
const mysql = require('mysql2/promise');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 

// --- PURE ENTERPRISE AI SETUP (OpenAI Only) ---
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();

// --- NETWORK & URL SETUP ---
function getLocalIp() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        const lower = name.toLowerCase();
        if (lower.includes('virtual') || lower.includes('vbox') || lower.includes('vmware') || lower.includes('vethernet')) {
            continue;
        }

        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('192.168.56.')) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const PORT = process.env.PORT || 3001;

// Strip any trailing slash so paths never end up with double slashes (//)
let rawBaseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
const BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

// Allow CORS from both Railway domain and localhost
app.use(cors({ 
    origin: [BASE_URL, 'http://localhost:3001', 'http://localhost:8080'],
    credentials: true 
}));
app.use(express.json());
app.use(express.static(__dirname)); 

// Trust proxy for secure cookies / sessions on Railway HTTPS
app.set('trust proxy', 1);

// --- MYSQL DATABASE CONNECTION ---
// Works with either individual variables or Railway's direct MYSQL_URL
const dbConfig = process.env.MYSQL_URL || process.env.DATABASE_URL
    ? (process.env.MYSQL_URL || process.env.DATABASE_URL)
    : {
        host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
        port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
        user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
        password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
        database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'cakeboost_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };

const db = mysql.createPool(dbConfig);

db.getConnection()
    .then((conn) => {
        console.log('✅ Connected to CakeBoost MySQL Database!');
        conn.release();
    })
    .catch((err) => console.error('❌ Database connection failed:', err.message));

// --- GOOGLE AUTHENTICATION SETUP ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'cakeboost_super_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/auth/google/callback`
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const googleId = profile.id;
        const picture = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;

        const [rows] = await db.query('SELECT * FROM users WHERE google_id = ? OR email = ?', [googleId, email]);
        let user = rows[0];

        if (!user) {
            const [result] = await db.query(
                'INSERT INTO users (email, google_id, name, subscription_status) VALUES (?, ?, ?, ?)',
                [email, googleId, name, 'free']
            );
            user = { id: result.insertId, email, name, subscription_status: 'free', picture };
        } else {
            user.picture = picture; 
        }
        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// --- AUTHENTICATION ROUTES ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => { 
        res.redirect('/'); 
    }
);

app.get('/api/current-user', (req, res) => { 
    res.send(req.user || null); 
});

app.get('/api/logout', (req, res) => {
    req.logout((err) => {
        if (err) return console.error(err);
        res.redirect('/');
    });
});

// --- STRIPE CHECKOUT ROUTE ---
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
            success_url: `${BASE_URL}/?payment=success`,
            cancel_url: `${BASE_URL}/?payment=cancelled`,
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error("Stripe Error:", error.message);
        res.status(500).json({ error: 'Failed to create checkout session.' });
    }
});

// --- GENERATOR & QR THEME ENGINE ---
const generatedCards = new Map();

app.post('/api/generate-campaign', async (req, res) => {
    const { businessName, prompt, includeQr, qrName, qrContact, qrLocation, qrHours } = req.body;

    try {
        // 1. OpenAI GPT acts as the Art Director
        const textResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are an expert digital marketer and art director. Respond ONLY with a JSON object in this exact format:
                    {
                        "facebook": "Engaging facebook post",
                        "instagram": "Catchy instagram post",
                        "whatsapp": "Friendly whatsapp broadcast",
                        "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
                        "imagePrompt": "A highly detailed visual prompt for an AI image generator to create a stunning marketing poster. You MUST instruct the AI to incorporate typography and write the business name prominently. Describe the exact font style, text placement, colors, and the dramatic background product photography."
                    }`
                },
                { role: "user", content: `Client: "${businessName}". Goal: "${prompt}".` }
            ]
        });

        const aiData = JSON.parse(textResponse.choices[0].message.content);

        // 2. OpenAI generates the enterprise poster with text
        const imageResponse = await openai.images.generate({
            model: "gpt-image-2.5-sunburst", 
            prompt: `Create a high-end commercial advertising poster. ${aiData.imagePrompt}. The poster MUST prominently feature the exact text "${businessName}" written in beautiful, readable typography. Bold graphic design layout, 4k resolution.`,
            n: 1,
            size: "1024x1024"
        });

        const posterUrl = `data:image/png;base64,${imageResponse.data[0].b64_json}`;
        const qrResult = includeQr ? await generateSmartQR(qrName, qrContact, qrLocation, qrHours, businessName) : null;

        res.json({ 
            status: 'success', 
            data: { 
                captionsAndTags: aiData, 
                posterUrl: posterUrl, 
                imageUrl: posterUrl, 
                qrCodeUrl: qrResult 
            } 
        });
    } catch (error) {
        console.error("Enterprise Generation Error:", error);
        res.status(500).json({ status: 'error', message: 'Failed to generate campaign. Check API keys.' });
    }
});

async function generateSmartQR(name, contact, location, hours, businessName) {
    const cardId = Date.now().toString();
    const cardUrl = `${BASE_URL}/card/${cardId}`;
    const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(cardUrl)}&size=450&dark=0f172a&light=ffffff&margin=2`;
    generatedCards.set(cardId, { name: name || businessName, contact, location, hours, qrImageUrl });
    return qrImageUrl;
}

app.get('/card/:id', (req, res) => {
    const cardData = generatedCards.get(req.params.id);
    if (!cardData) return res.status(404).send('<h1>Card Expired or Not Found</h1>');

    let theme = { bg: '#F1F5F9', card: '#ffffff', text: '#0F172A', accent: '#3B82F6', icon: '🏢', label: 'Premium Business' };
    const nameLower = cardData.name.toLowerCase();
    
    if (nameLower.includes('coffee') || nameLower.includes('cafe')) {
        theme = { bg: '#FDF8F5', card: '#ffffff', text: '#4A3B32', accent: '#8B5E3C', icon: '☕', label: 'Artisan Cafe' };
    } else if (nameLower.includes('gym') || nameLower.includes('fitness') || nameLower.includes('studio')) {
        theme = { bg: '#111827', card: '#1F2937', text: '#F9FAFB', accent: '#10B981', icon: '💪', label: 'Fitness Center' };
    } else if (nameLower.includes('food') || nameLower.includes('kitchen') || nameLower.includes('burger')) {
        theme = { bg: '#FFF7ED', card: '#ffffff', text: '#431407', accent: '#EA580C', icon: '🍔', label: 'Food & Dining' };
    }

    let waNumber = cardData.contact ? cardData.contact.replace(/\D/g, '') : '';
    if (waNumber.startsWith('0')) waNumber = '6' + waNumber; 

    const mapsLink = cardData.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cardData.location)}` : '#';

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${cardData.name} - Digital Card</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: ${theme.bg}; color: ${theme.text}; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
            .card { background-color: ${theme.card}; width: 100%; max-width: 400px; border-radius: 24px; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.08); text-align: center; }
            .icon-circle { width: 80px; height: 80px; background-color: ${theme.bg}; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 36px; margin: 0 auto 15px; border: 2px solid ${theme.accent}; box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
            h1 { font-size: 24px; font-weight: 700; margin-bottom: 5px; }
            .tag { display: inline-block; background-color: ${theme.accent}20; color: ${theme.accent}; padding: 5px 15px; border-radius: 20px; font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 25px; letter-spacing: 1px; }
            .action-btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 15px; border-radius: 14px; text-decoration: none; font-weight: 700; font-size: 16px; margin-bottom: 12px; transition: transform 0.2s; }
            .btn-wa { background-color: #25D366; color: white; box-shadow: 0 8px 20px rgba(37,211,102,0.3); }
            .btn-maps { background-color: ${theme.bg}; color: ${theme.text}; border: 1px solid ${theme.accent}40; }
            .details-box { text-align: left; background-color: ${theme.bg}; padding: 15px; border-radius: 14px; margin-top: 10px; font-size: 14px; line-height: 1.6; }
            .qr-section { margin-top: 25px; padding-top: 20px; border-top: 1px solid ${theme.accent}30; }
            .qr-image { width: 120px; height: 120px; border-radius: 12px; border: 4px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon-circle">${theme.icon}</div>
            <h1>${cardData.name}</h1>
            <div class="tag">${theme.label}</div>
            ${cardData.contact ? `<a href="https://wa.me/${waNumber}?text=Hello!" class="action-btn btn-wa"><i class="bi bi-whatsapp me-2"></i> Chat on WhatsApp</a>` : ''}
            ${cardData.location ? `<a href="${mapsLink}" class="action-btn btn-maps"><i class="bi bi-geo-alt-fill me-2" style="color: #EA4335;"></i> Get Directions</a>` : ''}
            ${cardData.hours ? `<div class="details-box"><strong><i class="bi bi-clock-history me-2"></i> Operating Hours</strong><br>${cardData.hours}</div>` : ''}
            <div class="qr-section">
                <p style="font-size: 12px; font-weight: 700; color: ${theme.accent};">SHARE THIS CARD</p>
                <img src="${cardData.qrImageUrl}" class="qr-image" alt="QR Code">
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CakeBoost Server running on port ${PORT}`);
});