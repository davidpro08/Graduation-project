import type { AuthUser } from '../auth/auth.types';

export const dimensions = ['ageGroup', 'sex', 'province', 'education', 'maritalStatus', 'familyType', 'occupation', 'district', 'bachelorsField', 'housingType', 'militaryStatus'] as const;
export type Dimension = typeof dimensions[number];
export type PersonaFilters = Partial<Record<Dimension, string[]>>;
export type PersonaProfile = { id: string; age: number; name?: string; sex: string; province: string; education: string; occupation: string; ageGroup: string } & Partial<Record<Dimension, string>>;
export interface Persona extends PersonaProfile { persona: string }
export interface PersonaContext { user: AuthUser; conversationId: string }
export interface PersonaSelection { eligible: number; personas: Persona[] }
export interface FacetQuery { province?: string[]; occupationSearch?: string; page?: number }
export interface PersonaFacets {
  values: Record<Dimension, string[]>;
  occupation: { total: number; page: number; pageSize: number; search: string };
  population: number; age: { min: number; max: number };
}
export interface PersonaPage { items: Persona[]; total: number; page: number; pageSize: number }
export const PERSONA_SOURCE = Symbol('PERSONA_SOURCE');
export interface PersonaSource {
  facets(context: PersonaContext, query?: FacetQuery): Promise<PersonaFacets>;
  select(filters: PersonaFilters, seed: string, previewOnly: boolean, context: PersonaContext): Promise<PersonaSelection>;
  browse(filters: PersonaFilters, page: number, pageSize: number, context: PersonaContext): Promise<PersonaPage>;
}
export function dimensionValue(profile: PersonaProfile, key: Dimension): string { return profile[key] || '미상'; }
