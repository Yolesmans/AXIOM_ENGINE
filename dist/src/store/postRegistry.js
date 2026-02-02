const postRegistry = {
    elgaenergy: [
        {
            posteId: "commercial_b2b",
            label: "Commercial B2B",
            createdAt: new Date().toISOString(),
        },
    ],
};
export function getPostsForTenant(tenantId) {
    const posts = postRegistry[tenantId];
    if (!posts) {
        throw new Error(`UNKNOWN_TENANT_POSTS: ${tenantId}`);
    }
    return posts;
}
export function getPostConfig(tenantId, posteId) {
    const posts = getPostsForTenant(tenantId);
    const post = posts.find((p) => p.posteId === posteId);
    if (!post) {
        throw new Error(`UNKNOWN_POSTE: ${tenantId} / ${posteId}`);
    }
    return post;
}
