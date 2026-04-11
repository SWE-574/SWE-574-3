import { getMapboxToken as getSharedMapboxToken } from "../constants/env";

export interface LocationValue {
  label: string;
  fullAddress?: string;
  district?: string;
  lat: number;
  lng: number;
}

interface MapboxContext {
  id: string;
  text: string;
}

interface MapboxFeature {
  id: string;
  text: string;
  place_name: string;
  place_type?: string[];
  center: [number, number];
  context?: MapboxContext[];
}

export function getMapboxToken(): string | undefined {
  return getSharedMapboxToken();
}

function extractDistrict(feature: MapboxFeature): string {
  const context = feature.context ?? [];
  const place = context.find((item) => item.id.startsWith("place."));
  if (place) return place.text;
  const locality = context.find((item) => item.id.startsWith("locality."));
  if (locality) return locality.text;
  if (feature.place_type?.includes("place")) return feature.text;
  return feature.text;
}

async function requestMapbox(url: string): Promise<MapboxFeature[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Mapbox request failed");
  }
  const data = (await response.json()) as { features?: MapboxFeature[] };
  return data.features ?? [];
}

export async function searchMapboxLocations(
  query: string,
  mode: "district" | "full" = "district",
): Promise<LocationValue[]> {
  const token = getMapboxToken();
  if (!token || query.trim().length < 2) return [];

  const url = [
    "https://api.mapbox.com/geocoding/v5/mapbox.places/",
    encodeURIComponent(query.trim()),
    ".json?access_token=",
    token,
    "&country=TR&types=address,neighborhood,locality,place,district",
    "&language=tr&limit=6",
    "&proximity=28.9784,41.0082",
  ].join("");

  const features = await requestMapbox(url);
  return features.map((feature) => {
    const [lng, lat] = feature.center;
    return {
      label: mode === "district" ? extractDistrict(feature) : feature.place_name,
      fullAddress: feature.place_name,
      district: extractDistrict(feature),
      lat,
      lng,
    };
  });
}

export async function reverseGeocodeLocation(
  lat: number,
  lng: number,
): Promise<LocationValue | null> {
  const token = getMapboxToken();
  if (!token) return null;

  const url = [
    "https://api.mapbox.com/geocoding/v5/mapbox.places/",
    encodeURIComponent(`${lng},${lat}`),
    ".json?access_token=",
    token,
    "&types=address,neighborhood,locality,place,district",
    "&language=tr&limit=1",
  ].join("");

  const [feature] = await requestMapbox(url);
  if (!feature) return null;

  return {
    label: extractDistrict(feature),
    fullAddress: feature.place_name,
    district: extractDistrict(feature),
    lat,
    lng,
  };
}
