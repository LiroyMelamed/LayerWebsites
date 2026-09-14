function resolveActorId(req) {
    const id = Number(req?.user?.UserId);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function computeClosureAudit({ wasClosed, nowClosed, isClosedProvided, actorId, previous = {} }) {
    let closedAt = previous.closed_at ?? null;
    let closedByUserId = previous.closed_by_userid ?? null;
    let reopenedAt = previous.reopened_at ?? null;
    let reopenedByUserId = previous.reopened_by_userid ?? null;

    if (!isClosedProvided) {
        return { closedAt, closedByUserId, reopenedAt, reopenedByUserId };
    }

    if (!wasClosed && nowClosed) {
        closedAt = new Date();
        closedByUserId = actorId;
        reopenedAt = null;
        reopenedByUserId = null;
    } else if (wasClosed && !nowClosed) {
        closedAt = null;
        closedByUserId = null;
        reopenedAt = new Date();
        reopenedByUserId = actorId;
    }

    return { closedAt, closedByUserId, reopenedAt, reopenedByUserId };
}

module.exports = {
    resolveActorId,
    computeClosureAudit,
};
