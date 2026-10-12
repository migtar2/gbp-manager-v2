/**
 * Google Business Profile Locations API
 *
 * Cliente oficial `mybusinessbusinessinformation v1` del SDK googleapis
 * (sustituye al legacy v4 `accounts.locations.*` retirado — verificado
 * 2026-10-12). La API NO expone reseñas ni localPosts (ver reviews.ts /
 * posts.ts para esos endpoints REST).
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { clampPageSize } from './gbp-rest';

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
  private api;

  constructor(auth: OAuth2Client) {
    this.api = google.mybusinessbusinessinformation({ version: 'v1', auth });
  }

  /** Lista ubicaciones de una cuenta (una página). */
  async listLocations(
    accountId: string,
    options: { pageSize?: number; pageToken?: string; filter?: string } = {}
  ): Promise<{ locations: Location[]; nextPageToken?: string }> {
    const response = await this.api.accounts.locations.list({
      parent: `accounts/${accountId}`,
      pageSize: clampPageSize(options.pageSize, 100, 100),
      pageToken: options.pageToken,
      filter: options.filter,
    });

    return {
      locations: (response.data.locations as Location[]) || [],
      nextPageToken: response.data.nextPageToken ?? undefined,
    };
  }

  /** Lista TODAS las ubicaciones de una cuenta (paginación completa). */
  async listAllLocations(
    accountId: string,
    options: { pageSize?: number; maxPages?: number; filter?: string } = {}
  ): Promise<Location[]> {
    const maxPages = options.maxPages ?? 10;
    const all: Location[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.listLocations(accountId, {
        pageSize: options.pageSize,
        pageToken,
        filter: options.filter,
      });
      all.push(...response.locations);
      pageToken = response.nextPageToken;
      if (!pageToken) break;
    }

    return all;
  }

  /** Obtiene los detalles de una ubicación. */
  async getLocation(locationName: string): Promise<Location> {
    const response = await this.api.locations.get({
      name: locationName,
      readMask: 'name,title,storeCode,websiteUri,phoneNumbers,categories,address,latlng,verificationState,profileState',
    });
    return response.data as Location;
  }

  /** Obtiene los atributos de una ubicación. */
  async getAttributes(locationName: string): Promise<unknown> {
    const response = await this.api.locations.getAttributes({ name: locationName });
    return response.data;
  }

  /** Atributos disponibles para una categoría/país. */
  async getAvailableAttributes(
    categoryName: string,
    regionCode: string,
    languageCode: string = 'es'
  ): Promise<unknown[]> {
    const response = await this.api.attributes.list({
      categoryName,
      regionCode,
      languageCode,
    });
    return ((response.data as { attributeMetadata?: unknown[] }).attributeMetadata) || [];
  }
}
