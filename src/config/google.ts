import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_FILE_PATH = path.resolve(process.cwd(), '.tokens.json');

// Scopes required to view, manage, and download files
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Load saved tokens if available
  if (fs.existsSync(TOKEN_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(TOKEN_FILE_PATH, 'utf-8');
      const tokens = JSON.parse(raw);
      oauth2Client.setCredentials(tokens);
    } catch (e) {
      console.error('Failed to parse .tokens.json:', e);
    }
  } else if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
  }

  // Automatically persist refreshed tokens
  oauth2Client.on('tokens', (tokens) => {
    try {
      let existing = {};
      if (fs.existsSync(TOKEN_FILE_PATH)) {
        existing = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf-8'));
      }
      const updated = { ...existing, ...tokens };
      fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(updated, null, 2));
    } catch (err) {
      console.error('Error saving updated tokens:', err);
    }
  });

  return oauth2Client;
}

export function saveTokens(tokens: any) {
  let existing = {};
  if (fs.existsSync(TOKEN_FILE_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf-8'));
    } catch (_) {}
  }
  const merged = { ...existing, ...tokens };
  fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(merged, null, 2));
}

export function clearTokens() {
  if (fs.existsSync(TOKEN_FILE_PATH)) {
    try {
      fs.unlinkSync(TOKEN_FILE_PATH);
    } catch (e) {
      console.error('Failed to remove tokens file:', e);
    }
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isAuthenticated(): boolean {
  const client = getOAuth2Client();
  if (!client) return false;
  const creds = client.credentials;
  return Boolean(creds && (creds.access_token || creds.refresh_token));
}

export function getDriveClient() {
  const auth = getOAuth2Client();
  if (!auth) {
    throw new Error('Google OAuth2 Client belum dikonfigurasi di .env');
  }
  return google.drive({ version: 'v3', auth });
}

export function getOAuthUrl(): string {
  const client = getOAuth2Client();
  if (!client) {
    throw new Error('Google OAuth credentials not configured in .env');
  }
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}
