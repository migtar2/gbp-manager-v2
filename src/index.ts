/**
 * GBP Manager V2 — Main Entry Point
 *
 * CLI y punto de entrada para gestionar Google Business Profiles.
 * Soporta gestión multi-cuenta desde una cuenta agencia.
 */

import { GoogleAuth } from './auth/google-oauth';
import { AccountsAPI } from './api/accounts';
import { LocationsAPI } from './api/locations';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const auth = new GoogleAuth();

  if (!auth.loadTokens()) {
    console.log('❌ No authentication token found.');
    console.log('Run: npm run auth');
    process.exit(1);
  }

  await auth.refreshIfNeeded();
  const client = auth.getClient();
  const accountsApi = new AccountsAPI(client);
  const locationsApi = new LocationsAPI(client);

  console.log('🚀 GBP Manager V2');
  console.log('================\n');

  try {
    const accounts = await accountsApi.listAccounts();

    console.log(`📋 Cuentas GBP encontradas: ${accounts.length}\n`);

    for (const account of accounts) {
      console.log(`  📁 ${account.accountName} (${account.name})`);

      const locations = await locationsApi.listAllLocations(
        account.name.replace(/^accounts\//, ''),
        { maxPages: 5 }
      );
      console.log(`     📍 Ubicaciones: ${locations.length}`);

      for (const location of locations.slice(0, 5)) {
        console.log(`        - ${location.title} (${location.name?.split('/').pop()})`);
      }

      if (locations.length > 5) {
        console.log(`        ... y ${locations.length - 5} más`);
      }
      console.log('');
    }

    console.log('✅ Listo. Usa el MCP server para gestionar con IA:');
    console.log('   npm run mcp');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', message);
    if (message?.includes('insufficient')) {
      console.log('\n💡 Necesitas habilitar las APIs de Google Business Profile en Google Cloud Console.');
    }
  }
}

main().catch(console.error);
