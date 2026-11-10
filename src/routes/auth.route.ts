import { Hono } from 'hono';
import {
  clearTokens,
  getOAuth2Client,
  getOAuthUrl,
  isAuthenticated,
  isConfigured,
  saveTokens,
} from '../config/google';

const authRoute = new Hono();

/**
 * Status konfigurasi & status otentikasi Google
 */
authRoute.get('/status', (c) => {
  const configured = isConfigured();
  const authenticated = configured && isAuthenticated();

  return c.json({
    success: true,
    data: {
      configured,
      authenticated,
    },
  });
});

/**
 * Mendapatkan URL Google OAuth consent
 */
authRoute.get('/url', (c) => {
  if (!isConfigured()) {
    return c.json(
      {
        success: false,
        message: 'Google Client ID dan Secret belum diisi di file .env',
      },
      400
    );
  }

  try {
    const url = getOAuthUrl();
    return c.json({
      success: true,
      data: { url },
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        message: err.message || 'Gagal menghasilkan URL OAuth',
      },
      500
    );
  }
});

/**
 * Callback dari Google setelah pengguna memberikan persetujuan (Consent)
 */
authRoute.get('/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`/?auth=error&message=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return c.redirect('/?auth=error&message=Kode_otorisasi_tidak_ditemukan');
  }

  try {
    const client = getOAuth2Client();
    if (!client) {
      return c.redirect('/?auth=error&message=Klien_OAuth_tidak_terkonfigurasi');
    }

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    saveTokens(tokens);

    return c.redirect('/?auth=success');
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    return c.redirect(`/?auth=error&message=${encodeURIComponent(err.message || 'Gagal_menukar_token')}`);
  }
});

/**
 * Logout / Hapus token otentikasi lokal
 */
authRoute.post('/logout', (c) => {
  clearTokens();
  return c.json({
    success: true,
    message: 'Berhasil keluar dari akun Google Drive',
  });
});

export default authRoute;
