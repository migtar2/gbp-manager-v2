/**
 * Google Business Profile Accounts API
 *
 * Cliente oficial `mybusinessaccountmanagement v1` del SDK googleapis
 * (sustituye al legacy v4 `accounts.list` retirado — verificado 2026-10-12).
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { clampPageSize } from './gbp-rest';

export interface Account {
  name: string;
  accountName: string;
  type: 'PERSONAL' | 'ORGANIZATION';
  role: 'OWNER' | 'MEMBER';
  verificationState: string;
}

export class AccountsAPI {
  private api;

  constructor(auth: OAuth2Client) {
    this.api = google.mybusinessaccountmanagement({ version: 'v1', auth });
  }

  /** Lista todas las cuentas GBP accesibles (con paginación completa). */
  async listAccounts(options: { pageSize?: number; maxPages?: number } = {}): Promise<Account[]> {
    const pageSize = clampPageSize(options.pageSize, 100, 100);
    const maxPages = options.maxPages ?? 10;
    const all: Account[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.api.accounts.list({ pageSize, pageToken });
      all.push(...((response.data.accounts as Account[]) || []));
      pageToken = response.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    return all;
  }

  /** Obtiene una cuenta concreta. */
  async getAccount(accountName: string): Promise<Account> {
    const response = await this.api.accounts.get({ name: accountName });
    return response.data as Account;
  }
}
