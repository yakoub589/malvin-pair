import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

function removeFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { recursive: true, force: true });
        }
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    const sessionDir = './' + (num || 'session');
    removeFile(sessionDir);

    const initiateSession = async () => {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        try {
            const client = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
                },
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }),
                browser: Browsers.ubuntu()
            });

            if (!client.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/\D/g, '');
                const code = await client.requestPairingCode(num);
                if (!res.headersSent) res.send({ code });
            }

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
                if (connection === 'open') {
                    try {
                        await delay(10000);
                        const credsPath = `${sessionDir}/creds.json`;
                        const sessionStream = fs.createReadStream(credsPath);

                        const randomId = () => {
                            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                            const rand = [...Array(6)].map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
                            return `${rand}${Math.floor(Math.random() * 10000)}`;
                        };

                        const megaUrl = await upload(sessionStream, `${randomId()}.json`);
                        const sessionId = `MALVIN~${megaUrl.replace('https://mega.nz/file/', '')}`;
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');

                        await client.sendMessage(userJid, { text: sessionId });
                        await client.sendMessage(userJid, { text: 'Hello MALVIN-XD User! 👋🏻*\n\n> Do not share your session ID with anyone.\n\n*Thanks for using MALVIN-XD 🚩*\n\n> Join WhatsApp Channel: ⤵️\nhttps://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A\n\nFork the repo ⬇️\nhttps://github.com/XdKing2/MALVIN-XD\n\n> *© Powered BY Malvin King*' });

                        removeFile(sessionDir);
                        res.status(200).send({ status: 'Session complete and uploaded.' });
                    } catch (err) {
                        console.error('Failed during connection open:', err);
                        if (!res.headersSent) res.status(500).send({ error: 'Failed during session handling.' });
                    }
                } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.warn('Connection closed, retrying...');
                    await delay(10000);
                    initiateSession();
                }
            });
        } catch (err) {
            console.error('Session init error:', err);
            if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
        }
    };

    await initiateSession();
});

process.on('uncaughtException', err => {
    console.error('Caught exception:', err);
});

export default router;
