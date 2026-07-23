import { SQL } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

export type AuthTableContract = Readonly<{
  name: string;
  columns: readonly Readonly<{
    name: string;
    sqlType: string;
    notNull: boolean;
    primary: boolean;
    unique: boolean;
    hasDefault: boolean;
    defaultValue: string | number | boolean | null;
    hasOnUpdate: boolean;
    enumValues: readonly string[] | undefined;
  }>[];
  foreignKeys: readonly Readonly<{
    columns: readonly string[];
    foreignTable: string;
    foreignColumns: readonly string[];
    onDelete: string | undefined;
  }>[];
  indexes: readonly Readonly<{
    columns: readonly string[];
    unique: boolean;
  }>[];
  checks: readonly string[];
  timestamps: readonly Readonly<{
    name: string;
    withTimezone: boolean;
  }>[];
}>;

export type AuthTableContractOptions = Readonly<{
  ignoreExtraIndexExpressions?: boolean;
}>;

const literalDefault = (value: unknown): string | number | boolean | null =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? value
    : null;

const indexedColumnName = (column: unknown): string => {
  const candidate = column as { name?: unknown };
  if (typeof candidate.name === "string") {
    return candidate.name;
  }
  throw new TypeError("Auth schema indexes must reference named columns");
};

export const tableContract = (
  table: Parameters<typeof getTableConfig>[0],
  options: AuthTableContractOptions = {}
): AuthTableContract => {
  const config = getTableConfig(table);
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      sqlType: column.getSQLType().replace(" with time zone", ""),
      notNull: column.notNull,
      primary: column.primary,
      unique: column.isUnique,
      hasDefault: column.default !== undefined,
      defaultValue: literalDefault(column.default),
      hasOnUpdate: typeof column.onUpdateFn === "function",
      enumValues: column.enumValues,
    })),
    foreignKeys: config.foreignKeys
      .map((foreignKey) => {
        const reference = foreignKey.reference();
        return {
          columns: reference.columns.map(({ name }) => name),
          foreignTable: getTableConfig(reference.foreignTable).name,
          foreignColumns: reference.foreignColumns.map(({ name }) => name),
          onDelete: foreignKey.onDelete,
        };
      })
      .sort((left, right) =>
        left.columns.join().localeCompare(right.columns.join())
      ),
    indexes: config.indexes
      .flatMap((index) => {
        if (
          options.ignoreExtraIndexExpressions === true &&
          index.config.columns.some((column) => column instanceof SQL)
        ) {
          return [];
        }
        return [
          {
            columns: index.config.columns.map(indexedColumnName),
            unique: index.config.unique,
          },
        ];
      })
      .sort((left, right) =>
        left.columns.join().localeCompare(right.columns.join())
      ),
    checks: config.checks.map(({ name }) => name).sort(),
    timestamps: config.columns
      .filter(({ name }) => name.endsWith("_at"))
      .map((column) => ({
        name: column.name,
        withTimezone: column.getSQLType().includes("with time zone"),
      })),
  };
};
