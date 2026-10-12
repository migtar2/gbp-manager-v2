/**
 * Google OAuth 2.0 Authentication for Google Business Profile
 *
 * Handles OAuth flow for multi-account GBP management.
 * Supports agency accounts that manage multiple business profiles.
 *
 * Seguridad (Fase P02):
 * - Parámetro `state` aleatorio verificado en el callback (anti-CSRF).
 * - token.json escrito con permisos 0o600 (solo el usuario actual).
 * - Revocación de credenciales disponible.
 * - Nunca se registran tokens ni secretos en logs.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import express from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
];

export interface GoogleAuthOptions {
  /** Ruta del almacén de tokens (por defecto <cwd>/token.json). */
  tokenPath?: string;
  /** Ruta del fichero de credenciales de cliente (informativa). */
  credentialsPath?: string;
}

/** Genera un state aleatorio para el flujo OAuth (anti-CSRF). */
export function generateStateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export class GoogleAuth {
  private oauth2Client: OAuth2Client;
  private readonly tokenPath: string;
  private readonly credentialsPath: string;
  private pendingState: string | null = null;

  constructor(options: GoogleAuthOptions = {}) {
    this.tokenPath = options.tokenPath ?? path.join(process.cwd(), 'token.json');
    this.credentialsPath = options.credentialsPath ?? path.join(process.cwd(), 'credentials.json');
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
    this.pendingState = generateStateToken();

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: this.pendingState,
    });

    console.log('\n🔗 Abre esta URL en tu navegador para autenticar:\n');
    console.log(authUrl);
    console.log('\n⏳ Esperando autorización...\n');

    // Start local server to receive callback
    const app = express();
    const port = parseInt(process.env.AUTH_PORT || '3456');

    app.get('/callback', async (req, res) => {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code) {
        res.status(400).send('No code received');
        return;
      }

      // Anti-CSRF: el state debe coincidir con el emitido en esta sesión.
      if (!this.pendingState || !state || state !== this.pendingState) {
        res.status(400).send('Estado OAuth inválido (posible CSRF). Vuelve a iniciar la autenticación.');
        console.error('❌ Callback OAuth rechazado: state no coincide.');
        return;
      }

      try {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        this.saveTokens(tokens);
        
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
        console.error('❌ Error al obtener token:', error instanceof Error ? error.message : error);
        res.status(500).send('Error al obtener token');
      }
    });

    app.listen(port, () => {
      console.log(`📡 Servidor de autenticación en http://localhost:${port}`);
    });
  }

  /**
   * Guarda los tokens en disco con permisos restrictivos (0o600).
   */
  saveTokens(tokens: object): void {
    fs.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    // En Windows el modo POSIX no aplica igual; best-effort en Unix.
    try {
      fs.chmodSync(this.tokenPath, 0o600);
    } catch {
      /* plataformas sin chmod */
    }
    console.log('✅ Token guardado en', this.tokenPath);
  }

  /**
   * Load saved tokens from disk
   */
  loadTokens(): boolean {
    try {
      if (fs.existsSync(this.tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
        this.oauth2Client.setCredentials(tokens);
        return true;
      }
    } catch {
      // Token corrupto o ilegible: se trata como no autenticado (sin loggear contenido).
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
   * Refresh tokens if expired. Los tokens renovados se guardan con los
   * mismos permisos restrictivos.
   */
  async refreshIfNeeded(): Promise<void> {
    const credentials = this.oauth2Client.credentials;
    if (credentials.expiry_date && credentials.expiry_date < Date.now()) {
      const { credentials: newTokens } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(newTokens);
      this.saveTokens(newTokens);
    }
  }

  /**
   * Revoca el refresh token en Google y elimina el almacén local.
   * Devuelve true si la revocación (local y remota cuando aplica) tuvo éxito.
   */
  async revoke(): Promise<boolean> {
    const refreshToken = this.oauth2Client.credentials.refresh_token;
    let ok = true;

    if (refreshToken) {
      try {
        await this.oauth2Client.revokeToken(refreshToken);
      } catch {
        ok = false;
      }
    }

    try {
      if (fs.existsSync(this.tokenPath)) fs.unlinkSync(this.tokenPath);
    } catch {
      ok = false;
    }

    this.oauth2Client.setCredentials({});
    return ok;
  }
}

// CLI entry point
if (require.main === module) {
  const auth = new GoogleAuth();
  auth.authenticate().catch(console.error);
}
