/**
 * GBP Manager V2 — Main Entry Point
 * 
 * CLI and API for managing Google Business Profiles.
 * Supports multi-account agency management.
 */

import { GoogleAuth } from './auth/google-oauth';
import { ReviewsAPI } from './api/reviews';
import { PostsAPI } from './api/posts';
import { generateReply, hasRisk, ReplyContext } from './ai/reply-engine';
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
  const reviewsApi = new ReviewsAPI(client);
  const postsApi = new PostsAPI(client);

  console.log('🚀 GBP Manager V2');
  console.log('================\n');

  // List accounts
  const { google } = await import('googleapis');
  const mybusinessaccount = google.mybusinessaccountmanagement({ version: 'v1', auth: client });
  
  try {
    const accountsRes = await mybusinessaccount.accounts.list();
    const accounts = accountsRes.data.accounts || [];
    
    console.log(`📋 Cuentas GBP encontradas: ${accounts.length}\n`);
    
    for (const account of accounts) {
      console.log(`  📁 ${account.accountName} (${account.name})`);
      
      // List locations for this account
      const mybusiness = google.mybusiness({ version: 'v4', auth: client });
      const locationsRes = await mybusiness.accounts.locations.list({
        parent: account.name!,
        pageSize: 100,
      });
      
      const locations = locationsRes.data.locations || [];
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
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.message?.includes('insufficient')) {
      console.log('\n💡 Necesitas habilitar las APIs de Google Business Profile en Google Cloud Console.');
    }
  }
}

main().catch(console.error);
