// Type declaration for the generated migrations bundle so TypeScript can import it.
declare const migrations: {
  journal: {
    version: string;
    dialect: string;
    entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
  };
  migrations: Record<string, string>;
};
export default migrations;
