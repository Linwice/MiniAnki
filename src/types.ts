export interface PublicSettings {
  baseUrl: string;
  hasApiKey: boolean;
}

export interface HealthStatus {
  apiVersion: number;
  inReview: boolean;
}

export interface CurrentCard {
  question: string;
  answer: string;
  css: string;
  deckName: string;
  modelName: string;
  cardId: number;
  buttons: number[];
}

export interface CachedMedia {
  filename: string;
  path: string;
  sha256: string;
}

