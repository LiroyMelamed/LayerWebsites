const { packageScopeSql } = require('./access');
const { personScopeSql } = require('./people');

// Parameters are scopeParams(scope): context, all, user, inherited case scope.
// A directory record is visible only through ownership or a currently accessible
// package. Having authority_manage changes the action, never the data scope.
function partyScopeSql(alias='party') {
    return `${alias}.owner_context_id=$1 AND ($2::boolean OR ${alias}.created_by=$3 OR EXISTS (
        SELECT 1 FROM signing_people person WHERE person.id=${alias}.person_id AND ${personScopeSql()}) OR EXISTS (
        SELECT 1 FROM signing_participations participation
        JOIN signing_package_revisions revision ON revision.owner_context_id=participation.owner_context_id AND revision.id=participation.revision_id
        JOIN signing_packages p ON p.owner_context_id=revision.owner_context_id AND p.id=revision.package_id
        WHERE participation.owner_context_id=${alias}.owner_context_id AND participation.represented_party_id=${alias}.id AND ${packageScopeSql('p')}))`;
}
function authorityScopeSql(alias='a') {
    return `${alias}.owner_context_id=$1 AND EXISTS (SELECT 1 FROM signing_people person WHERE person.id=${alias}.person_id AND ${personScopeSql()})
        AND EXISTS (SELECT 1 FROM signing_parties party WHERE party.id=${alias}.represented_party_id AND ${partyScopeSql()})`;
}
module.exports={partyScopeSql,authorityScopeSql};
