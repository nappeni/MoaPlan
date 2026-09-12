// Isolated development data. Do not load the project's production .env here.
import path from 'node:path';
process.env.DATABASE_URL = '';
process.env.DATABASE_SSL_CA_FILE = '';
process.env.DATABASE_SSL_CA = '';
process.env.ENCRYPTION_KEY = '';
process.env.SETUP_TOKEN = '';
process.env.NODE_ENV = 'development';
process.env.DATA_DIR = path.resolve('.local/development');
process.env.PORT = '5173';
process.env.APP_URL = 'http://localhost:5173';
process.env.MOAPLAN_WORKER_ENABLED = 'false';
await import('./index.js');
