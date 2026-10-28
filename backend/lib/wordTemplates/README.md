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
hash. Range bindings select nonempty UTF-16 `[start,end)` text ranges within one
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

## Private service integration

`services/signingV2/wordTemplates.js` retains the immutable original and versioned
bindings, resolves currently permitted client/case references, fills a new DOCX,
and converts that exact filled document to a private PDF. A Word data role does
not grant signing authority. The native draft bridge receives the final verified
PDF plus source/version/bindings/values/filled-DOCX/PDF hashes; final signing
fields start empty and require placement against that resulting PDF. Pagination
may change with data. Existing frozen signing packages remain immutable. Core
materialization sets `requiresPdfConversion` and `requiresFreshSigningGeometry`
to true; it does not create a signing submission or send anything.

Run only this module's focused tests with `node --test
backend/tests/wordTemplates.test.js` from the repository root. Read and append
the signing test ledger as required by the repository instructions.

## Per-process converter admission

`WORD_TEMPLATE_MAX_CONCURRENT` optionally caps active conversions in one Node
process. Its only accepted values are the exact strings `1` and `2`; an unset
variable preserves the incumbent default of two. Empty, padded or other values
fail as `WORD_CONVERSION_INVALID_CONFIG` before a subprocess can start. A full
worker rejects another request with the existing `WORD_CONVERSION_BUSY` error
(HTTP 503); it does not queue or change message delivery.

This cap leaves the managed executable, fixed argv, private directories, output
validation, timeout and cleanup unchanged. It is not a global host limit: count
all API instances, including QA, when reserving converter memory. The reviewed
three-customer setting is one per customer process with QA retaining two, for
five possible jobs at the existing per-job memory cap. Recheck current host
headroom before activation and retain all outbound/provider flags.

## Source-PDF visual authoring, schema 2

The upload-permission-protected `/signing-v2/word` router exposes:

- `GET /catalog` and catalog metadata on source list/load responses. Catalog
  entries distinguish record resolvers from manual document values. First/last
  names are explicitly manual; the resolver never splits a stored full name.
  Office values remain manual. Missing raw identity/organization enums stay
  missing rather than becoming profile-normalizer defaults. Stored enum codes
  are labeled as codes with an explicit document override. SQL birth dates keep
  their literal calendar date. `case.reference` is the internal case identifier;
  `case.courtNumber` requires a uniquely primary, permitted court link.
- `POST /:sourceId/authoring-renders` with `expectedVersion` and `sourceHash`.
  The original DOCX, rather than a previously filled preview, is converted. A
  bounded PDF.js worker computes the authoritative source text/layout map.
  Render metadata, PDF bytes and mapping JSON are immutable private objects,
  bound by hashes and the author/context. A later binding-only version can reuse
  the same original render while retaining its original `renderSourceVersion`.
- `GET /authoring-renders/:renderId` and `/pdf` return the current envelope and
  authenticated, hash-verified PDF. No public URL is generated; all responses use
  `private, no-store` and a fixed safe PDF filename.
- `POST /:sourceId/authoring-renders/:renderId/selections` with current version,
  source/map hashes and `{kind:'range',start:{itemId,offset},end:{itemId,offset}}`
  resolves the requested PDF text selection to one source paragraph. A mapped
  existing-text caret uses `{kind:'insert',start:{itemId,offset},affinity}`,
  where `affinity` is `before` or `after`. Empty paragraphs and arbitrary blank
  PDF locations are unsupported. Offsets are UTF-16, never estimated PDF pixels.
- Existing source `PUT` accepts `bindingSchemaVersion:2`, `authoringRenderId`,
  `authoringMapHash` and bindings containing these selectors. The service resolves
  every selector again and persists canonical source/paragraph/selection hashes.
  Legacy text-range save remains supported; raw legacy insertion is refused.

The source-PDF envelope declares PDF.js scale-1 top-left viewport geometry,
rotation, view box, user unit, per-item transform/size and text hash. PDF.js text
options are exactly `{disableNormalization:false,includeMarkedContent:false}`,
matching the existing React-PDF text API. The item hash is SHA256 over UTF-8
`JSON.stringify(items.map(i => [i.text,i.dir,i.transform,i.width,i.height,i.hasEOL]))`.
The viewer must verify PDF bytes and exact item text/order/direction/EOL before
selection; finite geometry differences alone have a declared tolerance of 0.01
PDF points. The UI never guesses source offsets from a visually similar string.

Mapping is a supported subset. A whole source paragraph must have one unambiguous
compact-text match, with every selected non-whitespace character attributable to
that paragraph. Identical names within a uniquely matched paragraph remain
independent ranges. Identical full paragraphs, compact-text whitespace ambiguity,
unsupported Word constructs, unmapped/normalized clusters and cross-paragraph
selections fail closed. Known repeated header/footer text may be transparent to
body flow without becoming an editable anchor. Table paragraphs use the same
proof requirement. Diagnostics expose unavailable paragraphs; rendering a page
does not mean every word is editable.

PDF extraction and mapping share a worker with a 30-second termination deadline
and 256-MiB old-generation memory bound. Input limits are 20-MiB PDF, 200 pages,
500,000 UTF-16 characters, 50,000 text items, 10,000 source paragraphs and 8-MiB
mapping JSON. These bounds do not replace the managed converter's confinement.
Exactly one such worker can be admitted per API process; a concurrent request
fails immediately with `WORD_AUTHORING_BUSY` (HTTP 503), without queuing. The
permit remains held through worker termination and is released after success,
reported error or timeout cleanup. This admission is separate from LibreOffice:
budget one mapping worker plus the configured converter jobs for every API
process. Multiple processes have independent caps; this is not a host-wide limit.
The additive `signing_word_authoring_renders` table is append-only and private
to the existing owner context/author; no customer/provider permission is added.

Focused tests are `wordTemplates.visual.test.js`,
`wordTemplates.authoringService.test.js` and `signingWordRoutes.test.js` alongside
the existing core/native privacy tests. The local real-converter proof uses a
synthetic already-filled Hebrew document, production bounded mapping, independent
repeated-name bindings and an existing-text caret. It mapped 33 of 62 paragraphs;
the other paragraphs retain explicit unsupported diagnostics. It verifies actual
new DOCX bytes, unaffected OOXML parts/run/paragraph properties and actual filled
PDF text. Shorter values or inserted text can wrap and move later content; neither
this proof nor OOXML preservation guarantees pixel/layout identity or WYSIWYG.
