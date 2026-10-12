/**
 * Google Business Profile Locations API
 * 
 * Manages business location data including info, attributes, and categories.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface Location {
  name: string;
  title: string;
  storeCode?: string;
  websiteUri?: string;
  phoneNumbers?: { primaryPhone?: string };
  categories?: { primaryCategory?: { displayName: string } };
  address?: {
    addressLines?: string[];
    locality?: string;
    postalCode?: string;
    regionCode?: string;
  };
  latlng?: { latitude: number; longitude: number };
  verificationState: string;
  profileState: string;
}

export class LocationsAPI {
  private mybusiness: any;
  private mybusinessbusiness: any;

  constructor(auth: OAuth2Client) {
    this.mybusiness = google.mybusiness({ version: 'v4', auth });
    this.mybusinessbusiness = google.mybusinessbusinessinformation({ version: 'v1', auth });
  }

  /**
   * List locations for an account
   */
  async listLocations(
    accountId: string,
    options: { pageSize?: number; pageToken?: string; filter?: string } = {}
  ): Promise<{ locations: Location[]; nextPageToken?: string }> {
    const response = await this.mybusiness.accounts.locations.list({
      parent: `accounts/${accountId}`,
      pageSize: options.pageSize || 100,
      pageToken: options.pageToken,
      filter: options.filter,
    });

    return {
      locations: response.data.locations || [],
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Get location details
   */
  async getLocation(locationName: string): Promise<Location> {
    const response = await this.mybusiness.accounts.locations.get({
      name: locationName,
    });
    return response.data;
  }

  /**
   * Get location attributes
   */
  async getAttributes(locationName: string): Promise<any> {
    const response = await this.mybusinessbusiness.locations.getAttributes({
      name: locationName,
    });
    return response.data;
  }

  /**
   * Get available attributes for a category/country
   */
  async getAvailableAttributes(
    categoryName: string,
    regionCode: string,
    languageCode: string = 'es'
  ): Promise<any> {
    const response = await this.mybusinessbusiness.attributes.list({
      categoryName,
      regionCode,
      languageCode,
    });
    return response.data.attributes || [];
  }
}
