// Oracle for the JavaScript port of the FpbMapper (app/fpb/aml/mapper).
//
// The C# mapper (AML/fpb-aml-mapper) is the reference. This program runs it
// over the inputs in tests/unit/aml/oracle/inputs and writes what it produces
// to tests/unit/aml/oracle/expected, together with a manifest of all cases
// (cases.json). The Vitest suite runs the port over the same inputs and
// compares: AML byte for byte after saving, JSON by content, warnings exactly.
//
// New GUIDs and the time come from MapperEnvironment with fixed sources per
// case (GUID n is 00000000-0000-4000-8000-<n as 12 hex digits>, the time is
// 2026-01-01T00:00:00Z); the port uses the same sources. Only IDs Aml.Engine
// generates itself (CreateClassInstance) stay random and are masked there.
//
//   dotnet run -- collect   copy the source models into inputs/ (once, or when they change)
//   dotnet run              generate the derived inputs and all expected outputs

using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Aml.Engine.CAEX;
using FpbMapper.Conversion;

var root = FindRepoRoot();
var oracleDir = Path.Combine(root, "tests", "unit", "aml", "oracle");
var inputs = Path.Combine(oracleDir, "inputs");
var expected = Path.Combine(oracleDir, "expected");

if (args.Length > 0 && args[0] == "collect")
{
    Collect(root, inputs);
    return;
}

if (Directory.Exists(expected)) Directory.Delete(expected, recursive: true);
Directory.CreateDirectory(expected);
var generated = Path.Combine(inputs, "generated");
if (Directory.Exists(generated)) Directory.Delete(generated, recursive: true);
Directory.CreateDirectory(generated);

var cases = new List<JsonObject>();
var edits = EditList();
var jsonInputs = Directory.GetFiles(Path.Combine(inputs, "json"), "*.json").OrderBy(f => f, StringComparer.Ordinal).ToList();
var amlInputs = Directory.GetFiles(Path.Combine(inputs, "aml"), "*.aml").OrderBy(f => f, StringComparer.Ordinal).ToList();

// 1. JSON -> AML (Convert). The results are AML inputs for the steps below.
foreach (var file in jsonInputs)
{
    var name = Path.GetFileNameWithoutExtension(file);
    var json = File.ReadAllText(file, Encoding.UTF8);
    var (doc, warnings) = Fixed(() => { var r = FpbJsonToCaex.Convert(json); return (r.Value, r.Warnings); });
    var outFile = Path.Combine(expected, "convert", name + ".aml");
    Save(doc, outFile);
    cases.Add(Case("convert", name, new() { ["json"] = Rel(file), ["expected"] = Rel(outFile) }, warnings));
    amlInputs.Add(outFile);
}

// 2. Documents with more than FPD content, and one without any.
amlInputs.Add(BuildMixed(Path.Combine(inputs, "aml", "Showcase-A-WaermetauscherMitRegelung.aml"), Path.Combine(inputs, "json", "fpbjs-temperieren.json"), Path.Combine(generated, "mixed.aml")));
amlInputs.Add(BuildWithoutFpd(Path.Combine(generated, "no-fpd.aml")));
amlInputs.Add(BuildLinks(Path.Combine(inputs, "aml", "Showcase-A-WaermetauscherMitRegelung.aml"), Path.Combine(generated, "links.aml")));

