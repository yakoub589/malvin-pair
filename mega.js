import * as mega from 'megajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to store session info
const sessionFilePath = path.join(__dirname, 'session');

// Mega authentication credentials (use with caution in real apps)
const auth = {
    email: 'malvinb017@gmail.com',
    password: 'malvin266',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
};

// Function to encode session as base64
const encodeSessionToBase64 = (session) => {
    return Buffer.from(session).toString('base64');
};

// Function to decode session from base64
const decodeSessionFromBase64 = (encodedSession) => {
    return Buffer.from(encodedSession, 'base64').toString('utf-8');
};

// Load or create Mega session
const getMegaStorage = () => {
    return new Promise((resolve, reject) => {
        let storage;

        // Try to reuse session
        if (fs.existsSync(sessionFilePath)) {
            const encodedSession = fs.readFileSync(sessionFilePath, 'utf-8');
            const session = decodeSessionFromBase64(encodedSession);
            storage = mega.Storage.fromSession(session, err => {
                if (err) return reject(`Session reuse failed: ${err}`);
                resolve(storage);
            });
        } else {
            // Login fresh and save session
            storage = new mega.Storage(auth, () => {
                const session = storage.toSession();
                const encodedSession = encodeSessionToBase64(session);
                fs.writeFileSync(sessionFilePath, encodedSession);
                resolve(storage);
            });

            storage.on('error', err => {
                reject(`Login failed: ${err}`);
            });
        }
    });
};

// Upload a file to Mega
export const upload = (data, name) => {
    return getMegaStorage().then(storage => {
        return new Promise((resolve, reject) => {
            const uploadStream = storage.upload({ name, allowUploadBuffering: true });
            data.pipe(uploadStream);

            storage.on('add', file => {
                resolve(file.link());
            });

            uploadStream.on('error', reject);
        });
    });
};
