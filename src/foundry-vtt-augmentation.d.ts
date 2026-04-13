export {};

declare global {
  namespace foundry {
    namespace utils {
      function escapeHTML(str: string): string;
      function randomID(length?: number): string;
      function isNewerVersion(newer: string, current: string): boolean;
    }
  }
}
