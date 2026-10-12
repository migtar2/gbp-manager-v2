/**
 * Google Business Profile Accounts API
 * 
 * Manages GBP accounts and user access.
 * Supports agency accounts that manage multiple business profiles.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface Account {
  name: string;
  accountName: string;
  type: 'PERSONAL' | 'ORGANIZATION';
  role: 'OWNER' | 'MEMBER';
  verificationState: string;
}

export class AccountsAPI {
  private mybusinessaccount: any;

  constructor(auth: OAuth2Client) {
    this.mybusinessaccount = google.mybusinessaccountmanagement({
      version: 'v1',
      auth,
    });
  }

  /**
   * List all accessible GBP accounts
   */
  async listAccounts(): Promise<Account[]> {
    const response = await this.mybusinessaccount.accounts.list();
    return response.data.accounts || [];
  }

  /**
   * Get a specific account
   */
  async getAccount(accountName: string): Promise<Account> {
    const response = await this.mybusinessaccount.accounts.get({
      name: accountName,
    });
    return response.data;
  }

  /**
   * List locations for an account
   */
  async listLocations(accountName: string): Promise<any[]> {
    const mybusiness = google.mybusiness({
      version: 'v4',
      auth: this.mybusinessaccount.auth,
    });

    const response = await mybusiness.accounts.locations.list({
      parent: accountName,
      pageSize: 100,
    });

    return response.data.locations || [];
  }
}
