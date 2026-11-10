import { Hono } from 'hono';
import { DriveService } from '../services/drive.service';
import { isAuthenticated } from '../config/google';

const driveRoute = new Hono();

// Middleware: Pastikan sudah login ke Google
driveRoute.use('*', async (c, next) => {
  if (!isAuthenticated()) {
    return c.json(
      {
        success: false,
        message: 'Belum terotentikasi ke Google Drive.',
      },
      401
    );
  }
  await next();
});

/**
 * Informasi profil pengguna dan kuota Google Drive
 */
driveRoute.get('/about', async (c) => {
  try {
    const data = await DriveService.getAboutInfo();
    return c.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error('Error getting drive info:', err);
    return c.json(
      {
        success: false,
        message: err.message || 'Gagal mengambil informasi profil Google Drive',
      },
      500
    );
  }
});

export default driveRoute;
