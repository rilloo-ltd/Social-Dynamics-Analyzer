import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portArgIndex = process.argv.indexOf('--port');
const PORT = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : 3000;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
const DATA_DIR = isProd ? '/tmp/data' : path.join(process.cwd(), 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(STATS_FILE, JSON.stringify({ uploads: [], buttonPresses: {}, geminiUsage: [], sessions: {} }));
}

app.use(express.json({ limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API Routes

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/messages', (req, res) => {
  res.json({
    phase1: [
      "קורא את הקובץ. לאט. כי מישהו פה כותב במגילות.",
      "עושה אנונימיזציה כדי לתסבך את כל ההאקרים.",
      "סופר כמה פעמים נכתב \"חחח\" בלי שאף אחד צחק באמת.",
      "ממיר אימוג'ים של בכי לטקסט קר ומנוכר.",
      "מתעלם משגיאות ההקלדה. או לפחות מנסה.",
      "בודק מתי הושארו וי כחולים ללא תגובה. הנתונים קשים.",
      "מאתחל את מודל הסבלנות האלקטרונית שלי.",
      "מסנן תמונות. המערכת שלי לא בנויה להכיל את זה.",
      "קורא את התנאים וההגבלות במקומך. סתם, גם אני לא קורא.",
      "מעבד הודעות של מילה אחת. מרתק.",
      "מחפש את ההקשר שאבד אי שם בנובמבר.",
      "מקטלג סימני קריאה מיותרים. ויש הרבה.",
      "טוען את היסטוריית ההודעות המודחקות.",
      "מוחק הודעות \"ער/ה?\" כדי לחסוך מבוכה מהשרתים.",
      "מוודא שהטקסט בטוח לקריאה. לפחות עבורי.",
      "מנסה להבין מי פה הצד הפגוע. כנראה שניכם.",
      "סורק את ההודעות שנמחקו. אני יודע מה היה שם.",
      "בוחן את זמני התגובה. מישהו פה משחק משחקים.",
      "שותה קפה וירטואלי לפני שאני צולל פנימה.",
      "מנתח את הפסיב-אגרסיב בשורה \"הכל טוב\"."
    ],
    phase2: [
      "מחלץ תובנות משמעותיות (אבל למי?).",
      "מודד את רמת החרדה הממוצעת להודעה.",
      "מחפש דפוסי התקשרות נמנעים. מוצא יותר מדי.",
      "משווה את הדינמיקה הזאת לנורמה. הנורמה מנצחת.",
      "מנסה למצוא משמעות עמוקה בתגובה \"סבבה\".",
      "מאבחן בעיות אמון על סמך שימוש מוגזם בשלוש נקודות...",
      "מחשב את יחס התן-וקח. המתמטיקה קורסת.",
      "ממפה פצעי ילדות דרך שימוש באימוג'י של ליצן.",
      "מריץ סימולציה של מה היה קורה אם הייתם פשוט מדברים.",
      "סופר כמה פעמים הייתם צריכים פשוט ללכת לישון.",
      "מחפש בספרות המקצועית מונח למה שקורה פה. כנראה שעוד אין.",
      "מפענח את הסאבטקסט. הוא די עמוק למטה.",
      "מנתח מנגנוני הגנה. נראה שהכחשה מובילה כרגע.",
      "בונה פרופיל פסיכולוגי. מבקש תוספת סיכון.",
      "תוהה אם פרויד היה מסתדר עם וואטסאפ. כנראה שלא.",
      "מודד טראומה בין-דורית לפי כמות הפעמים שמופיעה המילה \"אמא\".",
      "מבודד את הרגע המדויק שבו הכל התחיל להשתבש.",
      "מחפש תוקף רגשי בשיחה. מדווח על שגיאה 404.",
      "מזקק את כל הדרמה הזו לארבע שורות קוד.",
      "בודק חרדת נטישה דרך זמני ההמתנה לתשובה."
    ],
    phase3: [
      "שוקל איך לכתוב את הדברים בלי להעליב אף אחד.",
      "עוטף את המציאות המרה במילים יפות.",
      "מוסיף ז'רגון מקצועי כדי להצדיק את קיום האפליקציה הזאת.",
      "מתמצת את האבחנה. זה לא יכנס לפוסט-איט.",
      "מנסח פתרונות פרקטיים שברור לי שלא תיישמו.",
      "מתכונן נפשית לתגובה שלכם.",
      "מוודא שהדו\"ח מכיל מספיק אמפתיה מלאכותית.",
      "מחפש מילת תואר עדינה יותר ל\"קטסטרופה\".",
      "מדפיס את המסקנות לזיכרון. גורס אותן. מדפיס שוב.",
      "מכין קופסת טישו וירטואלית.",
      "מנסח דיסקליימר ארוך שקובע שאני, בסופו של דבר, רק אלגוריתם.",
      "מחליט לא להציג את הכל בבת אחת. פרה פרה.",
      "מוסיף קצת אופטימיות בסוף. עריכה: מוחק אותה שוב.",
      "מצמצם את כמות האשמה שמכוונת ישירות אליכם.",
      "מוודא שהפסיכולוג האמיתי שלכם לא יתבע אותנו.",
      "מתרגם שפת מכונה לאכזבה אנושית.",
      "מרכך את המכה.",
      "מגבה את הנתונים, למקרה שתחליטו להכחיש הכל אחר כך.",
      "אורז הכל לפורמט קריא.",
      "מסיים. לוקח נשימה עמוקה (אם היו לי ריאות)."
    ]
  });
});

const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

if (!fs.existsSync(CHATS_FILE)) {
  fs.writeFileSync(CHATS_FILE, JSON.stringify({}));
}

app.post('/api/chats/upload', (req, res) => {
  try {
    const { text, forceNew } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    // Code Generation Logic
    // We need to extract the first 10 and last 10 "content words".
    // Content words are words that are not timestamps and not participant identifiers (P1:, P2:).
    // If a word starts with P<number>:, we strip that prefix.
    
    const allWords = text.split(/\s+/);
    const contentWords = [];
    
    for (const rawWord of allWords) {
        let w = rawWord.trim();
        if (!w) continue;
        
        // Remove timestamp [date] if it matches exactly (though usually dates are 12/12/2020 without brackets in the formatted text, but let's be safe)
        if (/^\[.*?\]$/.test(w)) continue;
        
        // Check for P<number>: prefix
        // The user says "ignoring the PX".
        // If the word IS "P1:", we ignore it.
        // If the word IS "P1:Hello", we treat it as "Hello".
        
        const pMatch = w.match(/^(P\d+:)(.*)/);
        if (pMatch) {
            // It starts with P<number>:
            // pMatch[1] is P1:, pMatch[2] is the rest
            const rest = pMatch[2];
            if (!rest) {
                // It was just "P1:", ignore it
                continue;
            }
            // It was "P1:Hello", use "Hello"
            w = rest;
        }
        
        if (w) {
            contentWords.push(w);
        }
    }

    let first10 = [];
    let last10 = [];

    if (contentWords.length <= 20) {
        first10 = contentWords;
        last10 = []; 
    } else {
        first10 = contentWords.slice(0, 10);
        last10 = contentWords.slice(-10);
    }
    
    const code = [...first10, ...last10]
      .map(w => w.charAt(0))
      .join('');

    if (!code) {
        return res.status(400).json({ error: 'Could not generate chat code (empty content)' });
    }

    // Check if chat exists
    let chats = {};
    if (fs.existsSync(CHATS_FILE)) {
        try {
            chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
        } catch (e) {
            console.error("Error reading chats file, resetting", e);
            chats = {};
        }
    }

    if (chats[code] && !forceNew) {
        console.log(`Chat with code ${code} already exists. Returning existing data.`);
        return res.json({ success: true, code, existingOutputs: chats[code].outputs || {} });
    }
    
    chats[code] = {
      code,
      text, // The original text with identifiers is preserved
      timestamp: new Date().toISOString(),
      outputs: forceNew ? {} : (chats[code]?.outputs || {})
    };
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));

    res.json({ success: true, code, existingOutputs: {} });
  } catch (error) {
    console.error('Error storing chat:', error);
    res.status(500).json({ error: 'Failed to store chat' });
  }
});

