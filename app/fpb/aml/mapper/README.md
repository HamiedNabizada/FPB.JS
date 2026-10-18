# FpbMapper in JavaScript

Port of the C# FpbMapper (`AML/fpb-aml-mapper/dotnet/FpbMapper.Conversion`) on
AmlEngine.js (`amlengine-js`, a port of Aml.Engine 4.5.2). It converts FPB.js
JSON to AutomationML and back, and writes an edited model into an existing AML
document without touching the rest of it (`UpdateInPlace`). Feature 028 in
FPB.JS_Docs.

The C# mapper is the reference. `tools/aml-oracle` runs it over
`tests/unit/aml/oracle/inputs` and writes the expected results;
`tests/unit/aml/oracle.test.js` runs this port over the same inputs and compares
AML byte for byte (random GUIDs of Aml.Engine numbered), JSON by content and
warnings exactly.

`LastWritingDateTime` is written in the local time of the machine, as
Aml.Engine does. The expected files were made in Europe/Berlin, so the unit
tests run in that zone (`tests/setup/unit.js`); regenerate them on a machine
in that zone or the comparison fails on that one attribute.

## Files

| C# | JavaScript |
|---|---|
| `MapperEnvironment.cs` | `environment.js` |
| `FpbTypes.cs`, `IdentificationSchema.cs`, `ElementMetadata.cs` | `types.js` |
| `FpbMappings.cs`, constants of `MapperOptions.cs` and `DiagramInterchangeLibrary.cs` | `mappings.js` |
| `MapperOptions.cs` (options, `MapperTrace`) | `options.js` |
| `ReferenceTypes.cs` | `references.js` |
| `CaexElementWalker.cs` | `walker.js` |
| `DiagramInterchangeLibrary.cs` | `diagramInterchange.js` |
| `FpdLibraries.cs` | `libraries.js` |
| `Models/FpbModels.cs` | `models.js` |
| the ID helpers of `FpbJsonToCaex.cs` | `ids.js` |
| `CaexToFpbJson.cs` | `CaexToFpbJson.js` |
| `FpbJsonToCaex.cs` | `FpbJsonToCaex.js` |

Not ported: `CoverageReport.cs`, `MappingTableExport.cs`, `FpbValidationRules.cs`
and the OCL rules (validation, not conversion).

## Rules

- **Same behaviour, same order.** One JS function per C# method, in the same
  order, with the C# name in camel case (`UpdateInPlace` is `updateInPlace`,
  private helpers too). Keep the order of every write to the document: the
  saved file must be identical.
- **Engine API** follows C# in camel case (`CAEXFile` is `caexFile`,
  `RefBaseSystemUnitPath` is `refBaseSystemUnitPath`, `OriginID` is `originID`).
  Indexers are `item(...)` (`ie.Attribute["x"]` is `ie.attribute.item('x')`,
  `lib[name]` is `lib.item(name)`); sequences are iterable and have `append`,
  `insert`. See `node_modules/amlengine-js/dist/index.d.ts` and the engine's
  `docs/PORTING.md`. Extension methods are instance methods (`doc.findByPath`).
- **GUIDs and time** only through `environment.js` (`newGuid()`, `utcNow()`)
  and `ids.js` (`newId()` for `Guid.NewGuid().ToString("B")`,
  `deriveSubProcessId`, `deriveBoundaryStateId`). Never `crypto.randomUUID`.
- **Numbers**: `double.ToString(InvariantCulture)` and `$"{double}"` are
  `system.formatDouble(v)`; `double.TryParse(s, NumberStyles.Any,
  InvariantCulture, out x)` is `system.tryParseDouble(s, NumberStyles.Any)`
  (null when it fails; `const { NumberStyles } = system`); `int.TryParse` is
  `system.tryParseInt32(s)`. Integers in interpolated strings: `String(n)`.
- **Collections**: `Dictionary` and `HashSet` are `Map` and `Set` (both keep
  insertion order, as C# does without removals). `StringComparer.OrdinalIgnoreCase`
  keys: store and look up with `.toLowerCase()` (or a small helper map), and
  keep the original key where it is written out. LINQ `OrderBy` is stable, so is
  `Array.prototype.sort`. `First()` without a match throws, `FirstOrDefault()`
  gives null.
- **Strings**: `string.IsNullOrEmpty(s)` is `!s` for strings and null;
  `?.` and `??` as in C#; string concatenation with null gives "" in C#
  (`'a' + (x ?? '')`). Comparisons are ordinal unless C# says otherwise.
- **Results** are `{ value, warnings }` (`ConversionResult<T>`); warnings are
  the same strings as in C#.
- **JSON out** (`CaexToFpbJson`): build the object the C# serializer writes
  (same properties, null where C# writes null, absent where C# omits it) and
  `JSON.stringify(obj, null, 2)`. Content is compared, not bytes.
- **JSON in**: `models.js` (`parseFpbJson`) keeps the raw text of numbers,
  as the C# parser does.
- **Comments**: keep the C# comments that explain why, shortened; no history.
