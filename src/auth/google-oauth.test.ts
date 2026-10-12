import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GoogleAuth, generateStateToken } from './google-oauth';

describe('generateStateToken', () => {
  it('genera tokens aleatorios de 64 hex', () => {
    const a = generateStateToken();
    const b = generateStateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('GoogleAuth — almacén de tokens', () => {
  let dir: string;
  let tokenPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gbp-oauth-test-'));
    tokenPath = path.join(dir, 'token.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saveTokens escribe con permisos restrictivos en Unix', () => {
    const auth = new GoogleAuth({ tokenPath });
    auth.saveTokens({ refresh_token: 'rt', access_token: 'at', expiry_date: 1 });

    expect(fs.existsSync(tokenPath)).toBe(true);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(tokenPath).mode & 0o777;
      expect(mode).toBe(0o600);
    }

    // El contenido no debe aparecer en logs; aquí solo comprobamos que se
    // persiste el token para que loadTokens funcione.
    const auth2 = new GoogleAuth({ tokenPath });
    expect(auth2.loadTokens()).toBe(true);
    expect(auth2.getClient().credentials.refresh_token).toBe('rt');
  });

  it('loadTokens devuelve false si no hay token', () => {
    const auth = new GoogleAuth({ tokenPath });
    expect(auth.loadTokens()).toBe(false);
  });

  it('loadTokens devuelve false con token corrupto sin lanzar', () => {
    fs.writeFileSync(tokenPath, '{esto no es json', { mode: 0o600 });
    const auth = new GoogleAuth({ tokenPath });
    expect(auth.loadTokens()).toBe(false);
  });

  it('revoke elimina el token local aunque no haya refresh_token remoto', async () => {
    const auth = new GoogleAuth({ tokenPath });
    auth.saveTokens({ access_token: 'at' });
    expect(fs.existsSync(tokenPath)).toBe(true);

    const ok = await auth.revoke();
    expect(ok).toBe(true);
    expect(fs.existsSync(tokenPath)).toBe(false);
    expect(auth.loadTokens()).toBe(false);
  });
});
