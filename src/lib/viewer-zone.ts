import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_ZONE, isZone, ZONE_COOKIE, type ZoneId } from './timezones';

export async function viewerZone(): Promise<ZoneId> {
  const z = (await cookies()).get(ZONE_COOKIE)?.value;
  return isZone(z) ? z : DEFAULT_ZONE;
}
