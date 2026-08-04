/**
 * Domain Type Definitions for Truliva WebApp Frontend
 * Strongly-typed models for JSON and dynamic structures
 */

export interface CustomCosts {
  baoHanhCost?: number;
  suaChuaCost?: number;
  giaoHangCost?: number;
  lapDatCost?: number;
  giaoLapCost?: number;
  thayLocCost?: number;
  distanceCost?: number;
  otherCost?: number;
  [key: string]: number | undefined;
}

export interface WarehouseInfo {
  id?: string;
  name?: string;
  code?: string;
  address?: string;
}

export interface KtvServiceRateMatrix {
  id?: string;
  ktvUserId?: string;
  province?: string;
  stationName?: string;
  mainStationName?: string;
  baoHanhRate?: number | null;
  suaChuaRate?: number | null;
  giaoHangRate?: number | null;
  lapDatRate?: number | null;
  giaoLapRate?: number | null;
  thayLocRate?: number | null;
  distanceRate?: number | null;
  otherRate?: number | null;
  updatedAt?: string | Date;
}

export interface StationGroupTree {
  mainStationName: string;
  stations: Array<{
    key: string;
    name: string;
  }>;
}
