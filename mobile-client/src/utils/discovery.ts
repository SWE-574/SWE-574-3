import type { Service } from "../api/types";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function isInPersonService(service: Service): boolean {
  const value = (service.location_type ?? "").toLowerCase();
  return value.includes("in-person") || value.includes("in person");
}

export function isOnlineService(service: Service): boolean {
  const value = (service.location_type ?? "").toLowerCase();
  return value === "online" || value === "remote";
}

export function isRecurringService(service: Service): boolean {
  return (service.schedule_type ?? "").toLowerCase() === "recurrent";
}

export function getCapacityRatio(service: Service): number {
  const participantCount = service.participant_count ?? 0;
  const maxParticipants = service.max_participants ?? 0;

  if (maxParticipants <= 0) {
    return 0;
  }

  return participantCount / maxParticipants;
}

export function isNearlyFullService(service: Service): boolean {
  const isGroupListing =
    service.type === "Event" ||
    (service.type === "Offer" && (service.max_participants ?? 0) > 1);

  const ratio = getCapacityRatio(service);
  return isGroupListing && ratio >= 0.75 && ratio < 1;
}

export function getServiceDistanceKm(
  service: Service,
  coordinates: Coordinates | null,
): number | null {
  if (!coordinates || !service.location_lat || !service.location_lng) {
    return null;
  }

  const latitude = Number(service.location_lat);
  const longitude = Number(service.location_lng);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(latitude - coordinates.latitude);
  const dLng = toRadians(longitude - coordinates.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coordinates.latitude)) *
      Math.cos(toRadians(latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function formatDistanceKm(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.max(100, Math.round(distanceKm * 1000))} m away`;
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km away`;
}
