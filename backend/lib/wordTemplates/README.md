# DOCX text binding core

This module is an in-memory import and merge core. It has no database, HTTP,
filesystem, message delivery or signing workflow side effects. Its source DOCX
must be retained privately by an integrating service. A DOCX model is **not** a
PDF layout and must never be used to copy sample-document signature coordinates.

```js
const { importDocx, createBinding, materializeDocx } = require('./wordTemplates');
const model = importDocx(originalBuffer);
const binding = createBinding(model, {
    id: 'tenant_identity',
    part: 'word/document.xml',
    paragraphId: 'p4',
    start: 8,
    end: 12,
    field: 'role.tenant.identityNumber',
    required: true,
});
const result = materializeDocx(originalBuffer, {
    sourceHash: model.sourceHash,
    bindings: [binding],
    values: { 'role.tenant.identityNumber': '001234567' },
});
// result.buffer is a NEW DOCX. originalBuffer has not been changed.
```

## Selection and preservation

`importDocx` exposes paragraphs from the main document, including tables, and
numbered headers/footers. Paragraph IDs are stable only for the exact source
hash. The UI must select nonempty UTF-16 `[start,end)` text ranges within one
paragraph. Ordinary text split across several Word runs is one selectable
string. Underscore blanks are suggested in `blanks`; the user still explicitly
chooses a field binding. Tabs, line breaks, surrogate-pair splits, stale sources,
stale paragraph/selection hashes, overlapping ranges and duplicate binding IDs
are rejected. Unsupported paragraphs are returned with `editable:false` and
`unsupportedReasons`.

Replacement text inherits the first selected run's formatting. Later selected
run text is removed, while existing run properties remain in place. Unselected
text retains its run formatting. Other OOXML parts, including binary logos,
are preserved byte-for-byte as part payloads. The ZIP container headers may be
normalized; the output archive is not byte-identical to the source archive.
Values are escaped as XML text, never interpreted as markup, expressions or
code. Values must be explicit strings; leading zeros are retained. Required
missing/blank values stop the operation. Optional missing values clear the
selected placeholder. Repeat the same field in several bindings to fill all
its locations. Resolved field values are not added to the import model or
returned binding manifest; the latter includes value hashes only. The original
uploaded text may itself contain personal data, so the import model is private.

## Allowed fields

`FIELD_NAMES` exports the fixed client, case and office fields. Role fields use
`role.<stableRoleId>.<field>` with fields `fullName`, `companyName`, `identityNumber`,
`companyNumber`, `capacity`, and `authority`. An integrating service resolves the
selected client/person/case/office and supplies the final authorized values;
this core neither resolves identities nor accesses stored customer data.
Company identity and a representative's personal identity use distinct role
bindings. Business validation and locale date/amount formatting belong to the
upstream form/resolver, before materialization.

`clientValues.clientDocumentValues(record)` is the pure adapter for an already
authorized customer record. It uses the shared client-profile validator and
supports existing PascalCase/lowercase response aliases. The human contact's
name/identity remain distinct from the existing company name and organization's
registration number. Person records never supply a company registration number.
Missing data remains an empty string; no nationality or country is inferred.
This formatter does not provide access to customer records through other routes.

## Boundaries and security

The accepted package is a bounded UTF-8 DOCX / ZIP32 subset (20 MiB archive,
1024 parts, 12 MiB per part, 50 MiB total expansion, 200x expansion ratio).
Unsupported formats produce a `WordTemplateError` with a stable `code` and
non-sensitive details. The ZIP reader checks central/local consistency, payload
CRC, declared and actual expansion, paths, duplicate part names, overlaps,
encryption and unsupported compression. Nothing is extracted to disk.

DTD/entity declarations, external relationships and image references, active
Word instructions, macros, embedded packages, ActiveX, SVG, digital signatures,
and alternate external content are refused. Ordinary internal document, style,
metadata, header/footer and image relationships remain supported. Tracked
changes, field instructions/results, content controls and text boxes remain
read-only. Conversion services must still use an isolated, network-disabled,
time/memory-limited converter; document parsing does not make a desktop office
application a trusted processing sandbox.

## Integration remains separate

No authoring route, private source storage, client/case resolver, publication
revision, PDF conversion or stage automation is implemented here. The next
service must save the original hash and validated bindings, fill a new DOCX,
convert that exact filled document to PDF, then establish or explicitly verify
signature fields against its resulting pages. Pagination may change with data.
Existing frozen signing packages must remain immutable. The result explicitly
sets `requiresPdfConversion` and `requiresFreshSigningGeometry` to true.

Run only this module's focused tests with `node --test
backend/tests/wordTemplates.test.js` from the repository root. Read and append
the signing test ledger as required by the repository instructions.
