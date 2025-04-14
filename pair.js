import express from 'express';
import fs from 'fs';
import pino from 'pino';
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser
} from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

// Ensure the session directory exists and remove it
function removeFile(FilePath) {
    try {
        if (fs.existsSync(FilePath)) {
            fs.rmSync(FilePath, { recursive: true, force: true });
        }
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;

    if (!num || typeof num !== 'string') {
        return res.status(400).send({ error: "Phone number is required." });
    }

    num = num.replace(/[^0-9]/g, ''); // Strip non-digits

    const dirs = `./${num}`;
    removeFile(dirs); // Clean up any previous session

    let retryCount = 0;
    const maxRetries = 3;

    async function initiateSession() {
        if (retryCount >= maxRetries) {
            console.error('Maximum retries reached');
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const MalvinTechInc = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"]
            });

            if (!MalvinTechInc.authState.creds.registered) {
                await delay(2000);
                const code = await MalvinTechInc.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    return res.send({ code });
                }
            }

            MalvinTechInc.ev.on('creds.update', saveCreds);

            MalvinTechInc.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
                if (connection === 'open') {
                    await delay(10000);

                    const generateRandomId = (length = 6, numberLength = 4) => {
                        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let result = Array.from({ length }, () =>
                            chars[Math.floor(Math.random() * chars.length)]
                        ).join('');
                        const number = Math.floor(Math.random() * 10 ** numberLength);
                        return `${result}${number}`;
                    };

                    const filePath = `${dirs}/creds.json`;

                    const megaUrl = await upload(fs.createReadStream(filePath), `${generateRandomId()}.json`).catch(err => {
                        console.error("Upload failed:", err);
                        if (!res.headersSent) {
                            res.status(500).send({ error: 'Failed to upload session.' });
                        }
                        return null;
                    });

                    if (!megaUrl) return;

                    const sessionId = 'MALVIN~' + megaUrl.replace('https://mega.nz/file/', '');

                    const userJid = jidNormalizedUser(`${num}@s.whatsapp.net`);
                    const welcomeMsg = `*Hey there, MALVIN-XD User!* 👋🏻

Thanks for using *MALVIN-XD* — your session has been successfully created!

🔐 *Session ID:* Sent above  
⚠️ *Keep it safe!* Do NOT share this ID with anyone.

——————

*✅ Stay Updated:*  
Join our official WhatsApp Channel:  
https://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A

*💻 Source Code:*  
Fork & explore the project on GitHub:  
https://github.com/XdKing2/MALVIN-XD

——————

*© Powered by Malvin King*
Stay cool and hack smart. ✌🏻`;


                    await MalvinTechInc.sendMessage(userJid, { text: sessionId });
                    await MalvinTechInc.sendMessage(userJid, { text: welcomeMsg });

                    if (!res.headersSent) {
                        res.send({ sessionId });
                    }

                    await delay(100);
                    removeFile(dirs);
                    process.exit(0);
                }

                if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect.error);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log('Retrying...');
                        await delay(10000);
                        initiateSession();
                    }
                }
            });
        } catch (err) {
            console.error('Error during session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});

export default router;
