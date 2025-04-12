import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    
    // Validate phone number parameter
    if (!num) {
        return res.status(400).send({ error: "Phone number is required." });
    }

    let dirs = './' + (num || `session`);
    
    // Remove existing session if present
    await removeFile(dirs);

    let retryCount = 0;
    const maxRetries = 3;

    async function initiateSession() {
        if (retryCount >= maxRetries) {
            console.error('Maximum retries reached');
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            let MalvinTechInc = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });

            if (!MalvinTechInc.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await MalvinTechInc.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    await res.send({ code });
                }
            }

            MalvinTechInc.ev.on('creds.update', saveCreds);
            MalvinTechInc.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await delay(10000);
                    const sessionGlobal = fs.readFileSync(dirs + '/creds.json');

                    // Helper to generate a random Mega file ID
                    function generateRandomId(length = 6, numberLength = 4) {
                        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let result = '';
                        for (let i = 0; i < length; i++) {
                            result += characters.charAt(Math.floor(Math.random() * characters.length));
                        }
                        const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                        return `${result}${number}`;
                    }

                    // Upload session file to Mega
                    const megaUrl = await upload(fs.createReadStream(`${dirs}/creds.json`), `${generateRandomId()}.json`).catch(err => {
                        console.error("Error uploading to Mega:", err);
                        if (!res.headersSent) {
                            res.status(500).send({ error: 'Failed to upload session to Mega.' });
                        }
                        return; // Prevent further execution
                    });

                    if (!megaUrl) return; // If upload failed, stop further execution

                    let stringSession = megaUrl.replace('https://mega.nz/file/', ''); // Extract session ID from URL
                    stringSession = 'MALVIN~' + stringSession;  // Prepend your name to the session ID

                    // Send the session ID to the target number
                    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                    await MalvinTechInc.sendMessage(userJid, { text: stringSession });

                    // Send confirmation message
                    await MalvinTechInc.sendMessage(userJid, { text: 'Hello MALVIN-XD User! 👋🏻*\n\n> Do not share your session ID with anyone.\n\n*Thanks for using MALVIN-XD 🚩*\n\n> Join WhatsApp Channel: ⤵️\nhttps://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A\n\nFork the repo ⬇️\nhttps://github.com/XdKing2/MALVIN-XD\n\n> *© Powered BY Malvin King*' });

                    // Send the session ID as a response to the client
                    await res.send({ sessionId: stringSession });

                    // Clean up session after use
                    await delay(100);
                    removeFile(dirs);
                    process.exit(0);
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect.error);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log('Retrying session initialization...');
                        await delay(10000);
                        initiateSession(); // Retry session initiation
                    }
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    console.log('Caught exception: ' + err);
});

export default router;
