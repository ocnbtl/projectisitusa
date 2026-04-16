declare module "zipcodes" {
  export interface ZipLookup {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
  }

  export function lookup(zip: string | number): ZipLookup | undefined;
}