// 3. AML -> JSON per FPD hierarchy, and 4. updates with edited JSON.
foreach (var file in amlInputs)
{
    var name = Path.GetFileNameWithoutExtension(file);
    if (file.Contains(Path.Combine("expected", "convert"))) name = "convert-" + name;
    var text = ReadAml(file);
    var doc = CAEXDocument.LoadFromString(text);
    var hierarchies = CaexToFpbJson.FindFpdInstanceHierarchies(doc);

    cases.Add(Case("find", name, new()
    {
        ["aml"] = Rel(file),
        ["hierarchies"] = new JsonArray(hierarchies.Select(ih => (JsonNode)new JsonObject { ["id"] = ih.ID, ["name"] = ih.Name }).ToArray())
    }, []));

    for (var i = 0; i < hierarchies.Count; i++)
    {
        var fresh = CAEXDocument.LoadFromString(text);
        var ih = CaexToFpbJson.FindFpdInstanceHierarchies(fresh)[i];
        var (json, warnings) = Fixed(() => { var r = CaexToFpbJson.Convert(fresh, ih); return (r.Value, r.Warnings); });
        var outFile = Path.Combine(expected, "tojson", $"{name}__{i}.json");
        Write(outFile, json);
        cases.Add(Case("tojson", $"{name}__{i}", new() { ["aml"] = Rel(file), ["hierarchy"] = i, ["expected"] = Rel(outFile) }, warnings));

        // Links from outside per FPB element (016f E4), for the web app's index (amlIndex.js)
        if (name.StartsWith("Showcase-", StringComparison.Ordinal))
        {
            var linkDoc = CAEXDocument.LoadFromString(text);
            var linkIh = CaexToFpbJson.FindFpdInstanceHierarchies(linkDoc)[i];
            var linksFile = Path.Combine(expected, "links", $"{name}__{i}.json");
            Write(linksFile, LinksByFpbId(linkIh, ForeignLinks.Find(linkDoc, linkIh)).ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            cases.Add(Case("links", $"{name}__{i}", new() { ["aml"] = Rel(file), ["hierarchy"] = i, ["expected"] = Rel(linksFile) }, []));
        }

        // B19: what deleting each element removes, as the C# mapper finds it (ForeignLinks);
        // the web app asks with the port (app/fpb/aml/foreignLinks.js), the plugin with this list
        {
            var linkDoc = CAEXDocument.LoadFromString(text);
            var linkIh = CaexToFpbJson.FindFpdInstanceHierarchies(linkDoc)[i];
            var foreignFile = Path.Combine(expected, "foreignlinks", $"{name}__{i}.json");
            var found = new JsonArray(ForeignLinks.Find(linkDoc, linkIh).Select(e => (JsonNode)new JsonObject
            {
                ["elementId"] = e.ElementId,
                ["elementName"] = e.ElementName,
                ["links"] = new JsonArray(e.Links.Select(l => (JsonNode)new JsonObject { ["link"] = l.Link, ["owner"] = l.Owner }).ToArray())
            }).ToArray());
            Write(foreignFile, found.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            cases.Add(Case("foreignlinks", $"{name}__{i}", new() { ["aml"] = Rel(file), ["hierarchy"] = i, ["expected"] = Rel(foreignFile) }, []));
        }

        foreach (var (edit, apply) in edits)
        {
            var edited = apply(json);
            if (edited == null) continue;
            var jsonFile = Path.Combine(generated, "update", $"{name}__{i}__{edit}.json");
            Write(jsonFile, edited);

            var target = CAEXDocument.LoadFromString(text);
            var targetIh = CaexToFpbJson.FindFpdInstanceHierarchies(target)[i];
            var (updated, updateWarnings) = Fixed(() => { var r = FpbJsonToCaex.UpdateInPlace(target, edited, targetIh); return (r.Value, r.Warnings); });
            var updFile = Path.Combine(expected, "update", $"{name}__{i}__{edit}.aml");
            Save(updated, updFile);
            cases.Add(Case("update", $"{name}__{i}__{edit}", new()
            {
                ["aml"] = Rel(file), ["hierarchy"] = i, ["json"] = Rel(jsonFile), ["expected"] = Rel(updFile)
            }, updateWarnings));
        }
    }

    // A file without FPD content gets the process added (FPB.js: open empty, export into this file)
    if (hierarchies.Count == 0)
    {
        var jsonFile = Path.Combine(inputs, "json", "fpbjs-temperieren.json");
        var target = CAEXDocument.LoadFromString(text);
        var edited = File.ReadAllText(jsonFile, Encoding.UTF8);
        var (updated, updateWarnings) = Fixed(() => { var r = FpbJsonToCaex.UpdateInPlace(target, edited); return (r.Value, r.Warnings); });
        var updFile = Path.Combine(expected, "update", $"{name}__add.aml");
        Save(updated, updFile);
        cases.Add(Case("update", $"{name}__add", new()
        {
            ["aml"] = Rel(file), ["hierarchy"] = null, ["json"] = Rel(jsonFile), ["expected"] = Rel(updFile)
        }, updateWarnings));
    }
}

// 5. The name-based IDs (private in FpbJsonToCaex, called by reflection)
var derive = typeof(FpbJsonToCaex).GetMethod("DeriveSubProcessId", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
var deriveBoundary = typeof(FpbJsonToCaex).GetMethod("DeriveBoundaryStateId", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
foreach (var po in new[] { "abc", "6d37cff1-a715-266d-7750-8ee6e7574a4c", "Ä€😀 unicode" })
    cases.Add(Case("derive", "subprocess:" + po, new() { ["method"] = "DeriveSubProcessId", ["args"] = new JsonArray(po), ["result"] = (string)derive.Invoke(null, [po])! }, []));
foreach (var (state, sub) in new[] { ("s1", "p1"), ("dd4eb84c-c312-509d-25a0-10a5872a370e", "c03bd9e7-bf00-4577-a4d3-fd0cb6d0e89b"), ("x", "") })
    cases.Add(Case("derive", $"boundary:{state}@{sub}", new() { ["method"] = "DeriveBoundaryStateId", ["args"] = new JsonArray(state, sub), ["result"] = (string)deriveBoundary.Invoke(null, [state, sub])! }, []));

var manifest = new JsonObject
{
    ["guidPattern"] = "00000000-0000-4000-8000-{n:x12}",
    ["now"] = "2026-01-01T00:00:00Z",
    ["cases"] = new JsonArray(cases.Select(c => (JsonNode)c).ToArray())
};
Write(Path.Combine(oracleDir, "cases.json"), manifest.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"{cases.Count} cases written to {Rel(oracleDir)}");

// ---------------------------------------------------------------------------

(T, List<string>) Fixed<T>(Func<(T, List<string>)> run)
{
    var n = 0;
    using var _ = MapperEnvironment.Use(
        () => new Guid($"00000000-0000-4000-8000-{++n:x12}"),
        () => new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
    return run();
}

JsonObject Case(string kind, string id, JsonObject fields, List<string> warnings)
{
    var c = new JsonObject { ["kind"] = kind, ["id"] = id };
    foreach (var (k, v) in fields.ToList())
    {
        fields.Remove(k);
        c[k] = v;
    }
    c["warnings"] = new JsonArray(warnings.Select(w => (JsonNode)JsonValue.Create(w)!).ToArray());
    return c;
}

string Rel(string path) => Path.GetRelativePath(oracleDir, path).Replace('\\', '/');

static void Save(CAEXDocument doc, string file)
{
    Directory.CreateDirectory(Path.GetDirectoryName(file)!);
    using var stream = doc.SaveToStream(true);
    using var fs = File.Create(file);
    stream.Position = 0;
    stream.CopyTo(fs);
}

static void Write(string file, string text)
{
    Directory.CreateDirectory(Path.GetDirectoryName(file)!);
    File.WriteAllText(file, text, new UTF8Encoding(false));
}

// Loaded as FPB.js loads a file: the text without byte order mark
static string ReadAml(string file) => File.ReadAllText(file, Encoding.UTF8);

static IEnumerable<InternalElementType> Walk(IEnumerable<InternalElementType> roots)
{
    foreach (var ie in roots)
    {
        yield return ie;
        foreach (var child in Walk(ie.InternalElement)) yield return child;
    }
}

// ---------------------------------------------------------------------------
// Edits of the round-trip JSON, as a user makes them in FPB.js. Each returns
// null when the model has nothing to apply it to.

static (string, Func<string, string?>)[] EditList() =>
[
    ("same", json => json),
    // in every process that shows the state: a boundary state is one state (Szenario 7)
    ("rename", json => EditTop(json, (root, entry, data, visual) =>
    {
        var id = (string?)data.FirstOrDefault(e => IsState(e))?["id"];
        if (id == null) return false;
        foreach (var e in AllEntries(root))
            foreach (var state in Data(e).Where(x => (string?)x!["id"] == id))
            {
                var name = ((string?)state!["name"] ?? "") + " (neu)";
                state["name"] = name;
                if (state["identification"] is JsonObject ident) ident["shortName"] = name;
            }
        return true;
    })),
    ("move", json => EditTop(json, (root, entry, data, visual) =>
    {
        var po = data.FirstOrDefault(e => (string?)e!["$type"] == "fpb:ProcessOperator");
        var v = po == null ? null : visual.FirstOrDefault(x => (string?)x!["id"] == (string?)po["id"]);
        if (v == null || v["x"] == null) return false;
        v["x"] = (double)v["x"]! + 40;
        v["y"] = (double)v["y"]! + 20;
        return true;
    })),
    // gone from every process, with its flows, as FPB.js deletes it
    ("delete-state", json => EditTop(json, (root, entry, data, visual) =>
    {
        var id = (string?)data.FirstOrDefault(e => IsState(e))?["id"];
        if (id == null) return false;
        foreach (var e in AllEntries(root)) RemoveWithFlows(e, id);
        return true;
    })),
    // a fresh decompose: an operator without decomposition gets a sub-process
    // with its system limit and the copy of one input state under the shared
    // id, as FPB.js sends it (B10: the copy needs refObj to its state)
    ("decompose", json => EditTop(json, (root, entry, data, visual) =>
    {
        foreach (var po in data.Where(e => (string?)e!["$type"] == "fpb:ProcessOperator"
                     && string.IsNullOrEmpty((string?)e["decomposedView"])).ToList())
        {
            var poId = (string)po!["id"]!;
            var flow = data.FirstOrDefault(e => (string?)e!["$type"] == "fpb:Flow" && (string?)e["targetRef"] == poId
                && data.Any(s => IsState(s) && (string?)s!["id"] == (string?)e["sourceRef"]));
            if (flow == null) continue;
            var state = data.First(s => IsState(s) && (string?)s!["id"] == (string?)flow["sourceRef"])!;
            var stateId = (string)state["id"]!;
            var stateType = (string)state["$type"]!;
            const string slId = "0bdec000-0000-4000-8000-000000000001";
            po["decomposedView"] = poId;
            var copy = new JsonObject { ["$type"] = stateType, ["id"] = stateId, ["name"] = (string?)state["name"] };
            if (state["identification"] is JsonObject ident) copy["identification"] = ident.DeepClone();
            root.Add(new JsonObject
            {
                ["process"] = new JsonObject
                {
                    ["$type"] = "fpb:Process", ["id"] = poId, ["isDecomposedProcessOperator"] = poId,
                    ["elementsContainer"] = new JsonArray(slId), ["consistsOfSystemLimit"] = slId,
                    ["consistsOfStates"] = new JsonArray(stateId), ["consistsOfProcessOperator"] = new JsonArray(),
                    ["consistsOfProcesses"] = new JsonArray()
                },
                ["elementDataInformation"] = new JsonArray(
                    new JsonObject { ["$type"] = "fpb:SystemLimit", ["id"] = slId, ["name"] = "SL_sub", ["elementsContainer"] = new JsonArray(stateId) },
                    copy),
                ["elementVisualInformation"] = new JsonArray(
                    new JsonObject { ["id"] = slId, ["type"] = "fpb:SystemLimit", ["x"] = 0, ["y"] = 0, ["width"] = 400, ["height"] = 400 },
                    new JsonObject { ["id"] = stateId, ["type"] = stateType, ["x"] = 100, ["y"] = -25, ["width"] = 50, ["height"] = 50 })
            });
            return true;
        }
        return false;
    })),
    // a flow whose port a link from outside shares (Showcase A: VentilToPressureCtl
    // uses the port of this flow, 016f E4, V29): the port stays
    ("delete-flow", json => EditTop(json, (root, entry, data, visual) =>
    {
        const string flowId = "ee2b711a-2f74-786f-d912-819b2c61bd8f";
        if (!AllEntries(root).Any(e => Data(e).Any(x => string.Equals((string?)x!["id"], flowId, StringComparison.OrdinalIgnoreCase)))) return false;
        foreach (var e in AllEntries(root)) RemoveWithFlows(e, flowId);
        return true;
    })),
    ("add", json => EditTop(json, (root, entry, data, visual) =>
    {
        var po = data.FirstOrDefault(e => (string?)e!["$type"] == "fpb:ProcessOperator");
        var poVisual = po == null ? null : visual.FirstOrDefault(x => (string?)x!["id"] == (string?)po["id"]);
        if (poVisual == null || poVisual["x"] == null) return false;
        const string productId = "0badd000-0000-4000-8000-000000000001";
        const string flowId = "0badd000-0000-4000-8000-000000000002";
        var poId = (string)po!["id"]!;
        var x = (double)poVisual["x"]! - 150;
        var y = (double)poVisual["y"]!;
        data.Add(new JsonObject
        {
            ["$type"] = "fpb:Product", ["id"] = productId, ["name"] = "Neues Produkt",
            ["identification"] = new JsonObject
            {
                ["$type"] = "fpb:Identification", ["uniqueIdent"] = productId, ["longName"] = "",
                ["shortName"] = "Neues Produkt", ["versionNumber"] = "", ["revisionNumber"] = ""
            },
            ["isAssignedTo"] = new JsonArray(poId), ["incoming"] = new JsonArray(), ["outgoing"] = new JsonArray(flowId)
        });
        data.Add(new JsonObject { ["$type"] = "fpb:Flow", ["id"] = flowId, ["sourceRef"] = productId, ["targetRef"] = poId });
        visual.Add(new JsonObject { ["id"] = productId, ["width"] = 50, ["height"] = 50, ["type"] = "fpb:Product", ["x"] = x, ["y"] = y });
        visual.Add(new JsonObject
        {
            ["id"] = flowId, ["type"] = "fpb:Flow",
            ["waypoints"] = new JsonArray(
                new JsonObject { ["x"] = x + 50, ["y"] = y + 25 },
                new JsonObject { ["x"] = (double)poVisual["x"]!, ["y"] = y + 25 })
        });
        return true;
    })),
];

// Keyed like amlIndex.js: a state by the id its refObj names (the copies of a
// boundary state count for their state), every other element by its own id;
// processes are left out, as amlIndex.js leaves them out.
static JsonObject LinksByFpbId(InstanceHierarchyType ih, IReadOnlyList<ElementLinks> found)
{
    var states = new HashSet<string> { FpbTypes.Product, FpbTypes.Energy, FpbTypes.Information };
    var byId = new Dictionary<string, InternalElementType>(StringComparer.OrdinalIgnoreCase);
    foreach (var ie in Walk(ih.InternalElement))
        if (!string.IsNullOrEmpty(ie.ID)) byId[ie.ID.Trim('{', '}')] = ie;
    var grouped = new SortedDictionary<string, List<(string Link, string Owner)>>(StringComparer.Ordinal);
    foreach (var entry in found)
    {
        if (!byId.TryGetValue(entry.ElementId, out var ie)) continue;
        if (!FpbMappings.SucToElement.TryGetValue(FpbMappings.StripAlias(ie.RefBaseSystemUnitPath), out var type) || type == FpbTypes.Process) continue;
        var shared = states.Contains(type) ? ie.GetRefObjOrDerived() : null;
        var id = (string.IsNullOrEmpty(shared) ? ie.ID! : shared).Trim('{', '}');
        if (!grouped.TryGetValue(id, out var list)) grouped[id] = list = new();
        foreach (var l in entry.Links)
            if (!list.Contains((l.Link, l.Owner))) list.Add((l.Link, l.Owner));
    }
    var result = new JsonObject();
    foreach (var (id, list) in grouped)
        result[id] = new JsonArray(list
            .OrderBy(l => l.Link, StringComparer.Ordinal).ThenBy(l => l.Owner, StringComparer.Ordinal)
            .Select(l => (JsonNode)new JsonObject { ["link"] = l.Link, ["owner"] = l.Owner }).ToArray());
    return result;
}

static bool IsState(JsonNode? e) => (string?)e?["$type"] is "fpb:Product" or "fpb:Energy" or "fpb:Information";

// The top process: the entry point, else the first process that is no decomposition
static string? EditTop(string json, Func<JsonArray, JsonObject, JsonArray, JsonArray, bool> edit)
{
    var root = JsonNode.Parse(json)!.AsArray();
    var top = Top(root);
    if (top?["elementDataInformation"] is not JsonArray data || top["elementVisualInformation"] is not JsonArray visual) return null;
    return edit(root, top, data, visual) ? root.ToJsonString() : null;
}

static JsonObject? Top(JsonArray root)
{
    var entryPoint = (string?)root[0]?["entryPoint"];
    return root.Skip(1).OfType<JsonObject>().FirstOrDefault(e => (string?)e["process"]?["id"] == entryPoint)
           ?? root.Skip(1).OfType<JsonObject>().FirstOrDefault(e => string.IsNullOrEmpty((string?)e["process"]?["isDecomposedProcessOperator"]));
}

static IEnumerable<JsonObject> AllEntries(JsonArray root) => root.Skip(1).OfType<JsonObject>();

static IEnumerable<JsonNode?> Data(JsonObject entry) => entry["elementDataInformation"] as JsonArray ?? [];

static void RemoveWithFlows(JsonObject entry, string id)
{
    if (entry["elementDataInformation"] is not JsonArray data) return;
    var visual = entry["elementVisualInformation"] as JsonArray ?? new JsonArray();
    if (!data.Any(e => (string?)e!["id"] == id)) return;
    var gone = new HashSet<string> { id };
    foreach (var e in data)
        if ((string?)e!["sourceRef"] == id || (string?)e["targetRef"] == id) gone.Add((string)e["id"]!);
    foreach (var e in data.Where(e => gone.Contains((string?)e!["id"] ?? "")).ToList()) data.Remove(e);
    foreach (var v in visual.Where(v => gone.Contains((string?)v!["id"] ?? "")).ToList()) visual.Remove(v);
    foreach (var e in data)
        foreach (var key in new[] { "incoming", "outgoing", "isAssignedTo" })
            if (e?[key] is JsonArray refs)
                foreach (var r in refs.Where(r => gone.Contains((string?)r ?? "")).ToList()) refs.Remove(r);
    if (entry["process"] is JsonObject process)
        foreach (var key in new[] { "consistsOfStates", "consistsOfProcessOperator", "elementsContainer" })
            if (process[key] is JsonArray refs)
                foreach (var r in refs.Where(r => gone.Contains((string?)r ?? "")).ToList()) refs.Remove(r);
}

// ---------------------------------------------------------------------------

// Showcase A with what FPB.js must carry through: a plant hierarchy linking into
// a state (the one "delete-state" removes), user attributes and interfaces on FPD
// elements, and a second FPD hierarchy.
string BuildMixed(string showcase, string secondJson, string file)
{
    var doc = CAEXDocument.LoadFromString(ReadAml(showcase));
    var fpd = CaexToFpbJson.FindFpdInstanceHierarchies(doc)[0];
    var json = CaexToFpbJson.Convert(doc, fpd).Value;

    // the state "delete-state" removes
    var stateId = (string?)Data(Top(JsonNode.Parse(json)!.AsArray())!).First(e => IsState(e))!["id"];
    var fpdElements = Walk(fpd.InternalElement).ToList();
    var state = fpdElements.First(ie => ie.ID.Trim('{', '}').Equals(stateId, StringComparison.OrdinalIgnoreCase));
    var po = fpdElements.First(ie => (ie.RefBaseSystemUnitPath ?? "").EndsWith("FPD_ProcessOperator", StringComparison.Ordinal));

    var material = state.Attribute.Append("Materialnummer");
    material.Value = "4711";
    var owner = po.Attribute.Append("Verantwortlich");
    owner.Value = "Leitstand 2";
    var stateIf = state.ExternalInterface.Append("Anlagenbezug");

    var plant = doc.CAEXFile.InstanceHierarchy.Append("Anlage");
    var tank = plant.InternalElement.Append("Behaelter_B1");
    var volume = tank.Attribute.Append("Volumen");
    volume.Value = "2.5";
    volume.Unit = "m3";
    var tankIf = tank.ExternalInterface.Append("ZumProzess");
    var link = tank.InternalLink.Append("B1_Prozess");
    link.AInterface = tankIf;
    link.BInterface = stateIf;

    Fixed(() => { var r = FpbJsonToCaex.ImportInto(doc, File.ReadAllText(secondJson, Encoding.UTF8)); return (r.Value, r.Warnings); });

    Save(doc, file);
    return file;
}

// B19: links from outside onto what the web app overlooked: a child element of
// a state, the process of a lower layer, the copy of a boundary state, a
// technical resource; a link stored in an operator, one stored in a lower
// process, one in the form "element id:interface name" of CAEX 2.15, and one
// inside a state. Fixed ids, so the file stays the same from run to run.
string BuildLinks(string showcase, string file)
{
    var doc = CAEXDocument.LoadFromString(ReadAml(showcase));
    var fpd = CaexToFpbJson.FindFpdInstanceHierarchies(doc)[0];
    string Suc(InternalElementType ie) => FpbMappings.StripAlias(ie.RefBaseSystemUnitPath);
    bool Is(InternalElementType ie, string type) => Suc(ie) == FpbMappings.ElementToSuc[type];
    bool IsState(InternalElementType ie) => Is(ie, FpbTypes.Product) || Is(ie, FpbTypes.Energy) || Is(ie, FpbTypes.Information);
    var processes = fpd.InternalElement.Where(ie => Is(ie, FpbTypes.Process)).ToList();
    var top = processes.First(p => string.IsNullOrEmpty(p.GetRefObjOrDerived()));
    var lower = processes.First(p => p.InternalElement.Any(ie => IsState(ie) && !string.IsNullOrEmpty(ie.GetRefObjOrDerived())));
    var state = top.InternalElement.First(IsState);
    var op = top.InternalElement.First(ie => Is(ie, FpbTypes.ProcessOperator));
    var copy = lower.InternalElement.First(ie => IsState(ie) && !string.IsNullOrEmpty(ie.GetRefObjOrDerived()));
    var resource = processes.SelectMany(p => p.InternalElement).First(ie => Is(ie, FpbTypes.TechnicalResource));

    var n = 0;
    string Id() => $"{{00000000-0000-4000-8000-b19{++n:x9}}}";
    ExternalInterfaceType Port(InternalElementType owner, string name)
    {
        var port = owner.ExternalInterface.Append(name);
        port.ID = Id();
        return port;
    }
    void Link(InternalElementType holder, string name, ExternalInterfaceType a, ExternalInterfaceType b)
    {
        var link = holder.InternalLink.Append(name);
        link.ID = Id();
        link.AInterface = a;
        link.BInterface = b;
    }

    var sensor = state.InternalElement.Append("Sensor_T1");
    sensor.ID = Id();
    var processPort = Port(lower, "Prozessbezug");
    Port(state, "Anlagenbezug");

    var plant = doc.CAEXFile.InstanceHierarchy.Append("Leitebene");
    plant.ID = Id();
    var control = plant.InternalElement.Append("Leitsystem");
    control.ID = Id();
    Link(control, "L_Sensor", Port(control, "ZumSensor"), Port(sensor, "Signal"));
    Link(control, "L_Prozess", Port(control, "ZumProzess"), processPort);
    Link(control, "L_Kopie", Port(control, "ZurKopie"), Port(copy, "Messstelle"));
    Link(control, "L_Ressource", Port(control, "ZurRessource"), Port(resource, "Wartung"));
    Link(op, "L_Innen", Port(op, "Bedienung"), Port(control, "ZumBedienplatz"));
    Link(lower, "L_Ebene", processPort, Port(control, "ZurEbene"));
    Link(lower, "L_Quer", Port(copy, "Quer"), Port(resource, "Quer"));
    Link(state, "L_Intern", Port(sensor, "Intern"), Port(state, "Intern"));
    var old = control.InternalLink.Append("L_Alt");
    old.ID = Id();
    old.RefPartnerSideA = control.ID + ":" + Port(control, "Alt").Name;
    old.RefPartnerSideB = state.ID + ":Anlagenbezug";

    Save(doc, file);
    return file;
}

string BuildWithoutFpd(string file)
{
    var doc = CAEXDocument.New_CAEXDocument();
    var plant = doc.CAEXFile.InstanceHierarchy.Append("Anlage");
    var pump = plant.InternalElement.Append("Pumpe_P1");
    var flow = pump.Attribute.Append("Foerderstrom");
    flow.Value = "12";
    flow.Unit = "m3/h";
    Save(doc, file);
    return file;
}

// ---------------------------------------------------------------------------

static void Collect(string root, string inputs)
{
    var aml = Path.GetFullPath(Path.Combine(root, "..", "AML"));
    var sources = new (string From, string To)[]
    {
        (Path.Combine(root, "tests", "e2e", "fixtures", "temperieren.json"), "json/fpbjs-temperieren.json"),
        (Path.Combine(root, "tests", "e2e", "fixtures", "import", "MPS500-ohne-grafik.json"), "json/fpbjs-MPS500-ohne-grafik.json"),
        (Path.Combine(root, "tests", "e2e", "fixtures", "import", "Paper-at2026-ohne-grafik.json"), "json/fpbjs-Paper-at2026-ohne-grafik.json"),
        (Path.Combine(aml, "fpb-aml-mapper", "examples", "Temperieren.json"), "json/mapper-examples-Temperieren.json"),
        (Path.Combine(aml, "fpb-aml-mapper", "dotnet", "FpbMapper.Tests", "TestData", "Temperieren.json"), "json/mapper-testdata-Temperieren.json"),
        (Path.Combine(aml, "fpb-aml-editor-plugin", "examples", "Showcase-A-WaermetauscherMitRegelung.aml"), "aml/Showcase-A-WaermetauscherMitRegelung.aml"),
        (Path.Combine(aml, "fpb-aml-editor-plugin", "examples", "Showcase-B-PharmaChargeUndReinigung.aml"), "aml/Showcase-B-PharmaChargeUndReinigung.aml"),
        (Path.Combine(aml, "fpb-aml-editor-plugin", "examples", "Showcase-C-CncRobotikMontage.aml"), "aml/Showcase-C-CncRobotikMontage.aml"),
    };
    foreach (var (from, to) in sources)
    {
        var target = Path.Combine(inputs, to);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.Copy(from, target, overwrite: true);
        Console.WriteLine($"{to} <- {from}");
    }
}

static string FindRepoRoot()
{
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    while (dir != null && !File.Exists(Path.Combine(dir.FullName, "package.json"))) dir = dir.Parent;
    return dir?.FullName ?? throw new InvalidOperationException("FPB.JS root (package.json) not found");
}