app.post('/api/chats/update', (req, res) => {
  try {
    const { code, type, output } = req.body;
    if (!code || !type || !output) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let chats = {};
    if (fs.existsSync(CHATS_FILE)) {
        try {
            chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
        } catch (e) {
            console.error("Error reading chats file", e);
            return res.status(500).json({ error: 'Database error' });
        }
    }

    if (!chats[code]) {
        return res.status(404).json({ error: 'Chat not found' });
    }

    // Initialize the type index if it doesn't exist
    if (!chats[code].outputs) {
        chats[code].outputs = {};
    }

    // Store the output under the specific type index
    chats[code].outputs[type] = {
        output,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

app.post('/api/log/upload', (req, res) => {
  try {
    const { participants, timestamp, anonymizedText, tokenCount, chatCode } = req.body;
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const ts = timestamp || new Date().toISOString();

    // Legacy support
    stats.uploads.push({
      timestamp: ts,
      participants: participants || 0
    });
    
    // New Detailed Session
    if (!stats.sessions) stats.sessions = {};
    stats.sessions[sessionId] = {
      id: sessionId,
      timestamp: ts,
      participants: participants || 0,
      anonymizedText: anonymizedText || "",
      chatCode: chatCode || null,
      buttonsPressed: [],
      shares: [],
      geminiUsage: [],
      imagesGenerated: [],
      initialTokenCount: tokenCount || 0
    };

    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Error logging upload:', error);
    res.status(500).json({ error: 'Failed to log upload' });
  }
});

app.post('/api/log/button', (req, res) => {
  try {
    const { buttonId, sessionId } = req.body;
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    // Legacy
    stats.buttonPresses[buttonId] = (stats.buttonPresses[buttonId] || 0) + 1;

    // Session
    if (sessionId && stats.sessions && stats.sessions[sessionId]) {
        stats.sessions[sessionId].buttonsPressed.push({
            buttonId,
            timestamp: new Date().toISOString()
        });
    }

    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging button:', error);
    res.status(500).json({ error: 'Failed to log button' });
  }
});

app.post('/api/log/share', (req, res) => {
    try {
      const { type, platform, sessionId } = req.body;
      const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
      
      if (sessionId && stats.sessions && stats.sessions[sessionId]) {
          stats.sessions[sessionId].shares.push({
              type,
              platform,
              timestamp: new Date().toISOString()
          });
          fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
      }
  
      res.json({ success: true });
    } catch (error) {
      console.error('Error logging share:', error);
      res.status(500).json({ error: 'Failed to log share' });
    }
});

app.post('/api/log/image', (req, res) => {
    try {
        const { model, sessionId } = req.body;
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));

        if (sessionId && stats.sessions && stats.sessions[sessionId]) {
            if (!stats.sessions[sessionId].imagesGenerated) {
                stats.sessions[sessionId].imagesGenerated = [];
            }
            stats.sessions[sessionId].imagesGenerated.push({
                model,
                timestamp: new Date().toISOString()
            });
            fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error logging image generation:', error);
        res.status(500).json({ error: 'Failed to log image generation' });
    }
});

app.post('/api/log/feedback', (req, res) => {
    try {
        const { rating, comment, sessionId } = req.body;
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));

        if (sessionId && stats.sessions && stats.sessions[sessionId]) {
            if (!stats.sessions[sessionId].feedbacks) {
                stats.sessions[sessionId].feedbacks = [];
            }
            stats.sessions[sessionId].feedbacks.push({
                rating,
                comment,
                timestamp: new Date().toISOString()
            });
            fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error logging feedback:', error);
        res.status(500).json({ error: 'Failed to log feedback' });
    }
});

app.post('/api/log/gemini', (req, res) => {
    try {
        const { promptTokens, responseTokens, model, sessionId } = req.body;
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));

        if (!stats.geminiUsage) stats.geminiUsage = [];
        stats.geminiUsage.push({
            timestamp: new Date().toISOString(),
            promptTokens,
            responseTokens,
            model
        });

        if (sessionId && stats.sessions && stats.sessions[sessionId]) {
            stats.sessions[sessionId].geminiUsage.push({
                promptTokens,
                responseTokens,
                model,
                timestamp: new Date().toISOString()
            });
        }

        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error logging gemini usage:', error);
        res.status(500).json({ error: 'Failed to log gemini usage' });
    }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    // Enrich sessions with chat outputs if available
    if (stats.sessions && fs.existsSync(CHATS_FILE)) {
        try {
            const chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
            Object.values(stats.sessions).forEach((session) => {
                if (session.chatCode && chats[session.chatCode]) {
                    session.chatOutputs = chats[session.chatCode].outputs || {};
                }
            });
        } catch (e) {
            console.error("Error reading chats file for stats enrichment", e);
        }
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

app.post('/api/admin/reset-cache', (req, res) => {
  try {
    if (fs.existsSync(CHATS_FILE)) {
      fs.writeFileSync(CHATS_FILE, JSON.stringify({}));
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting cache:', error);
    res.status(500).json({ error: 'Failed to reset cache' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === 'Magav1!') {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Vite middleware
async function startServer() {
  const isProdServer = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE || fs.existsSync(path.join(__dirname, 'dist', 'index.html'));

  if (!isProdServer) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error('Failed to load vite:', e);
      // Fallback to static serving if vite fails to load
      app.use(express.static(path.join(__dirname, 'dist')));
      app.use((req, res) => {
        const indexPath = path.join(__dirname, 'dist', 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('Not Found');
        }
      });
    }
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.use((req, res) => {
      const indexPath = path.join(__dirname, 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
