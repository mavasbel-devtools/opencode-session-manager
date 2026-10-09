import { customType } from "drizzle-orm/sqlite-core"

/**
 * A column whose values pass through untouched, for columns declared without a type (or with one
 * SQLite gives no fixed affinity): whatever the store holds is read and written back as is.
 */
export const value = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => "",
  toDriver: (input) => input,
  fromDriver: (stored) => stored,
})

/**
 * An INTEGER-affinity column read as BigInt: the store engine reads every integer exactly, so the
 * typed value says so too (a timestamp or a counter beyond 2^53 survives a copy unchanged).
 */
export const bigInteger = customType<{ data: bigint; driverData: bigint | number }>({
  dataType: () => "integer",
  toDriver: (input) => input,
  fromDriver: (stored) => BigInt(stored),
})
