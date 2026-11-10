import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import authRoute from './routes/auth.route';
import filesRoute from './routes/files.route';
import driveRoute from './routes/drive.route';

const app = new Hono();

app.use('*', logger());
// CORS Terbatas (Hanya izinkan akses dari localhost untuk mencegah website luar mengakses API Anda)
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Jika request tanpa origin (same-origin browser) atau berasal dari localhost
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return origin || 'http://localhost:3000';
      }
      return null;
    },
    credentials: true,
  })
);

// API Routes
app.route('/api/auth', authRoute);
app.route('/api/files', filesRoute);
app.route('/api/drive', driveRoute);

// Serve static files dari direktori public
app.use('/*', serveStatic({ root: './public' }));

// Fallback jika mengakses rute root
app.get('/', serveStatic({ path: './public/index.html' }));

const port = Number(process.env.PORT) || 3000;
console.log(`🚀 Personal Drive Dashboard berjalan di: http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  // Izinkan upload berkas besar (video, film, arsip) hingga 20 GB (bawaan Bun hanya 128 MB)
  maxRequestBodySize: 1024 * 1024 * 1024 * 20,
};
