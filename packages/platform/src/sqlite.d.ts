declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      get(...args: unknown[]): unknown;
      all(...args: unknown[]): unknown[];
      run(...args: unknown[]): { changes: number };
    };
    close(): void;
  }
}
