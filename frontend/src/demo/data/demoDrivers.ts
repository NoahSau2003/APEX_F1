import type { Driver, Team } from '@/types/domain';

/**
 * DEMO DATA. Teams and drivers are fictional so that simulated results can
 * never be mistaken for real Formula 1 records. Replace via the data service.
 */
export const TEAMS: Team[] = [
  { id: 'halcyon', name: 'Halcyon Racing', short: 'HAL', color: '#d9761a', powerUnit: 'Halcyon HX-6', base: 'Woking, UK' },
  { id: 'northvale', name: 'Northvale GP', short: 'NVL', color: '#4c8dff', powerUnit: 'Kessel V6', base: 'Milton Keynes, UK' },
  { id: 'arclight', name: 'Arclight Scuderia', short: 'ARC', color: '#e5484d', powerUnit: 'Arclight 066', base: 'Maranello, IT' },
  { id: 'meridian', name: 'Meridian F1', short: 'MER', color: '#14a08a', powerUnit: 'Meridian M17', base: 'Brackley, UK' },
  { id: 'stratos', name: 'Stratos Motorsport', short: 'STR', color: '#9a78f0', powerUnit: 'Kessel V6', base: 'Silverstone, UK' },
  { id: 'volta', name: 'Volta Racing', short: 'VOL', color: '#ad8c00', powerUnit: 'Meridian M17', base: 'Enstone, UK' },
  { id: 'tidewater', name: 'Tidewater', short: 'TDW', color: '#2496c8', powerUnit: 'Arclight 066', base: 'Grove, UK' },
  { id: 'orbis', name: 'Orbis Team', short: 'ORB', color: '#d4529a', powerUnit: 'Halcyon HX-6', base: 'Faenza, IT' },
  { id: 'kestrel', name: 'Kestrel F1', short: 'KST', color: '#4f9d3a', powerUnit: 'Kessel V6', base: 'Hinwil, CH' },
  { id: 'cinder', name: 'Cinder Racing', short: 'CDR', color: '#b5654a', powerUnit: 'Arclight 066', base: 'Kannapolis, US' },
];

export const DRIVERS: Driver[] = [
  { id: 'reid', code: 'REI', number: 4, firstName: 'Callum', lastName: 'Reid', teamId: 'halcyon', nationality: 'GBR' },
  { id: 'brandt', code: 'BRA', number: 81, firstName: 'Noah', lastName: 'Brandt', teamId: 'halcyon', nationality: 'AUS' },
  { id: 'voss', code: 'VOS', number: 1, firstName: 'Adrian', lastName: 'Voss', teamId: 'northvale', nationality: 'NED' },
  { id: 'sakai', code: 'SAK', number: 22, firstName: 'Haruto', lastName: 'Sakai', teamId: 'northvale', nationality: 'JPN' },
  { id: 'ferrand', code: 'FER', number: 16, firstName: 'Luca', lastName: 'Ferrand', teamId: 'arclight', nationality: 'MON' },
  { id: 'lindqvist', code: 'LIN', number: 7, firstName: 'Oskar', lastName: 'Lindqvist', teamId: 'arclight', nationality: 'SWE' },
  { id: 'moreau', code: 'MOR', number: 63, firstName: 'Elias', lastName: 'Moreau', teamId: 'meridian', nationality: 'FRA' },
  { id: 'valdes', code: 'VAL', number: 12, firstName: 'Tomás', lastName: 'Valdés', teamId: 'meridian', nationality: 'ESP' },
  { id: 'juhola', code: 'JUH', number: 27, firstName: 'Mikael', lastName: 'Juhola', teamId: 'stratos', nationality: 'FIN' },
  { id: 'duarte', code: 'DUA', number: 5, firstName: 'Rafael', lastName: 'Duarte', teamId: 'stratos', nationality: 'BRA' },
  { id: 'lacombe', code: 'LAC', number: 10, firstName: 'Pierre', lastName: 'Lacombe', teamId: 'volta', nationality: 'FRA' },
  { id: 'whitfield', code: 'WHI', number: 30, firstName: 'Jonah', lastName: 'Whitfield', teamId: 'volta', nationality: 'NZL' },
  { id: 'hartmann', code: 'HAR', number: 87, firstName: 'Leon', lastName: 'Hartmann', teamId: 'tidewater', nationality: 'GER' },
  { id: 'mehta', code: 'MEH', number: 43, firstName: 'Arjun', lastName: 'Mehta', teamId: 'tidewater', nationality: 'IND' },
  { id: 'ibarra', code: 'IBA', number: 11, firstName: 'Santiago', lastName: 'Ibarra', teamId: 'orbis', nationality: 'MEX' },
  { id: 'achterberg', code: 'ACH', number: 18, firstName: 'Felix', lastName: 'Achterberg', teamId: 'orbis', nationality: 'BEL' },
  { id: 'orlov', code: 'ORL', number: 31, firstName: 'Dmitri', lastName: 'Orlov', teamId: 'kestrel', nationality: 'EST' },
  { id: 'carver', code: 'CAR', number: 6, firstName: 'Ethan', lastName: 'Carver', teamId: 'kestrel', nationality: 'USA' },
  { id: 'nakamura', code: 'NAK', number: 23, firstName: 'Kai', lastName: 'Nakamura', teamId: 'cinder', nationality: 'CAN' },
  { id: 'ebner', code: 'EBN', number: 77, firstName: 'Matthias', lastName: 'Ebner', teamId: 'cinder', nationality: 'AUT' },
];
