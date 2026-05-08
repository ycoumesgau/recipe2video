import type { Json } from "./database.types";

export function toJson(value: unknown): Json {
  return value as Json;
}

export function fromJson<T>(value: Json | null | undefined): T | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value as T;
}
