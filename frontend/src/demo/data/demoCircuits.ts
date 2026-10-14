import type { Circuit } from '@/types/domain';

/**
 * Circuit facts (length, laps, corners) follow public figures. Outlines are
 * hand-drawn stylisations for the 3D/2D renderer, not surveyed geometry, and
 * reference lap times are rounded values used only to scale the simulation.
 */
export const CIRCUITS: Circuit[] = [
  {
    id: 'sakhir', name: 'Bahrain International Circuit', locality: 'Sakhir', country: 'Bahrain', countryCode: 'BHR',
    lengthKm: 5.412, laps: 57, corners: 15, type: 'permanent', referenceLap: 92.5,
    traits: { downforce: 0.5, topSpeed: 0.6, overtaking: 0.75, tyreWear: 0.8 },
    outline: [[0, 0], [2.2, 0], [2.6, 0.25], [2.45, 0.6], [2.0, 0.75], [1.6, 1.0], [1.9, 1.4], [2.5, 1.55], [2.9, 2.1], [2.6, 2.5], [1.9, 2.3], [1.3, 1.9], [0.7, 2.2], [0.2, 2.0], [-0.1, 1.4], [0.4, 1.0], [0.1, 0.6], [-0.3, 0.3]],
  },
  {
    id: 'jeddah', name: 'Jeddah Corniche Circuit', locality: 'Jeddah', country: 'Saudi Arabia', countryCode: 'KSA',
    lengthKm: 6.174, laps: 50, corners: 27, type: 'street', referenceLap: 89.5,
    traits: { downforce: 0.35, topSpeed: 0.9, overtaking: 0.6, tyreWear: 0.4 },
    outline: [[0, 0], [0.3, 0.4], [0.2, 0.9], [0.45, 1.3], [0.35, 2.0], [0.5, 2.8], [0.4, 3.6], [0.6, 4.3], [0.9, 4.6], [1.1, 4.3], [0.95, 3.5], [1.05, 2.6], [0.95, 1.6], [1.0, 0.8], [0.8, 0.2], [0.4, -0.2]],
  },
  {
    id: 'albert-park', name: 'Albert Park Circuit', locality: 'Melbourne', country: 'Australia', countryCode: 'AUS',
    lengthKm: 5.278, laps: 58, corners: 14, type: 'hybrid', referenceLap: 80.5,
    traits: { downforce: 0.55, topSpeed: 0.65, overtaking: 0.45, tyreWear: 0.45 },
    outline: [[0, 0], [1.4, -0.1], [1.8, 0.2], [1.7, 0.7], [2.2, 1.1], [2.6, 1.8], [2.3, 2.4], [1.6, 2.6], [1.1, 2.2], [0.6, 2.5], [0.1, 2.2], [-0.3, 1.5], [-0.1, 1.0], [-0.4, 0.5]],
  },
  {
    id: 'shanghai', name: 'Shanghai International Circuit', locality: 'Shanghai', country: 'China', countryCode: 'CHN',
    lengthKm: 5.451, laps: 56, corners: 16, type: 'permanent', referenceLap: 95.5,
    traits: { downforce: 0.6, topSpeed: 0.7, overtaking: 0.7, tyreWear: 0.65 },
    outline: [[0, 0], [1.2, 0], [1.65, 0.25], [1.6, 0.8], [1.2, 0.85], [1.15, 0.5], [0.8, 0.55], [0.5, 1.0], [0.9, 1.4], [1.6, 1.5], [2.8, 1.6], [3.1, 1.9], [2.7, 2.15], [1.6, 2.05], [0.6, 1.95], [0.0, 1.6], [-0.3, 1.0], [-0.3, 0.4]],
  },
  {
    id: 'imola', name: 'Autodromo Enzo e Dino Ferrari', locality: 'Imola', country: 'Italy', countryCode: 'ITA',
    lengthKm: 4.909, laps: 63, corners: 19, type: 'permanent', referenceLap: 77.5,
    traits: { downforce: 0.65, topSpeed: 0.55, overtaking: 0.25, tyreWear: 0.5 },
    outline: [[0, 0], [0.8, -0.2], [1.2, 0.0], [1.6, -0.1], [2.3, 0.1], [2.6, 0.5], [2.4, 0.9], [2.7, 1.3], [2.3, 1.6], [1.7, 1.5], [1.3, 1.8], [0.8, 1.6], [0.5, 1.2], [0.0, 1.0], [-0.4, 0.6], [-0.3, 0.2]],
  },
  {
    id: 'monaco', name: 'Circuit de Monaco', locality: 'Monte Carlo', country: 'Monaco', countryCode: 'MON',
    lengthKm: 3.337, laps: 78, corners: 19, type: 'street', referenceLap: 73.5,
    traits: { downforce: 1.0, topSpeed: 0.1, overtaking: 0.05, tyreWear: 0.2 },
    outline: [[0, 0], [0.5, 0.1], [0.7, 0.4], [1.0, 0.8], [1.3, 1.0], [1.4, 1.3], [1.2, 1.4], [1.0, 1.2], [0.9, 1.5], [0.4, 1.6], [-0.1, 1.3], [-0.6, 1.0], [-0.9, 0.6], [-0.7, 0.3], [-0.4, 0.35], [-0.3, 0.0]],
  },
  {
    id: 'catalunya', name: 'Circuit de Barcelona-Catalunya', locality: 'Montmeló', country: 'Spain', countryCode: 'ESP',
    lengthKm: 4.657, laps: 66, corners: 14, type: 'permanent', referenceLap: 76.5,
    traits: { downforce: 0.75, topSpeed: 0.5, overtaking: 0.35, tyreWear: 0.75 },
    outline: [[0, 0], [1.6, 0], [1.9, 0.3], [1.7, 0.6], [2.2, 1.0], [2.4, 1.5], [2.0, 1.8], [1.4, 1.5], [1.0, 1.8], [0.4, 1.7], [0.1, 1.3], [0.4, 0.9], [0.0, 0.6], [-0.3, 0.3]],
  },
  {
    id: 'villeneuve', name: 'Circuit Gilles Villeneuve', locality: 'Montréal', country: 'Canada', countryCode: 'CAN',
    lengthKm: 4.361, laps: 70, corners: 14, type: 'hybrid', referenceLap: 74.0,
    traits: { downforce: 0.3, topSpeed: 0.8, overtaking: 0.7, tyreWear: 0.45 },
    outline: [[0, 0], [0.4, 0.1], [0.6, 0.4], [0.5, 0.8], [0.7, 1.3], [0.6, 1.9], [0.8, 2.4], [0.7, 3.0], [0.85, 3.6], [0.7, 3.85], [0.5, 3.6], [0.4, 2.9], [0.3, 2.0], [0.15, 1.2], [0.0, 0.6], [-0.2, 0.3]],
  },
  {
    id: 'spielberg', name: 'Red Bull Ring', locality: 'Spielberg', country: 'Austria', countryCode: 'AUT',
    lengthKm: 4.318, laps: 71, corners: 10, type: 'permanent', referenceLap: 66.5,
    traits: { downforce: 0.4, topSpeed: 0.75, overtaking: 0.7, tyreWear: 0.55 },
    outline: [[0, 0], [1.0, 0.2], [1.3, 0.5], [1.0, 0.7], [0.2, 1.6], [-0.1, 1.7], [-0.2, 1.4], [0.2, 1.0], [0.0, 0.85], [-0.5, 1.1], [-0.8, 0.9], [-0.6, 0.4], [-0.4, 0.05]],
  },
  {
    id: 'silverstone', name: 'Silverstone Circuit', locality: 'Silverstone', country: 'United Kingdom', countryCode: 'GBR',
    lengthKm: 5.891, laps: 52, corners: 18, type: 'permanent', referenceLap: 88.0,
    traits: { downforce: 0.7, topSpeed: 0.7, overtaking: 0.6, tyreWear: 0.7 },
    outline: [[0, 0], [0.9, 0.2], [1.3, 0.6], [1.1, 1.0], [1.5, 1.3], [2.2, 1.2], [2.6, 1.6], [2.3, 2.1], [1.6, 2.3], [1.0, 2.6], [0.4, 2.3], [0.6, 1.8], [0.2, 1.4], [-0.3, 1.5], [-0.6, 1.0], [-0.4, 0.5]],
  },
  {
    id: 'spa', name: 'Circuit de Spa-Francorchamps', locality: 'Stavelot', country: 'Belgium', countryCode: 'BEL',
    lengthKm: 7.004, laps: 44, corners: 19, type: 'permanent', referenceLap: 106.0,
    traits: { downforce: 0.4, topSpeed: 0.9, overtaking: 0.75, tyreWear: 0.55 },
    outline: [[0, 0], [0.2, 0.25], [0.6, 0.4], [1.2, 0.9], [1.9, 1.6], [2.3, 1.7], [2.4, 1.4], [2.0, 1.1], [2.2, 0.6], [2.6, 0.2], [2.4, -0.3], [1.8, -0.4], [1.2, -0.7], [0.6, -0.6], [0.3, -0.3], [-0.1, -0.3], [-0.15, -0.05]],
  },
  {
    id: 'zandvoort', name: 'Circuit Zandvoort', locality: 'Zandvoort', country: 'Netherlands', countryCode: 'NED',
    lengthKm: 4.259, laps: 72, corners: 14, type: 'permanent', referenceLap: 72.0,
    traits: { downforce: 0.85, topSpeed: 0.35, overtaking: 0.2, tyreWear: 0.6 },
    outline: [[0, 0], [1.0, 0], [1.3, 0.3], [1.0, 0.5], [0.6, 0.7], [0.9, 1.1], [1.4, 1.0], [1.8, 1.3], [1.6, 1.7], [1.0, 1.8], [0.4, 1.6], [0.1, 1.2], [-0.3, 1.0], [-0.4, 0.5]],
  },
  {
    id: 'monza', name: 'Autodromo Nazionale Monza', locality: 'Monza', country: 'Italy', countryCode: 'ITA',
    lengthKm: 5.793, laps: 53, corners: 11, type: 'permanent', referenceLap: 82.0,
    traits: { downforce: 0.1, topSpeed: 1.0, overtaking: 0.8, tyreWear: 0.4 },
    outline: [[0, 0], [1.9, 0], [2.1, 0.08], [2.25, -0.02], [2.6, 0.2], [2.9, 0.7], [2.95, 1.1], [2.8, 1.25], [2.85, 1.5], [2.6, 1.8], [2.3, 1.75], [1.9, 1.5], [1.3, 1.3], [1.0, 1.15], [0.8, 1.2], [0.2, 1.1], [-0.3, 0.8], [-0.4, 0.35], [-0.2, 0.05]],
  },
  {
    id: 'cota', name: 'Circuit of the Americas', locality: 'Austin', country: 'United States', countryCode: 'USA',
    lengthKm: 5.513, laps: 56, corners: 20, type: 'permanent', referenceLap: 96.0,
    traits: { downforce: 0.6, topSpeed: 0.65, overtaking: 0.65, tyreWear: 0.7 },
    outline: [[0, 0], [0.1, 0.5], [-0.1, 0.7], [0.3, 1.1], [0.7, 1.1], [1.0, 1.4], [1.4, 1.3], [1.6, 1.6], [2.0, 1.5], [3.2, 1.0], [3.4, 0.7], [3.0, 0.55], [2.5, 0.5], [2.3, 0.2], [1.8, 0.3], [1.4, 0.0], [0.8, -0.2], [0.3, -0.25]],
  },
  {
    id: 'interlagos', name: 'Autódromo José Carlos Pace', locality: 'São Paulo', country: 'Brazil', countryCode: 'BRA',
    lengthKm: 4.309, laps: 71, corners: 15, type: 'permanent', referenceLap: 72.0,
    traits: { downforce: 0.55, topSpeed: 0.6, overtaking: 0.75, tyreWear: 0.55 },
    outline: [[0, 0], [-0.3, 0.3], [-0.15, 0.6], [0.3, 0.65], [0.9, 0.9], [1.4, 1.3], [1.6, 1.0], [1.3, 0.6], [1.0, 0.45], [0.8, 0.1], [1.1, -0.2], [1.5, -0.1], [1.7, -0.4], [1.4, -0.7], [0.6, -0.5], [0.3, -0.3]],
  },
  {
    id: 'yas-marina', name: 'Yas Marina Circuit', locality: 'Abu Dhabi', country: 'United Arab Emirates', countryCode: 'UAE',
    lengthKm: 5.281, laps: 58, corners: 16, type: 'permanent', referenceLap: 86.0,
    traits: { downforce: 0.6, topSpeed: 0.6, overtaking: 0.5, tyreWear: 0.45 },
    outline: [[0, 0], [0.6, 0.1], [0.8, 0.4], [0.5, 0.7], [0.6, 1.2], [1.4, 1.6], [2.6, 2.0], [2.8, 1.8], [2.2, 1.3], [1.8, 0.9], [1.9, 0.5], [1.6, 0.2], [1.2, 0.0], [1.0, -0.3], [0.5, -0.4], [0.1, -0.25]],
  },
];

export const CIRCUIT_BY_ID: Record<string, Circuit> = Object.fromEntries(CIRCUITS.map((c) => [c.id, c]));
