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

// Load or create Mega session
const getMegaStorage = () => {
    return new Promise((resolve, reject) => {
        let storage;

        // Try to reuse session
        if (fs.existsSync(sessionFilePath)) {
            const session = fs.readFileSync(sessionFilePath, 'utf-8');
            storage = mega.Storage.fromSession(session, err => {
                if (err) return reject(`Session reuse failed: ${err}`);
                resolve(storage);
            });
        } else {
            // Login fresh and save session
            storage = new mega.Storage(auth, () => {
                const session = storage.toSession();
                fs.writeFileSync(sessionFilePath, session);
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
