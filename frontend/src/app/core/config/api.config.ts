/** Resolves the backend API base URL for local-network operation. */
export function getApiBaseUrl(): string {
  return `http://${window.location.hostname}:3000/api`;
}
