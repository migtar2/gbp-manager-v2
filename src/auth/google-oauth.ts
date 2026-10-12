/**
 * Google OAuth 2.0 Authentication for Google Business Profile
 * 
 * Handles OAuth flow for multi-account GBP management.
 * Supports agency accounts that manage multiple business profiles.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

export class GoogleAuth {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3456/callback'
    );
  }

  /**
   * Start the OAuth flow — opens browser for user consent
   */
  async authenticate(): Promise<void> {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    console.log('\n🔗 Abre esta URL en tu navegador para autenticar:\n');
    console.log(authUrl);
    console.log('\n⏳ Esperando autorización...\n');

    // Start local server to receive callback
    const app = express();
    const port = parseInt(process.env.AUTH_PORT || '3456');

    app.get('/callback', async (req, res) => {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).send('No code received');
        return;
      }

      try {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        
        // Save tokens
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        console.log('✅ Token guardado en', TOKEN_PATH);
        
        res.send(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✅ Autenticación exitosa</h1>
              <p>Ya puedes cerrar esta ventana.</p>
            </body>
          </html>
        `);
        
        setTimeout(() => {
          console.log('\n🚀 Autenticación completada. Ya puedes usar el GBP Manager.');
          process.exit(0);
        }, 1000);
      } catch (error) {
        console.error('❌ Error al obtener token:', error);
        res.status(500).send('Error al obtener token');
      }
    });

    app.listen(port, () => {
      console.log(`📡 Servidor de autenticación en http://localhost:${port}`);
    });
  }

  /**
   * Load saved tokens from disk
   */
  loadTokens(): boolean {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
        this.oauth2Client.setCredentials(tokens);
        return true;
      }
    } catch (error) {
      console.error('Error loading tokens:', error);
    }
    return false;
  }

  /**
   * Get the authenticated OAuth2 client
   */
  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  /**
   * Refresh tokens if expired
   */
  async refreshIfNeeded(): Promise<void> {
    const credentials = this.oauth2Client.credentials;
    if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
      const { credentials: newTokens } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(newTokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
    }
  }
}

// CLI entry point
if (require.main === module) {
  const auth = new GoogleAuth();
  auth.authenticate().catch(console.error);
}
