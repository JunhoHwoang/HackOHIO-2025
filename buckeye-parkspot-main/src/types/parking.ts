export type PermitType = 'A' | 'B' | 'C' | 'West Campus' | 'Visitor' | 'Staff';
export type StallStatus = 'open' | 'occupied' | 'unknown';
export type PaymentMethod = 'ParkMobile' | 'Meter' | 'Free';

export interface Stall {
  id: string;
  polygon: [number, number][];
  status: StallStatus;
  confidence?: number;
  permit: PermitType[];
  attributes?: {
    ada?: boolean;
    ev?: boolean;
    compact?: boolean;
  };
}

export interface LotAccess {
  id: string;
  kind: 'entrance' | 'exit';
  name: string;
  location: { lat: number; lng: number };
  address?: string;
}

export interface Lot {
  id: string;
  name: string;
  code: string;
  location: { lat: number; lng: number };
  capacity: number;
  occupied: number;
  open: number;
  permits: PermitType[];
  payment: PaymentMethod[];
  parkMobileZone?: string;
  pricing?: {
    hourly?: number;
    max?: number;
    notes?: string;
  };
  imageUrl?: string;
  updatedAt: string;
  source: 'camera' | 'manual' | 'osu_feed';
  stalls?: Stall[];
  entrances?: LotAccess[];
  exits?: LotAccess[];
  distance?: number; // in meters
  walkingTime?: number; // in minutes
}

export interface LotSnapshot {
  at: string;
  source: string;
  counts: {
    total: number;
    occupied: number;
    open: number;
    unknown: number;
  };
}
