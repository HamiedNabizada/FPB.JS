import { DateTime, DateTimeKind, Guid } from 'amlengine-js';

/**
 * Port of MapperEnvironment.cs: the two things the mapper takes from outside,
 * new GUIDs and the current time. Random and the clock by default; the
 * comparison with the C# mapper (tests/unit/aml) sets the same fixed sources
 * as tools/aml-oracle.
 */

let newGuidSource = null;
let utcNowSource = null;

/** A new GUID (engine Guid), random unless a scope set a source */
export function newGuid() {
  return newGuidSource ? newGuidSource() : Guid.newGuid();
}

/** The current UTC time (engine DateTime), unless a scope set a source */
export function utcNow() {
  return utcNowSource ? utcNowSource() : DateTime.utcNow;
}

/**
 * Use `guidSource` and `nowSource` until the returned function is called.
 * Unlike the AsyncLocal of C#, the scope is global: the mapper runs
 * synchronously, so a scope around one call covers exactly that call.
 */
export function useEnvironment(guidSource, nowSource) {
  const previous = [newGuidSource, utcNowSource];
  newGuidSource = guidSource;
  utcNowSource = nowSource;
  return function restore() {
    [newGuidSource, utcNowSource] = previous;
  };
}

/** The fixed sources of tools/aml-oracle: GUID n and 2026-01-01T00:00:00Z */
export function fixedEnvironment() {
  let n = 0;
  return useEnvironment(
    () => Guid.parse('00000000-0000-4000-8000-' + (++n).toString(16).padStart(12, '0')),
    () => new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)
  );
}
